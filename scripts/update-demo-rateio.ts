/**
 * Cria rateio FORMAL MARÍTIMO para o demo
 *
 * Modo: FORMAL (marítimo) — adequado para lote USD ~$13.5k FOB
 * Fator de custo: ~1.97x sobre FOB (II 20% + PIS/COFINS/ICMS + frete)
 * Margem média: ~28-32% sobre preço de venda no ML
 *
 * Valor aduaneiro CIF ~R$75.097 → créditos PIS/COFINS fazem Lucro Real ganhar
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const cambio = 5.25
const freteUsd = 1850.00  // frete marítimo Guangzhou → Santos
const siscomex = 214.50
const extras = 380.00     // despachante + armazenagem

// Itens — preços de venda ML alinhados com os pedidos demo
// II 20% = alíquota padrão NCM acessórios escritório/games (cap 9401/9403/8518/8525/8536)
const itensLote = [
  {
    sku: 'CAD-GAM-PRO-01', nome: 'Cadeira Gamer Pro RGB Reclinável',
    qty: 200, unitUsd: 28.00, peso: 12.5,
    dim_c: 65, dim_l: 62, dim_a: 120,
    ii: 20, ipi: 0, pis: 2.1, cofins: 9.65, icms: 18,
    targetPrice: 369.90,
  },
  {
    sku: 'MES-GAM-RGB-01', nome: 'Mesa Gamer LED RGB 120×60cm',
    qty: 80, unitUsd: 20.00, peso: 18.0,
    dim_c: 125, dim_l: 65, dim_a: 8,
    ii: 20, ipi: 0, pis: 2.1, cofins: 9.65, icms: 18,
    targetPrice: 279.90,
  },
  {
    sku: 'SUP-MON-DUP-01', nome: 'Suporte Articulado Monitor Duplo',
    qty: 150, unitUsd: 9.50, peso: 3.2,
    dim_c: 30, dim_l: 20, dim_a: 15,
    ii: 20, ipi: 0, pis: 2.1, cofins: 9.65, icms: 18,
    targetPrice: 109.90,
  },
  {
    sku: 'HDS-GAM-71-01', nome: 'Headset Gamer 7.1 Surround USB',
    qty: 150, unitUsd: 8.80, peso: 0.32,
    dim_c: 22, dim_l: 18, dim_a: 10,
    ii: 20, ipi: 0, pis: 2.1, cofins: 9.65, icms: 18,
    targetPrice: 99.90,
  },
  {
    sku: 'WEB-FHD-RNG-01', nome: 'Webcam Full HD 1080p Ring Light',
    qty: 120, unitUsd: 7.20, peso: 0.18,
    dim_c: 14, dim_l: 12, dim_a: 10,
    ii: 20, ipi: 0, pis: 2.1, cofins: 9.65, icms: 18,
    targetPrice: 119.90,
  },
  {
    sku: 'HUB-USC-7X1-01', nome: 'Hub USB-C 7 em 1 HDMI 4K',
    qty: 150, unitUsd: 5.50, peso: 0.09,
    dim_c: 12, dim_l: 4, dim_a: 2,
    ii: 20, ipi: 0, pis: 2.1, cofins: 9.65, icms: 18,
    targetPrice: 79.90,
  },
  {
    sku: 'MPD-XXL-SPD-01', nome: 'Mousepad XXL Speed Edition 90×40cm',
    qty: 400, unitUsd: 2.40, peso: 0.38,
    dim_c: 92, dim_l: 42, dim_a: 1,
    ii: 20, ipi: 0, pis: 2.1, cofins: 9.65, icms: 18,
    targetPrice: 49.90,
  },
  {
    sku: 'SUP-NTB-ERG-01', nome: 'Suporte Ergonômico para Notebook',
    qty: 250, unitUsd: 3.80, peso: 0.45,
    dim_c: 28, dim_l: 22, dim_a: 4,
    ii: 20, ipi: 0, pis: 2.1, cofins: 9.65, icms: 18,
    targetPrice: 69.90,
  },
]

function calcCustoFormal(item: typeof itensLote[0], totalFobUsd: number): number {
  const fobUnit = item.unitUsd * cambio
  // Frete proporcional ao FOB
  const freteUnitBrl = (freteUsd * cambio) * (item.unitUsd * item.qty / totalFobUsd) / item.qty
  const cifUnit = fobUnit + freteUnitBrl
  // Impostos formais sobre CIF
  const iiUnit = cifUnit * (item.ii / 100)
  const ipiUnit = (cifUnit + iiUnit) * (item.ipi / 100)
  const pisUnit = cifUnit * (item.pis / 100)
  const cofinsUnit = cifUnit * (item.cofins / 100)
  // ICMS por dentro
  const baseAnteIcms = cifUnit + iiUnit + ipiUnit + pisUnit + cofinsUnit + (siscomex + extras) / itensLote.reduce((a, i) => a + i.qty, 0)
  const icmsUnit = baseAnteIcms / (1 - item.icms / 100) * (item.icms / 100)
  return cifUnit + iiUnit + ipiUnit + pisUnit + cofinsUnit + icmsUnit
}

async function main() {
  const ws = await prisma.workspace.findFirst({ where: { slug: 'nacao-import-demo' } })
  if (!ws) { console.error('❌ Workspace demo não encontrado'); return }
  console.log('✅ Workspace:', ws.nome)

  const produtos = await prisma.produto_catalogo.findMany({
    where: { workspace_id: ws.id, ativo: true },
    select: { id: true, sku_interno: true },
  })
  const prodMap = new Map(produtos.map(p => [p.sku_interno, p]))

  await prisma.rateio.deleteMany({ where: { workspace_id: ws.id, nome: { contains: 'Demo' } } })
  await prisma.rateio.deleteMany({ where: { workspace_id: ws.id, nome: { contains: 'TechGear' } } })

  const totalFobUsd = itensLote.reduce((a, i) => a + i.qty * i.unitUsd, 0)
  const totalQty = itensLote.reduce((a, i) => a + i.qty, 0)

  // Valor aduaneiro CIF = (FOB + frete) em BRL
  const totalCifBrl = (totalFobUsd + freteUsd) * cambio

  // Custo nationalizado por item e total
  let totalInvestido = 0
  let totalFaturado = 0
  const itensComCalculo = itensLote.map(item => {
    const custoUnit = calcCustoFormal(item, totalFobUsd)
    const fator = custoUnit / (item.unitUsd * cambio)
    const margemBruta = item.targetPrice > 0 ? (item.targetPrice - custoUnit) / item.targetPrice * 100 : 0
    totalInvestido += custoUnit * item.qty
    totalFaturado += item.targetPrice * item.qty
    console.log(`  ${item.nome}: FOB R$${(item.unitUsd * cambio).toFixed(2)} → custo R$${custoUnit.toFixed(2)} (${fator.toFixed(2)}x) → venda R$${item.targetPrice} → margem ${margemBruta.toFixed(1)}%`)
    return { ...item, custoUnit, valorAdUnit: (item.unitUsd + freteUsd / totalFobUsd * item.unitUsd) * cambio }
  })

  const rateio = await prisma.rateio.create({
    data: {
      workspace_id: ws.id,
      nome: 'Lote Jun/2026 — Guangzhou TechGear Demo',
      modo: 'FORMAL',
      cambio,
      frete_usd: freteUsd,
      siscomex_brl: siscomex,
      extras_brl: extras,
      venda_imposto_perc: 6.0,
      venda_taxa_mkt_perc: 13.0,
      venda_taxa_fixa_brl: 5.50,
      status: 'SALVO',
      ano_ref: 2026,
      mes_ref: 6,
      valor_aduaneiro_brl: totalCifBrl,
      created_by: 'demo-seed',
      itens: {
        create: itensComCalculo.map(item => ({
          produto_id: prodMap.get(item.sku)?.id ?? null,
          nome: item.nome,
          qty: item.qty,
          unit_usd: item.unitUsd,
          peso: item.peso,
          dim_c: item.dim_c,
          dim_l: item.dim_l,
          dim_a: item.dim_a,
          ii: item.ii,
          ipi: item.ipi,
          pis: item.pis,
          cofins: item.cofins,
          icms: item.icms,
          target_price: item.targetPrice,
          custo_unit_brl: item.custoUnit,
          valor_aduaneiro_unit_brl: item.valorAdUnit,
        })),
      },
    },
  })

  const margemMedia = totalFaturado > 0 ? (totalFaturado - totalInvestido) / totalFaturado * 100 : 0
  const lucroTotal = totalFaturado - totalInvestido

  console.log(`\n✅ Rateio criado: ${rateio.nome}`)
  console.log(`   Modo: FORMAL (Marítimo)`)
  console.log(`   FOB total: USD ${totalFobUsd.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
  console.log(`   CIF total: R$ ${totalCifBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
  console.log(`   Investimento total (nacionalizado): R$ ${totalInvestido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
  console.log(`   Faturamento estimado: R$ ${totalFaturado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
  console.log(`   Lucro estimado: R$ ${lucroTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
  console.log(`   Margem média: ${margemMedia.toFixed(1)}%`)

  // Verificar créditos PIS/COFINS para o Simulador Tributário
  const creditoPIS = totalCifBrl * 0.021
  const creditoCOFINS = totalCifBrl * 0.0965
  const receita = 118500
  const netPIS = Math.max(0, receita * 0.0165 - creditoPIS)
  const netCOFINS = Math.max(0, receita * 0.076 - creditoCOFINS)
  const lucroOp = receita - 54000 - 50000
  const totalLR = lucroOp * 0.24 + netPIS + netCOFINS
  console.log(`\n📊 Simulador Tributário — Lucro Real: ${(totalLR / receita * 100).toFixed(2)}% (Presumido: 5.93%, Simples: 8.94%)`)
  console.log(totalLR / receita < 0.0593 ? '🏆 Lucro Real GANHA!' : '⚠️ Verificar créditos')
}

main()
  .catch(e => { console.error('❌', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
