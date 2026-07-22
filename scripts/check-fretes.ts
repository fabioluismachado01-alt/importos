import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
async function run() {
  const ws = await p.workspace.findUnique({ where: { slug: 'nacao-import-demo' } })
  const fretes = await p.frete_historico.findMany({
    where: { workspace_id: ws!.id },
    orderBy: { data_embarque: 'desc' },
  })
  console.log(`Total fretes demo: ${fretes.length}`)
  for (const f of fretes) {
    console.log(`  ${f.data_embarque.toISOString().slice(0,10)} | ${f.modal} | ${f.tipo_container ?? 'AEREO'} | ${f.operador} | $${f.frete_usd} | R$${f.custo_total_brl.toFixed(0)}`)
  }
}
run().catch(e => console.error(e.message)).finally(() => p.$disconnect())
