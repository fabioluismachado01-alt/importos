import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

function ok(label: string) { console.log(`  ✅ ${label}`) }
function warn(label: string) { console.log(`  ⚠️  ${label}`) }
function err(label: string) { console.log(`  ❌ ${label}`) }
function brl(n: number) { return 'R$' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) }
function pct(n: number) { return n.toFixed(2) + '%' }

async function main() {
  // Encontrar user pelo email
  const user = await p.user.findFirst({
    where: { email: 'namavestore@gmail.com' },
    include: { membros: { include: { workspace: true } } },
  })

  if (!user) { err('Usuário namavestore@gmail.com não encontrado'); return }
  console.log(`\n👤 Usuário: ${user.name ?? user.email}`)

  for (const m of user.membros) {
    const ws = m.workspace
    console.log(`\n${'═'.repeat(60)}`)
    console.log(`🏢 WORKSPACE: ${ws.nome} (${ws.slug})`)
    console.log(`${'═'.repeat(60)}`)

    // 1. Empresa
    console.log('\n━━━ 1. EMPRESA / CONFIGURAÇÃO ━━━')
    const emp = await p.empresa.findUnique({ where: { workspace_id: ws.id } })
    if (!emp) { err('Empresa não configurada'); continue }
    emp.regime_tributario?.includes('SIMPLES') ? ok(`Regime: ${emp.regime_tributario}`) : warn(`Regime: ${emp.regime_tributario ?? 'não configurado'}`)
    const aliq = emp.aliquota_simples ?? 0
    aliq >= 1 ? ok(`Alíquota Simples: ${aliq}%`) : warn(`Alíquota: ${aliq} (parece decimal — deveria ser %, ex: 8)`)
    emp.estado_uf ? ok(`UF: ${emp.estado_uf}`) : warn('UF não configurada')

    // 2. Faturamento mensal 2026
    console.log('\n━━━ 2. FATURAMENTO MENSAL 2026 ━━━')
    const meses = await p.faturamento_mes.findMany({
      where: { workspace_id: ws.id, ano: 2026 },
      orderBy: { mes: 'asc' },
    })
    meses.length > 0 ? ok(`${meses.length} meses com dados`) : warn('Sem dados 2026')
    for (const m of meses) {
      const cmv = m.desp_custo_produtos ?? 0
      const margem = m.receita_total > 0 ? (m.lucro_bruto / m.receita_total) * 100 : 0
      const label = `${String(m.mes).padStart(2,'0')}/2026 — Fat: ${brl(m.receita_total ?? 0)} | CMV: ${brl(cmv)} | LB: ${brl(m.lucro_bruto ?? 0)} | Margem: ${pct(margem)}`
      m.receita_total > 0 && margem > 0 && cmv > 0 ? ok(label) : warn(label)
    }

    // 3. Histórico multi-ano
    console.log('\n━━━ 3. HISTÓRICO MULTI-ANO ━━━')
    const hist = await p.historico_faturamento_anual.findMany({ where: { workspace_id: ws.id } })
    const anos = [...new Set(hist.map(h => h.ano))].sort()
    anos.length >= 3 ? ok(`Anos disponíveis: ${anos.join(', ')}`) : anos.length > 0 ? warn(`Poucos anos: ${anos.join(', ')}`) : warn('Sem histórico anual')
    for (const ano of anos) {
      const fatAno = hist.filter(h => h.ano === ano).reduce((a, h) => a + h.faturamento, 0)
      ok(`${ano}: ${brl(fatAno)} (${hist.filter(h => h.ano === ano).length} meses)`)
    }

    // 4. Produtos catálogo
    console.log('\n━━━ 4. CATÁLOGO DE PRODUTOS ━━━')
    const prods = await p.produto_catalogo.findMany({
      where: { workspace_id: ws.id, ativo: true },
      select: { sku_interno: true, nome: true, custo_brl: true },
    })
    prods.length > 0 ? ok(`${prods.length} produtos ativos`) : warn('Nenhum produto no catálogo')
    for (const pr of prods) {
      pr.custo_brl && pr.custo_brl > 0 ? ok(`${pr.sku_interno}: ${pr.nome} — custo ${brl(pr.custo_brl)}`) : warn(`${pr.sku_interno}: custo zerado`)
    }

    // 5. Pedidos ML
    console.log('\n━━━ 5. PEDIDOS ML ━━━')
    const totalPedidos = await p.ml_pedido.count({ where: { workspace_id: ws.id } })
    totalPedidos > 0 ? ok(`${totalPedidos} pedidos`) : warn('Sem pedidos ML')
    if (totalPedidos > 0) {
      const semFoto = await p.ml_pedido.count({ where: { workspace_id: ws.id, foto_url: null } })
      semFoto === 0 ? ok('Todos com foto') : warn(`${semFoto} pedidos sem foto`)
      const semCusto = await p.ml_pedido.count({ where: { workspace_id: ws.id, custo_produto: null } })
      semCusto === 0 ? ok('Todos com custo_produto') : warn(`${semCusto} pedidos sem custo (margens podem estar incorretas)`)

      const sample = await p.ml_pedido.findMany({
        where: { workspace_id: ws.id },
        select: { valor_venda: true, custo_produto: true, tarifa: true },
        take: 100,
      })
      const aliqNorm = aliq >= 1 ? aliq / 100 : aliq
      const negativos = sample.filter(pd => {
        const imp = pd.valor_venda * aliqNorm
        return pd.valor_venda - (pd.custo_produto ?? 0) - (pd.tarifa ?? 0) - imp < 0
      }).length
      negativos === 0 ? ok('Nenhuma margem negativa (amostra 100)') : warn(`${negativos} pedidos com margem negativa na amostra`)
    }

    // 6. Estoque ML
    console.log('\n━━━ 6. ESTOQUE ML ━━━')
    const estoque = await p.ml_estoque.findMany({ where: { workspace_id: ws.id } })
    estoque.length > 0 ? ok(`${estoque.length} SKUs no estoque`) : warn('Sem dados de estoque')
    const estSemFoto = estoque.filter(e => !e.foto_url).length
    estSemFoto === 0 ? ok('Todos com foto') : warn(`${estSemFoto} itens sem foto`)

    // 7. Painel Tributário
    console.log('\n━━━ 7. PAINEL TRIBUTÁRIO ━━━')
    const aliqHist = await p.aliquota_historico.findFirst({
      where: { workspace_id: ws.id, ano: 2026, mes: 6 },
    })
    const aliqAtiva = aliqHist?.aliquota ?? aliq
    aliqAtiva >= 1 ? ok(`Alíquota ativa Jun/2026: ${aliqAtiva}%`) : err(`Alíquota ativa: ${aliqAtiva} (em decimal — bug)`)
    const fatJun = meses.find(m => m.mes === 6)?.receita_total ?? 0
    if (fatJun > 0) {
      const das = fatJun * (aliqAtiva / 100)
      ok(`DAS Jun/2026 estimado: ${brl(das)} (${aliqAtiva}% × ${brl(fatJun)})`)
    }

    // 8. Rateios
    console.log('\n━━━ 8. RATEIOS SALVOS ━━━')
    const rateios = await p.rateio.findMany({
      where: { workspace_id: ws.id, status: 'SALVO' },
      include: { itens: true },
    })
    rateios.length > 0 ? ok(`${rateios.length} rateio(s) salvo(s)`) : warn('Nenhum rateio salvo')
    for (const r of rateios) {
      ok(`${r.nome} — modo: ${r.modo} | CIF: ${brl(r.valor_aduaneiro_brl ?? 0)} | ${r.itens.length} itens`)
    }
  }

  console.log('\n━━━ VERIFICAÇÃO COMPLETA ━━━')
  await p.$disconnect()
}

main().catch(e => { console.error('❌', e); process.exit(1) })
