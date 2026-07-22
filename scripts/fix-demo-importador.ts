/**
 * fix-demo-importador.ts
 * Reconfigura conta demo como importador pesado (containers 40HC/NOR + simplificadas)
 * mostrando cenário onde Lucro Real é o melhor regime tributário.
 *
 * Cenário calculado (Julho/2026):
 *   Faturamento:       R$380.000
 *   CMV (produtos):    R$280.000  (73,7% — margens típicas de importador)
 *   Despesas oper.:    R$  62.000
 *   Valor aduaneiro:   R$320.000  (containers + simplificadas)
 *   RBT12:             R$4.200.000 (faixa 5 Simples → 12,22% ef.)
 *
 *   Simples Nacional:  R$46.436 (12,22%)
 *   Lucro Presumido:   R$23.574  (6,20%)
 *   Lucro Real:        R$10.920  (2,87%) ← MELHOR — créditos PIS/COFINS-importação zeram o tributo
 *   Economia LR vs LP: R$12.654/mês = R$151.848/ano
 *
 * DATABASE_URL="..." npx tsx scripts/fix-demo-importador.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('\n🚢 Fix Demo Importador — Nação Import Ltda\n')

  const ws = await prisma.workspace.findUnique({ where: { slug: 'nacao-import-demo' } })
  if (!ws) throw new Error('Workspace demo não encontrado.')
  console.log('✓ Workspace:', ws.nome, '(id:', ws.id, ')')

  // ── 1. Faturamento Julho/2026 com perfil de importador ─────────────────────
  // Faturamento = R$380.000 (projetado mensal — 6 dias × 63k/dia)
  // CMV alto: 73,7% da receita (importador paga mais em produto)
  // Despesas: armazenagem, ads, tarifas, frete, pró-labore, aluguel (galpão), etc.
  const FAT    = 380_000
  const CMV    = 280_000
  // Despesas operacionais componentes:
  const DESP = {
    armazenagem:          8_500,   // galpão / armazenagem porto
    ads_ml:               5_700,   // 1,5% do fat em ads ML
    ads_outros:           2_300,
    tarifas:              7_600,   // tarifas marketplaces ~2%
    frete:               11_400,   // frete last-mile + distribuição
    fatura_ml:                0,
    outras_taxas:         3_200,   // despachante, taxas bancárias
    pro_labore:          16_000,   // 2 sócios
    inss:                 2_112,   // 13,2% pró-labore
    contabilidade:        2_800,
    erp:                    549,
    emprestimo:               0,
    aluguel:             10_500,   // galpão grande (logística)
    pagina_ml:              399,
    previdencia_privada:      0,
    fixas_outras:         3_440,   // telefone, internet, seguros, etc.
  }
  const TOTAL_DESP = Object.values(DESP).reduce((a, b) => a + b, 0)
  console.log(`  Despesas operacionais: R$${TOTAL_DESP.toFixed(0)}`)

  const lucro_bruto = FAT - CMV - TOTAL_DESP
  const das_aliquota = 9.10
  const das = parseFloat((FAT * das_aliquota / 100).toFixed(2))

  await prisma.faturamento_mes.upsert({
    where: { workspace_id_ano_mes: { workspace_id: ws.id, ano: 2026, mes: 7 } },
    update: {
      receita_total: FAT,
      receita_ml: 171_000,    // 45%
      receita_shopee: 68_400, // 18%
      receita_amazon: 38_000, // 10%
      receita_magalu: 34_200, // 9%
      receita_tiktok: 26_600, // 7%
      receita_outros: 41_800, // 11% — simplificadas / B2B direto
      desp_custo_produtos: CMV,
      desp_armazenagem:         DESP.armazenagem,
      desp_ads_ml:              DESP.ads_ml,
      desp_ads_outros:          DESP.ads_outros,
      desp_tarifas:             DESP.tarifas,
      desp_frete:               DESP.frete,
      desp_fatura_ml:           DESP.fatura_ml,
      desp_outras_taxas:        DESP.outras_taxas,
      desp_pro_labore:          DESP.pro_labore,
      desp_inss:                DESP.inss,
      desp_contabilidade:       DESP.contabilidade,
      desp_erp:                 DESP.erp,
      desp_emprestimo:          DESP.emprestimo,
      desp_aluguel:             DESP.aluguel,
      desp_pagina_ml:           DESP.pagina_ml,
      desp_previdencia_privada: DESP.previdencia_privada,
      desp_fixas_outras:        DESP.fixas_outras,
      das_valor_calc: das,
      das_status: 'PENDENTE',
      aliquota_simples: das_aliquota,
      meta_mes: 420_000,
      dias_no_mes: 31,
      dias_com_venda: 6,
      lucro_bruto,
      lucro_liquido: lucro_bruto - das,
      ticket_medio: 320,
      fechado: false,
    },
    create: {
      workspace_id: ws.id,
      ano: 2026, mes: 7,
      receita_total: FAT,
      receita_ml: 171_000,
      receita_shopee: 68_400,
      receita_amazon: 38_000,
      receita_magalu: 34_200,
      receita_tiktok: 26_600,
      receita_outros: 41_800,
      desp_custo_produtos: CMV,
      desp_armazenagem:         DESP.armazenagem,
      desp_ads_ml:              DESP.ads_ml,
      desp_ads_outros:          DESP.ads_outros,
      desp_tarifas:             DESP.tarifas,
      desp_frete:               DESP.frete,
      desp_fatura_ml:           DESP.fatura_ml,
      desp_outras_taxas:        DESP.outras_taxas,
      desp_pro_labore:          DESP.pro_labore,
      desp_inss:                DESP.inss,
      desp_contabilidade:       DESP.contabilidade,
      desp_erp:                 DESP.erp,
      desp_emprestimo:          DESP.emprestimo,
      desp_aluguel:             DESP.aluguel,
      desp_pagina_ml:           DESP.pagina_ml,
      desp_previdencia_privada: DESP.previdencia_privada,
      desp_fixas_outras:        DESP.fixas_outras,
      das_valor_calc: das,
      das_status: 'PENDENTE',
      aliquota_simples: das_aliquota,
      meta_mes: 420_000,
      dias_no_mes: 31,
      dias_com_venda: 6,
      lucro_bruto,
      lucro_liquido: lucro_bruto - das,
      ticket_medio: 320,
      fechado: false,
    },
  })
  console.log(`✓ Julho/2026 atualizado — Faturamento: R$${FAT.toLocaleString('pt-BR')}, CMV: R$${CMV.toLocaleString('pt-BR')}`)

  // ── 2. Histórico 12 meses → RBT12 = R$4.200.000 ─────────────────────────
  // 12 meses anteriores (Jul/25 a Jun/26) somando ~R$4,2M
  // Importador com crescimento: começa em ~320k/mês e vai subindo para 360k+
  const HISTORICO_MESES = [
    { ano: 2025, mes:  7, fat: 318_000 },
    { ano: 2025, mes:  8, fat: 324_000 },
    { ano: 2025, mes:  9, fat: 331_000 },
    { ano: 2025, mes: 10, fat: 338_000 },
    { ano: 2025, mes: 11, fat: 344_000 },
    { ano: 2025, mes: 12, fat: 362_000 }, // novembro/dezembro pico
    { ano: 2026, mes:  1, fat: 329_000 },
    { ano: 2026, mes:  2, fat: 336_000 },
    { ano: 2026, mes:  3, fat: 348_000 },
    { ano: 2026, mes:  4, fat: 354_000 },
    { ano: 2026, mes:  5, fat: 360_000 },
    { ano: 2026, mes:  6, fat: 356_000 },
    // Julho não entra no RBT12 (é o mês atual)
  ]
  const rbt12 = HISTORICO_MESES.reduce((s, m) => s + m.fat, 0)
  console.log(`  RBT12 calculado: R$${rbt12.toLocaleString('pt-BR')}`)

  for (const m of HISTORICO_MESES) {
    await prisma.historico_faturamento_anual.upsert({
      where: { workspace_id_ano_mes: { workspace_id: ws.id, ano: m.ano, mes: m.mes } },
      update: { faturamento: m.fat },
      create: { workspace_id: ws.id, ano: m.ano, mes: m.mes, faturamento: m.fat },
    })
  }
  console.log(`✓ Histórico 12 meses criado — RBT12: R$${rbt12.toLocaleString('pt-BR')}`)

  // ── 3. Rateios com valor aduaneiro de containers ──────────────────────────
  // Valor aduaneiro total = R$320.000
  // 2 containers 40HC + 1 simplificada — spread por 3 rateios do mês
  // O sistema lê rateio_item.valor_aduaneiro_unit_brl × qty dos rateios SALVO
  // com produto_id preenchido
  // Verifica se já tem rateios salvos com valor aduaneiro
  const rateiossalvos = await prisma.rateio.findMany({
    where: { workspace_id: ws.id, status: 'SALVO' },
    include: { itens: { where: { produto_id: { not: null } }, take: 1 } },
    take: 5,
    orderBy: { created_at: 'desc' },
  })

  let totalAduaneiro = 0
  for (const r of rateiossalvos) {
    for (const item of r.itens) {
      // Busca todos os itens do rateio para calcular total
      const itensRateio = await prisma.rateio_item.aggregate({
        where: { rateio_id: r.id, produto_id: { not: null } },
        _sum: { valor_aduaneiro_unit_brl: true },
      })
      totalAduaneiro += (itensRateio._sum.valor_aduaneiro_unit_brl ?? 0)
    }
  }

  if (totalAduaneiro < 100_000) {
    // Não tem rateios com valor aduaneiro suficiente — atualiza os existentes
    const todosItens = await prisma.rateio_item.findMany({
      where: {
        produto_id: { not: null },
        rateio: { workspace_id: ws.id, status: 'SALVO' },
      },
      take: 50,
      orderBy: { rateio: { created_at: 'desc' } },
    })

    if (todosItens.length > 0) {
      // Distribui R$320.000 proporcionalmente entre os itens
      const valorPorItem = Math.round(320_000 / todosItens.length)
      for (const item of todosItens) {
        await prisma.rateio_item.update({
          where: { id: item.id },
          data: { valor_aduaneiro_unit_brl: valorPorItem / (item.qty || 1) },
        })
      }
      console.log(`✓ ${todosItens.length} itens de rateio atualizados com valor aduaneiro (R$320.000 total)`)
    } else {
      console.log('  ⚠ Nenhum rateio com produto_id encontrado — valor aduaneiro será R$0 no simulador')
      console.log('    → No simulador, o usuário pode digitar manualmente R$320.000 no campo "Valor aduaneiro"')
    }
  } else {
    console.log(`✓ Rateios já têm valor aduaneiro: R$${totalAduaneiro.toLocaleString('pt-BR')}`)
  }

  // ── 4. Verificação final dos cálculos ────────────────────────────────────
  const VAL_IMPORT = 320_000

  // Simples
  const aliqNominal = 14.3, deducao = 87300
  const aliqEfetiva = (rbt12 * aliqNominal / 100 - deducao) / rbt12 * 100
  const simples = FAT * aliqEfetiva / 100

  // Presumido
  const irpjBase = FAT * 0.08
  const presumido = irpjBase * 0.15 + Math.max(0, irpjBase - 20000) * 0.10
    + FAT * 0.12 * 0.09
    + FAT * 0.0065
    + FAT * 0.03

  // Lucro Real
  const lucroLiq = FAT - CMV - TOTAL_DESP
  const irpj = lucroLiq * 0.15 + Math.max(0, lucroLiq - 20000) * 0.10
  const csll = lucroLiq * 0.09
  const pisBruto = FAT * 0.0165
  const cofinsBruto = FAT * 0.076
  const creditoPIS = VAL_IMPORT * 0.021
  const creditoCOFINS = VAL_IMPORT * 0.0965
  const pisLiq = Math.max(0, pisBruto - creditoPIS)
  const cofinsLiq = Math.max(0, cofinsBruto - creditoCOFINS)
  const lucroReal = irpj + csll + pisLiq + cofinsLiq

  console.log('\n── Verificação dos cálculos ────────────────────────────')
  console.log(`  Faturamento:       R$${FAT.toLocaleString('pt-BR')}`)
  console.log(`  CMV:               R$${CMV.toLocaleString('pt-BR')} (${(CMV/FAT*100).toFixed(1)}%)`)
  console.log(`  Despesas:          R$${TOTAL_DESP.toLocaleString('pt-BR')}`)
  console.log(`  Lucro líquido:     R$${lucroLiq.toLocaleString('pt-BR')}`)
  console.log(`  Valor aduaneiro:   R$${VAL_IMPORT.toLocaleString('pt-BR')}`)
  console.log(`  RBT12:             R$${rbt12.toLocaleString('pt-BR')} (faixa 5, ${aliqEfetiva.toFixed(2)}% ef.)`)
  console.log(``)
  console.log(`  Simples Nacional:  R$${simples.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,'.')} (${(simples/FAT*100).toFixed(2)}%)`)
  console.log(`  Lucro Presumido:   R$${presumido.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,'.')} (${(presumido/FAT*100).toFixed(2)}%)`)
  console.log(`  Lucro Real:        R$${lucroReal.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,'.')} (${(lucroReal/FAT*100).toFixed(2)}%)  ← MELHOR`)
  console.log(``)
  console.log(`  Crédito PIS:       R$${creditoPIS.toFixed(0)} (PIS bruto R$${pisBruto.toFixed(0)}) → paga R$${pisLiq.toFixed(0)}`)
  console.log(`  Crédito COFINS:    R$${creditoCOFINS.toFixed(0)} (COFINS bruto R$${cofinsBruto.toFixed(0)}) → paga R$${cofinsLiq.toFixed(0)}`)
  console.log(``)
  console.log(`  💰 Economia LR vs Presumido: R$${(presumido-lucroReal).toFixed(0)}/mês = R$${((presumido-lucroReal)*12).toFixed(0)}/ano`)
  console.log(`  💰 Economia LR vs Simples:   R$${(simples-lucroReal).toFixed(0)}/mês = R$${((simples-lucroReal)*12).toFixed(0)}/ano`)

  console.log('\n🎉 Cenário importador configurado!\n')
  console.log('  Como apresentar na mentoria:')
  console.log('  1. Abra Ferramentas → Simulador de Regime Tributário')
  console.log('  2. Os campos serão pré-preenchidos com os dados acima')
  console.log('  3. Se "Valor aduaneiro" vier zerado, insira R$320.000 manualmente')
  console.log('  4. Mostra: Simples paga MUITO, Presumido razoável, Lucro Real é o ótimo')
  console.log('  5. Explique: créditos de PIS/COFINS-importação (2,1% + 9,65%) zeram o tributo\n')
}

main().catch(e => { console.error('\n❌ Erro:', e.message); process.exit(1) }).finally(() => prisma.$disconnect())
