import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

async function main() {
  const ws = await p.workspace.findFirst({ where: { slug: { not: 'nacao-import-demo' } } })
  if (!ws) { console.log('no ws'); return }

  const semFoto = await p.ml_pedido.findMany({
    where: { workspace_id: ws.id, foto_url: null },
    select: { ml_item_id: true, sku: true, titulo: true, data_compra: true },
    orderBy: { data_compra: 'desc' },
    take: 20,
  })
  console.log('Pedidos com foto_url NULL:', semFoto.length)
  for (const pd of semFoto) {
    console.log(`  ${pd.sku} | ${pd.ml_item_id} | ${pd.titulo?.substring(0, 40)} | ${pd.data_compra}`)
  }

  // Checa também quantos com foto_url vazio string
  const vazios = await p.ml_pedido.count({ where: { workspace_id: ws.id, foto_url: '' } })
  console.log('Pedidos com foto_url VAZIO "":', vazios)

  // Total
  const total = await p.ml_pedido.count({ where: { workspace_id: ws.id } })
  console.log('Total pedidos:', total)

  await p.$disconnect()
}
main().catch(console.error)
