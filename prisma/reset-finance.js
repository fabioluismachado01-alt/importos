/**
 * Reset dos dados financeiros do ImportOS
 * Apaga: faturamento_mes, lancamentos, das, historico, relatorios
 * Mantém: users, workspaces, empresas, templates, canais, socios, config
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('\n🗑️  Zerando dados financeiros...\n')

  // Ordem importa por causa das FKs
  const d1 = await prisma.lancamento.deleteMany({})
  console.log(`  ✓ Lançamentos removidos: ${d1.count}`)

  const d2 = await prisma.das.deleteMany({})
  console.log(`  ✓ DAS removidos: ${d2.count}`)

  const d3 = await prisma.faturamento_mes.deleteMany({})
  console.log(`  ✓ Meses removidos: ${d3.count}`)

  const d4 = await prisma.historico_faturamento_anual.deleteMany({})
  console.log(`  ✓ Histórico anual removido: ${d4.count}`)

  const d5 = await prisma.relatorio_marketplace.deleteMany({})
  console.log(`  ✓ Relatórios marketplace removidos: ${d5.count}`)

  console.log('\n✅ Banco zerado. Mantidos:')
  console.log('   → Usuário e workspace')
  console.log('   → Empresa e configurações')
  console.log('   → Templates de despesas fixas')
  console.log('   → Canais de venda')
  console.log('   → Configuração de sócios\n')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
