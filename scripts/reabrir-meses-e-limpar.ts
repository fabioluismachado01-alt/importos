import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const ws = await prisma.workspace.findFirst({ select: { id: true } })
  if (!ws) return

  // 1. Reabre Maio e Junho
  const reabrir = await prisma.faturamento_mes.updateMany({
    where: { workspace_id: ws.id, ano: 2026, mes: { in: [5, 6] } },
    data: { fechado: false },
  })
  console.log(`✓ ${reabrir.count} meses reabertos (fechado = false)`)

  // 2. Deleta qualquer ml_analise_relatorio restante de Maio e Junho
  const mls = await prisma.ml_analise_relatorio.findMany({
    where: { workspace_id: ws.id, ano: 2026, mes: { in: [5, 6] } },
    select: { id: true, ano: true, mes: true },
  })
  console.log(`ml_analise_relatorio encontrados: ${mls.length}`)
  for (const r of mls) {
    await prisma.ml_analise_sku.deleteMany({ where: { relatorio_id: r.id } })
    await prisma.ml_analise_relatorio.delete({ where: { id: r.id } })
    console.log(`  ✓ Deletado ${r.ano}-${String(r.mes).padStart(2,'0')} [${r.id}]`)
  }

  console.log('\nPronto — meses reabertos e análises limpas. Pode subir as planilhas.')
}
main().catch(console.error).finally(() => prisma.$disconnect())
