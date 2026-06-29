import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

async function main() {
  const ws = await p.workspace.findFirst({ where: { slug: { not: 'nacao-import-demo' } } })
  if (!ws) return

  // Pedidos mais recentes
  const recentes = await p.ml_pedido.findMany({
    where: { workspace_id: ws.id },
    select: { ml_item_id: true, sku: true, titulo: true, foto_url: true, data_compra: true },
    orderBy: { data_compra: 'desc' },
    take: 15,
  })
  console.log('Pedidos mais recentes:')
  for (const pd of recentes) {
    const fotoStatus = pd.foto_url === null ? '❌ NULL' : pd.foto_url === '' ? '❌ VAZIO' : `✅ ${pd.foto_url.substring(0, 60)}...`
    console.log(`  ${pd.sku?.padEnd(10)} | ${String(pd.data_compra).substring(0,16)} | ${fotoStatus}`)
  }

  await p.$disconnect()
}
main().catch(console.error)
