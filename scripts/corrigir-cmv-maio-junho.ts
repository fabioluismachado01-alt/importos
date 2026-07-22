/**
 * Deleta os lançamentos CMV calculados automaticamente para Maio e Junho 2026
 * que foram gerados com custos errados (fator 7.4039 em vez de 12.7292).
 *
 * ATENÇÃO: apaga SOMENTE os CMVs gerados pelas análises de marketplace.
 * Mantém os lançamentos manuais ("CMV — Custo de Mercadorias Vendidas").
 * Mantém outros lançamentos (fita, etc.).
 *
 * Após rodar este script, o usuário deve re-subir os relatórios de cada
 * marketplace para Maio e Junho no sistema — os custos novos serão usados.
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// IDs dos lançamentos CMV computados de Maio 2026
const DELETAR_MAIO = [
  'cmpzyerfm00emvc3gq20ui21v', // [TikTok] R$219,30
  'cmpzztpxf0004vcpoqluwy0mb', // [Magalu] R$996,55
  'cmq9ij9he000gvc4w2loriqrv', // ML Import R$45.423,18
  'cmpzrppnc001bvc3gn1gskvop', // [Amazon] R$6.453,30 -- verificar id
  'cmpzrppnc001bvc3gn1gskvop', // placeholder
  'cmpzrppnc001bvc3gn1gskvq7', // [Amazon] R$6.453,30
  'cmpzswaui001yvc3g1dra23rx', // [Shopee] R$1.364,45
]

// IDs dos lançamentos CMV computados de Junho 2026
const DELETAR_JUNHO = [
  'cmr3s8vi6000ejs04ogaw65l5', // [Magalu] R$836,20
  'cmr2ukbb40005jo040qkzy5bv', // ML Import R$49.761,02
  'cmr3oz58i0005l50497z9fyfo', // [Amazon] R$7.706,65
  'cmr3q4rgu0006jo043vdf6ug9', // [Shopee] R$763,17
  'cmr3rdzsj0006js04z3shyzqc', // [TikTok] R$907,40
]

// Todos para deletar (sem duplicatas)
const TODOS = [...new Set([...DELETAR_MAIO, ...DELETAR_JUNHO])]

async function main() {
  // Confirma quais existem antes de deletar
  const existentes = await prisma.lancamento.findMany({
    where: { id: { in: TODOS } },
    include: { faturamento: { select: { ano: true, mes: true } } },
    orderBy: [{ faturamento: { ano: 'asc' } }, { faturamento: { mes: 'asc' } }],
  })

  console.log(`\nLançamentos a deletar (${existentes.length}/${TODOS.length}):\n`)
  let totalDeletado = 0
  for (const l of existentes) {
    console.log(`  ${l.faturamento?.ano}-${String(l.faturamento?.mes).padStart(2,'0')} | ${l.descricao.padEnd(45)} | R$ ${l.valor.toFixed(2)}`)
    totalDeletado += l.valor
  }
  console.log(`\nTotal CMV a remover: R$ ${totalDeletado.toFixed(2)}`)

  if (existentes.length === 0) {
    console.log('\nNenhum lançamento encontrado. Nada a fazer.')
    return
  }

  // Deleta
  const result = await prisma.lancamento.deleteMany({
    where: { id: { in: existentes.map(l => l.id) } },
  })

  console.log(`\n✓ ${result.count} lançamentos deletados`)
  console.log('\n═══════════════════════════════════════════════════════')
  console.log('PRÓXIMOS PASSOS — Re-subir relatórios com custo correto:')
  console.log('═══════════════════════════════════════════════════════')
  console.log('MAIO 2026:')
  console.log('  • Mercado Livre — Relatório de Vendas/Pedidos')
  console.log('  • Magalu        — Relatório de Vendas')
  console.log('  • Amazon        — Monthly Unified Transaction')
  console.log('  • Shopee        — Relatório de Vendas')
  console.log('  • TikTok        — Demonstrativo de Liquidação')
  console.log('\nJUNHO 2026:')
  console.log('  • Mercado Livre — Relatório de Vendas/Pedidos')
  console.log('  • Magalu        — Relatório de Vendas')
  console.log('  • Amazon        — Monthly Unified Transaction')
  console.log('  • Shopee        — Relatório de Vendas')
  console.log('  • TikTok        — Demonstrativo de Liquidação')
}

main().catch(console.error).finally(() => prisma.$disconnect())
