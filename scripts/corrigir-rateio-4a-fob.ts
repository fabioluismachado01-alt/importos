/**
 * Corrige o rateio da 4ª importação incluindo o custo FOB pago na China.
 *
 * Custo total real:
 *   FOB pago China:      R$ 21.945,33
 *   Nacionalização BR:   R$ 30.431,19
 *   Saldo PIX:           R$     80,16
 *   TOTAL:               R$ 52.456,68
 *
 * FOB USD total DI (26/0631049-6): USD 4.120,98
 *
 * Fator antigo: 30.511,35 / 4.120,98 = 7,4039 R$/USD  (só nacionalização — ERRADO)
 * Fator novo:   52.456,68 / 4.120,98 = 12,7292 R$/USD (FOB + nacionalização — CORRETO)
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const RATEIO_ID = 'cmrbzotwi0001vc5s9we68fr6'
const TOTAL_BRL = 52456.68
const TOTAL_FOB_USD = 4120.98
const FATOR = TOTAL_BRL / TOTAL_FOB_USD // 12.7292...

async function main() {
  console.log(`\n=== CORREÇÃO RATEIO 4ª IMPORTAÇÃO ===`)
  console.log(`Fator antigo: 7,4039 R$/USD`)
  console.log(`Fator novo:   ${FATOR.toFixed(4)} R$/USD`)
  console.log(`Total correto: R$ ${TOTAL_BRL.toFixed(2)}\n`)

  // Busca todos os itens do rateio
  const itens = await prisma.rateio_item.findMany({
    where: { rateio_id: RATEIO_ID },
    include: { produto: { select: { id: true, nome: true, sku_interno: true } } },
    orderBy: { nome: 'asc' },
  })

  console.log(`Itens encontrados: ${itens.length}\n`)

  // Calcula novos custos
  const updates: { id: string; nome: string; sku: string | null; qty: number; unit_usd: number; custo_antigo: number | null; custo_novo: number; produto_id: string | null }[] = []

  for (const item of itens) {
    const custo_novo = item.unit_usd * FATOR
    updates.push({
      id: item.id,
      nome: item.nome,
      sku: item.produto?.sku_interno ?? null,
      qty: item.qty,
      unit_usd: item.unit_usd,
      custo_antigo: item.custo_unit_brl,
      custo_novo,
      produto_id: item.produto_id ?? null,
    })
  }

  // Exibe tabela comparativa ANTES de alterar
  console.log('ANTES → DEPOIS (custo unitário R$):')
  console.log('─'.repeat(90))
  console.log(`${'SKU'.padEnd(12)} ${'Nome'.padEnd(30)} ${'Qtd'.padStart(6)} ${'USD/un'.padStart(8)} ${'Antes R$'.padStart(10)} ${'Depois R$'.padStart(10)} ${'Δ%'.padStart(7)}`)
  console.log('─'.repeat(90))

  for (const u of updates) {
    const antes = u.custo_antigo?.toFixed(2) ?? '—'
    const depois = u.custo_novo.toFixed(2)
    const delta = u.custo_antigo ? ((u.custo_novo / u.custo_antigo - 1) * 100).toFixed(1) + '%' : '—'
    console.log(
      `${(u.sku ?? '—').padEnd(12)} ${u.nome.slice(0, 30).padEnd(30)} ${String(u.qty).padStart(6)} ${u.unit_usd.toFixed(4).padStart(8)} ${String(antes).padStart(10)} ${String(depois).padStart(10)} ${delta.padStart(7)}`
    )
  }
  console.log('─'.repeat(90))

  const totalAntes = updates.reduce((s, u) => s + (u.custo_antigo ?? 0) * u.qty, 0)
  const totalDepois = updates.reduce((s, u) => s + u.custo_novo * u.qty, 0)
  console.log(`\nTotal rateio ANTES:  R$ ${totalAntes.toFixed(2)}`)
  console.log(`Total rateio DEPOIS: R$ ${totalDepois.toFixed(2)}`)
  console.log(`Total real pago:     R$ ${TOTAL_BRL.toFixed(2)}`)
  console.log(`Diferença (arred.):  R$ ${(totalDepois - TOTAL_BRL).toFixed(2)}`)

  // Executa as atualizações
  console.log('\nAtualizando rateio_items...')
  for (const u of updates) {
    await prisma.rateio_item.update({
      where: { id: u.id },
      data: { custo_unit_brl: u.custo_novo },
    })
  }

  // Atualiza custo_brl em produto_catalogo para cada produto vinculado
  console.log('Atualizando produto_catalogo.custo_brl...')
  const produtosAtualizados: string[] = []
  for (const u of updates) {
    if (!u.produto_id || produtosAtualizados.includes(u.produto_id)) continue
    // Se o mesmo produto tem mais de um item (ex: ATS-2 e ATS-4 são o mesmo), usa o custo do item com maior qty
    // Como todos têm o mesmo unit_usd para o mesmo produto, o custo é igual
    await prisma.produto_catalogo.update({
      where: { id: u.produto_id },
      data: { custo_brl: u.custo_novo },
    })
    produtosAtualizados.push(u.produto_id)
    console.log(`  → ${u.sku ?? u.nome}: R$ ${u.custo_novo.toFixed(2)}`)
  }

  // Atualiza total do rateio
  await prisma.rateio.update({
    where: { id: RATEIO_ID },
    data: { cambio: FATOR },
  })

  console.log(`\n✓ ${updates.length} itens atualizados`)
  console.log(`✓ ${produtosAtualizados.length} produtos atualizados no catálogo`)
  console.log('✓ Concluído!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
