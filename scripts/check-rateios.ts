import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
async function run() {
  const ws = await p.workspace.findUnique({ where: { slug: 'nacao-import-demo' } })
  if (!ws) { console.log('ws not found'); return }
  const produtos = await p.produto_catalogo.count({ where: { workspace_id: ws.id } })
  const rateios = await p.rateio.count({ where: { workspace_id: ws.id } })
  const rateiosSalvos = await p.rateio.count({ where: { workspace_id: ws.id, status: 'SALVO' } })
  console.log('Produtos catálogo:', produtos)
  console.log('Rateios total:', rateios)
  console.log('Rateios SALVO:', rateiosSalvos)
  if (rateios > 0) {
    const r = await p.rateio.findFirst({ where: { workspace_id: ws.id }, include: { itens: { take: 2 } } })
    console.log('Rateio sample:', r?.nome, r?.status, '| itens:', r?.itens?.length)
    if (r?.itens[0]) console.log('Item:', JSON.stringify(r.itens[0]).slice(0, 250))
  }
  if (produtos > 0) {
    const prod = await p.produto_catalogo.findFirst({ where: { workspace_id: ws.id } })
    console.log('Produto sample:', prod?.nome, prod?.sku)
  }
}
run().catch(e => console.error(e.message)).finally(() => p.$disconnect())
