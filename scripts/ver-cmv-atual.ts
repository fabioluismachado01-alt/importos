import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const ls = await prisma.lancamento.findMany({
    where: { categoria: 'CUSTO_PRODUTOS', faturamento: { ano: 2026, mes: { in: [5, 6] } } },
    include: { faturamento: { select: { ano: true, mes: true } } },
    orderBy: [{ faturamento: { mes: 'asc' } }, { descricao: 'asc' }],
  })
  ls.forEach(l => console.log(
    `${l.faturamento?.ano}-${String(l.faturamento?.mes).padStart(2,'0')} | [${l.id}] ${l.descricao.padEnd(45)} | R$ ${l.valor.toFixed(2)}`
  ))
  console.log(`\nTotal: ${ls.length} lançamentos`)
}
main().catch(console.error).finally(() => prisma.$disconnect())
