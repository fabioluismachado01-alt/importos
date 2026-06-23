const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
async function main() {
  const fat = await prisma.faturamento_mes.findFirst({ where:{ano:2026,mes:5} })
  const diasReais = 30          // 30 dias de vendas no ciclo (30/04 a 29/05)
  const ticketMedio = fat.receita_total / 1094  // 1094 pedidos válidos

  await prisma.faturamento_mes.update({
    where:{id:fat.id},
    data:{ dias_com_venda: diasReais, ticket_medio: ticketMedio }
  })
  console.log('Dias c/ Venda:', diasReais, '(ciclo 30/04 a 29/05)')
  console.log('Ticket Médio: R$'+ticketMedio.toFixed(2),'(receita / 1094 pedidos)')
  console.log('Atualizado! ✅')
}
main().catch(console.error).finally(() => prisma.$disconnect())
