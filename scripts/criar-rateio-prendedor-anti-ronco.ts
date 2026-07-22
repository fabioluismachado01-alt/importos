/**
 * Cria o produto e rateio da Importação Simplificada — Prendedor Anti-Ronco
 *
 * Invoice INV070-11 — Henan Like Health Industry Co., Ltd. (via Abby Zhu)
 *   Produto: Anti-Snoring Nose Clip
 *   Qty: 6.000 un | FOB: USD 0,035/un | FOB total: USD 210,00
 *   Frete FedEx: USD 378,00 | Total declarado: USD 588,00
 *
 * Pagamentos:
 *   China (DAP — produto + frete): R$ 3.453,53
 *   Brasil (FedEx ROD 2429781 — impostos + taxas): R$ 3.136,63
 *   TOTAL: R$ 6.590,16
 *   Câmbio efetivo: R$3.453,53 / USD 588,00 = R$ 5,8733/USD
 *   Custo unitário: R$6.590,16 / 6.000 = R$ 1,0984/un
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const CAMBIO   = 3453.53 / 588.00   // 5.8733 R$/USD
const FRETE_USD = 378.00
const UNIT_USD  = 0.035             // USD 210 / 6000 un
const QTY       = 6000
const TAXES_BRL = 3136.63           // FedEx ROD — impostos + taxas BR
const TOTAL_BRL = 3453.53 + 3136.63 // 6590.16

const CUSTO_UNIT = +(TOTAL_BRL / QTY).toFixed(4) // 1.0984

async function main() {
  const ws = await prisma.workspace.findFirst({ select: { id: true, nome: true } })
  if (!ws) { console.log('Nenhum workspace'); return }
  console.log(`Workspace: ${ws.nome}`)
  console.log(`Câmbio: R$ ${CAMBIO.toFixed(4)}/USD`)
  console.log(`Custo unitário: R$ ${CUSTO_UNIT}/un\n`)

  // 1. Busca ou cria produto
  let produto = await prisma.produto_catalogo.findFirst({
    where: { workspace_id: ws.id, sku_interno: { in: ['ANR-1', 'PRENDEDOR-ANTI-RONCO'] } },
  })

  if (!produto) {
    // Tenta por nome
    produto = await prisma.produto_catalogo.findFirst({
      where: { workspace_id: ws.id, nome: { contains: 'Ronco', mode: 'insensitive' } },
    })
  }

  if (produto && produto.sku_interno === 'ANR-1') {
    console.log(`Produto já existe: [${produto.sku_interno}] ${produto.nome} (id: ${produto.id})`)
    console.log(`  Custo atual: R$ ${produto.custo_brl?.toFixed(4)} → NÃO alterado ainda (use "Aplicar Custos" na UI)`)
  } else {
    // Produto não encontrado ou é outro produto (DTS-1) — cria novo com SKU correto
    produto = await prisma.produto_catalogo.create({
      data: {
        workspace_id: ws.id,
        sku_interno:  'ANR-1',
        nome:         'Prendedor Nasal Anti-Ronco',
        custo_brl:    CUSTO_UNIT,
      },
    })
    console.log(`✓ Produto criado: [ANR-1] Prendedor Nasal Anti-Ronco (id: ${produto.id})`)
    console.log(`  Custo: R$ ${CUSTO_UNIT}`)
  }

  // 2. Busca um membro do workspace para usar como created_by
  const membro = await prisma.workspace_membro.findFirst({
    where: { workspace_id: ws.id },
    select: { user_id: true },
  })
  const userId = membro?.user_id ?? 'system'

  // 3. Cria rateio
  // FOB total: 6000 × 0.035 = 210 USD
  // CIF BRL = (210 + 378) × 5.8733 = 588 × 5.8733 = 3453.50 ≈ 3453.53
  const fobTotalUsd = QTY * UNIT_USD           // 210
  const fobBrl      = fobTotalUsd * CAMBIO     // 1233.39
  const freteBrl    = FRETE_USD * CAMBIO       // 2220.13
  const cifBrl      = fobBrl + freteBrl        // 3453.52 ≈ 3453.53
  const cifUnitBrl  = +(cifBrl / QTY).toFixed(4) // 0.5756
  const valorAduaneiroBrl = cifBrl             // base CIF para PIS/COFINS

  const rateio = await prisma.rateio.create({
    data: {
      workspace_id:        ws.id,
      nome:                'Prendedor Anti-Ronco — Jul/2026 (INV070-11)',
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
      valor_aduaneiro_brl: +valorAduaneiroBrl.toFixed(2),
      peso_total_kg:       30,  // gross weight FedEx
      origem:              'Zhoukou, Henan — China',
      status:              'SALVO',
      // Vigência: deixa pendente — usuário aplica quando quiser pelo botão na UI
      custos_aplicados:    false,
      created_by:          userId,
      itens: {
        create: [{
          produto_id:              produto.id,
          nome:                    'Prendedor Nasal Anti-Ronco',
          qty:                     QTY,
          unit_usd:                UNIT_USD,
          peso:                    0.005,   // ~5g/un (30kg / 6000un)
          ii:                      60,
          ipi:                     0,
          pis:                     2.1,
          cofins:                  9.65,
          icms:                    17,
          target_price:            0,
          custo_unit_brl:          CUSTO_UNIT,
          valor_aduaneiro_unit_brl: cifUnitBrl,
        }],
      },
    },
  })

  console.log(`\n✓ Rateio criado: ${rateio.id}`)
  console.log(`  Nome: ${rateio.nome}`)
  console.log(`  FOB: USD ${fobTotalUsd.toFixed(2)} | Frete: USD ${FRETE_USD}`)
  console.log(`  CIF: R$ ${cifBrl.toFixed(2)} | Impostos BR: R$ ${TAXES_BRL.toFixed(2)}`)
  console.log(`  Total real: R$ ${TOTAL_BRL.toFixed(2)}`)
  console.log(`  Custo/un: R$ ${CUSTO_UNIT}`)
  console.log(`\n⚠ Custos NÃO aplicados ao catálogo ainda.`)
  console.log(`  Acesse Ferramentas → Rateio → "Aplicar Custos" quando quiser ativar o novo custo.`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
