/**
 * Atualiza target_price do item INV070 para R$19,00
 * e imprime o resumo completo do rateio com os dois câmbios corretos.
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const RATEIO_ID   = 'cmrjmv7ic0001vc94x8zxm1me'
const TARGET_PRICE = 19.00

// Parâmetros de venda (defaults do sistema)
const DAS_PERC  = 6.0    // %
const MKT_PERC  = 16.5   // %
const MKT_FIXED = 5.50   // R$

async function main() {
  const rateio = await prisma.rateio.findUnique({
    where: { id: RATEIO_ID },
    include: { itens: true },
  })
  if (!rateio) { console.log('❌ Rateio não encontrado'); return }

  // Atualiza target_price do item
  for (const item of rateio.itens) {
    await prisma.rateio_item.update({
      where: { id: item.id },
      data: { target_price: TARGET_PRICE },
    })
  }

  // Parâmetros reais
  const DOLAR_FOB   = rateio.cambio           // 5.0937
  const DOLAR_FRETE = (rateio as any).cambio_frete ?? rateio.cambio  // 5.1717
  const FRETE_USD   = rateio.frete_usd
  const TAXES_BRL   = rateio.imposto_simpl_brl ?? 0
  const QTY         = rateio.itens[0]?.qty ?? 1500
  const UNIT_USD    = rateio.itens[0]?.unit_usd ?? 0.14

  // CIF
  const fobTotalUsd = QTY * UNIT_USD
  const fobBrl      = fobTotalUsd * DOLAR_FOB
  const freteBrl    = FRETE_USD * DOLAR_FRETE
  const cifBrl      = fobBrl + freteBrl
  const total       = cifBrl + TAXES_BRL
  const custoKit    = total / QTY

  // Simulação de venda
  const v       = TARGET_PRICE
  const das     = v * (DAS_PERC  / 100)
  const mkt     = v * (MKT_PERC  / 100) + MKT_FIXED
  const lucro   = v - custoKit - das - mkt
  const margem  = (lucro / v) * 100
  const roi     = (lucro / custoKit) * 100

  console.log('═══════════════════════════════════════════════')
  console.log(' RATEIO INV070 — Kit 4 Clipes Anti-Ronco')
  console.log('═══════════════════════════════════════════════')
  console.log()
  console.log('── CÂMBIO ──────────────────────────────────────')
  console.log(`  Dólar FOB (mercadoria): R$ ${DOLAR_FOB}`)
  console.log(`  Dólar Frete (DIR/FedEx): R$ ${DOLAR_FRETE}`)
  console.log()
  console.log('── CUSTO DO LOTE ───────────────────────────────')
  console.log(`  Qtd: ${QTY} kits  |  Custo USD/kit: USD ${UNIT_USD}`)
  console.log(`  FOB Total: USD ${fobTotalUsd.toFixed(2)} × R$ ${DOLAR_FOB} = R$ ${fobBrl.toFixed(2)}`)
  console.log(`  Frete:     USD ${FRETE_USD.toFixed(2)} × R$ ${DOLAR_FRETE} = R$ ${freteBrl.toFixed(2)}`)
  console.log(`  CIF:       R$ ${cifBrl.toFixed(2)}`)
  console.log(`  Impostos BR (FedEx ROD): R$ ${TAXES_BRL.toFixed(2)}`)
  console.log(`  TOTAL:     R$ ${total.toFixed(2)}`)
  console.log(`  Custo/kit: R$ ${custoKit.toFixed(4)}`)
  console.log()
  console.log('── SIMULAÇÃO DE VENDA ──────────────────────────')
  console.log(`  Preço de venda: R$ ${v.toFixed(2)}`)
  console.log(`  Custo/kit:      R$ ${custoKit.toFixed(4)}`)
  console.log(`  DAS ${DAS_PERC}%:        - R$ ${das.toFixed(2)}`)
  console.log(`  Mkt ${MKT_PERC}% + R$${MKT_FIXED}: - R$ ${mkt.toFixed(2)}`)
  console.log(`  Lucro/kit:      R$ ${lucro.toFixed(2)}`)
  console.log()
  console.log('── RESULTADO DO LOTE ───────────────────────────')
  console.log(`  Margem de contribuição: ${margem.toFixed(1)}%`)
  console.log(`  ROI:                    ${roi.toFixed(1)}%`)
  console.log(`  Lucro total lote:       R$ ${(lucro * QTY).toFixed(2)}`)
  console.log(`  Investimento total:     R$ ${(custoKit * QTY).toFixed(2)}`)
  console.log()
  console.log('✓ target_price atualizado para R$19,00')
}

main().catch(console.error).finally(() => prisma.$disconnect())
