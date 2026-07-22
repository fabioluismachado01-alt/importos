import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
async function main() {
  const r = await p.produto_catalogo.update({
    where: { id: 'cmpxag8pm000dvcn8fbu8mq6t' },
    data: { sku_alias: 'ATS-6' }
  })
  console.log('✓ Alias setado:', r.sku_interno, '| sku_alias:', r.sku_alias, '| custo: R$' + r.custo_brl?.toFixed(2))

  const check = await p.produto_catalogo.findMany({
    where: { workspace_id: 'cmpx6dq5k000fvckk6d1aknfq', sku_alias: { not: null } },
    select: { sku_interno: true, nome: true, sku_alias: true, custo_brl: true }
  })
  console.log('\nProdutos com sku_alias no workspace:')
  check.forEach(c => console.log(' ', (c.sku_interno??'?').padEnd(8), '| alias:', (c.sku_alias??'—').padEnd(10), '| custo: R$', c.custo_brl?.toFixed(2), '|', c.nome))
}
main().catch(e => { console.error(e.message); process.exit(1) }).finally(() => p.$disconnect())
