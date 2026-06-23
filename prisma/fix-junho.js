// Remove o lançamento de teste de R$12.500 do Junho
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
async function main() {
  const fat = await prisma.faturamento_mes.findFirst({ where:{ano:2026,mes:6} })
  if (!fat) { console.log('Junho não encontrado'); return }
  const del = await prisma.lancamento.deleteMany({ where:{ faturamento_id: fat.id } })
  console.log('Lançamentos de Junho removidos:', del.count)
  await prisma.faturamento_mes.update({
    where:{id:fat.id},
    data:{ receita_total:0, das_valor_calc:0, lucro_bruto:0, lucro_liquido:0, dias_com_venda:0 }
  })
  console.log('Junho zerado ✅')
}
main().catch(console.error).finally(()=>prisma.$disconnect())
