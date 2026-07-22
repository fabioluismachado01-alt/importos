/**
 * Corrige o registro de frete aéreo de julho/2026 com peso_kg=52500 (erro de digitação).
 * Peso correto: 52.5 kg → custo_kg = $378 / 52.5 = $7.20/kg (plausível para aéreo).
 *
 * Executar: npx tsx scripts/fix-frete-julho-2026.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL } },
})

async function main() {
  const ID = 'cmrjnt5210005lg04aada5h9l'

  const r = await prisma.frete_historico.findUnique({ where: { id: ID } })
  if (!r) { console.log('Registro não encontrado.'); return }

  console.log('Antes:')
  console.log(`  peso_kg:     ${r.peso_kg} kg`)
  console.log(`  frete_usd:   $${r.frete_usd}`)
  console.log(`  custo_kg_usd: $${r.custo_kg_usd}`)

  const novoPeso = 52.5
  const novoCusto = r.frete_usd / novoPeso

  await prisma.frete_historico.update({
    where: { id: ID },
    data: { peso_kg: novoPeso, custo_kg_usd: novoCusto },
  })

  console.log('\nDepois:')
  console.log(`  peso_kg:      ${novoPeso} kg`)
  console.log(`  frete_usd:    $${r.frete_usd}`)
  console.log(`  custo_kg_usd: $${novoCusto.toFixed(4)}/kg`)
  console.log('\n✓ Corrigido.')
}

main().catch(console.error).finally(() => prisma.$disconnect())
