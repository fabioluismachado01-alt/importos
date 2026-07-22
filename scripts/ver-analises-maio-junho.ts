import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const ws = await prisma.workspace.findFirst({ select: { id: true } })
  if (!ws) return

  // Relatórios marketplace (Shopee, Amazon, Magalu, TikTok, Avulsas)
  const rels = await prisma.relatorio_marketplace.findMany({
    where: { workspace_id: ws.id, ano: 2026, mes: { in: [5, 6] } },
    select: { id: true, marketplace: true, ano: true, mes: true, receita_bruta: true },
    orderBy: [{ mes: 'asc' }, { marketplace: 'asc' }],
  })
  console.log(`\nrelatorio_marketplace (${rels.length}):`)
  rels.forEach(r => console.log(`  [${r.id}] ${r.ano}-${String(r.mes).padStart(2,'0')} ${r.marketplace} R$${r.receita_bruta.toFixed(2)}`))

  // ML analise relatorio
  const mls = await prisma.ml_analise_relatorio.findMany({
    where: { workspace_id: ws.id, ano: 2026, mes: { in: [5, 6] } },
    select: { id: true, ano: true, mes: true, receita_bruta: true },
    orderBy: { mes: 'asc' },
  })
  console.log(`\nml_analise_relatorio (${mls.length}):`)
  mls.forEach(r => console.log(`  [${r.id}] ${r.ano}-${String(r.mes).padStart(2,'0')} ML R$${r.receita_bruta.toFixed(2)}`))

  // Todos lançamentos de Maio e Junho (exceto manuais grandes)
  const lancs = await prisma.lancamento.findMany({
    where: { faturamento: { ano: 2026, mes: { in: [5, 6] } } },
    include: { faturamento: { select: { ano: true, mes: true } } },
    orderBy: [{ faturamento: { mes: 'asc' } }, { categoria: 'asc' }],
  })
  console.log(`\nTodos os lançamentos Maio+Junho (${lancs.length}):`)
  lancs.forEach(l => console.log(
    `  [${l.id}] ${l.faturamento?.ano}-${String(l.faturamento?.mes).padStart(2,'0')} ${l.tipo.padEnd(18)} ${l.categoria?.padEnd(20)} ${l.descricao.slice(0,40).padEnd(40)} R$${l.valor.toFixed(2)}`
  ))
}
main().catch(console.error).finally(() => prisma.$disconnect())
