import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const workspace = await prisma.workspace.findFirst({ select: { id: true, nome: true } })
  if (!workspace) { console.log('Nenhum workspace'); return }
  console.log(`Workspace: ${workspace.nome} (${workspace.id})\n`)

  const lancs = await prisma.lancamento.findMany({
    where: { faturamento_id: { not: undefined }, categoria: 'CUSTO_PRODUTOS' },
    include: { faturamento: { select: { ano: true, mes: true, workspace_id: true } } },
    orderBy: [{ faturamento: { ano: 'asc' } }, { faturamento: { mes: 'asc' } }, { data: 'asc' }],
  })

  const meses: Record<string, { ano: number; mes: number; total: number; ids: string[]; descricoes: string[] }> = {}

  for (const l of lancs) {
    if (!l.faturamento) continue
    const key = `${l.faturamento.ano}-${String(l.faturamento.mes).padStart(2,'0')}`
    if (!meses[key]) meses[key] = { ano: l.faturamento.ano, mes: l.faturamento.mes, total: 0, ids: [], descricoes: [] }
    meses[key].total += l.valor
    meses[key].ids.push(l.id)
    meses[key].descricoes.push(`  [${l.id}] ${l.descricao} → R$ ${l.valor.toFixed(2)}`)
  }

  console.log('=== LANÇAMENTOS CUSTO_PRODUTOS POR MÊS ===\n')
  for (const [key, m] of Object.entries(meses)) {
    console.log(`${key} — Total CMV: R$ ${m.total.toFixed(2)} (${m.ids.length} lançamento(s))`)
    m.descricoes.forEach(d => console.log(d))
    console.log()
  }

  console.log(`Total de lançamentos: ${lancs.length}`)
  console.log(`Meses com CMV: ${Object.keys(meses).length}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
