import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

async function main() {
  const ws = await p.workspace.findFirst({ where: { slug: { not: 'nacao-import-demo' } } })
  if (!ws) return

  // Ver foto_url dos SKUs com problema
  const skus = ['INV02', 'INV070', 'INV070-5']
  for (const sku of skus) {
    const pedidos = await p.ml_pedido.findMany({
      where: { workspace_id: ws.id, sku },
      select: { ml_item_id: true, foto_url: true, titulo: true },
      distinct: ['ml_item_id'],
    })
    console.log(`\n${sku}:`)
    for (const pd of pedidos) {
      console.log(`  item_id: ${pd.ml_item_id}`)
      console.log(`  foto_url: ${pd.foto_url ?? 'NULL'}`)
    }
  }

  // Contar quantos têm foto_url null vs vazio vs com valor
  const todos = await p.ml_pedido.findMany({
    where: { workspace_id: ws.id },
    select: { foto_url: true },
  })
  const nulo = todos.filter(p => p.foto_url === null).length
  const vazio = todos.filter(p => p.foto_url === '').length
  const comFoto = todos.filter(p => p.foto_url && p.foto_url.length > 0).length
  console.log(`\nResumo: null=${nulo} | vazio="${vazio}" | com URL=${comFoto}`)

  await p.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
