import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

async function main() {
  const ws = await p.workspace.findFirst({ where: { slug: { not: 'nacao-import-demo' } } })
  if (!ws) return

  const conn = await p.ml_conexao.findFirst({ where: { workspace_id: ws.id } })
  if (!conn) { console.log('Sem conexão ML'); return }

  const token = conn.access_token
  if (!token) { console.log('Sem token ML'); return }

  const semFoto = await p.ml_pedido.findMany({
    where: { workspace_id: ws.id, foto_url: null },
    select: { ml_item_id: true },
    distinct: ['ml_item_id'],
  })
  console.log(`${semFoto.length} item_ids sem foto`)

  const ids = semFoto.map(x => x.ml_item_id)
  const thumbMap = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 20) {
    const batch = ids.slice(i, i + 20).join(',')
    const res = await fetch(`https://api.mercadolibre.com/items?ids=${batch}&attributes=id,thumbnail`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const data: Array<{ code: number; body: { id: string; thumbnail: string } }> = await res.json()
      for (const d of data)
        if (d.code === 200 && d.body?.thumbnail)
          thumbMap.set(d.body.id, d.body.thumbnail.replace('http://', 'https://'))
    }
  }

  let atualizados = 0
  for (const [mlItemId, fotoUrl] of thumbMap) {
    const r = await p.ml_pedido.updateMany({
      where: { workspace_id: ws.id, ml_item_id: mlItemId, foto_url: null },
      data: { foto_url: fotoUrl },
    })
    atualizados += r.count
    console.log(`✅ ${mlItemId}: ${r.count} pedidos atualizados`)
  }

  console.log(`\nTotal: ${atualizados} pedidos com foto agora`)
  await p.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
