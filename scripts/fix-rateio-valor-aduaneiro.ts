/**
 * Restaura os valores CIF do rateio para R$320k (via trading company).
 *
 * O catalog.custo_brl = landed cost de compra direta (EXW fábrica + impostos).
 * O rateio.valor_aduaneiro = CIF pago via trading company intermediária (preço premium),
 * o que é 100% real: importadores pequenos sem MOQ direto pagam 40-60% a mais.
 *
 * Essa diferença é o próprio argumento do módulo de gestão de compras:
 * "olha quanto você paga a mais por comprar via intermediário".
 */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

const ITENS_CIF = [
  { sku: 'MPD-XXL-SPD-01', qty: 1800, unit_usd:  8.90, cif_brl:  50.90 },
  { sku: 'HUB-USC-7X1-01', qty:  800, unit_usd: 10.00, cif_brl:  57.20 },
  { sku: 'WEB-FHD-RNG-01', qty:  500, unit_usd: 11.90, cif_brl:  68.10 },
  { sku: 'HDS-GAM-71-01',  qty:  300, unit_usd: 14.35, cif_brl:  82.10 },
  { sku: 'SUP-NTB-ERG-01', qty:  600, unit_usd:  8.42, cif_brl:  48.20 },
  { sku: 'SUP-MON-DUP-01', qty:  300, unit_usd: 15.91, cif_brl:  91.00 },
  { sku: 'MES-GAM-RGB-01', qty:   90, unit_usd: 58.60, cif_brl: 335.00 },
  { sku: 'CAD-GAM-PRO-01', qty:   55, unit_usd:120.63, cif_brl: 690.00 },
]

// Landed cost para custo_unit_brl no rateio (CIF + impostos)
function landedFromCIF(cif: number, ii: number, ipi = 0) {
  return cif * (1 + ii/100 + ipi/100 + 0.021 + 0.0965 + 0.17)
}
const II: Record<string, number> = {
  'MPD-XXL-SPD-01': 16, 'HUB-USC-7X1-01': 16, 'WEB-FHD-RNG-01': 16,
  'HDS-GAM-71-01': 16, 'SUP-NTB-ERG-01': 16, 'SUP-MON-DUP-01': 16,
  'MES-GAM-RGB-01': 35, 'CAD-GAM-PRO-01': 35,
}
const IPI: Record<string, number> = { 'WEB-FHD-RNG-01': 5, 'HDS-GAM-71-01': 5 }

async function main() {
  const ws = await p.workspace.findUnique({ where: { slug: 'nacao-import-demo' } })
  if (!ws) throw new Error('Workspace não encontrado')

  const rateio = await p.rateio.findFirst({
    where: { workspace_id: ws.id, status: 'SALVO' },
    orderBy: { created_at: 'desc' },
    include: { itens: true },
  })
  if (!rateio) throw new Error('Rateio não encontrado')

  const catalogo = await p.produto_catalogo.findMany({ where: { workspace_id: ws.id } })
  const skuByProdId = new Map(catalogo.map(c => [c.id, c.sku_interno ?? '']))

  let totalCIF = 0
  for (const item of rateio.itens) {
    const sku = item.produto_id ? skuByProdId.get(item.produto_id) : undefined
    const cfg = ITENS_CIF.find(c => c.sku === sku)
    if (!cfg) { console.log(`  ⚠ item sem mapeamento: ${item.nome}`); continue }
    const landed = landedFromCIF(cfg.cif_brl, II[cfg.sku] ?? 16, IPI[cfg.sku] ?? 0)
    totalCIF += cfg.qty * cfg.cif_brl
    await p.rateio_item.update({
      where: { id: item.id },
      data: {
        unit_usd: cfg.unit_usd,
        valor_aduaneiro_unit_brl: cfg.cif_brl,
        custo_unit_brl: parseFloat(landed.toFixed(2)),
      },
    })
    console.log(`  ✓ ${cfg.sku}: CIF R$${cfg.cif_brl}/un | Landed R$${landed.toFixed(2)}/un`)
  }
  await p.rateio.update({
    where: { id: rateio.id },
    data: { valor_aduaneiro_brl: parseFloat(totalCIF.toFixed(2)) },
  })

  const RECEITA = 380_000, VAL_IMP = totalCIF
  const pisCredito   = VAL_IMP * 0.021
  const cofinsCredito = VAL_IMP * 0.0965
  const pisLiq    = Math.max(0, RECEITA * 0.0165 - pisCredito)
  const cofinsLiq = Math.max(0, RECEITA * 0.076 - cofinsCredito)
  const lucroReal = 68_000
  const irpj = lucroReal * 0.15 + Math.max(0, lucroReal - 20_000) * 0.10
  const csll  = lucroReal * 0.09
  const totalLR = irpj + csll + pisLiq + cofinsLiq
  const presumido = RECEITA*0.08*0.15 + Math.max(0,RECEITA*0.08-20000)*0.10 + RECEITA*0.12*0.09 + RECEITA*0.0065 + RECEITA*0.03

  console.log(`\n  Rateio valor aduaneiro: R$${totalCIF.toLocaleString('pt-BR', {minimumFractionDigits:2})}`)
  console.log(`  PIS crédito R$${pisCredito.toFixed(0)} / Gross R$${(RECEITA*0.0165).toFixed(0)} → paga R$${pisLiq.toFixed(0)}`)
  console.log(`  COFINS crédito R$${cofinsCredito.toFixed(0)} / Gross R$${(RECEITA*0.076).toFixed(0)} → paga R$${cofinsLiq.toFixed(0)}`)
  console.log(`\n  Simples:   R$${37166}`)
  console.log(`  Presumido: R$${presumido.toFixed(0)}`)
  console.log(`  Lucro Real: R$${totalLR.toFixed(0)} ${totalLR < presumido ? '← MELHOR ✅' : '← Presumido ganha ⚠'}`)
}

main().catch(e => { console.error('❌', e.message); process.exit(1) }).finally(() => p.$disconnect())
