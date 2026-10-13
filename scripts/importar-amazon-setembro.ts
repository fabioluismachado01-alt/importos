/**
 * Importa Amazon setembro/2026:
 *   - Relatorio de Transações.csv  (MTU-PT: header na linha 9, valores BR)
 *   - relatorio de pedidos.txt     (TSV, item-price + qty por SKU)
 */
import * as fs from 'fs'
import { createInterface } from 'readline'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } })
const WORKSPACE_ID = 'cmpx6dq5k000fvckk6d1aknfq'
const ANO = 2026
const MES = 9
const DIR = 'C:\\Users\\fabio\\Downloads\\Relatório de Vendas\\amazon'

// ─── helpers ─────────────────────────────────────────────────────────────────

function parseBR(v: string): number {
  const s = v.trim()
  if (!s) return 0
  const n = s.includes(',') ? parseFloat(s.replace(/\./g, '').replace(',', '.')) : parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

function parseCsvRow(line: string): string[] {
  const result: string[] = []
  let cur = '', inQ = false
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ }
    else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = '' }
    else { cur += ch }
  }
  result.push(cur.trim())
  return result
}

// ─── CSV Transações (MTU-PT) ──────────────────────────────────────────────────

async function parseCsvTransacoes(filePath: string) {
  const lines: string[] = []
  const rl = createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity })
  for await (const line of rl) if (line.trim()) lines.push(line)

  // Header at line index 9 (0-based)
  const header = parseCsvRow(lines[9]).map(h => h.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
  const find = (...kws: string[]) => {
    for (const kw of kws) { const i = header.findIndex(h => h.includes(kw)); if (i !== -1) return i }
    return -1
  }
  const C = {
    TIPO:     find('tipo'),
    ORDER_ID: find('id do pedido', 'order id'),
    SKU:      find('sku'),
    QTY:      find('quantidade', 'quantity'),
    RECEITA:  find('vendas do produto', 'product sales'),
    ENVIO:    find('creditos de remessa', 'shipping credits'),
    DESCONTO: find('descontos promocionais', 'promotional rebates'),
    COMISSAO: find('tarifas de venda', 'selling fees'),
    FBA:      find('taxas fba', 'fba fees'),
  }
  console.log('Colunas MTU detectadas:', C)

  let receitaBruta = 0, tarifasVenda = 0, taxasFBA = 0, descontos = 0, credEnvio = 0
  let reembolsosBruto = 0, ajustes = 0
  const pedidosIds = new Set<string>()

  for (let i = 10; i < lines.length; i++) {
    const cols = parseCsvRow(lines[i])
    if (cols.length < 5) continue
    const tipo = (cols[C.TIPO] ?? '').trim().toLowerCase()
    if (!tipo) continue
    const orderId = (cols[C.ORDER_ID] ?? '').trim()
    if (orderId && orderId !== '---') pedidosIds.add(orderId)

    if (tipo === 'taxa de estoque fba') {
      taxasFBA += Math.abs(parseBR(cols[C.FBA] ?? ''))
      continue
    }
    if (tipo !== 'pedido') {
      ajustes += Math.abs(parseBR(cols[C.RECEITA] ?? ''))
      continue
    }

    const rec  = parseBR(cols[C.RECEITA]  ?? '')
    const desc = parseBR(cols[C.DESCONTO] ?? '')
    const com  = parseBR(cols[C.COMISSAO] ?? '')
    const env  = parseBR(cols[C.ENVIO]    ?? '')
    const fba  = parseBR(cols[C.FBA]      ?? '')

    receitaBruta += rec
    tarifasVenda += Math.abs(com)
    taxasFBA     += Math.abs(fba)
    descontos    += Math.abs(desc)
    credEnvio    += env
  }

  return {
    receitaBruta, tarifasVenda, taxasFBA, descontos, credEnvio,
    reembolsosBruto, ajustes,
    pedidos: pedidosIds.size,
  }
}

// ─── TXT Pedidos ──────────────────────────────────────────────────────────────

async function parseTxtPedidos(filePath: string, custoPorSku: Record<string, number>) {
  const lines: string[] = []
  const rl = createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity })
  for await (const line of rl) lines.push(line)

  const hdr      = lines[0].split('\t')
  const iOrderId = hdr.indexOf('amazon-order-id')
  const iStatus  = hdr.indexOf('order-status')
  const iDate    = hdr.indexOf('purchase-date')
  const iSku     = hdr.indexOf('sku')
  const iQty     = hdr.indexOf('quantity')
  const iPrice   = hdr.indexOf('item-price')
  const iCanal   = hdr.indexOf('sales-channel')

  console.log(`TXT header: order-id=${iOrderId}, status=${iStatus}, date=${iDate}, sku=${iSku}, qty=${iQty}, price=${iPrice}, canal=${iCanal}`)

  let pedidos = 0, unidades = 0, receita = 0, custoProdutos = 0
  const skuLog: Record<string, { qty: number; custo: number; receita: number }> = {}

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t')
    if (cols.length < 10) continue
    const status = (cols[iStatus] ?? '').trim().toLowerCase()
    if (!status.startsWith('shipped') || status.includes('reject') || status.includes('return')) continue
    const canal = (cols[iCanal] ?? '').trim().toLowerCase()
    if (canal && canal !== 'amazon.com.br') continue

    const dateStr = (cols[iDate] ?? '').trim()
    if (dateStr) {
      const d = new Date(dateStr)
      if (d.getUTCMonth() + 1 !== MES || d.getUTCFullYear() !== ANO) continue
    }

    const qty    = parseInt(cols[iQty] ?? '0') || 0
    const price  = parseFloat((cols[iPrice] ?? '0').replace(/[^0-9.\-]/g, '')) || 0
    const skuRaw = (cols[iSku] ?? '').trim().replace(/_fba/gi, '').replace(/\s/g, '').toUpperCase()
    const custo  = custoPorSku[skuRaw] ?? 0

    pedidos++
    unidades      += qty
    receita       += price
    custoProdutos += custo * qty

    if (!skuLog[skuRaw]) skuLog[skuRaw] = { qty: 0, custo, receita: 0 }
    skuLog[skuRaw].qty     += qty
    skuLog[skuRaw].receita += price
  }

  return { pedidos, unidades, receita, custoProdutos, skuLog }
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Importação Amazon — Setembro/2026 ===\n')

  const fileCSV = `${DIR}\\Relatorio de Transações.csv`
  const fileTXT = `${DIR}\\relatorio de pedidos.txt`

  if (!fs.existsSync(fileCSV)) { console.error('CSV não encontrado:', fileCSV); return }
  if (!fs.existsSync(fileTXT)) { console.error('TXT não encontrado:', fileTXT); return }

  const produtos = await prisma.produto_catalogo.findMany({
    where: { workspace_id: WORKSPACE_ID },
    select: { sku_interno: true, custo_brl: true, sku_alias: true },
  })
  const custoPorSku: Record<string, number> = {}
  for (const p of produtos) {
    if (!p.custo_brl) continue
    if (p.sku_interno) custoPorSku[p.sku_interno.toUpperCase()] = p.custo_brl
    if (p.sku_alias) for (const a of p.sku_alias.split(',')) {
      const s = a.trim().toUpperCase(); if (s) custoPorSku[s] = p.custo_brl
    }
  }
  console.log(`Catálogo: ${Object.keys(custoPorSku).length} SKUs com custo`)

  const csv = await parseCsvTransacoes(fileCSV)
  const txt = await parseTxtPedidos(fileTXT, custoPorSku)

  console.log(`\nCSV: receita=${csv.receitaBruta.toFixed(2)} | tarifasVenda=${csv.tarifasVenda.toFixed(2)} | taxasFBA=${csv.taxasFBA.toFixed(2)} | pedidos=${csv.pedidos}`)
  console.log(`TXT: pedidos=${txt.pedidos} | un=${txt.unidades} | receita=${txt.receita.toFixed(2)} | custoProd=${txt.custoProdutos.toFixed(2)}`)
  console.log('TXT SKUs:', Object.entries(txt.skuLog).map(([k, v]) => `${k}:${v.qty}un@R$${(v.receita/v.qty).toFixed(2)}`).join(' | '))

  // Usar receita do CSV (mais precisa), CMV do TXT
  const primeiroDia = new Date(ANO, MES - 1, 1)
  const fatMes = await prisma.faturamento_mes.upsert({
    where: { workspace_id_ano_mes: { workspace_id: WORKSPACE_ID, ano: ANO, mes: MES } },
    update: {},
    create: {
      workspace_id: WORKSPACE_ID, ano: ANO, mes: MES,
      aliquota_simples: 0.08, dias_no_mes: 30,
      das_vencimento: new Date(ANO, MES, 20),
    },
  })

  const deleted = await prisma.lancamento.deleteMany({
    where: { faturamento_id: fatMes.id, descricao: { contains: 'Amazon Import' } },
  })
  if (deleted.count > 0) console.log(`\nRemovidos ${deleted.count} lançamentos Amazon anteriores`)

  const lancamentos: any[] = []
  const mk = (tipo: string, categoria: string, descricao: string, valor: number, canal?: string) =>
    ({ faturamento_id: fatMes.id, tipo, categoria, descricao, valor, data: primeiroDia, status: 'CONFIRMADO', e_automatico: false, ...(canal ? { canal } : {}) })

  if (csv.receitaBruta > 0) lancamentos.push(mk('RECEITA', 'AMAZON', `Amazon Import — Receita de Vendas (${csv.pedidos} pedidos, ${txt.unidades} un.)`, csv.receitaBruta, 'AMAZON'))
  if (csv.tarifasVenda > 0) lancamentos.push(mk('DESPESA_VARIAVEL', 'TARIFAS', 'Amazon Import — Tarifas de Venda Amazon', csv.tarifasVenda))
  if (csv.taxasFBA > 0)     lancamentos.push(mk('DESPESA_VARIAVEL', 'FRETE',   'Amazon Import — Taxas FBA (fulfillment)', csv.taxasFBA))
  if (txt.custoProdutos > 0)lancamentos.push(mk('DESPESA_VARIAVEL', 'CUSTO_PRODUTOS', 'Amazon Import — Custo com Produtos', txt.custoProdutos))

  await prisma.lancamento.createMany({ data: lancamentos })
  console.log(`\n✅ ${lancamentos.length} lançamentos criados:`)
  lancamentos.forEach(l => console.log(`   [${l.tipo.padEnd(16)} | ${l.categoria.padEnd(15)}] R$${l.valor.toFixed(2).padStart(12)}  "${l.descricao}"`))

  // Recalcular DRE
  const { calcularKPIs } = await import('../src/engines/finance')
  const lans = await prisma.lancamento.findMany({ where: { faturamento_id: fatMes.id, status: 'CONFIRMADO' }, select: { tipo: true, categoria: true, canal: true, valor: true, data: true, descricao: true } })
  const fat = await prisma.faturamento_mes.findUnique({ where: { id: fatMes.id }, select: { aliquota_simples: true, meta_mes: true, dias_no_mes: true, dlr_modo: true, dlr_percentual_custom: true, dlr_valor_fixo: true, das_valor_real: true, das_status: true } })
  const empresa = await prisma.empresa.findUnique({ where: { workspace_id: WORKSPACE_ID }, select: { aliquota_simples: true } })
  const finCfg = await prisma.finance_config.findFirst({ where: { workspace_id: WORKSPACE_ID }, orderBy: { ano: 'desc' }, select: { percentual_dlr_socio: true, percentual_reinvestimento: true, formula_previdencia: true } })
  const toD = (v: number) => v > 1 ? v / 100 : v
  const cfg = {
    aliquota_simples: toD(fat?.aliquota_simples ?? empresa?.aliquota_simples ?? 8),
    percentual_dlr_socio: finCfg?.percentual_dlr_socio ?? 0.5,
    percentual_reinvestimento: finCfg?.percentual_reinvestimento ?? 0.5,
    formula_previdencia: finCfg?.formula_previdencia ?? 'PRO_LABORE*0.20+LUCRO_BRUTO*0.11',
    dias_no_mes: fat?.dias_no_mes ?? 30,
    meta_mes: fat?.meta_mes ?? 0,
    dlr_modo: (fat?.dlr_modo as 'PERCENTUAL' | 'FIXO') ?? 'PERCENTUAL',
    dlr_percentual_custom: fat?.dlr_percentual_custom ?? undefined,
    dlr_valor_fixo: fat?.dlr_valor_fixo ?? undefined,
    das_valor_real: fat?.das_status === 'PAGO' ? fat?.das_valor_real : null,
  }
  const kpis = calcularKPIs(lans as any, cfg as any)
  await prisma.faturamento_mes.update({
    where: { id: fatMes.id },
    data: {
      receita_total: kpis.receita_total, receita_ml: kpis.receita_ml,
      receita_amazon: kpis.receita_amazon, receita_shopee: kpis.receita_shopee,
      receita_tiktok: kpis.receita_tiktok, receita_outros: kpis.receita_outros,
      receita_magalu: kpis.receita_magalu, receita_casas_bahia: kpis.receita_casas_bahia,
      receita_presencial: kpis.receita_presencial,
      desp_custo_produtos: kpis.desp_custo_produtos, desp_tarifas: kpis.desp_tarifas,
      desp_frete: kpis.desp_frete, desp_fatura_ml: kpis.desp_fatura_ml,
      desp_armazenagem: kpis.desp_armazenagem, desp_ads_ml: kpis.desp_ads_ml,
      desp_ads_outros: kpis.desp_ads_outros, desp_outras_taxas: kpis.desp_outras_taxas,
      das_valor_calc: kpis.das_valor_calc, das_vencimento: new Date(ANO, MES, 20),
      desp_pro_labore: kpis.desp_pro_labore, desp_inss: kpis.desp_inss,
      desp_contabilidade: kpis.desp_contabilidade, desp_erp: kpis.desp_erp,
      desp_emprestimo: kpis.desp_emprestimo, desp_aluguel: kpis.desp_aluguel,
      desp_pagina_ml: kpis.desp_pagina_ml, desp_previdencia_privada: kpis.desp_previdencia_privada,
      desp_fixas_outras: kpis.desp_fixas_outras,
      lucro_bruto: kpis.lucro_bruto, lucro_liquido: kpis.lucro_liquido,
      margem_contribuicao: kpis.margem_contribuicao, break_even: kpis.break_even, roas_atual: kpis.roas_atual,
    },
  })

  const updated = await prisma.faturamento_mes.findUnique({ where: { id: fatMes.id }, select: { receita_total: true, receita_amazon: true, lucro_bruto: true, lucro_liquido: true } })
  console.log(`\n✅ DRE setembro/2026: receita_total=R$${updated?.receita_total?.toFixed(2)} | receita_amazon=R$${updated?.receita_amazon?.toFixed(2)} | lucro_liq=R$${updated?.lucro_liquido?.toFixed(2)}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
