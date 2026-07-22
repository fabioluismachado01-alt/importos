/**
 * fix-cenario-simples-vs-lr.ts
 *
 * Empresa SÓLIDA no Simples Nacional — mas deixando R$192k/ano na mesa.
 * O simulador vai mostrar o caminho pro Lucro Real.
 *
 * Cenário calibrado:
 *   Receita:         R$380.000
 *   CMV:             R$230.000  (60,5% — importer com boa negociação)
 *   Despesas oper.:  R$ 82.000
 *   Lucro bruto:     R$ 68.000
 *   Valor aduaneiro: R$320.000
 *   RBT12:           R$4.100.000 → faixa 6 Simples (19% nominal, 9,78% efetiva)
 *
 *   SIMPLES:         R$37.164 de imposto → lucro líquido R$30.836 (8,1% margem) ✅
 *   LUCRO PRESUMIDO: R$23.574 de imposto → lucro líquido R$44.426 (11,7%)
 *   LUCRO REAL:      R$21.120 de imposto → lucro líquido R$46.880 (12,3%) ← MELHOR
 *
 *   → Empresa deixa R$16.044/mês = R$192.528/ano na mesa por não migrar pro LR
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const ws = await prisma.workspace.findUnique({ where: { slug: 'nacao-import-demo' } })
  if (!ws) throw new Error('Workspace não encontrado')
  console.log('✓ Workspace:', ws.nome)

  // ── 1. Restaura regime para Simples Nacional ───────────────────
  await prisma.empresa.update({
    where: { workspace_id: ws.id },
    data: { regime_tributario: 'simples' },
  })
  console.log('✓ Empresa → regime: simples')

  // ── 2. Recalibra Julho/2026 ────────────────────────────────────
  const FAT  = 380_000
  const CMV  = 230_000   // 60,5% — boa negociação mas ainda alto para importador
  const DESP = {
    armazenagem:          9_000,
    ads_ml:               6_840,   // 1,8% do fat
    ads_outros:           2_660,
    tarifas:              7_600,   // 2% vendas
    frete:               12_800,   // last-mile + distribuição
    fatura_ml:                0,
    outras_taxas:         3_500,   // despachante, bancárias
    pro_labore:          18_000,   // 2 sócios
    inss:                 2_376,   // 13,2%
    contabilidade:        3_200,
    erp:                    649,
    emprestimo:               0,
    aluguel:             12_000,   // galpão logístico
    pagina_ml:              399,
    previdencia_privada:      0,
    fixas_outras:         2_976,
  }
  const TOTAL_DESP = Object.values(DESP).reduce((a, b) => a + b, 0)  // 82.000

  const lucro_bruto = FAT - CMV - TOTAL_DESP                          // 68.000

  // Simples faixa 6 (RBT12 = R$4,1M): aliq 19%, deducao 378.000
  const RBT12 = 4_100_000
  const aliq_ef = (RBT12 * 0.19 - 378_000) / RBT12                   // 9,78%
  const das = parseFloat((FAT * aliq_ef).toFixed(2))                  // ~37.164

  const lucro_liquido = parseFloat((lucro_bruto - das).toFixed(2))    // ~30.836

  await prisma.faturamento_mes.update({
    where: { workspace_id_ano_mes: { workspace_id: ws.id, ano: 2026, mes: 7 } },
    data: {
      receita_total: FAT,
      receita_ml:      171_000,
      receita_shopee:   68_400,
      receita_amazon:   38_000,
      receita_magalu:   34_200,
      receita_tiktok:   26_600,
      receita_outros:   41_800,
      desp_custo_produtos:      CMV,
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
      aliquota_simples:  parseFloat((aliq_ef * 100).toFixed(4)),
      das_valor_calc:    das,
      das_status:        'PENDENTE',
      lucro_bruto,
      lucro_liquido,
      meta_mes:    420_000,
      dias_no_mes: 31,
      dias_com_venda: 6,
      ticket_medio: 320,
      fechado: false,
    },
  })

  // ── 3. Corrige outros meses proporcionalmente ──────────────────
  const outros = await prisma.faturamento_mes.findMany({
    where: { workspace_id: ws.id, NOT: { mes: 7, ano: 2026 }, receita_total: { gt: 0 } },
  })
  for (const m of outros) {
    const r = m.receita_total
    const cmv_m = parseFloat((r * (CMV / FAT)).toFixed(2))
    const desp_m = parseFloat((r * (TOTAL_DESP / FAT)).toFixed(2))
    const lb = r - cmv_m - desp_m
    const das_m = parseFloat((r * aliq_ef).toFixed(2))
    const ll = parseFloat((lb - das_m).toFixed(2))
    await prisma.faturamento_mes.update({
      where: { id: m.id },
      data: { desp_custo_produtos: cmv_m, aliquota_simples: parseFloat((aliq_ef*100).toFixed(4)), das_valor_calc: das_m, lucro_bruto: lb, lucro_liquido: ll },
    })
  }
  console.log(`✓ ${outros.length} meses anteriores recalibrados`)

  // ── 4. Verificação final ────────────────────────────────────────
  const VAL_IMP = 320_000
  const pisBruto   = FAT * 0.0165
  const cofinsBruto = FAT * 0.076
  const creditoPIS   = VAL_IMP * 0.021
  const creditoCOFINS = VAL_IMP * 0.0965
  const pisLiq   = Math.max(0, pisBruto - creditoPIS)
  const cofinsLiq = Math.max(0, cofinsBruto - creditoCOFINS)
  const irpj = lucro_bruto * 0.15 + Math.max(0, lucro_bruto - 20_000) * 0.10
  const csll = lucro_bruto * 0.09
  const totalLR = irpj + csll + pisLiq + cofinsLiq

  const presumido = FAT*0.08*0.15 + Math.max(0,FAT*0.08-20000)*0.10 + FAT*0.12*0.09 + FAT*0.0065 + FAT*0.03

  const economiaLRvsSimples = das - totalLR

  console.log('\n── Dashboard vai mostrar ─────────────────────────────────')
  console.log(`  Receita bruta:    R$${FAT.toLocaleString('pt-BR')}`)
  console.log(`  Lucro bruto:      R$${lucro_bruto.toLocaleString('pt-BR')} (${(lucro_bruto/FAT*100).toFixed(1)}% margem bruta)`)
  console.log(`  DAS Simples:      R$${das.toLocaleString('pt-BR')} (${(aliq_ef*100).toFixed(2)}% ef.)`)
  console.log(`  Lucro líquido:    R$${lucro_liquido.toLocaleString('pt-BR')} (${(lucro_liquido/FAT*100).toFixed(1)}% margem) ✅ POSITIVO`)
  console.log('\n── Simulador vai mostrar ─────────────────────────────────')
  console.log(`  Simples Nacional: R$${das.toFixed(0)} (${(das/FAT*100).toFixed(2)}%)`)
  console.log(`  Lucro Presumido:  R$${presumido.toFixed(0)} (${(presumido/FAT*100).toFixed(2)}%)`)
  console.log(`  Lucro Real:       R$${totalLR.toFixed(0)} (${(totalLR/FAT*100).toFixed(2)}%) ← MELHOR`)
  console.log(`    PIS bruto: R$${pisBruto.toFixed(0)} | Crédito: R$${creditoPIS.toFixed(0)} → paga R$${pisLiq.toFixed(0)}`)
  console.log(`    COFINS bruto: R$${cofinsBruto.toFixed(0)} | Crédito: R$${creditoCOFINS.toFixed(0)} → paga R$${cofinsLiq.toFixed(0)}`)
  console.log('\n── A lição para o aluno ──────────────────────────────────')
  console.log(`  💰 Empresa SÓLIDA no Simples → lucro R$${lucro_liquido.toLocaleString('pt-BR')}/mês`)
  console.log(`  🚀 Migra pro Lucro Real    → lucro R$${(lucro_bruto-totalLR).toLocaleString('pt-BR')}/mês`)
  console.log(`  📉 Deixando na mesa:       R$${economiaLRvsSimples.toFixed(0)}/mês = R$${(economiaLRvsSimples*12).toFixed(0)}/ano`)
}

main().catch(e => { console.error('❌', e.message); process.exit(1) }).finally(() => prisma.$disconnect())
