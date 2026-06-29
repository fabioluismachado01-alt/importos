import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

async function main() {
  const ws = await p.workspace.findFirst({ where: { slug: 'nacao-import-demo' } })
  if (!ws) { console.error('❌ Demo não encontrado'); return }

  // ── 1. Estoque sem foto ────────────────────────────────────────────────────
  const semFoto = await p.ml_estoque.findMany({ where: { workspace_id: ws.id, foto_url: null } })
  console.log('Estoque sem foto:', semFoto.map(e => e.sku))
  for (const e of semFoto) {
    // Mapeia para foto de produto genérico de tech
    await p.ml_estoque.update({ where: { id: e.id }, data: { foto_url: 'https://picsum.photos/id/160/400/400' } })
    console.log(`✅ Foto adicionada: ${e.sku}`)
  }

  // ── 2. CMV zerado nos meses 2026 ──────────────────────────────────────────
  const meses = await p.faturamento_mes.findMany({
    where: { workspace_id: ws.id, ano: 2026 },
    orderBy: { mes: 'asc' },
  })

  // CMV = receita - lucro_bruto (já que lucro_bruto = receita - CMV)
  // despesas_totais deve incluir despesas fixas + variáveis
  // Margem líquida alvo: 3-6% (compatível com cenário tributário)
  for (const m of meses) {
    const receita = m.receita_total ?? 0
    const lucro_bruto = m.lucro_bruto ?? 0
    const cmv = receita - lucro_bruto  // CMV derivado do lucro bruto já lançado

    await p.faturamento_mes.update({
      where: { id: m.id },
      data: { desp_custo_produtos: cmv },
    })
    console.log(`✅ ${String(m.mes).padStart(2,'0')}/2026: desp_custo_produtos = R$${cmv.toLocaleString('pt-BR')} (receita ${receita} - lucro_bruto ${lucro_bruto})`)
  }

  // Verificação final
  console.log('\n📊 Meses 2026 pós-fix:')
  const mesesFix = await p.faturamento_mes.findMany({
    where: { workspace_id: ws.id, ano: 2026 },
    orderBy: { mes: 'asc' },
  })
  for (const m of mesesFix) {
    const margem = (m.receita_total ?? 0) > 0 ? ((m.lucro_bruto ?? 0) / (m.receita_total ?? 1)) * 100 : 0
    console.log(`  ${String(m.mes).padStart(2,'0')}/2026: fat=${m.receita_total} | cmv=${m.desp_custo_produtos} | lucro_bruto=${m.lucro_bruto} | desp=${m.despesas_totais} | margem=${margem.toFixed(1)}%`)
  }

  await p.$disconnect()
}

main().catch(e => { console.error('❌', e); process.exit(1) })
