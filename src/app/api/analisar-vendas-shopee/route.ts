/**
 * Parser do Relatório de Vendas Shopee (.xlsx)
 * Aba: "orders" — Row 0 = header, Row 1+ = dados
 *
 * Colunas relevantes:
 *  0  ID do pedido          1  Status do pedido
 *  3  Cancelar Motivo        4  Status da Devolução / Reembolso
 * 10  Data de criação       12  Nº de referência do SKU principal
 * 13  Nome do Produto       14  Número de referência SKU
 * 15  Nome da variação      17  Preço acordado
 * 18  Quantidade            19  Returned quantity
 * 20  Subtotal do produto   33  Ajuste por pagamento via PIX
 * 39  Valor Total           40  Taxa de envio paga pelo comprador
 * 41  Desconto de Frete Aprox  44  Taxa de comissão bruta
 * 45  Taxa de comissão líquida 46  Taxa de serviço bruta
 * 47  Taxa de serviço líquida  48  Total global
 * 49  Valor estimado do frete
 *
 * Regra de receita oficial:
 * - Usar Valor Total (col 39) para DRE — exclui automaticamente cancelados e devolvidos (val=0)
 * - Status válidos: Concluído, Entregue, Enviado, "O comprador pode pedir..."
 * - Devoluções: col 4 preenchida OU col 19 > 0
 */
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'

const COL = {
  ID: 0, STATUS: 1, MOTIVO: 3, STATUS_DEV: 4,
  DATA: 10, SKU_PRINCIPAL: 12, NOME_PRODUTO: 13,
  SKU: 14, VARIACAO: 15, PRECO_ACORDADO: 17,
  QTD: 18, RETURNED_QTY: 19, SUBTOTAL: 20,
  AJUSTE_PIX: 33, VALOR_TOTAL: 39, FRETE_COMPRADOR: 40,
  DESC_FRETE: 41, COM_BRUTA: 44, COM_LIQUIDA: 45,
  SERV_BRUTA: 46, SERV_LIQUIDA: 47, TOTAL_GLOBAL: 48,
  FRETE_ESTIMADO: 49,
}

const STATUS_VALIDOS = ['Concluído', 'Entregue', 'Enviado', 'O comprador pode pedir']

function n(v: unknown): number {
  return parseFloat(String(v ?? '').replace(',', '.')) || 0
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await getAuthContext()
    const formData = await req.formData()
    const file = formData.get('file') as File
    const mesExplicito = formData.get('mes') ? parseInt(String(formData.get('mes'))) : null
    const anoExplicito = formData.get('ano') ? parseInt(String(formData.get('ano'))) : null

    if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buffer, { type: 'buffer' })

    // Busca aba "orders" (case-insensitive)
    const sheetName = wb.SheetNames.find(s => s.toLowerCase() === 'orders') ?? wb.SheetNames[0]
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

    if (rows.length < 3) return NextResponse.json({ error: 'Arquivo vazio ou formato incorreto' }, { status: 400 })

    // Valida que é relatório Shopee
    const header = rows[0].map(c => String(c).toLowerCase())
    if (!header.some(h => h.includes('status do pedido')) || !header.some(h => h.includes('taxa de comissão'))) {
      return NextResponse.json({ error: 'Este arquivo não parece ser o Relatório de Vendas Shopee.' }, { status: 400 })
    }

    // Busca custos do catálogo por SKU
    const produtos = await prisma.produto_catalogo.findMany({
      where: { workspace_id: workspaceId },
      select: { sku_interno: true, custo_brl: true, nome: true },
    })
    const custoPorSku: Record<string, number> = {}
    const nomePorSku: Record<string, string> = {}
    produtos.forEach(p => {
      if (p.sku_interno) {
        custoPorSku[p.sku_interno.toUpperCase()] = p.custo_brl ?? 0
        nomePorSku[p.sku_interno.toUpperCase()] = p.nome
      }
    })

    // Acumuladores
    let receita_total = 0
    let comissao_liquida = 0
    let servico_liquido = 0
    let frete_estimado = 0
    let pedidos_validos = 0
    let unidades_total = 0
    let desconto_vendedor = 0

    // Cancelados e devoluções (para exibição)
    const cancelados: Array<{ sku: string; motivo: string; valor: number }> = []
    const devolucoes: Array<{ sku: string; status_dev: string; returned_qty: number; valor: number }> = []

    const skus: Record<string, {
      sku: string; nome_produto: string; nome_catalogo: string; variacao: string
      unidades: number; receita: number; comissao: number; servico: number
      frete: number; custo_unit: number; sem_custo: boolean
    }> = {}

    // Período
    const datas: Date[] = []

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] as unknown[]
      if (!r?.[COL.ID]) continue

      const status = String(r[COL.STATUS] ?? '').trim()
      const statusDev = String(r[COL.STATUS_DEV] ?? '').trim()
      const returnedQty = n(r[COL.RETURNED_QTY])
      const skuRaw = String(r[COL.SKU] ?? '').trim()
      const sku = skuRaw.toUpperCase()
      const valorTotal = n(r[COL.VALOR_TOTAL])

      // Data
      const dataStr = String(r[COL.DATA] ?? '').slice(0, 10)
      if (dataStr) datas.push(new Date(dataStr))

      // Cancelados — excluir completamente
      if (status.toLowerCase().startsWith('cancelad')) {
        cancelados.push({
          sku: skuRaw,
          motivo: String(r[COL.MOTIVO] ?? ''),
          valor: n(r[COL.SUBTOTAL]),
        })
        continue
      }

      // Devoluções — rastrear separado, excluir da receita (ValorTotal = 0)
      if (statusDev || returnedQty > 0) {
        devolucoes.push({
          sku: skuRaw,
          status_dev: statusDev,
          returned_qty: returnedQty,
          valor: n(r[COL.SUBTOTAL]),
        })
        // Ainda inclui na contagem de unidades mas valor total = 0, então não entra na receita
      }

      // Status válidos para receita
      if (!STATUS_VALIDOS.some(v => status.startsWith(v))) continue

      const qty = n(r[COL.QTD])
      const comLiq = n(r[COL.COM_LIQUIDA])
      const servLiq = n(r[COL.SERV_LIQUIDA])
      const freteEst = n(r[COL.FRETE_ESTIMADO])
      const descVend = n(r[COL.SUBTOTAL]) - valorTotal > 0 ? 0 : n(r[COL.SUBTOTAL]) - valorTotal

      receita_total += valorTotal
      comissao_liquida += comLiq
      servico_liquido += servLiq
      frete_estimado += freteEst
      desconto_vendedor += n(r[COL.AJUSTE_PIX])
      pedidos_validos++
      unidades_total += qty

      const custo_unit = custoPorSku[sku] ?? 0
      const nome_produto = String(r[COL.NOME_PRODUTO] ?? '').slice(0, 80)
      const variacao = String(r[COL.VARIACAO] ?? '').trim()
      const nome_catalogo = nomePorSku[sku] ?? ''

      if (!skus[sku]) {
        skus[sku] = {
          sku: skuRaw, nome_produto, nome_catalogo, variacao,
          unidades: 0, receita: 0, comissao: 0, servico: 0, frete: 0,
          custo_unit, sem_custo: custo_unit === 0,
        }
      }
      skus[sku].unidades += qty
      skus[sku].receita += valorTotal
      skus[sku].comissao += comLiq
      skus[sku].servico += servLiq
      skus[sku].frete += freteEst
    }

    // Período
    datas.sort((a, b) => a.getTime() - b.getTime())
    const dataInicio = datas[0]?.toISOString().slice(0, 10) ?? ''
    const dataFim = datas[datas.length - 1]?.toISOString().slice(0, 10) ?? ''
    const anoDetect = anoExplicito ?? (dataFim ? parseInt(dataFim.slice(0, 4)) : new Date().getFullYear())
    const mesDetect = mesExplicito ?? (dataFim ? parseInt(dataFim.slice(5, 7)) : new Date().getMonth() + 1)

    const skusArray = Object.values(skus).map(s => {
      const custo_total = s.custo_unit * s.unidades
      const lucro_bruto = s.receita - s.comissao - s.servico - custo_total
      return {
        ...s,
        custo_total,
        lucro_bruto,
        margem_perc: s.receita > 0 ? (lucro_bruto / s.receita) * 100 : 0,
        ticket_medio: s.unidades > 0 ? s.receita / s.unidades : 0,
        lucro_unit: s.unidades > 0 ? lucro_bruto / s.unidades : 0,
      }
    }).sort((a, b) => b.receita - a.receita)

    const custo_produtos = skusArray.reduce((s, x) => s + x.custo_total, 0)

    // SKUs sem custo cadastrado
    const sku_sem_custo = skusArray.filter(s => s.sem_custo).map(s => s.sku)

    return NextResponse.json({
      arquivo: file.name,
      periodo: { inicio: dataInicio, fim: dataFim, ano: anoDetect, mes: mesDetect },
      // Totais
      pedidos: pedidos_validos,
      unidades: unidades_total,
      receita_total,       // Valor Total (inclui frete comprador)
      comissao_liquida,
      servico_liquido,
      frete_estimado,
      custo_produtos,
      // Cancelamentos e devoluções
      cancelados_count: cancelados.length,
      cancelados,
      devolucoes_count: devolucoes.length,
      devolucoes,
      // SKUs
      skus: skusArray,
      alertas: { sku_sem_custo },
    })
  } catch (err) {
    console.error('[analisar-vendas-shopee]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
