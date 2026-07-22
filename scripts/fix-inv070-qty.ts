import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const RATEIO_ID = 'cmrbzotwi0001vc5s9we68fr6'
const TOTAL_BRL = 30_511.35

async function main() {
  // INV070 kit×4: 1000 → 500 kits (500×4 = 2000 peças)
  const inv070 = await p.rateio_item.findFirst({ where: { rateio_id: RATEIO_ID, nome: { contains: 'INV070 —' } } })
  if (!inv070) throw new Error('INV070 item não encontrado')
  await p.rateio_item.update({ where: { id: inv070.id }, data: { qty: 500 } })
  console.log('✓ INV070 kit×4: qty 1000 → 500  (500×4 = 2000 peças)')

  // INV070-5 kit×5: 400 → 300 kits (300×5 = 1500 peças)
  const inv0705 = await p.rateio_item.findFirst({ where: { rateio_id: RATEIO_ID, nome: { contains: 'INV070-5' } } })
  if (!inv0705) throw new Error('INV070-5 item não encontrado')
  await p.rateio_item.update({ where: { id: inv0705.id }, data: { qty: 300 } })
  console.log('✓ INV070-5 kit×5: qty 400 → 300  (300×5 = 1500 peças)')
  console.log('  Total peças: 2000 + 1500 = 3500 ✓')

  // Verificação final
  const items = await p.rateio_item.findMany({
    where: { rateio_id: RATEIO_ID },
    select: { nome: true, qty: true, unit_usd: true, custo_unit_brl: true }
  })
  let totalFob = 0, totalBrl = 0
  items.forEach(it => { totalFob += it.qty * it.unit_usd; totalBrl += (it.custo_unit_brl ?? 0) * it.qty })

  console.log('\nVerificação do rateio completo:')
  items.forEach(it => {
    const brl = (it.custo_unit_brl ?? 0) * it.qty
    console.log(' ', (it.nome ?? '').slice(0, 50).padEnd(50), `| qty: ${String(it.qty).padStart(5)} | BRL: R$${brl.toFixed(2).padStart(8)}`)
  })
  console.log(`\n  FOB total: USD ${totalFob.toFixed(2)}  (DI: USD 4120.98)`)
  console.log(`  BRL total: R$${totalBrl.toFixed(2)}`)
  console.log(`  Pago real: R$${TOTAL_BRL.toFixed(2)}`)
  console.log(`  Diferença: R$${(totalBrl - TOTAL_BRL).toFixed(2)}  (deve ser ≈0 agora)`)
}
main().catch(e => { console.error('Erro:', e.message); process.exit(1) }).finally(() => p.$disconnect())
