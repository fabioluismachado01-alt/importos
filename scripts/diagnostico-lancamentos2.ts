import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

async function main() {
  const ws = await p.workspace.findUnique({ where: { slug: 'nacao-import-demo' } })
  if (!ws) throw new Error('Workspace não encontrado')

  // Busca faturamento_mes com lancamentos para Jun e Jul/2026
  const meses = await p.faturamento_mes.findMany({
    where: { workspace_id: ws.id, ano: 2026, mes: { in: [5, 6, 7] } },
    include: { lancamentos: { orderBy: { data: 'asc' } } }
  })

  for (const fat of meses) {
    console.log(`\n══ ${fat.mes}/${fat.ano} | Receita total: R$${fat.receita_total} ════`)
    console.log(`  receita_ml: ${fat.receita_ml} | shopee: ${fat.receita_shopee} | amazon: ${fat.receita_amazon}`)
    console.log(`  magalu: ${fat.receita_magalu} | tiktok: ${fat.receita_tiktok} | outros: ${fat.receita_outros}`)
    console.log(`  Lançamentos: ${fat.lancamentos.length}`)
    const receitas = fat.lancamentos.filter(l => l.tipo === 'RECEITA')
    const despesas = fat.lancamentos.filter(l => l.tipo !== 'RECEITA')
    console.log(`  RECEITA lançamentos: ${receitas.length}`)
    for (const l of receitas) {
      console.log(`    canal=${l.canal} | cat=${l.categoria} | R$${l.valor} | ${l.descricao?.slice(0,50)}`)
    }
    console.log(`  OUTRAS lançamentos: ${despesas.length}`)
    for (const l of despesas.slice(0,5)) {
      console.log(`    tipo=${l.tipo} | cat=${l.categoria} | R$${l.valor} | ${l.descricao?.slice(0,50)}`)
    }
  }

  // Vê exemplos de categorias usadas
  const allLans = await p.lancamento.findMany({
    where: { faturamento: { workspace_id: ws.id } },
    distinct: ['tipo', 'categoria'],
    select: { tipo: true, categoria: true, canal: true }
  })
  console.log('\n══ CATEGORIAS USADAS ════════════════════════')
  const seen = new Set<string>()
  for (const l of allLans) {
    const key = `${l.tipo}|${l.categoria}|${l.canal}`
    if (!seen.has(key)) { seen.add(key); console.log(`  tipo=${l.tipo} | cat=${l.categoria} | canal=${l.canal}`) }
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1) }).finally(() => p.$disconnect())
