/**
 * Atualiza o rateio INV070 (Prendedor Anti-Ronco) com dois câmbios separados:
 *   cambio       = 5.0937  (dólar pago na China para a mercadoria, USD 210)
 *   cambio_frete = 5.1717  (dólar do frete FedEx / ROD, USD 378)
 *
 * Recalcula o custo/kit e o valor aduaneiro BRL com os valores reais.
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const RATEIO_ID     = 'cmrjmv7ic0001vc94x8zxm1me'
const DOLAR_FOB     = 5.0937   // pago ao fornecedor China
const DOLAR_FRETE   = 5.1717   // taxa FedEx ROD

const FOB_USD       = 210.00   // 1500 kits × USD 0.14
const FRETE_USD     = 378.00
const TAXES_BRL     = 3136.63
const QTY_KITS      = 1500

async function main() {
  const fobBrl    = FOB_USD   * DOLAR_FOB    // 1069.68
  const freteBrl  = FRETE_USD * DOLAR_FRETE  // 1954.90
  const cifBrl    = fobBrl + freteBrl        // 3024.58
  const total     = cifBrl + TAXES_BRL       // 6161.21
  const custoKit  = +(total / QTY_KITS).toFixed(4)  // 4.1075

  console.log('─── Recálculo com câmbios separados ───')
  console.log(`FOB:   USD ${FOB_USD.toFixed(2)} × R$ ${DOLAR_FOB} = R$ ${fobBrl.toFixed(2)}`)
  console.log(`Frete: USD ${FRETE_USD.toFixed(2)} × R$ ${DOLAR_FRETE} = R$ ${freteBrl.toFixed(2)}`)
  console.log(`CIF:   R$ ${cifBrl.toFixed(2)}`)
  console.log(`Impostos BR: R$ ${TAXES_BRL}`)
  console.log(`Total: R$ ${total.toFixed(2)}`)
  console.log(`Custo/kit: R$ ${custoKit}`)
  console.log()

  // Busca rateio
  const rateio = await prisma.rateio.findUnique({
    where: { id: RATEIO_ID },
    include: { itens: true },
  })
  if (!rateio) { console.log('❌ Rateio não encontrado'); return }
  console.log(`Rateio: ${rateio.nome}`)
  console.log(`  Câmbio atual (média): R$ ${rateio.cambio}`)

  // Atualiza rateio
  await prisma.rateio.update({
    where: { id: RATEIO_ID },
    data: {
      cambio:              DOLAR_FOB,
      cambio_frete:        DOLAR_FRETE,
      valor_aduaneiro_brl: +cifBrl.toFixed(2),
    },
  })

  // Atualiza item (custo_unit_brl e valor_aduaneiro_unit_brl)
  for (const item of rateio.itens) {
    const cifUnitBrl = +(cifBrl / QTY_KITS).toFixed(4)
    await prisma.rateio_item.update({
      where: { id: item.id },
      data: {
        custo_unit_brl:           custoKit,
        valor_aduaneiro_unit_brl: cifUnitBrl,
      },
    })
  }

  console.log()
  console.log('✓ Rateio atualizado:')
  console.log(`  cambio (FOB):    R$ ${DOLAR_FOB}`)
  console.log(`  cambio_frete:    R$ ${DOLAR_FRETE}`)
  console.log(`  CIF BRL:         R$ ${cifBrl.toFixed(2)}`)
  console.log(`  Custo/kit novo:  R$ ${custoKit}`)
  console.log()
  console.log('⚠ Custo ainda pendente — clique "Aplicar Custos" na UI para ativar em 01/08/2026.')
}

main().catch(console.error).finally(() => prisma.$disconnect())
