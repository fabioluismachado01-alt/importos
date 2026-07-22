/**
 * fix-rateios-demo.ts
 * Atualiza rateios existentes para status SALVO e seta valor_aduaneiro_unit_brl
 * para que o simulador tributário mostre ~R$320.000 de importações automaticamente.
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const ws = await prisma.workspace.findUnique({ where: { slug: 'nacao-import-demo' } })
  if (!ws) throw new Error('Workspace não encontrado')

  // Busca todos os rateios do demo
  const rateios = await prisma.rateio.findMany({
    where: { workspace_id: ws.id },
    include: { itens: true },
  })
  console.log(`\nRateios encontrados: ${rateios.length}`)

  // Total de itens com produto_id
  const itensComProduto = rateios.flatMap(r => r.itens.filter(i => i.produto_id))
  console.log(`Itens com produto_id: ${itensComProduto.length}`)

  // Distribui R$320.000 de valor aduaneiro pelos itens proporcionalmente à qty
  const totalQty = itensComProduto.reduce((s, i) => s + i.qty, 0)
  const valorAlvo = 320_000
  console.log(`Total qty (para distribuição): ${totalQty}`)

  for (const item of itensComProduto) {
    const valorProporcional = (item.qty / totalQty) * valorAlvo
    const valUnitBrl = parseFloat((valorProporcional / item.qty).toFixed(2))
    await prisma.rateio_item.update({
      where: { id: item.id },
      data: { valor_aduaneiro_unit_brl: valUnitBrl },
    })
    console.log(`  Item ${item.nome} (qty ${item.qty}): R$${valUnitBrl}/un = R$${(valUnitBrl * item.qty).toFixed(0)} total`)
  }

  // Muda os rateios para SALVO (e define ano/mes de referência como Julho/2026)
  for (const r of rateios) {
    await prisma.rateio.update({
      where: { id: r.id },
      data: { status: 'SALVO', ano_ref: 2026, mes_ref: 7 },
    })
    console.log(`✓ Rateio "${r.nome}" → SALVO (ref Jul/2026)`)
  }

  // Verifica o total que o simulador vai calcular
  const check = await prisma.rateio_item.aggregate({
    where: {
      produto_id: { not: null },
      rateio: { workspace_id: ws.id, status: 'SALVO' },
    },
    _sum: { valor_aduaneiro_unit_brl: true },
  })
  // Essa soma é de unit_brl — precisamos qty × unit
  const itensVerif = await prisma.rateio_item.findMany({
    where: { produto_id: { not: null }, rateio: { workspace_id: ws.id, status: 'SALVO' } },
    select: { qty: true, valor_aduaneiro_unit_brl: true },
  })
  const totalVerif = itensVerif.reduce((s, i) => s + (i.qty * (i.valor_aduaneiro_unit_brl ?? 0)), 0)
  console.log(`\n✅ Valor aduaneiro total que o simulador vai ler: R$${totalVerif.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`)
}

main().catch(e => { console.error('❌', e.message); process.exit(1) }).finally(() => prisma.$disconnect())
