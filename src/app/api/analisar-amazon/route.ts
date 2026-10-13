/**
 * API: Parser do Relatório Unificado de Transações Amazon
 * Arquivo: "Monthly Unified Transaction" (.csv)
 *
 * Estrutura:
 * - 9 linhas de cabeçalho/definições
 * - Linha 10 (índice 9): header das colunas
 * - Linha 11+ (índice 10+): dados
 * - Valores em CENTAVOS — dividir por 100 para obter R$
 *
 * Colunas relevantes:
 * - Col 0: data/hora
 * - Col 2: tipo (Pedido | Reembolso | Ajuste | Taxa de serviço | Taxa de Estoque FBA | Transferir)
 * - Col 4: sku (remover sufixo _FBA/_fba)
 * - Col 13: vendas do produto
 * - Col 14: créditos de remessa (frete pago pelo comprador)
 * - Col 16: descontos promocionais (negativo = cupom)
 * - Col 18: tarifas de venda (comissão Amazon ≈12%)
 * - Col 19: taxas fba (fulfillment + armazenagem)
 * - Col 20: taxas de outras transações
 * - Col 21: outro
 * - Col 22: total (valor líquido = o que cai na conta)
 */
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'
import { detectarFormato, parseAmazonVT, limparSkuAmazon, parseRelatorioPedidosAmazon } from '@/lib/amazon-formato'

const COL = {
  DATA: 0, TIPO: 2, PEDIDO: 3, SKU: 4, DESC: 5, QTD: 6,
  VENDA: 13, REMESSA: 14, DESCONTO: 16,
  TARIFA_VENDA: 18, TAXA_FBA: 19, OUTRAS_TAXAS: 20, OUTRO: 21, TOTAL: 22,
}

function parseDateBR(str: string): Date | null {
  // "30 de abr. de 2026 20:39:02 GMT-7"
  const meses: Record<string, number> = {
    jan:1, fev:2, mar:3, abr:4, mai:5, jun:6,
    jul:7, ago:8, set:9, out:10, nov:11, dez:12,
  }
  const match = str.match(/(\d+) de (\w+)\.? de (\d{4})/)
  if (!match) return null
  const m = meses[match[2].toLowerCase().slice(0, 3)]
  if (!m) return null
  return new Date(parseInt(match[3]), m - 1, parseInt(match[1]))
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await getAuthContext()
    const formData = await req.formData()
    const file = formData.get('file') as File
    const fileRelatorioPedidos = formData.get('relatorio_pedidos') as File | null
    const mesExplicito  = formData.get('mes')  ? parseInt(String(formData.get('mes')))  : null
    const anoExplicito  = formData.get('ano')  ? parseInt(String(formData.get('ano')))  : null
    const modoPreview   = formData.get('preview') === 'true'

    if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buffer, { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

    // ─── Detecção de formato (bugs AMZ-1/2/3) ───────────────────────────
    // A Amazon exporta dois layouts incompatíveis. O parser antigo assumia MTU
    // (9 linhas de header, valores em centavos) e produzia lixo silencioso ao
    // receber o extrato "Visualizar Transações". Agora o formato é detectado.
    const formato = detectarFormato(rows)

    if (formato === 'DESCONHECIDO') {
      return NextResponse.json({
        error: 'Formato de arquivo Amazon não reconhecido. Envie o relatório "Visualizar Transações" (.csv) ou o "Monthly Unified Transaction".'
      }, { status: 400 })
    }

    if (formato === 'VT') {
      const vt = parseAmazonVT(rows)

      // ─── Join VT × Relatório de Pedidos (CMV por SKU) ──────────────────
      // O VT não tem SKU/quantidade. O Relatório de Pedidos complementa esses dados.
      // Join por amazon-order-id; itens sem correspondência → cmv_incompleto.
      let pedidosMap: ReturnType<typeof parseRelatorioPedidosAmazon> | null = null
      if (fileRelatorioPedidos) {
        const rpBuf = Buffer.from(await fileRelatorioPedidos.arrayBuffer())
        // Tentar UTF-8; a Amazon usa latin1 em algumas regiões — normalizar acima do ASCII é seguro
        const rpText = rpBuf.toString('utf8')
        pedidosMap = parseRelatorioPedidosAmazon(rpText)
      }

      // Busca custos do catálogo (só necessário se temos o Relatório de Pedidos)
      type SkuAmazon = { sku: string; titulo: string; unidades: number; pedidos: number; custo_unit: number; sem_custo: boolean; cmv: number }
      const skusVT: Record<string, SkuAmazon> = {}
      let pedidosSemCorrespondencia = 0
      let pedidosComCmv = 0

      if (pedidosMap && pedidosMap.size > 0) {
        const produtos = await prisma.produto_catalogo.findMany({
          where: { workspace_id: workspaceId },
          select: { sku_interno: true, custo_brl: true, sku_alias: true },
        })
        const custoPorSku: Record<string, number> = {}
        produtos.forEach(p => {
          if (!p.custo_brl) return
          if (p.sku_interno) custoPorSku[p.sku_interno.toUpperCase()] = p.custo_brl
          if (p.sku_alias) p.sku_alias.split(',').forEach(a => {
            const s = a.trim().toUpperCase(); if (s && !custoPorSku[s]) custoPorSku[s] = p.custo_brl!
          })
        })

        // Para cada linha VT do tipo pagamento, buscar SKU no mapa de pedidos
        for (const linha of vt.linhas) {
          const tipoRaw = linha.tipo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
          if (tipoRaw !== 'pagamento do pedido') continue
          const orderId = linha.pedido
          const itensPedido = pedidosMap.get(orderId)
          if (!itensPedido || itensPedido.length === 0) {
            pedidosSemCorrespondencia++
            continue
          }
          pedidosComCmv++
          for (const item of itensPedido) {
            const { sku, quantidade } = item
            const custo_unit = custoPorSku[sku] ?? 0
            const sem_custo = !custoPorSku[sku]
            const cmv = custo_unit * quantidade
            if (!skusVT[sku]) {
              skusVT[sku] = {
                sku, titulo: sku, unidades: 0, pedidos: 0,
                custo_unit, sem_custo, cmv: 0,
              }
            }
            skusVT[sku].unidades += quantidade
            skusVT[sku].pedidos++
            skusVT[sku].cmv += cmv
          }
        }
      }

      const skusVTArray = Object.values(skusVT).sort((a, b) => b.cmv - a.cmv)
      const cmv_total_vt = skusVTArray.reduce((s, x) => s + x.cmv, 0)
      const temRelatorio = !!pedidosMap
      const cmv_incompleto = !temRelatorio || pedidosSemCorrespondencia > 0 || skusVTArray.some(s => s.sem_custo)

      return NextResponse.json({
        preview: modoPreview,
        arquivo: file.name,
        marketplace: 'AMAZON',
        formato: 'VT',
        periodo: {
          inicio: vt.periodo.inicio,
          fim: vt.periodo.fim,
          ano: anoExplicito ?? vt.periodo.ano,
          mes: mesExplicito ?? vt.periodo.mes,
        },
        pedidos: vt.pedidos,
        // Receitas e taxas (já em R$ — o formato VT não usa centavos)
        venda_bruta:   vt.venda_bruta,
        desconto:      vt.desconto,
        tarifa_venda:  Math.abs(vt.tarifas),
        outros:        vt.outros,
        receita_total: vt.venda_bruta + vt.desconto,
        // Linha de fechamento
        total_liquido: vt.total_liquido,
        reembolsos:    vt.reembolsos,
        taxas_servico: vt.taxas_servico,
        reembolso_inventario: vt.reembolso_inventario,
        outros_tipos:  vt.outros_tipos,
        tipos:         vt.tipos,
        linhas:        vt.linhas,
        // CMV via Relatório de Pedidos (D1)
        cmv_disponivel: temRelatorio && !cmv_incompleto,
        cmv_incompleto,
        cmv_total: cmv_total_vt,
        relatorio_pedidos_presente: temRelatorio,
        pedidos_com_cmv: pedidosComCmv,
        pedidos_sem_correspondencia: pedidosSemCorrespondencia,
        skus: skusVTArray,
        alertas: {
          cmv_indisponivel: temRelatorio
            ? (cmv_incompleto ? 'CMV parcial: alguns pedidos ou SKUs não foram reconciliados com o Relatório de Pedidos.' : null)
            : 'O extrato "Visualizar Transações" não contém SKU nem quantidade. Importe o Relatório de Pedidos para apurar o CMV da Amazon.',
          sem_custo: skusVTArray.filter(s => s.sem_custo).map(s => s.sku),
          margem_negativa: [],
          pedidos_sem_correspondencia: pedidosSemCorrespondencia > 0
            ? `${pedidosSemCorrespondencia} pedidos do VT não encontrados no Relatório de Pedidos.`
            : null,
        },
      })
    }

    // ─── Formato MTU (legado) — parser original, preservado ──────────────
    if (rows.length < 12) return NextResponse.json({ error: 'Arquivo vazio ou formato incorreto' }, { status: 400 })

    // Busca custos do catálogo por SKU
    const produtos = await prisma.produto_catalogo.findMany({
      where: { workspace_id: workspaceId },
      select: { sku_interno: true, custo_brl: true, sku_alias: true },
    })
    const custoPorSku: Record<string, number> = {}
    produtos.forEach(p => {
      if (!p.custo_brl) return
      if (p.sku_interno) custoPorSku[p.sku_interno.toUpperCase()] = p.custo_brl
      if (p.sku_alias) p.sku_alias.split(',').forEach(a => { const s = a.trim().toUpperCase(); if (s) custoPorSku[s] = p.custo_brl! })
    })

    // Inicializa acumuladores
    const skus: Record<string, {
      sku: string; titulo: string; unidades: number; pedidos: number
      venda: number; remessa: number; desconto: number
      tarifa_venda: number; taxa_fba: number
      custo_unit: number; sem_custo: boolean
    }> = {}

    let totais = {
      venda: 0, remessa: 0, desconto: 0, tarifa_venda: 0, taxa_fba: 0,
      outras_taxas: 0, reembolsos: 0, ajustes: 0, taxas_servico: 0,
      estoque_fba: 0, pedidos: 0, unidades: 0,
    }

    const diasComVenda = new Set<string>()

    // Processa a partir da linha 11 (índice 10) — header está em índice 9
    for (let i = 10; i < rows.length; i++) {
      const r = rows[i] as unknown[]
      if (!r?.[COL.TIPO]) continue

      const tipo  = String(r[COL.TIPO]).trim()
      const total = (Number(r[COL.TOTAL]) || 0) / 100  // centavos → reais

      // Tipos que NÃO são venda direta
      if (tipo === 'Transferir') continue
      if (tipo === 'Reembolso')      { totais.reembolsos    += total; continue }
      if (tipo === 'Ajuste')         { totais.ajustes       += total; continue }
      if (tipo === 'Taxa de serviço'){ totais.taxas_servico += total; continue }
      if (tipo === 'Taxa de Estoque FBA') { totais.estoque_fba += total; continue }

      // Apenas pedidos (vendas)
      if (tipo !== 'Pedido') continue

      const skuRaw = String(r[COL.SKU] ?? '').trim()
      const sku    = limparSkuAmazon(skuRaw)
      if (!sku) continue

      const titulo = String(r[COL.DESC] ?? '').slice(0, 60)
      const qty    = Number(r[COL.QTD]) || 0

      // Centavos → reais
      const venda  = (Number(r[COL.VENDA])         || 0) / 100
      const remessa= (Number(r[COL.REMESSA])        || 0) / 100
      const desc   = (Number(r[COL.DESCONTO])       || 0) / 100   // negativo = cupom
      const tarifV = (Number(r[COL.TARIFA_VENDA])   || 0) / 100   // negativo
      const taxFBA = (Number(r[COL.TAXA_FBA])        || 0) / 100   // negativo

      // Data
      const dataDate = parseDateBR(String(r[COL.DATA]))
      if (dataDate) {
        const key = dataDate.toISOString().split('T')[0]
        diasComVenda.add(key)
      }

      // Acumula totais
      totais.venda       += venda
      totais.remessa     += remessa
      totais.desconto    += desc
      totais.tarifa_venda+= tarifV
      totais.taxa_fba    += taxFBA
      totais.pedidos++
      totais.unidades    += qty

      // Por SKU
      if (!skus[sku]) skus[sku] = {
        sku, titulo, unidades: 0, pedidos: 0,
        venda: 0, remessa: 0, desconto: 0, tarifa_venda: 0, taxa_fba: 0,
        custo_unit: custoPorSku[sku] ?? 0,
        sem_custo: !custoPorSku[sku],
      }
      skus[sku].unidades    += qty
      skus[sku].pedidos++
      skus[sku].venda       += venda
      skus[sku].remessa     += remessa
      skus[sku].desconto    += desc
      skus[sku].tarifa_venda+= tarifV
      skus[sku].taxa_fba    += taxFBA
    }

    // Período: usa explícito do usuário ou detecta da maioria das datas
    const diasArr = [...diasComVenda].sort()
    const dataInicio = diasArr[0] ?? ''
    const dataFim    = diasArr[diasArr.length - 1] ?? ''
    const ano = anoExplicito ?? parseInt(dataFim.split('-')[0])
    const mes = mesExplicito ?? parseInt(dataFim.split('-')[1])

    // Receita total = venda + remessa + desconto (cupom já é negativo)
    const receitaTotal = totais.venda + totais.remessa + totais.desconto

    // Calcula lucro por SKU
    const skusArray = Object.values(skus).map(s => {
      const recS       = s.venda + s.remessa + s.desconto
      const custoTotal = s.custo_unit * s.unidades
      const lucroBruto = recS + s.tarifa_venda + s.taxa_fba - custoTotal
      const margem     = recS > 0 ? (lucroBruto / recS) * 100 : 0
      const ticketMed  = s.unidades > 0 ? recS / s.unidades : 0
      const lucroUnit  = s.unidades > 0 ? lucroBruto / s.unidades : 0
      return {
        ...s, receitaTotal: recS, custo_total: custoTotal,
        lucro_bruto: lucroBruto, margem_perc: margem,
        ticket_medio: ticketMed, lucro_unit: lucroUnit,
        tarifa_venda: Math.abs(s.tarifa_venda),  // exibe positivo
        taxa_fba:     Math.abs(s.taxa_fba),
      }
    }).sort((a, b) => b.lucro_bruto - a.lucro_bruto)

    const tarifasTotalAbs = Math.abs(totais.tarifa_venda)
    const fbaTotal        = Math.abs(totais.taxa_fba)
    const lucroBrutoTotal = receitaTotal - tarifasTotalAbs - fbaTotal -
      skusArray.reduce((s, x) => s + x.custo_total, 0)

    const resultado = {
      arquivo:      file.name,
      marketplace:  'AMAZON',
      formato:      'MTU' as const,
      cmv_disponivel: true,
      periodo:      { inicio: dataInicio, fim: dataFim, ano, mes },
      pedidos:      totais.pedidos,
      unidades:     totais.unidades,
      dias_com_venda: diasComVenda.size,
      // Receitas
      venda_bruta:  totais.venda,
      remessa:      totais.remessa,
      desconto:     totais.desconto,
      receita_total: receitaTotal,
      // Taxas Amazon
      tarifa_venda: tarifasTotalAbs,
      taxa_fba:     fbaTotal,
      // Outros
      reembolsos:   totais.reembolsos,
      ajustes:      totais.ajustes,
      taxas_servico: totais.taxas_servico,
      estoque_fba:  totais.estoque_fba,
      // Resultado
      lucro_bruto:  lucroBrutoTotal,
      ticket_medio: totais.unidades > 0 ? receitaTotal / totais.unidades : 0,
      custo_total:  skusArray.reduce((s, x) => s + x.custo_total, 0),
      // Por SKU
      skus:         skusArray,
      alertas: {
        sem_custo:        skusArray.filter(s => s.sem_custo).map(s => s.sku),
        margem_negativa:  skusArray.filter(s => s.margem_perc < 0 && !s.sem_custo).map(s => s.sku),
      },
    }

    return NextResponse.json({ preview: modoPreview, ...resultado })
  } catch (err) {
    console.error('[analisar-amazon]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
