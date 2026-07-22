/**
 * rateio-4a-importacao.ts
 *
 * Registra retroativamente o rateio da 4ª Importação (DI 26/0631049-6)
 * na conta principal (workspace minha-operacao).
 *
 * Distribuição proporcional pelo FOB USD → fator 7.4038 R$/USD
 * Total R$ 30.511,35 / USD 4.120,98 FOB = 7,4038
 *
 * Atualiza custo_brl nos produtos reais (não-brindes).
 * ATS-3, ATS-4 não encontrados no catálogo → incluídos no rateio sem produto_id.
 * ATS-5, ATS-5-C (brindes) → rateio_item sem produto_id, sem atualizar catálogo.
 * ATS-6 (brinde) → rateio_item com produto_id mas sem alterar custo_brl.
 */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

const WS_ID      = 'cmpx6dq5k000fvckk6d1aknfq'
const USER_ID    = 'cmpx6dq4u000evckkgh2w6ekr'
const TOTAL_BRL  = 30_511.35
const TOTAL_FOB  = 4_120.98
const FACTOR     = TOTAL_BRL / TOTAL_FOB  // 7.4038

// Produto IDs já cadastrados
const IDS = {
  'DTS-1':    'cmpxag8qn000lvcn8cf9zrud1',
  'ATS-1':    'cmpy1xj0s0003vcxojm8k5lqt',
  'ATS-2':    'cmpxag8qf000jvcn8kcon0ji2',
  'ATS-6':    'cmpxag8pm000dvcn8fbu8mq6t', // brinde nesta importação, produto real
  'INV070':   'cmpxag8p30009vcn8dlq0oopr', // = kit de 4 clipes nasais
  'INV070-5': 'cmpxag8pb000bvcn8cg22enx6',
  'CTS-1':    'cmr2udctr0017jx04dhb2h490', // usar o mais recente
  'BTS-1':    'cmpxag8q5000hvcn8ybbouvrd',
  'BTS-2':    'cmpxag8pu000fvcn8bwerwrfa',
  'INV071-6': 'cmpxag8os0007vcn8myy9gx4v',
}

function alloc(fob_usd: number) {
  return parseFloat((fob_usd * FACTOR).toFixed(2))
}

async function main() {
  console.log(`Fator de rateio: ${FACTOR.toFixed(4)} R$/USD (Total R$${TOTAL_BRL} / USD ${TOTAL_FOB})`)
  console.log()

  // ── 1. Cria o rateio ─────────────────────────────────────────────────────
  const rateio = await p.rateio.create({
    data: {
      workspace_id:       WS_ID,
      created_by:         USER_ID,
      nome:               '4ª Importação — DI 26/0631049-6 (retroativo)',
      modo:               'SIMPLIFICADA',
      cambio:             5.18406,
      frete_usd:          0,
      // overhead total = total pago - FOB em R$ ao câmbio de pagamento
      imposto_simpl_brl:  parseFloat((TOTAL_BRL - TOTAL_FOB * 5.18406).toFixed(2)),
      extras_brl:         0,
      status:             'APROVADO',
      modal:              'MARITIMO',
      origem:             'Guangzhou / Yiwu, China',
      ano_ref:            2026,
      mes_ref:            1,
      valor_aduaneiro_brl: parseFloat((TOTAL_FOB * 4.9587).toFixed(2)), // PTAX da DI
    }
  })
  console.log(`✓ Rateio criado: ${rateio.id}`)
  console.log(`  overhead (imposto_simpl_brl): R$${rateio.imposto_simpl_brl?.toFixed(2)}`)

  // ── 2. Helper para criar rateio_item ─────────────────────────────────────
  async function item(opts: {
    nome: string, produto_id?: string,
    qty: number, unit_usd: number,
    custo_unit_brl: number
  }) {
    const total_fob = opts.qty * opts.unit_usd
    const allocated = alloc(total_fob)
    const r = await p.rateio_item.create({
      data: {
        rateio_id:      rateio.id,
        produto_id:     opts.produto_id,
        nome:           opts.nome,
        qty:            opts.qty,
        unit_usd:       opts.unit_usd,
        custo_unit_brl: opts.custo_unit_brl,
        peso:           0,
        ii:   60, ipi: 0, pis: 2.1, cofins: 9.65, icms: 17,
      }
    })
    console.log(`  + ${opts.nome.padEnd(40)} | qty: ${String(opts.qty).padStart(5)} | unit USD: ${opts.unit_usd.toFixed(4)} | custo BRL: R$${opts.custo_unit_brl.toFixed(4)} | FOB alocado: R$${allocated.toFixed(2)}`)
    return r
  }

  // ── 3. Itens da DI ──────────────────────────────────────────────────────
  console.log('\nCriando rateio_items:')

  // AD001 — DTS-1 (Zhuhai Boning — Dilatador Nasal)
  // 450 kits × USD 1.00 = USD 450 → R$ 3.331,72 → R$ 7,40/kit
  const custo_dts1 = alloc(450) / 450
  await item({ nome: 'DTS-1 — Dilatador Nasal Kit 15un', produto_id: IDS['DTS-1'],
    qty: 450, unit_usd: 1.00, custo_unit_brl: parseFloat(custo_dts1.toFixed(4)) })

  // AD002 — Yiwu Feide Meige (ATS mix + ATS-6 brinde)
  // Total FOB AD002 = 627.60
  const fob_ad002 = 627.60
  const alloc_ad002 = alloc(fob_ad002)

  const ats1_fob = 100 * 2.70  // 270.00
  const ats2_fob = 100 * 2.70  // 270.00
  const ats3_fob = 100 * 0.55  // 55.00
  const ats4_fob =  12 * 2.70  // 32.40
  const ats6_fob =   2 * 0.10  // 0.20 (brinde)

  const custo_ats1 = (ats1_fob / fob_ad002) * alloc_ad002 / 100
  const custo_ats2 = (ats2_fob / fob_ad002) * alloc_ad002 / 100
  const custo_ats3 = (ats3_fob / fob_ad002) * alloc_ad002 / 100
  const custo_ats4 = (ats4_fob / fob_ad002) * alloc_ad002 / 12
  const custo_ats6_brinde = (ats6_fob / fob_ad002) * alloc_ad002 / 2

  await item({ nome: 'ATS-1 — Comedouro Bebedouro Pet 2em1', produto_id: IDS['ATS-1'],
    qty: 100, unit_usd: 2.70, custo_unit_brl: parseFloat(custo_ats1.toFixed(4)) })

  await item({ nome: 'ATS-2 — Comedouro Bebedouro Gravidade', produto_id: IDS['ATS-2'],
    qty: 100, unit_usd: 2.70, custo_unit_brl: parseFloat(custo_ats2.toFixed(4)) })

  await item({ nome: 'ATS-3 — (produto a identificar)', // não encontrado no catálogo
    qty: 100, unit_usd: 0.55, custo_unit_brl: parseFloat(custo_ats3.toFixed(4)) })

  await item({ nome: 'ATS-4 — (produto a identificar)', // não encontrado no catálogo
    qty: 12, unit_usd: 2.70, custo_unit_brl: parseFloat(custo_ats4.toFixed(4)) })

  await item({ nome: 'ATS-6 — Comedouro Elevado Inox (brinde)', produto_id: IDS['ATS-6'],
    qty: 2, unit_usd: 0.10, custo_unit_brl: parseFloat(custo_ats6_brinde.toFixed(4)) })

  // AD003 — ATS-5 (brinde, não no catálogo)
  // 2 × 0.10 = 0.20 USD
  const custo_ats5 = alloc(0.20) / 2
  await item({ nome: 'ATS-5 — (brinde, excluir após)',
    qty: 2, unit_usd: 0.10, custo_unit_brl: parseFloat(custo_ats5.toFixed(4)) })

  // AD004 — ATS-5-C (brinde, não no catálogo)
  // 9 × 0.02 = 0.18 USD
  const custo_ats5c = alloc(0.18) / 9
  await item({ nome: 'ATS-5-C — (brinde, excluir após)',
    qty: 9, unit_usd: 0.02, custo_unit_brl: parseFloat(custo_ats5c.toFixed(4)) })

  // AD005 — Henan Yuenai (clipes nasais — INV070 e INV070-5)
  // DI: 3.500 peças × USD 0.08 = USD 280
  // Kits: INV070 = 1.000 kits × 4pcs; INV070-5 = 400 kits × 5pcs
  const fob_ad005 = 280.00
  const alloc_ad005 = alloc(fob_ad005)
  const custo_peca = alloc_ad005 / 3500  // R$/peça

  const custo_inv070   = custo_peca * 4  // kit 4
  const custo_inv070_5 = custo_peca * 5  // kit 5

  await item({ nome: 'INV070 — Kit 4 Clipes Nasais (kit×4pcs)', produto_id: IDS['INV070'],
    qty: 1000, unit_usd: 4 * 0.08, custo_unit_brl: parseFloat(custo_inv070.toFixed(4)) })

  await item({ nome: 'INV070-5 — Kit 5 Clipes Nasais (kit×5pcs)', produto_id: IDS['INV070-5'],
    qty: 400, unit_usd: 5 * 0.08, custo_unit_brl: parseFloat(custo_inv070_5.toFixed(4)) })

  // AD006 — CTS-1 (Comedouro Elevado)
  // 100 × 5.10 = USD 510
  const custo_cts1 = alloc(510) / 100
  await item({ nome: 'CTS-1 — Comedouro Pet Elevado', produto_id: IDS['CTS-1'],
    qty: 100, unit_usd: 5.10, custo_unit_brl: parseFloat(custo_cts1.toFixed(4)) })

  // AD007 — BTS (Caminhas Elevadas)
  // BTS-1: 102 × 8.00 = 816; BTS-2: 102 × 8.50 = 867; total 1.683
  const fob_ad007 = 1683.00
  const alloc_ad007 = alloc(fob_ad007)

  const bts1_fob = 102 * 8.00   // 816
  const bts2_fob = 102 * 8.50   // 867

  const custo_bts1 = (bts1_fob / fob_ad007) * alloc_ad007 / 102
  const custo_bts2 = (bts2_fob / fob_ad007) * alloc_ad007 / 102

  await item({ nome: 'BTS-1 — Caminha Elevada Médio 90x65cm', produto_id: IDS['BTS-1'],
    qty: 102, unit_usd: 8.00, custo_unit_brl: parseFloat(custo_bts1.toFixed(4)) })

  await item({ nome: 'BTS-2 — Caminha Elevada Grande 110x77cm', produto_id: IDS['BTS-2'],
    qty: 102, unit_usd: 8.50, custo_unit_brl: parseFloat(custo_bts2.toFixed(4)) })

  // AD008 — SSM → INV071-6 (Travas Gaveta Magnéticas)
  // 6.000 peças × 0.095 = USD 570 → 1.000 kits de 6
  const custo_peca_inv071 = alloc(570) / 6000
  const custo_inv071_6 = custo_peca_inv071 * 6

  await item({ nome: 'INV071-6 — Kit 6 Travas Gaveta Magnéticas', produto_id: IDS['INV071-6'],
    qty: 1000, unit_usd: 6 * 0.095, custo_unit_brl: parseFloat(custo_inv071_6.toFixed(4)) })

  // ── 4. Atualiza custo_brl nos produtos (exceto brindes e sem catálogo) ──
  console.log('\nAtualizando custo_brl no catálogo:')

  const updates: Array<{ id: string, sku: string, custo: number }> = [
    { id: IDS['DTS-1'],    sku: 'DTS-1',    custo: parseFloat(custo_dts1.toFixed(2)) },
    { id: IDS['ATS-1'],    sku: 'ATS-1',    custo: parseFloat(custo_ats1.toFixed(2)) },
    { id: IDS['ATS-2'],    sku: 'ATS-2',    custo: parseFloat(custo_ats2.toFixed(2)) },
    { id: IDS['INV070'],   sku: 'INV070',   custo: parseFloat(custo_inv070.toFixed(2)) },
    { id: IDS['INV070-5'], sku: 'INV070-5', custo: parseFloat(custo_inv070_5.toFixed(2)) },
    { id: IDS['CTS-1'],    sku: 'CTS-1',    custo: parseFloat(custo_cts1.toFixed(2)) },
    { id: IDS['BTS-1'],    sku: 'BTS-1',    custo: parseFloat(custo_bts1.toFixed(2)) },
    { id: IDS['BTS-2'],    sku: 'BTS-2',    custo: parseFloat(custo_bts2.toFixed(2)) },
    { id: IDS['INV071-6'], sku: 'INV071-6', custo: parseFloat(custo_inv071_6.toFixed(2)) },
  ]

  for (const u of updates) {
    const old = await p.produto_catalogo.findUnique({ where: { id: u.id }, select: { custo_brl: true } })
    await p.produto_catalogo.update({ where: { id: u.id }, data: { custo_brl: u.custo } })
    console.log(`  ✓ ${u.sku.padEnd(10)} | ${String(old?.custo_brl?.toFixed(2) ?? '—').padStart(8)} → R$${u.custo.toFixed(2)}`)
  }

  // ── 5. Resumo ─────────────────────────────────────────────────────────────
  const total_items = await p.rateio_item.count({ where: { rateio_id: rateio.id } })
  const soma = await p.rateio_item.findMany({ where: { rateio_id: rateio.id }, select: { qty: true, custo_unit_brl: true } })
  const totalBRLCheck = soma.reduce((s, i) => s + (i.custo_unit_brl ?? 0) * i.qty, 0)

  console.log('\n══════════════════════════════════════════════')
  console.log(`✅ Rateio criado: ${rateio.id}`)
  console.log(`   Itens: ${total_items}`)
  console.log(`   Total rateado (qty × custo): R$${totalBRLCheck.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
  console.log(`   Total real pago:              R$${TOTAL_BRL.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
  console.log(`   Diferença:                    R$${(totalBRLCheck - TOTAL_BRL).toFixed(2)}`)
  console.log('\n⚠️  ATS-3 e ATS-4 não encontrados no catálogo — incluídos no rateio sem produto_id.')
  console.log('   Cadastre-os no catálogo e vincule manualmente ao rateio se necessário.')
  console.log('   ATS-5, ATS-5-C: brindes temporários no rateio — excluir quando quiser.')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) }).finally(() => p.$disconnect())
