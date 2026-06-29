import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

function ok(label: string) { console.log(`  ✅ ${label}`) }
function warn(label: string) { console.log(`  ⚠️  ${label}`) }
function err(label: string) { console.log(`  ❌ ${label}`) }
function brl(n: number) { return 'R$' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) }
function pct(n: number) { return n.toFixed(2) + '%' }

async function main() {
  // Busca todas as workspaces exceto demo
  const workspaces = await p.workspace.findMany({
    where: { slug: { not: 'nacao-import-demo' } },
    select: { id: true, nome: true, slug: true },
  })

  if (!workspaces.length) { console.log('Nenhuma workspace pessoal encontrada'); return }

  for (const ws of workspaces) {
    console.log(`\n🏢 WORKSPACE: ${ws.nome} (${ws.slug})\n`)

    // 1. Empresa
    console.log('━━━ 1. EMPRESA ━━━')
    const emp = await p.empresa.findUnique({ where: { workspace_id: ws.id } })
    if (!emp) { err('Empresa não configurada'); continue }
    const isSimples = emp.regime_tributario?.toLowerCase().includes('simples') ?? false
    const aliq = emp.aliquota_simples ?? 0
    isSimples ? ok(`Regime: ${emp.regime_tributario}`) : warn(`Regime: ${emp.regime_tributario ?? 'não configurado'}`)
    aliq > 1 ? ok(`Alíquota: ${aliq}%`) : aliq > 0 ? warn(`Alíquota: ${aliq} (parece decimal, deveria ser %)`) : warn('Alíquota não configurada')

    // 2. Faturamento mais recente
    console.log('\n━━━ 2. FATURAMENTO MENSAL ━━━')
    const ultimosMeses = await p.faturamento_mes.findMany({
      where: { workspace_id: ws.id, receita_total: { gt: 0 } },
      orderBy: [{ ano: 'desc' }, { mes: 'desc' }],
      take: 6,
    })
    ultimosMeses.length > 0 ? ok(`${ultimosMeses.length} meses com dados`) : warn('Sem dados de faturamento')
    for (const m of ultimosMeses) {
      const cmv = m.desp_custo_produtos ?? 0
      const margem = m.receita_total > 0 ? (m.lucro_bruto / m.receita_total) * 100 : 0
      const label = `${String(m.mes).padStart(2,'0')}/${m.ano} — Fat: ${brl(m.receita_total)} | CMV: ${brl(cmv)} | Margem: ${pct(margem)}`
      m.receita_total > 0 && margem > 0 ? ok(label) : warn(label)
    }

    // 3. Histórico
    console.log('\n━━━ 3. HISTÓRICO MULTI-ANO ━━━')
    const hist = await p.historico_faturamento_anual.findMany({ where: { workspace_id: ws.id } })
    const anos = [...new Set(hist.map(h => h.ano))].sort()
    anos.length > 0 ? ok(`Anos: ${anos.join(', ')}`) : warn('Sem histórico anual')

    // 4. Pedidos ML
    console.log('\n━━━ 4. PEDIDOS ML ━━━')
    const totalPedidos = await p.ml_pedido.count({ where: { workspace_id: ws.id } })
    totalPedidos > 0 ? ok(`${totalPedidos} pedidos`) : warn('Sem pedidos ML')

    if (totalPedidos > 0) {
      const semFoto = await p.ml_pedido.count({ where: { workspace_id: ws.id, foto_url: null } })
      semFoto === 0 ? ok('Todos com foto') : warn(`${semFoto} sem foto`)

      const semCusto = await p.ml_pedido.count({ where: { workspace_id: ws.id, custo_produto: null } })
      semCusto === 0 ? ok('Todos com custo_produto') : warn(`${semCusto} pedidos sem custo (margem pode ser incorreta)`)

      // Verificar margens
      const pedidos = await p.ml_pedido.findMany({
        where: { workspace_id: ws.id },
        select: { valor_venda: true, custo_produto: true, tarifa: true },
        take: 50,
      })
      const aliqNorm = aliq > 1 ? aliq / 100 : aliq
      const negativos = pedidos.filter(pd => {
        const imp = pd.valor_venda * aliqNorm
        return pd.valor_venda - (pd.custo_produto ?? 0) - (pd.tarifa ?? 0) - imp < 0
      }).length
      negativos === 0 ? ok('Margens positivas (amostra 50 pedidos)') : warn(`${negativos} pedidos com margem negativa na amostra`)
    }

    // 5. Painel Tributário
    console.log('\n━━━ 5. PAINEL TRIBUTÁRIO ━━━')
    isSimples ? ok('Regime Simples reconhecido corretamente') : warn('Regime não é Simples — Painel pode mostrar dados diferentes')
    aliq > 1
      ? ok(`Alíquota ${aliq}% será normalizada para ${(aliq/100).toFixed(4)} no cálculo`)
      : warn('Alíquota parece já estar em decimal — verificar')

    // 6. Rateios
    console.log('\n━━━ 6. RATEIOS SALVOS ━━━')
    const rateios = await p.rateio.count({ where: { workspace_id: ws.id, status: 'SALVO' } })
    rateios > 0 ? ok(`${rateios} rateio(s) salvo(s)`) : warn('Nenhum rateio salvo (Simulador Tributário sem valor aduaneiro)')
  }

  console.log('\n━━━ FIM ━━━')
  await p.$disconnect()
}

main().catch(e => { console.error('❌', e); process.exit(1) })
