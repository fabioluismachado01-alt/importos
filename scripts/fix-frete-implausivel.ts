/**
 * Localiza registros de frete com custo_kg_usd implausível (< $0.10/kg)
 * e exibe os dados para correção manual ou confirma a exclusão.
 *
 * Executar: npx tsx scripts/fix-frete-implausivel.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL } },
})

async function main() {
  const registros = await prisma.frete_historico.findMany({
    where: { custo_kg_usd: { lt: 0.10 } },
    orderBy: { data_embarque: 'asc' },
  })

  if (registros.length === 0) {
    console.log('Nenhum registro implausível encontrado (custo_kg_usd < $0.10/kg).')
    return
  }

  console.log(`\n=== ${registros.length} registro(s) com custo_kg_usd implausível ===\n`)
  for (const r of registros) {
    console.log(`ID:             ${r.id}`)
    console.log(`Workspace:      ${r.workspace_id}`)
    console.log(`Data embarque:  ${r.data_embarque.toISOString().slice(0, 10)}`)
    console.log(`Modal:          ${r.modal}`)
    console.log(`Frete USD:      $${r.frete_usd}`)
    console.log(`Peso KG:        ${r.peso_kg} kg`)
    console.log(`custo_kg_usd:   $${r.custo_kg_usd}`)
    console.log(`Fornecedor:     ${r.fornecedor ?? '—'}`)
    console.log('---')
  }

  // Para deletar automaticamente, descomente as linhas abaixo:
  // const ids = registros.map(r => r.id)
  // await prisma.frete_historico.deleteMany({ where: { id: { in: ids } } })
  // console.log(`\n${ids.length} registro(s) deletado(s).`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
