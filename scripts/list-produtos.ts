import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
async function run() {
  const ws = await p.workspace.findUnique({ where: { slug: 'nacao-import-demo' } })
  const prods = await p.produto_catalogo.findMany({ where: { workspace_id: ws!.id } })
  for (const prod of prods) {
    const keys = Object.keys(prod)
    const skuKey = keys.find(k => k.toLowerCase().includes('sku'))
    console.log(prod.id, '|', prod.nome, '| skuKey:', skuKey, '=', skuKey ? (prod as any)[skuKey] : 'N/A')
  }
  // Also show schema fields
  console.log('\nFields:', Object.keys(prods[0] ?? {}).join(', '))
}
run().catch(e => console.error(e.message)).finally(() => p.$disconnect())
