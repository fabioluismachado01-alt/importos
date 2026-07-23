/**
 * Parser do Relatório de Pedidos Amazon
 * Menu → Pedidos → Relatório de Pedidos → Todos os pedidos
 *
 * Formato: TSV (tab-separated), header linha 0, valores em BRL
 * Colunas relevantes:
 *   0: amazon-order-id   2: purchase-date   4: order-status
 *   6: sales-channel     10: product-name   11: sku
 *   14: quantity         16: item-price     18: shipping-price
 *   22: item-promotion-discount
 *
 * Regras de filtragem por order-status:
 *   ✅ INCLUIR — "Shipped"    (entregue ou em trânsito)
 *   ❌ EXCLUIR — "Cancelled"  (cancelado pelo comprador ou Amazon)
 *   ❌ EXCLUIR — "Pending"    (aguardando pagamento — ainda não confirmado)
 *   ❌ EXCLUIR — "Unshipped"  (pago mas ainda não enviado — inclui quando importar)
 *
 * Regras de filtragem por sales-channel:
 *   ✅ INCLUIR — "Amazon.com.br"  (venda direta ao consumidor)
 *   ❌ EXCLUIR — "Non-Amazon"     (remoção FBA, MCF, atacado B2B — sem receita real)
 *
 * Extrai: SKUs, quantidades, receita por produto → margem via catálogo
 */
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'

const COL = {
  ORDER_ID:    0,
  DATA:        2,
  STATUS:      4,
  CANAL:       6,   // sales-channel: "Amazon.com.br" = venda real; "Non-Amazon" = remoção FBA / MCF / B2B
  PRODUTO:    10,
  SKU:        11,
  QTD:        14,
  PRECO:      16,
  FRETE:      18,
  DESCONTO:   22,
}

// Canal de vendas aceito — exclui remoções FBA, MCF e pedidos B2B que têm item-price = 0
const CANAL_VALIDO = 'amazon.com.br'

// Pedidos cancelados — exclui definitivamente
const STATUS_CANCELADOS = new Set(['cancelled', 'canceled'])

// Variações de "Shipped" que NÃO são venda (rejeições/devoluções)
const STATUS_SHIPPED_EXCLUIDOS = new Set([
  'shipped - rejected by buyer',
  'shipped - returned to seller',
  'shipped - damaged',
])

// Pedidos pendentes/não enviados — exclui por agora (podem aparecer no mês seguinte)
const STATUS_PENDENTES = new Set(['pending', 'unshipped', 'partiallyshipped'])

function isStatusValido(status: string): boolean {
  // Qualquer variação de "Shipped" é válida, exceto as de rejeição/devolução
  return status.startsWith('shipped') && !STATUS_SHIPPED_EXCLUIDOS.has(status)
}

function normalizarSku(sku: string): string {
  return sku.replace(/_fba/gi, '').replace(/\s/g, '').trim().toUpperCase()
}

function parseBRL(v: unknown): number {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''))
  return isNaN(n) ? 0 : n
}

function parseDataISO(str: string): Date | null {
  // "2026-06-30T18:22:08+00:00"
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]))
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await getAuthContext()
    const formData = await req.formData()
    const file = formData.get('file') as File
    const mesExplicito = formData.get('mes') ? parseInt(String(formData.get('mes'))) : null
    const anoExplicito = formData.get('ano') ? parseInt(String(formData.get('ano'))) : null
    // IDs dos pedidos do CSV — quando fornecidos, filtra o TXT para cobrir exatamente os mesmos pedidos
    const orderIdsRaw = formData.get('order_ids')
    const orderIdsFilter: Set<string> | null = orderIdsRaw
      ? new Set(JSON.parse(String(orderIdsRaw)) as string[])
      : null

    if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())

    // TSV: lê como string com separador de tabulação
    const wb = XLSX.read(buffer, { type: 'buffer', FS: '\t' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

    if (rows.length < 2) return NextResponse.json({ error: 'Arquivo vazio ou formato incorreto' }, { status: 400 })

    // Valida cabeçalho
    const header = rows[0].map(c => String(c).toLowerCase())
    if (!header.some(h => h.includes('amazon-order-id')) || !header.some(h => h === 'sku')) {
      return NextResponse.json({
        error: 'Formato não reconhecido. Envie o "Relatório de Pedidos" (Menu → Pedidos → Relatório de Pedidos).'
      }, { status: 400 })
    }

    // Busca custos do catálogo por SKU
    const produtos = await prisma.produto_catalogo.findMany({
      where: { workspace_id: workspaceId },
      select: { sku_interno: true, custo_brl: true, nome: true, sku_alias: true },
    })
    const custoPorSku: Record<string, number> = {}
    const nomePorSku:  Record<string, string>  = {}
    produtos.forEach(p => {
      if (p.sku_interno) {
        const k = p.sku_interno.toUpperCase()
        if (p.custo_brl) custoPorSku[k] = p.custo_brl
        nomePorSku[k] = p.nome
      }
      if (p.sku_alias) p.sku_alias.split(',').forEach(a => {
        const s = a.trim().toUpperCase(); if (!s) return
        if (p.custo_brl) custoPorSku[s] = p.custo_brl
        nomePorSku[s] = p.nome
      })
    })

    // Acumuladores por SKU
    const skus: Record<string, {
      sku: string; titulo: string; nome_catalogo: string
      unidades: number; pedidos: number
      venda: number; frete: number; desconto: number
      custo_unit: number; sem_custo: boolean
    }> = {}

    const diasComVenda = new Set<string>()
    let pedidos_total = 0
    let unidades_total = 0
    let cancelados = 0
    let pendentes = 0

    // Período detectado das datas
    const datasDoMes: Date[] = []

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] as unknown[]
      if (!r?.[COL.ORDER_ID]) continue

      const status   = String(r[COL.STATUS] ?? '').trim().toLowerCase()
      const canal    = String(r[COL.CANAL]  ?? '').trim().toLowerCase()
      const skuRaw   = String(r[COL.SKU]    ?? '').trim()
      const dataStr  = String(r[COL.DATA]   ?? '').trim()

      if (!skuRaw) continue

      // Remoções FBA, MCF e pedidos B2B — sales-channel = "Non-Amazon" — não são vendas ao consumidor
      if (canal && canal !== CANAL_VALIDO) continue

      // Se o CSV forneceu seus order IDs, só conta pedidos que aparecem lá (mesmo período)
      const orderId = String(r[COL.ORDER_ID] ?? '').trim()
      if (orderIdsFilter && orderId && !orderIdsFilter.has(orderId)) continue

      const data = parseDataISO(dataStr)
      if (!data) continue

      // Filtra pelo mês/ano explícito se fornecido
      if (mesExplicito && data.getMonth() + 1 !== mesExplicito) continue
      if (anoExplicito && data.getFullYear() !== anoExplicito) continue

      // Contadores de status
      if (STATUS_CANCELADOS.has(status)) { cancelados++; continue }
      if (STATUS_PENDENTES.has(status))  { pendentes++; continue }
      if (!isStatusValido(status))       { pendentes++; continue }   // qualquer outro status desconhecido → pendente

      const sku    = normalizarSku(skuRaw)
      const titulo = String(r[COL.PRODUTO] ?? '').slice(0, 80)
      const qty    = Math.max(1, Number(r[COL.QTD]) || 1)
      const preco  = parseBRL(r[COL.PRECO])
      const frete  = parseBRL(r[COL.FRETE])
      const desc   = parseBRL(r[COL.DESCONTO])  // positivo = desconto

      pedidos_total++
      unidades_total += qty

      diasComVenda.add(data.toISOString().split('T')[0])
      datasDoMes.push(data)

      if (!skus[sku]) {
        const custo_unit  = custoPorSku[sku] ?? 0
        const nome_cat    = nomePorSku[sku] ?? ''
        skus[sku] = {
          sku, titulo, nome_catalogo: nome_cat,
          unidades: 0, pedidos: 0,
          venda: 0, frete: 0, desconto: 0,
          custo_unit, sem_custo: !custo_unit,
        }
      }

      skus[sku].unidades += qty
      skus[sku].pedidos++
      skus[sku].venda    += preco * qty
      skus[sku].frete    += frete
      skus[sku].desconto += desc
    }

    // Determina período
    const diasArr = [...diasComVenda].sort()
    const dataFim = diasArr[diasArr.length - 1] ?? ''
    const dateRef = datasDoMes.length > 0 ? datasDoMes[Math.floor(datasDoMes.length / 2)] : new Date()
    const ano = anoExplicito ?? dateRef.getFullYear()
    const mes = mesExplicito ?? dateRef.getMonth() + 1

    const skusArray = Object.values(skus).map(s => {
      const custo_total = s.custo_unit * s.unidades
      const receita_liq = s.venda - s.desconto
      const margem_perc = receita_liq > 0
        ? ((receita_liq - custo_total) / receita_liq) * 100
        : 0
      return {
        sku:          s.sku,
        titulo:       s.titulo,
        nome_catalogo: s.nome_catalogo,
        unidades:     s.unidades,
        pedidos:      s.pedidos,
        venda:        s.venda,
        frete:        s.frete,
        desconto:     s.desconto,
        receita_liq,
        taxa_fba:     0,   // não disponível neste relatório — vem do "Visualizar Transações"
        custo_unit:   s.custo_unit,
        custo_total,
        margem_perc,
        ticket_medio: s.unidades > 0 ? s.venda / s.unidades : 0,
        sem_custo:    s.sem_custo,
      }
    }).sort((a, b) => b.venda - a.venda)

    const receita_total = skusArray.reduce((s, x) => s + x.venda, 0)
    const custo_total   = skusArray.reduce((s, x) => s + x.custo_total, 0)

    return NextResponse.json({
      arquivo:         file.name,
      fonte:           'RELATORIO_PEDIDOS',
      periodo:         { inicio: diasArr[0] ?? '', fim: dataFim, ano, mes },
      pedidos:         pedidos_total,
      unidades:        unidades_total,
      cancelados,
      pendentes,
      dias_com_venda:  diasComVenda.size,
      receita_total,
      custo_total,
      skus:            skusArray,
      alertas: {
        sem_custo:       skusArray.filter(s => s.sem_custo).map(s => s.sku),
        margem_negativa: skusArray.filter(s => s.margem_perc < 0 && !s.sem_custo).map(s => s.sku),
      },
      // Compatibilidade com interface GeralData (campos não disponíveis = 0)
      fba_fulfillment:      0,
      fba_armazenagem:      0,
      mensalidade:          0,
      outras_taxas_servico: 0,
      reembolsos_count:     0,
      reembolsos_bruto:     0,
      reembolsos_comissao:  0,
      reembolsos_fba:       0,
      reembolsos_liquido:   0,
      ajustes:              0,
      publicidade_interno:  0,
    })
  } catch (err) {
    console.error('[analisar-relatorio-pedidos]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
