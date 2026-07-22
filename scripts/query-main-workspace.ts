import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

async function main() {
  const ws_id = 'cmpx6dq5k000fvckk6d1aknfq'
  const all = await p.produto_catalogo.findMany({
    where: { workspace_id: ws_id },
    select: { id: true, sku_interno: true, nome: true, custo_brl: true },
    orderBy: { sku_interno: 'asc' }
  })
  console.log('Todos os produtos (' + all.length + '):')
  all.forEach(pr => console.log(' ', (pr.sku_interno ?? '(sem sku)').padEnd(14), '|', String(pr.custo_brl ?? '—').padStart(8), '|', pr.nome.slice(0,50), '|', pr.id))

  const users = await p.user.findMany({ select: { id: true, email: true } })
  console.log('\nUsers:', JSON.stringify(users))
}

main().catch(e => { console.error('Erro:', e.message); process.exit(1) }).finally(() => p.$disconnect())
