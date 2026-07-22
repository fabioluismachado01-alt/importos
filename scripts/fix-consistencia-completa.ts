/**
 * fix-consistencia-completa.ts
 *
 * Reconstrói ml_pedido e ml_estoque para que os dados sejam consistentes:
 *  - Pedidos distribuídos em 12 meses (Jul/25 → Jul/26)
 *  - Apenas SKUs do catálogo (8 produtos reais)
 *  - Preços = catalog.preco_venda
 *  - Revenue ML de cada mês ≈ 45% do faturamento daquele mês
 *  - custo_produto = landed cost real (EXW × câmbio + impostos de importação)
 *  - Estoque com quantidades plausíveis
 *  - Catalog custo_brl corrigido para refletir custo real (EXW × câmbio)
 */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// ── Configurações ────────────────────────────────────────────────────
const CAMBIO = 5.72
const ML_PCT = 0.45       // ML representa 45% do faturamento total
const TARIFA_PCT = 0.165  // Tarifa ML ~16,5% (marketplace + anúncio)
const FRETE_GRATIS = 0    // fulfillment: frete é do vendedor

// ── Produtos: dados coerentes ─────────────────────────────────────────
// exw_usd:  preço EXW fábrica China
// cif_factor: multiplicador para CIF (inclui frete proporcional + seguro ~22-30%)
// ii_pct:   Imposto de Importação
// ipi_pct:  IPI
// pis_pct, cofins_pct, icms_pct: demais impostos
// preco_ml: preço de venda no ML (= catalog.preco_venda — alinhado abaixo)
const PRODUTOS = [
  { sku: 'MPD-XXL-SPD-01', nome: 'Mousepad XXL Speed 90×40cm',        exw_usd:  3.70, cif_factor: 1.22, ii: 16, ipi:  0, preco_ml:  69.90, share: 0.22 },
  { sku: 'HUB-USC-7X1-01', nome: 'Hub USB-C 7 em 1 com HDMI 4K',      exw_usd:  8.10, cif_factor: 1.20, ii: 16, ipi:  0, preco_ml: 139.90, share: 0.15 },
  { sku: 'SUP-NTB-ERG-01', nome: 'Suporte Ergonômico para Notebook',   exw_usd:  5.90, cif_factor: 1.22, ii: 16, ipi:  0, preco_ml:  99.90, share: 0.13 },
  { sku: 'WEB-FHD-RNG-01', nome: 'Webcam Full HD 1080p com Ring Light',exw_usd: 10.90, cif_factor: 1.20, ii: 16, ipi:  5, preco_ml: 179.90, share: 0.12 },
  { sku: 'HDS-GAM-71-01',  nome: 'Headset Gamer 7.1 Surround USB',    exw_usd: 13.20, cif_factor: 1.20, ii: 16, ipi:  5, preco_ml: 219.90, share: 0.11 },
  { sku: 'SUP-MON-DUP-01', nome: 'Suporte Articulado Monitor Duplo',   exw_usd: 14.80, cif_factor: 1.22, ii: 16, ipi:  0, preco_ml: 249.90, share: 0.10 },
  { sku: 'MES-GAM-RGB-01', nome: 'Mesa Gamer LED RGB 120×60cm',        exw_usd: 31.00, cif_factor: 1.28, ii: 35, ipi:  0, preco_ml: 549.90, share: 0.10 },
  { sku: 'CAD-GAM-PRO-01', nome: 'Cadeira Gamer Pro RGB Reclinável',   exw_usd: 52.00, cif_factor: 1.28, ii: 35, ipi:  0, preco_ml: 899.90, share: 0.07 },
]

// Calcula landed cost real para cada produto
function landedCost(prod: typeof PRODUTOS[0]) {
  const cif_brl = prod.exw_usd * CAMBIO * prod.cif_factor
  const pis = 2.10, cofins = 9.65, icms = 17
  return cif_brl * (1 + prod.ii/100 + prod.ipi/100 + pis/100 + cofins/100 + icms/100)
}

// ── Receita ML por mês (histórico Jul/25 → Jul/26) ───────────────────
// Baseado no crescimento gradual criado no historico_faturamento_anual
// (Jul/25 R$318k → Jun/26 R$356k → Jul/26 R$380k), ML = 45%
const HISTORICO_RECEITA: { ano: number; mes: number; fat_total: number }[] = [
  { ano: 2025, mes:  7, fat_total: 318_000 },
  { ano: 2025, mes:  8, fat_total: 324_000 },
  { ano: 2025, mes:  9, fat_total: 330_000 },
  { ano: 2025, mes: 10, fat_total: 335_000 },
  { ano: 2025, mes: 11, fat_total: 328_000 },
  { ano: 2025, mes: 12, fat_total: 310_000 }, // dez: queda pré-estoque
  { ano: 2026, mes:  1, fat_total: 332_000 },
  { ano: 2026, mes:  2, fat_total: 338_000 },
  { ano: 2026, mes:  3, fat_total: 345_000 },
  { ano: 2026, mes:  4, fat_total: 350_000 },
  { ano: 2026, mes:  5, fat_total: 353_000 },
  { ano: 2026, mes:  6, fat_total: 356_000 },
  { ano: 2026, mes:  7, fat_total: 380_000 },
]

// Avg weighted ticket com o mix de produtos
const avgTicket = PRODUTOS.reduce((s, p) => s + p.share * p.preco_ml, 0)

function diasUteis(ano: number, mes: number): number[] {
  const dias: number[] = []
  const total = new Date(ano, mes, 0).getDate()
  for (let d = 1; d <= total; d++) {
    const dow = new Date(ano, mes - 1, d).getDay()
    if (dow !== 0) dias.push(d) // sem domingos (sábados ok pra importadores online)
  }
  return dias
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

const COMPRADORES = [
  'ana.souza_sp','pedro.costa_rj','lucas.ferreira_mg','julia.lima_rs',
  'marcos.santos_ba','fernanda.oliveira_pr','rafael.alves_sc','camila.rocha_go',
  'gabriel.martins_pe','leticia.silva_sp','thiago.souza_rj','amanda.costa_mg',
  'rodrigo.lima_rs','priscila.ferreira_ba','anderson.oliveira_pr','tatiane.alves_sc',
  'vinicius.rocha_go','bruna.martins_pe','gustavo.silva_sp','renata.souza_rj',
  'felipe.costa_mg','daniela.lima_rs','leandro.ferreira_ba','fabiana.oliveira_pr',
  'henrique.alves_sc','patricia.rocha_go','diego.martins_pe','mariana.silva_sp',
  'joao.souza_rj','silvia.costa_mg','carlos.lima_rs','rosana.ferreira_ba',
]

const STATUS = ['paid', 'paid', 'paid', 'paid', 'shipped', 'paid', 'paid', 'delivered']
const LOGISTICA = ['fulfillment', 'fulfillment', 'drop_off', 'fulfillment', 'drop_off']

async function main() {
  const ws = await p.workspace.findUnique({ where: { slug: 'nacao-import-demo' } })
  if (!ws) throw new Error('Workspace não encontrado')
  console.log('✓ Workspace:', ws.nome)

  const conexao = await p.ml_conexao.findFirst({ where: { workspace_id: ws.id } })
  if (!conexao) throw new Error('Conexão ML não encontrada')

  // ── 0. Verifica / exibe landed costs ─────────────────────────────
  console.log('\n── Landed costs calculados ───────────────────────────────')
  const avgLanded = PRODUTOS.reduce((s, prod) => {
    const lc = landedCost(prod)
    const margin = ((prod.preco_ml - lc) / prod.preco_ml * 100).toFixed(1)
    console.log(`  ${prod.sku.padEnd(18)} | EXW: $${prod.exw_usd.toFixed(2)} | CIF: R$${(prod.exw_usd*CAMBIO*prod.cif_factor).toFixed(2)} | Landed: R$${lc.toFixed(2)} | Preço ML: R$${prod.preco_ml} | Margem: ${margin}%`)
    return s + prod.share * lc
  }, 0)
  console.log(`  Avg landed ponderado: R$${avgLanded.toFixed(2)}`)
  console.log(`  Avg ticket ML: R$${avgTicket.toFixed(2)}`)
  console.log(`  Margem bruta média ML: ${((avgTicket - avgLanded) / avgTicket * 100).toFixed(1)}%`)

  // ── 1. Atualiza produto_catalogo com custo_brl correto (landed) ──
  console.log('\n── Atualizando catálogo ──────────────────────────────────')
  const catalogProdutos = await p.produto_catalogo.findMany({ where: { workspace_id: ws.id } })
  const catalogById = new Map(catalogProdutos.map(cp => [cp.sku_interno ?? '', cp.id]))
  for (const prod of PRODUTOS) {
    const catId = catalogById.get(prod.sku)
    if (!catId) { console.log(`  ⚠ ${prod.sku} não encontrado no catálogo`); continue }
    const lc = landedCost(prod)
    await p.produto_catalogo.update({
      where: { id: catId },
      data: {
        custo_medio_usd: prod.exw_usd,
        custo_brl: parseFloat(lc.toFixed(2)),    // custo_brl = landed cost real
        preco_venda: prod.preco_ml,
      },
    })
    console.log(`  ✓ ${prod.sku}: custo_brl=R$${lc.toFixed(2)} preco_venda=R$${prod.preco_ml}`)
  }

  // ── 2. Atualiza rateio CIF para ser consistente com custo real ───
  // CIF = EXW × câmbio × cif_factor (sem impostos — valor aduaneiro é o CIF)
  console.log('\n── Atualizando rateio CIF ────────────────────────────────')
  const rateio = await p.rateio.findFirst({
    where: { workspace_id: ws.id, status: 'SALVO' },
    orderBy: { created_at: 'desc' },
    include: { itens: true },
  })
  if (rateio) {
    // Mapeia produto_id → PRODUTOS config via catalogById
    const catalogoAtualizado = await p.produto_catalogo.findMany({ where: { workspace_id: ws.id } })
    const prodBySku = new Map(PRODUTOS.map(pr => [pr.sku, pr]))
    const skuByProdId = new Map(catalogoAtualizado.map(cp => [cp.id, cp.sku_interno ?? '']))

    let totalCIF = 0
    for (const item of rateio.itens) {
      const sku = item.produto_id ? skuByProdId.get(item.produto_id) : undefined
      const prod = sku ? prodBySku.get(sku) : undefined
      if (!prod) continue
      const cif_unit = prod.exw_usd * CAMBIO * prod.cif_factor
      const landed_unit = landedCost(prod)
      totalCIF += item.qty * cif_unit
      await p.rateio_item.update({
        where: { id: item.id },
        data: {
          unit_usd: parseFloat((prod.exw_usd * prod.cif_factor).toFixed(2)),
          valor_aduaneiro_unit_brl: parseFloat(cif_unit.toFixed(2)),
          custo_unit_brl: parseFloat(landed_unit.toFixed(2)),
        },
      })
    }
    await p.rateio.update({
      where: { id: rateio.id },
      data: { valor_aduaneiro_brl: parseFloat(totalCIF.toFixed(2)) },
    })
    console.log(`  ✓ Rateio atualizado: valor aduaneiro total = R$${totalCIF.toLocaleString('pt-BR', {minimumFractionDigits:2})}`)
  }

  // ── 3. Apaga pedidos antigos ──────────────────────────────────────
  const deleted = await p.ml_pedido.deleteMany({ where: { workspace_id: ws.id } })
  console.log(`\n── ml_pedido: ${deleted.count} registros apagados`)

  // ── 4. Cria pedidos distribuídos em 12 meses ─────────────────────
  let totalCriados = 0
  let totalRevenueCriado = 0

  for (const periodo of HISTORICO_RECEITA) {
    const { ano, mes, fat_total } = periodo
    const mlRevTarget = fat_total * ML_PCT
    const nOrdersTarget = Math.round(mlRevTarget / avgTicket)
    const dias = diasUteis(ano, mes)

    // Distribui nOrders proporcionalmente por produto (+ ruído ±15%)
    let ordersRestantes = nOrdersTarget
    const pedidosMes: Array<typeof PRODUTOS[0] & { qty: number; dia: number }> = []

    for (let i = 0; i < PRODUTOS.length; i++) {
      const prod = PRODUTOS[i]
      const isLast = i === PRODUTOS.length - 1
      const n = isLast ? ordersRestantes : Math.round(nOrdersTarget * prod.share * (0.85 + Math.random() * 0.30))
      ordersRestantes -= n
      for (let j = 0; j < n; j++) {
        pedidosMes.push({ ...prod, qty: 1, dia: dias[randInt(0, dias.length - 1)] })
      }
    }

    // Embaralha e cria
    pedidosMes.sort(() => Math.random() - 0.5)
    let revenueMes = 0
    let mlOrderIdBase = ano * 10000000 + mes * 100000

    for (let i = 0; i < pedidosMes.length; i++) {
      const item = pedidosMes[i]
      const hora = randInt(7, 22)
      const min = randInt(0, 59)
      const dataCompra = new Date(ano, mes - 1, item.dia, hora, min, 0)
      const tarifa = parseFloat((item.preco_ml * TARIFA_PCT).toFixed(2))
      const lc = parseFloat(landedCost(item).toFixed(2))
      const comprador = COMPRADORES[randInt(0, COMPRADORES.length - 1)]

      await p.ml_pedido.create({
        data: {
          workspace_id: ws.id,
          conexao_id: conexao.id,
          ml_order_id: String(mlOrderIdBase + i),
          ml_item_id: `MLB${randInt(100000000, 999999999)}`,
          status: STATUS[randInt(0, STATUS.length - 1)],
          data_compra: dataCompra,
          comprador_nick: comprador,
          titulo: item.nome,
          foto_url: `https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?w=300&h=300&fit=crop&auto=format`,
          sku: item.sku,
          quantidade: item.qty,
          valor_venda: item.preco_ml,
          tarifa,
          frete_vendedor: FRETE_GRATIS,
          custo_produto: lc,
          logistica_tipo: LOGISTICA[randInt(0, LOGISTICA.length - 1)],
        },
      })
      revenueMes += item.preco_ml
      totalRevenueCriado += item.preco_ml
    }

    totalCriados += pedidosMes.length
    console.log(`  ${String(mes).padStart(2,'0')}/${ano}: ${String(pedidosMes.length).padStart(4)} pedidos | ML Revenue: R$${revenueMes.toLocaleString('pt-BR', {minimumFractionDigits:0})} (alvo R$${mlRevTarget.toLocaleString('pt-BR', {minimumFractionDigits:0})}) | Δ ${((revenueMes/mlRevTarget-1)*100).toFixed(1)}%`)
  }

  console.log(`\n  Total criado: ${totalCriados} pedidos | Revenue total: R$${totalRevenueCriado.toLocaleString('pt-BR')}`)

  // ── 5. Atualiza ml_estoque com quantidades plausíveis ──────────────
  // Estoque disponível: representa estoque atual após vendas do mês
  // Container 40HC trouxe: baseado em qty do rateio
  // Estimativa: ~25-35% do container ainda em estoque (72-75% já vendido/distribuído)
  console.log('\n── Atualizando estoque ───────────────────────────────────')
  const ESTOQUE: Record<string, number> = {
    'MPD-XXL-SPD-01': 420,  // 1800 importados, vendeu bastante, resta ~23%
    'HUB-USC-7X1-01': 195,  // 800 importados, resta ~24%
    'SUP-NTB-ERG-01': 148,  // 600 importados, resta ~25%
    'WEB-FHD-RNG-01': 128,  // 500 importados, resta ~26%
    'HDS-GAM-71-01':   74,  // 300 importados, resta ~25%
    'SUP-MON-DUP-01':  72,  // 300 importados, resta ~24%
    'MES-GAM-RGB-01':  22,  // 90 importados, saiu bem, resta ~24%
    'CAD-GAM-PRO-01':  14,  // 55 importados, produto premium, resta ~25%
    'CAD-GAM-PRO-02':  0,   // variante sem estoque
  }

  const estoques = await p.ml_estoque.findMany({ where: { workspace_id: ws.id } })
  for (const est of estoques) {
    const qty = ESTOQUE[est.sku ?? ''] ?? 0
    await p.ml_estoque.update({
      where: { id: est.id },
      data: { quantidade: qty, status: qty > 0 ? 'active' : 'closed' },
    })
    console.log(`  ✓ ${(est.sku ?? '').padEnd(20)} → ${qty} un`)
  }

  // ── 6. Verificação final ──────────────────────────────────────────
  console.log('\n── VERIFICAÇÃO FINAL ─────────────────────────────────────')
  const julPedidos = await p.ml_pedido.findMany({
    where: {
      workspace_id: ws.id,
      data_compra: { gte: new Date('2026-07-01'), lt: new Date('2026-08-01') },
    },
  })
  const julRevenue = julPedidos.reduce((s, pd) => s + pd.valor_venda * pd.quantidade, 0)
  const julTicket = julPedidos.length > 0 ? julRevenue / julPedidos.length : 0
  console.log(`  Jul/2026: ${julPedidos.length} pedidos | Revenue: R$${julRevenue.toLocaleString('pt-BR', {minimumFractionDigits:0})} | Avg ticket: R$${julTicket.toFixed(0)}`)
  console.log(`  Faturamento.receita_ml Jul/2026: R$171.000`)
  console.log(`  Diferença: R$${(julRevenue - 171000).toFixed(0)} (${((julRevenue/171000-1)*100).toFixed(1)}%)`)

  // Preços vs catálogo
  const porSku = new Map<string, number>()
  const allPed = await p.ml_pedido.findMany({ where: { workspace_id: ws.id } })
  for (const ped of allPed) {
    if (!porSku.has(ped.sku ?? '')) porSku.set(ped.sku ?? '', ped.valor_venda)
  }
  console.log('\n  Preços nos pedidos vs catálogo:')
  for (const prod of PRODUTOS) {
    const pedPreco = porSku.get(prod.sku) ?? 0
    const ok = Math.abs(pedPreco - prod.preco_ml) < 0.01 ? '✅' : '❌'
    console.log(`  ${ok} ${prod.sku.padEnd(18)}: pedido R$${pedPreco} | catálogo R$${prod.preco_ml}`)
  }

  console.log('\n✅ Consistência restaurada!')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) }).finally(() => p.$disconnect())
