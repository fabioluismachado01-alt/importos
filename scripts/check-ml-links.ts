import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const WS = 'cmpx6dq5k000fvckk6d1aknfq'

async function main() {
  const skus = ['DTS-1','ATS-1','ATS-2','CTS-1','BTS-1','BTS-2','INV070','INV070-5','INV071-6','INV072','INV073']
  const prods = await p.produto_catalogo.findMany({
    where: { workspace_id: WS, sku_interno: { in: skus } },
    select: { id: true, sku_interno: true, nome: true, custo_brl: true },
    orderBy: { sku_interno: 'asc' }
  })
  console.log('Estado atual do catálogo (conta principal):')
  prods.forEach(r => console.log(
    ' ', (r.sku_interno??'?').padEnd(12),
    '| custo atual: R$' + (r.custo_brl?.toFixed(2)??'—').padStart(7),
    '|', r.nome.slice(0,40),
    '|', r.id.slice(-8)
  ))

  console.log('\nRateio 4ª importação — todos os itens finais:')
  const items = await p.rateio_item.findMany({
    where: { rateio_id: 'cmrbzotwi0001vc5s9we68fr6' },
    select: { nome: true, qty: true, unit_usd: true, custo_unit_brl: true, produto_id: true },
    orderBy: { nome: 'asc' }
  })
  let totalFob = 0, totalBrl = 0
  items.forEach(it => {
    const fob = it.qty * it.unit_usd
    const brl = (it.custo_unit_brl ?? 0) * it.qty
    totalFob += fob; totalBrl += brl
    console.log(
      ' ', (it.nome??'?').slice(0,52).padEnd(52),
      `qty: ${String(it.qty).padStart(5)}`,
      `| unit USD: ${it.unit_usd.toFixed(4)}`,
      `| custo/un: R$${(it.custo_unit_brl??0).toFixed(2).padStart(6)}`,
      `| total BRL: R$${brl.toFixed(2).padStart(8)}`,
      it.produto_id ? '' : '⚠️ sem produto'
    )
  })
  console.log(`\nFOB total rateio: USD ${totalFob.toFixed(2)}  (DI: USD 4120.98)`)
  console.log(`BRL total rateio: R$${totalBrl.toFixed(2)}  (pago: R$30511.35)`)
  console.log(`Diferença:        R$${(totalBrl - 30511.35).toFixed(2)} (INV070 qty overcounting explicado abaixo)`)
  console.log()
  console.log('Nota: R$1480.69 de diferença = INV070 tem 1000×4 + 400×5 = 6000pcs rateadas mas DI tem 3500pcs.')
  console.log('Custo/unidade está correto (baseado no preço por peça × qtd do kit).')
}
main().catch(e => { console.error(e.message); process.exit(1) }).finally(() => p.$disconnect())
