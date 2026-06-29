import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

function ok(label: string, val?: string) { console.log(`  ✅ ${label}${val ? ': ' + val : ''}`) }
function warn(label: string, val?: string) { console.log(`  ⚠️  ${label}${val ? ': ' + val : ''}`) }
function err(label: string, val?: string) { console.log(`  ❌ ${label}${val ? ': ' + val : ''}`) }
function brl(n: number) { return 'R$' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) }
function pct(n: number) { return n.toFixed(2) + '%' }

async function main() {
  const ws = await p.workspace.findFirst({ where: { slug: 'nacao-import-demo' } })
  if (!ws) { err('Workspace demo não encontrado'); return }
  console.log(`\n🏢 WORKSPACE: ${ws.nome} (${ws.slug})\n`)

  // ── 1. EMPRESA ────────────────────────────────────────────────────────────
  console.log('━━━ 1. EMPRESA / CONFIGURAÇÃO ━━━')
  const emp = await p.empresa.findUnique({ where: { workspace_id: ws.id } })
  if (!emp) { err('Empresa não encontrada'); }
  else {
    emp.regime_tributario?.toLowerCase().includes('simples') ? ok('Regime: ' + emp.regime_tributario) : warn('Regime: ' + emp.regime_tributario)
    const aliq = emp.aliquota_simples ?? 0
    aliq > 1 ? ok(`Alíquota Simples: ${aliq}% (armazenada como %)`) : warn(`Alíquota Simples: ${aliq} (deve ser > 1)`)
    emp.estado_uf ? ok('UF: ' + emp.estado_uf) : warn('UF não configurada')
  }

  // ── 2. FATURAMENTO MES 2026 ───────────────────────────────────────────────
  console.log('\n━━━ 2. FATURAMENTO MENSAL 2026 (DRE) ━━━')
  const meses2026 = await p.faturamento_mes.findMany({
    where: { workspace_id: ws.id, ano: 2026 },
    orderBy: { mes: 'asc' },
  })
  if (!meses2026.length) { err('Nenhum mês 2026 encontrado') }
  else {
    for (const m of meses2026) {
      const margem = m.receita_total > 0 ? (m.lucro_bruto / m.receita_total) * 100 : 0
      const cmv = m.desp_custo_produtos ?? 0
      const label = `${String(m.mes).padStart(2,'0')}/2026 — Fat: ${brl(m.receita_total ?? 0)} | CMV: ${brl(cmv)} | Lucro Bruto: ${brl(m.lucro_bruto ?? 0)} | Margem: ${pct(margem)}`
      m.receita_total > 0 && margem > 0 && cmv > 0 ? ok(label) : warn(label)
    }
  }

  // ── 3. HISTÓRICO ANUAL ────────────────────────────────────────────────────
  console.log('\n━━━ 3. HISTÓRICO MULTI-ANO ━━━')
  const hist = await p.historico_faturamento_anual.findMany({
    where: { workspace_id: ws.id },
    orderBy: [{ ano: 'asc' }, { mes: 'asc' }],
  })
  const anos = [...new Set(hist.map(h => h.ano))]
  anos.length >= 3 ? ok(`Anos disponíveis: ${anos.join(', ')}`) : warn(`Poucos anos: ${anos.join(', ')}`)
  for (const ano of anos) {
    const fatAno = hist.filter(h => h.ano === ano).reduce((a, h) => a + h.faturamento, 0)
    ok(`${ano}: ${brl(fatAno)} (${hist.filter(h => h.ano === ano).length} meses)`)
  }

  // ── 4. PRODUTOS / SKUs ────────────────────────────────────────────────────
  console.log('\n━━━ 4. CATÁLOGO DE PRODUTOS ━━━')
  const prods = await p.produto_catalogo.findMany({
    where: { workspace_id: ws.id, ativo: true },
    select: { sku_interno: true, nome: true, custo_brl: true },
  })
  prods.length >= 8 ? ok(`${prods.length} produtos ativos`) : warn(`Apenas ${prods.length} produtos`)
  for (const pr of prods) {
    pr.custo_brl && pr.custo_brl > 0 ? ok(`${pr.sku_interno}: ${pr.nome} — custo ${brl(pr.custo_brl)}`) : warn(`${pr.sku_interno}: custo zerado`)
  }

  // ── 5. ML PEDIDOS ─────────────────────────────────────────────────────────
  console.log('\n━━━ 5. PEDIDOS ML ━━━')
  const pedidos = await p.ml_pedido.findMany({ where: { workspace_id: ws.id } })
  ok(`Total pedidos: ${pedidos.length}`)

  const semFoto = pedidos.filter(p => !p.foto_url)
  semFoto.length === 0 ? ok('Todos com foto_url') : warn(`${semFoto.length} pedidos sem foto`)

  const semCusto = pedidos.filter(p => !p.custo_produto || p.custo_produto === 0)
  semCusto.length === 0 ? ok('Todos com custo_produto') : warn(`${semCusto.length} pedidos sem custo`)

  // Verificar margens (simulando cálculo do MLPedidosView)
  const ALIQ = (emp?.aliquota_simples ?? 6)  // em %
  let negativos = 0
  for (const pd of pedidos) {
    const imposto = pd.valor_venda * (ALIQ / 100)
    const lucro = pd.valor_venda - (pd.custo_produto ?? 0) - pd.tarifa_ml - (pd.frete_vendedor ?? 0) - imposto
    if (lucro < 0) negativos++
  }
  negativos === 0 ? ok('Nenhum pedido com margem negativa') : warn(`${negativos} pedidos com margem negativa`)

  // ── 6. ML ESTOQUE ─────────────────────────────────────────────────────────
  console.log('\n━━━ 6. ESTOQUE ML ━━━')
  const estoque = await p.ml_estoque.findMany({ where: { workspace_id: ws.id } })
  ok(`${estoque.length} SKUs no estoque`)
  const estSemFoto = estoque.filter(e => !e.foto_url)
  estSemFoto.length === 0 ? ok('Todos com foto_url') : warn(`${estSemFoto.length} itens sem foto`)

  // ── 7. RATEIO ─────────────────────────────────────────────────────────────
  console.log('\n━━━ 7. RATEIO DE LOTE ━━━')
  const rateios = await p.rateio.findMany({
    where: { workspace_id: ws.id, status: 'SALVO' },
    include: { itens: true },
  })
  rateios.length > 0 ? ok(`${rateios.length} rateio(s) salvo(s)`) : err('Nenhum rateio salvo')
  for (const r of rateios) {
    ok(`${r.nome} — modo: ${r.modo} | CIF: ${brl(r.valor_aduaneiro_brl ?? 0)} | ${r.itens.length} itens`)
    const semSku = r.itens.filter(i => !i.produto_id).length
    semSku === 0 ? ok('Todos os itens com SKU vinculado') : warn(`${semSku} itens sem SKU — excluídos do simulador`)
    const semTarget = r.itens.filter(i => !i.target_price || i.target_price === 0).length
    semTarget === 0 ? ok('Todos os itens com preço de venda') : warn(`${semTarget} itens sem preço de venda`)
    r.modo === 'FORMAL' ? ok('Modo FORMAL (correto para lote grande)') : warn('Modo SIMPLIFICADA (limite $3k USD)')
  }

  // ── 8. SIMULADOR TRIBUTÁRIO ────────────────────────────────────────────────
  console.log('\n━━━ 8. SIMULADOR TRIBUTÁRIO ━━━')
  const cifTotal = rateios.flatMap(r => r.itens)
    .reduce((a, i) => a + i.qty * (i.valor_aduaneiro_unit_brl ?? 0), 0)
  const receita = meses2026.find(m => m.mes === 6)?.receita_total ?? 118500
  const cmv     = meses2026.find(m => m.mes === 6)?.cmv ?? 54000
  const desp    = meses2026.find(m => m.mes === 6)?.despesas_totais ?? 50000
  const lucroOp = receita - cmv - desp
  const netPIS  = Math.max(0, receita * 0.0165 - cifTotal * 0.021)
  const netCOFINS = Math.max(0, receita * 0.076 - cifTotal * 0.0965)
  const totalLR = lucroOp * 0.24 + netPIS + netCOFINS
  const cargaLR = totalLR / receita * 100
  ok(`CIF total para créditos: ${brl(cifTotal)}`)
  ok(`Créditos PIS+COFINS: ${brl(cifTotal * 0.1175)}`)
  cargaLR < 5.93 ? ok(`Lucro Real ${pct(cargaLR)} < Presumido 5.93% — VANTAGEM CONFIRMADA`) : err(`Lucro Real ${pct(cargaLR)} não ganha`)

  // ── 9. PAINEL TRIBUTÁRIO ──────────────────────────────────────────────────
  console.log('\n━━━ 9. PAINEL TRIBUTÁRIO ━━━')
  const isSimples = emp?.regime_tributario?.toLowerCase().includes('simples') ?? false
  isSimples ? ok('Regime reconhecido como Simples Nacional') : err('Regime NÃO reconhecido como Simples')
  const aliqNorm = (emp?.aliquota_simples ?? 6) > 1 ? (emp?.aliquota_simples ?? 6) / 100 : (emp?.aliquota_simples ?? 6)
  const dasRef = receita * aliqNorm
  ok(`DAS estimado Jun/2026: ${brl(dasRef)} (${pct(aliqNorm * 100)} × ${brl(receita)})`)
  dasRef < receita * 0.15 ? ok('DAS dentro do esperado (< 15% do faturamento)') : err('DAS muito alto — verificar')

  console.log('\n━━━ RESUMO ━━━')
  console.log('✅ Verificação completa!')
  await p.$disconnect()
}

main().catch(e => { console.error('❌', e); process.exit(1) })
