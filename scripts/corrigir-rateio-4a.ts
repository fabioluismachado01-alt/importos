/**
 * corrigir-rateio-4a.ts
 *
 * Aplica todas as correções pós-criação do rateio da 4ª importação:
 *
 *  1. INV072 + INV073 custo_brl → R$4,07 (eram R$6,55)
 *  2. Rateio ATS-3: delete 1 item, cria 2 (INV073×50 e INV072×50)
 *  3. Rateio ATS-4: atualiza produto_id → ATS-2 (é reposição do mesmo produto)
 *  4. Catálogo ATS-6: corrige sku_interno → 'CTS-1', custo → R$37,76
 *  5. CTS-1 duplicata (64.01) → exclui
 *  6. Exibe tabela ANTES × DEPOIS completa
 *
 * Fator rateio: R$30.511,35 / USD 4.120,98 = 7,40382 R$/USD
 */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

const WS          = 'cmpx6dq5k000fvckk6d1aknfq'
const RATEIO_ID   = 'cmrbzotwi0001vc5s9we68fr6'
const TOTAL_BRL   = 30_511.35
const TOTAL_FOB   = 4_120.98
const FACTOR      = TOTAL_BRL / TOTAL_FOB   // 7.40382...

const ID = {
  'DTS-1':    'cmpxag8qn000lvcn8cf9zrud1',
  'ATS-1':    'cmpy1xj0s0003vcxojm8k5lqt',
  'ATS-2':    'cmpxag8qf000jvcn8kcon0ji2',
  'ATS-6':    'cmpxag8pm000dvcn8fbu8mq6t',   // ← sku errado, deve ser CTS-1
  'CTS-1-A':  'cmr2udctr0017jx04dhb2h490',   // ← keeper (atualizado pelo rateio)
  'CTS-1-B':  'cmr2ucteo000pjx042wagwtq3',   // ← duplicata para excluir
  'BTS-1':    'cmpxag8q5000hvcn8ybbouvrd',
  'BTS-2':    'cmpxag8pu000fvcn8bwerwrfa',
  'INV070':   'cmpxag8p30009vcn8dlq0oopr',
  'INV070-5': 'cmpxag8pb000bvcn8cg22enx6',
  'INV071-6': 'cmpxag8os0007vcn8myy9gx4v',
  'INV072':   'cmpxag8oj0005vcn8gyg7zj12',
  'INV073':   'cmpxag8o90003vcn8ji8zm9rs',
}

// Rateio item IDs (da saída anterior)
const RITEM = {
  'ATS-3': 'cmrbzotxv000mvc5sq8v2l38v', // será substituído
  'ATS-4': 'cmrbzotxx000ovc5sqjg9bbyj', // produto_id → ATS-2
}

function f(v: number) { return parseFloat((v * FACTOR).toFixed(2)) }

async function main() {
  console.log(`Fator: ${FACTOR.toFixed(6)} R$/USD  (R$${TOTAL_BRL} ÷ USD ${TOTAL_FOB})`)
  console.log()

  // ════════════════════════════════════════════════════════
  // SNAPSHOT ANTES
  // ════════════════════════════════════════════════════════
  const skusBefore = ['DTS-1','ATS-1','ATS-2','ATS-6','CTS-1','BTS-1','BTS-2','INV070','INV070-5','INV071-6','INV072','INV073']
  const before = await p.produto_catalogo.findMany({
    where: { workspace_id: WS, sku_interno: { in: skusBefore } },
    select: { id: true, sku_interno: true, nome: true, custo_brl: true },
    orderBy: { sku_interno: 'asc' }
  })
  console.log('╔══════════════════════════════════════════════════════════════════════╗')
  console.log('║                      ESTADO ATUAL (antes)                           ║')
  console.log('╠═════════════╤══════════╤═══════════════════════════════════════════╣')
  before.forEach(r => {
    const sku = (r.sku_interno??'?').padEnd(11)
    const custo = `R$${r.custo_brl?.toFixed(2)??'—'}`.padStart(9)
    const nome = r.nome.slice(0,40).padEnd(40)
    const dup = (r.id === ID['CTS-1-B']) ? ' ← DUPLICATA' : (r.id === ID['ATS-6']) ? ' ← SKU ERRADO' : ''
    console.log(`║ ${sku} │ ${custo} │ ${nome}${dup}`)
  })
  console.log('╚══════════════════════════════════════════════════════════════════════╝')
  console.log()

  // ════════════════════════════════════════════════════════
  // CORREÇÃO 1: INV072 + INV073 custo_brl
  // ATS-3 do DI: 100 peças × USD 0.55 → custo/pç = 0.55 × FACTOR = R$4,07
  // Split: 50 INV072 + 50 INV073
  // ════════════════════════════════════════════════════════
  const custo_inv072_73 = parseFloat((0.55 * FACTOR).toFixed(2))
  console.log(`[1/5] Atualizando INV072 e INV073 → custo R$${custo_inv072_73} (era R$6,55)`)
  await p.produto_catalogo.update({ where: { id: ID['INV072'] }, data: { custo_brl: custo_inv072_73 } })
  await p.produto_catalogo.update({ where: { id: ID['INV073'] }, data: { custo_brl: custo_inv072_73 } })
  console.log('    ✓ INV072 e INV073 atualizados')

  // ════════════════════════════════════════════════════════
  // CORREÇÃO 2: Rateio ATS-3 → deletar e criar 2 itens
  // ════════════════════════════════════════════════════════
  console.log('[2/5] Substituindo rateio_item ATS-3 → INV073 (50un) + INV072 (50un)')
  // Busca o item pelo nome pois o ID pode diferir
  const ats3Item = await p.rateio_item.findFirst({
    where: { rateio_id: RATEIO_ID, nome: { contains: 'ATS-3' } }
  })
  if (!ats3Item) throw new Error('rateio_item ATS-3 não encontrado')
  await p.rateio_item.delete({ where: { id: ats3Item.id } })
  console.log(`    ✓ Item ATS-3 deletado (id: ${ats3Item.id})`)

  await p.rateio_item.create({
    data: {
      rateio_id:      RATEIO_ID,
      produto_id:     ID['INV073'],
      nome:           'INV073 — Pá Higiênica Inox Areia Gato (AD002-ATS3, 50un)',
      qty:            50,
      unit_usd:       0.55,
      custo_unit_brl: parseFloat((0.55 * FACTOR).toFixed(4)),
      peso:           0, ii: 60, ipi: 0, pis: 2.1, cofins: 9.65, icms: 17,
    }
  })
  await p.rateio_item.create({
    data: {
      rateio_id:      RATEIO_ID,
      produto_id:     ID['INV072'],
      nome:           'INV072 — Pá Higiênica Aço Inox Malha (AD002-ATS3, 50un)',
      qty:            50,
      unit_usd:       0.55,
      custo_unit_brl: parseFloat((0.55 * FACTOR).toFixed(4)),
      peso:           0, ii: 60, ipi: 0, pis: 2.1, cofins: 9.65, icms: 17,
    }
  })
  console.log(`    ✓ INV073 (50un) e INV072 (50un) criados`)

  // ════════════════════════════════════════════════════════
  // CORREÇÃO 3: Rateio ATS-4 → produto_id = ATS-2
  // ════════════════════════════════════════════════════════
  console.log('[3/5] Vinculando rateio ATS-4 → ATS-2 (mesma produto, reposição)')
  const ats4Item = await p.rateio_item.findFirst({
    where: { rateio_id: RATEIO_ID, nome: { contains: 'ATS-4' } }
  })
  if (!ats4Item) throw new Error('rateio_item ATS-4 não encontrado')
  await p.rateio_item.update({
    where: { id: ats4Item.id },
    data: {
      produto_id: ID['ATS-2'],
      nome: 'ATS-4 (=ATS-2) — Reposição Comedouro Bebedouro Gravidade (12un)',
    }
  })
  console.log(`    ✓ ATS-4 item vinculado a ATS-2 (id: ${ats4Item.id})`)

  // ════════════════════════════════════════════════════════
  // CORREÇÃO 4: ATS-6 catálogo → sku_interno = CTS-1 + custo = 37.76
  // ATENÇÃO: o ML análise possui SKU 'ATS-6' em receitas (R$670).
  // Ao mudar o sku_interno o match por string vai apontar para CTS-1.
  // O usuário deve atualizar o seller_sku no anúncio ML para 'CTS-1' também.
  // ════════════════════════════════════════════════════════
  const custo_cts1 = parseFloat((5.10 * FACTOR).toFixed(2))  // R$37.76
  console.log(`[4/5] Corrigindo ATS-6 no catálogo → sku_interno='CTS-1', custo R$${custo_cts1}`)
  await p.produto_catalogo.update({
    where: { id: ID['ATS-6'] },
    data: { sku_interno: 'CTS-1', custo_brl: custo_cts1 }
  })
  console.log('    ✓ ATS-6 → CTS-1 corrigido')
  console.log('    ⚠️  ATENÇÃO: o anúncio ML com seller_sku "ATS-6" perderá o vínculo.')
  console.log('    ⚠️  Atualize o seller_sku para "CTS-1" na listagem do Mercado Livre.')

  // ════════════════════════════════════════════════════════
  // CORREÇÃO 5: CTS-1 duplicata → excluir a antiga (R$64,01)
  // ════════════════════════════════════════════════════════
  console.log('[5/5] Excluindo CTS-1 duplicata (R$64,01)')
  // Verifica vínculos antes de deletar
  const links = await p.rateio_item.count({ where: { produto_id: ID['CTS-1-B'] } })
  const simLinks = await p.simulacao_item.count({ where: { produto_id: ID['CTS-1-B'] } })
  if (links > 0 || simLinks > 0) {
    console.log(`    ⚠️  Duplicata tem ${links} rateio_items e ${simLinks} simulacao_items. Mantendo.`)
  } else {
    await p.produto_catalogo.delete({ where: { id: ID['CTS-1-B'] } })
    console.log(`    ✓ CTS-1 duplicata (R$64,01) excluída`)
  }

  // ════════════════════════════════════════════════════════
  // SNAPSHOT DEPOIS + VERIFICAÇÃO
  // ════════════════════════════════════════════════════════
  console.log()
  const after = await p.produto_catalogo.findMany({
    where: { workspace_id: WS, sku_interno: { in: skusBefore } },
    select: { id: true, sku_interno: true, nome: true, custo_brl: true },
    orderBy: { sku_interno: 'asc' }
  })

  // Mapa antes para comparação
  const bMap: Record<string, number> = {}
  before.forEach(r => {
    // Só registra a primeira ocorrência (para evitar duplicata CTS-1 complicar)
    if (!bMap[r.id]) bMap[r.id] = r.custo_brl ?? 0
  })
  // Custo antes por sku
  const bSku: Record<string, number[]> = {}
  before.forEach(r => {
    const k = r.sku_interno ?? '?'
    bSku[k] = bSku[k] ?? []
    bSku[k].push(r.custo_brl ?? 0)
  })

  console.log('╔══════════════════════════════════════════════════════════════════════════════╗')
  console.log('║                 ANTES × DEPOIS — Custos de importação                       ║')
  console.log('╠══════════════╤═══════════════╤═══════════════╤══════════════════════════════╣')
  console.log('║ SKU          │    ANTES      │    DEPOIS     │ Adição DI                    ║')
  console.log('╠══════════════╪═══════════════╪═══════════════╪══════════════════════════════╣')

  const tabela = [
    { sku: 'DTS-1',    antes: 11.30,  depois: 7.40 * 1,    adição: 'AD001 – Zhuhai Boning 450un' },
    { sku: 'ATS-1',    antes: 34.56,  depois: 0.55 * FACTOR, note: '(19.99)', adição: 'AD002 – Yiwu Feide 100un' },
    { sku: 'ATS-2',    antes: 34.56,  depois: 0.55 * FACTOR, note: '(19.99)', adição: 'AD002 – Yiwu Feide 100+12un' },
    { sku: 'CTS-1',    antes: 64.01,  depois: 5.10 * FACTOR,                  adição: 'AD006 – CTS-1 100un' },
    { sku: 'BTS-1',    antes: 104.05, depois: (816/1683 * f(1683)) / 102,     adição: 'AD007 – BTS 102un' },
    { sku: 'BTS-2',    antes: 111.15, depois: (867/1683 * f(1683)) / 102,     adição: 'AD007 – BTS 102un' },
    { sku: 'INV070',   antes: 3.23,   depois: 0.08 * FACTOR * 4,              adição: 'AD005 – kit×4 1000un' },
    { sku: 'INV070-5', antes: 4.04,   depois: 0.08 * FACTOR * 5,              adição: 'AD005 – kit×5 400un' },
    { sku: 'INV071-6', antes: 6.12,   depois: 0.095 * FACTOR * 6,             adição: 'AD008 – SSM kit×6 1000un' },
    { sku: 'INV072',   antes: 6.55,   depois: 0.55 * FACTOR,                  adição: 'AD002 – ATS-3→INV072 50un' },
    { sku: 'INV073',   antes: 6.55,   depois: 0.55 * FACTOR,                  adição: 'AD002 – ATS-3→INV073 50un' },
  ]

  for (const row of tabela) {
    const sku    = row.sku.padEnd(12)
    const antes  = `R$${row.antes.toFixed(2)}`.padStart(13)
    const depois = `R$${row.depois.toFixed(2)}`.padStart(13)
    const diff   = row.depois < row.antes ? '↓' : '↑'
    const adição = (row.adição ?? '').padEnd(29)
    console.log(`║ ${sku} │ ${antes} │ ${diff} ${depois} │ ${adição}║`)
  }
  console.log('╠══════════════╧═══════════════╧═══════════════╧══════════════════════════════╣')
  console.log('║  ↓ = custo real de importação menor que estimativa anterior                  ║')
  console.log('║  ATS-1, ATS-2: custo calculado com FACTOR × unit_usd AD002                  ║')
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝')

  // ── Verificação do rateio: soma dos itens vs total pago ──────────────────
  console.log('\n── Verificação do rateio ──────────────────────────────────────────────')
  const items = await p.rateio_item.findMany({
    where: { rateio_id: RATEIO_ID },
    select: { nome: true, qty: true, unit_usd: true, custo_unit_brl: true }
  })
  console.log(`Total itens no rateio: ${items.length}`)

  let totalFOB   = 0
  let totalAloc  = 0
  for (const it of items) {
    const fob  = it.qty * it.unit_usd
    const aloc = (it.custo_unit_brl ?? 0) * it.qty
    totalFOB  += fob
    totalAloc += aloc
    console.log(
      ' ', (it.nome??'?').padEnd(50),
      `| qty: ${String(it.qty).padStart(5)}`,
      `| FOB: USD${fob.toFixed(2).padStart(8)}`,
      `| custo/un: R$${(it.custo_unit_brl??0).toFixed(4)}`,
    )
  }

  console.log(`\nTotal FOB no rateio:         USD ${totalFOB.toFixed(2)} (DI: USD ${TOTAL_FOB})`)
  console.log(`Total BRL alocado (qty×custo): R$${totalAloc.toFixed(2)}`)
  console.log(`Total real pago:               R$${TOTAL_BRL.toFixed(2)}`)
  console.log(`Diferença (rounding + qty):    R$${(totalAloc - TOTAL_BRL).toFixed(2)}`)

  // ── Aviso sobre ATS-6 e ML ────────────────────────────────────────────────
  console.log('\n══ AVISOS IMPORTANTES ═════════════════════════════════════════════════')
  console.log('1. ATS-6 → CTS-1: O anúncio no Mercado Livre ainda usa seller_sku "ATS-6".')
  console.log('   Vá em Catálogo → Editar anúncio → Atualizar SKU para "CTS-1".')
  console.log('   Enquanto não atualizar, o relatório ML "ATS-6" não vai linkar ao catálogo CTS-1.')
  console.log('2. INV070 (kit×4): DI tem 3.500 peças. 1.000 kits×4 + 400 kits×5 = 6.000 peças.')
  console.log('   Verifique se havia estoque de peças anterior ou se o DI registrou em kits.')
  console.log('3. ATS-5 e ATS-5-C (brindes) estão no rateio mas sem produto no catálogo.')
  console.log('   Exclua quando quiser: rateio → excluir itens ATS-5 e ATS-5-C.')
}

main().catch(e => { console.error('❌', e.message, e.stack?.split('\n')[1]); process.exit(1) })
      .finally(() => p.$disconnect())
