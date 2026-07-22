/**
 * Corrige o rateio do Prendedor Anti-Ronco:
 * - Deleta produto ANR-1 criado errado e rateio anterior
 * - Usa SKU INV070 (já cadastrado) — 6.000 unidades = 1.500 kits de 4 peças
 * - Custo/kit = 4 × R$1,0984 = R$4,3934
 * - Vigência: 01/08/2026 (custo antigo vale até 31/07/2026)
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const RATEIO_ERRADO  = 'cmrjmtujc0003vc3wa09kksc7'
const PRODUTO_ERRADO = 'cmrjmtui20001vc3w2knlvyzq'

const CAMBIO    = 3453.53 / 588.00   // 5.8734 R$/USD
const FRETE_USD = 378.00
const UNIT_USD  = 0.14               // 4 peças × USD 0,035
const QTY_KITS  = 1500               // 6.000 peças ÷ 4
const TAXES_BRL = 3136.63
const TOTAL_BRL = 3453.53 + 3136.63  // R$6.590,16

const CUSTO_KIT = +(TOTAL_BRL / QTY_KITS).toFixed(4)  // R$4,3934

async function main() {
  const ws = await prisma.workspace.findFirst({ select: { id: true, nome: true } })
  if (!ws) return

  // 1. Deleta rateio e produto errados
  await prisma.rateio_item.deleteMany({ where: { rateio_id: RATEIO_ERRADO } })
  await prisma.rateio.delete({ where: { id: RATEIO_ERRADO } })
  console.log('✓ Rateio errado deletado')

  await prisma.produto_catalogo.delete({ where: { id: PRODUTO_ERRADO } })
  console.log('✓ Produto ANR-1 deletado\n')

  // 2. Busca INV070
  const produto = await prisma.produto_catalogo.findFirst({
    where: { workspace_id: ws.id, sku_interno: 'INV070' },
    select: { id: true, nome: true, sku_interno: true, custo_brl: true },
  })
  if (!produto) { console.log('❌ Produto INV070 não encontrado'); return }
  console.log(`Produto: [${produto.sku_interno}] ${produto.nome}`)
  console.log(`  Custo atual: R$ ${produto.custo_brl?.toFixed(4)}`)
  console.log(`  Custo novo:  R$ ${CUSTO_KIT} (vigência 01/08/2026)\n`)

  // 3. Busca membro do workspace
  const membro = await prisma.workspace_membro.findFirst({
    where: { workspace_id: ws.id },
    select: { user_id: true },
  })
  const userId = membro?.user_id ?? 'system'

  // 4. Cria rateio correto
  const fobTotalUsd = QTY_KITS * UNIT_USD          // 210
  const fobBrl      = fobTotalUsd * CAMBIO          // 1233.41
  const freteBrl    = FRETE_USD * CAMBIO            // 2220.12
  const cifBrl      = fobBrl + freteBrl             // 3453.53
  const cifUnitBrl  = +(cifBrl / QTY_KITS).toFixed(4)

  const rateio = await prisma.rateio.create({
    data: {
      workspace_id:        ws.id,
      nome:                'Prendedor Anti-Ronco INV070 — Jul/2026 (INV070-11)',
      modo:                'SIMPLIFICADA',
      modal:               'AEREO',
      cambio:              +CAMBIO.toFixed(4),
      frete_usd:           FRETE_USD,
      imposto_simpl_brl:   TAXES_BRL,
      venda_imposto_perc:  6.0,
      venda_taxa_mkt_perc: 16.5,
      venda_taxa_fixa_brl: 5.50,
      ano_ref:             2026,
      mes_ref:             7,
      valor_aduaneiro_brl: +cifBrl.toFixed(2),
      peso_total_kg:       30,
      origem:              'Zhoukou, Henan — China',
      status:              'SALVO',
      custo_vigencia_data: new Date('2026-08-01T00:00:00.000Z'),
      custos_aplicados:    false,
      created_by:          userId,
      itens: {
        create: [{
          produto_id:               produto.id,
          nome:                     produto.nome,
          qty:                      QTY_KITS,
          unit_usd:                 UNIT_USD,
          peso:                     0.02,    // ~20g/kit
          ii:                       60,
          ipi:                      0,
          pis:                      2.1,
          cofins:                   9.65,
          icms:                     17,
          target_price:             0,
          custo_unit_brl:           CUSTO_KIT,
          valor_aduaneiro_unit_brl: cifUnitBrl,
        }],
      },
    },
  })

  console.log(`✓ Rateio criado: ${rateio.id}`)
  console.log(`  ${QTY_KITS} kits × USD ${UNIT_USD}/kit (4 peças × USD 0,035)`)
  console.log(`  FOB: USD ${fobTotalUsd} | Frete: USD ${FRETE_USD} | Câmbio: R$ ${CAMBIO.toFixed(4)}`)
  console.log(`  CIF: R$ ${cifBrl.toFixed(2)} | Impostos BR: R$ ${TAXES_BRL}`)
  console.log(`  Total real: R$ ${TOTAL_BRL}`)
  console.log(`  Custo/kit: R$ ${CUSTO_KIT}`)
  console.log(`  Vigência: 01/08/2026`)
  console.log(`\n⚠ Custo entra em vigor em 01/08/2026 — clique "Aplicar Custos" no dia ou altere manualmente antes se necessário.`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
