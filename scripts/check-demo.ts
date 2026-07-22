import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
async function run() {
  const ws = await p.workspace.findUnique({ where: { slug: 'nacao-import-demo' } })
  if (!ws) { console.log('Workspace não encontrado'); return }
  console.log('Workspace:', ws.id)
  const meses = await p.faturamento_mes.findMany({ where: { workspace_id: ws.id, ano: 2026 }, orderBy: { mes: 'asc' }, select: { mes: true, receita_total: true, fechado: true } })
  for (const m of meses) console.log('Mes', m.mes, ':', m.receita_total, m.fechado ? 'FECHADO' : 'ABERTO')
  const pedidosHoje = await p.ml_pedido.count({ where: { workspace_id: ws.id, data_compra: { gte: new Date('2026-07-06T00:00:00Z'), lt: new Date('2026-07-07T00:00:00Z') } } })
  const pedidosTotal = await p.ml_pedido.count({ where: { workspace_id: ws.id } })
  console.log('Pedidos hoje (Jul 6):', pedidosHoje)
  console.log('Pedidos total:', pedidosTotal)
}
run().catch(e => console.error(e.message)).finally(() => p.$disconnect())
