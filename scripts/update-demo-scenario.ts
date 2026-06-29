/**
 * Atualiza dados demo para cenário tributário realista:
 * RBT12 ~R$1.29M → Simples ~9% vs Lucro Real ~4.75% (com créditos importação)
 *
 * Conta demo: demo@importos.com.br / Demo@2026
 * Empresa: Nação Import Ltda
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const ws = await prisma.workspace.findFirst({ where: { slug: 'nacao-import-demo' } })
  if (!ws) { console.error('❌ Workspace demo não encontrado'); return }
  console.log('✅ Workspace:', ws.nome)

  // ─── HISTÓRICO 2023 ────────────────────────────────────────────────────────
  // Fase inicial: empresa crescendo, R$350k no ano
  const historico2023 = [
    { mes: 1, fat: 18000, lb: 8100, ll: 3200 },
    { mes: 2, fat: 21000, lb: 9450, ll: 3800 },
    { mes: 3, fat: 26000, lb: 11700, ll: 4600 },
    { mes: 4, fat: 24000, lb: 10800, ll: 4200 },
    { mes: 5, fat: 28000, lb: 12600, ll: 5100 },
    { mes: 6, fat: 31000, lb: 13950, ll: 5500 },
    { mes: 7, fat: 29000, lb: 13050, ll: 5000 },
    { mes: 8, fat: 32000, lb: 14400, ll: 5700 },
    { mes: 9, fat: 35000, lb: 15750, ll: 6200 },
    { mes: 10, fat: 33000, lb: 14850, ll: 5800 },
    { mes: 11, fat: 44000, lb: 19800, ll: 7900 },
    { mes: 12, fat: 53000, lb: 23850, ll: 9600 },
  ]

  // ─── HISTÓRICO 2024 ────────────────────────────────────────────────────────
  // Crescimento acelerado: R$699k no ano (+100% vs 2023)
  const historico2024 = [
    { mes: 1, fat: 35000, lb: 15750, ll: 6200 },
    { mes: 2, fat: 38000, lb: 17100, ll: 6800 },
    { mes: 3, fat: 48000, lb: 21600, ll: 8600 },
    { mes: 4, fat: 44000, lb: 19800, ll: 7800 },
    { mes: 5, fat: 46000, lb: 20700, ll: 8100 },
    { mes: 6, fat: 52000, lb: 23400, ll: 9200 },
    { mes: 7, fat: 58000, lb: 26100, ll: 10300 },
    { mes: 8, fat: 55000, lb: 24750, ll: 9700 },
    { mes: 9, fat: 62000, lb: 27900, ll: 11000 },
    { mes: 10, fat: 68000, lb: 30600, ll: 12100 },
    { mes: 11, fat: 95000, lb: 42750, ll: 16900 },
    { mes: 12, fat: 98000, lb: 44100, ll: 17400 },
  ]

  // ─── HISTÓRICO 2025 ────────────────────────────────────────────────────────
  // Escala forte: R$1.148M (+64% vs 2024)
  const historico2025 = [
    { mes: 1, fat: 55000, lb: 24750, ll: 8200 },
    { mes: 2, fat: 58000, lb: 26100, ll: 8600 },
    { mes: 3, fat: 72000, lb: 32400, ll: 10900 },
    { mes: 4, fat: 68000, lb: 30600, ll: 10200 },
    { mes: 5, fat: 80000, lb: 36000, ll: 12000 },
    { mes: 6, fat: 75000, lb: 33750, ll: 11200 },
    { mes: 7, fat: 95000, lb: 42750, ll: 12800 },  // ← entra no RBT12
    { mes: 8, fat: 88000, lb: 39600, ll: 11800 },
    { mes: 9, fat: 105000, lb: 47250, ll: 14200 },
    { mes: 10, fat: 115000, lb: 51750, ll: 15500 },
    { mes: 11, fat: 152000, lb: 68400, ll: 20600 },
    { mes: 12, fat: 185000, lb: 83250, ll: 25000 },
  ]

  // ─── HISTÓRICO 2026 (Jan–Mai) ─────────────────────────────────────────────
  // Entra no RBT12 junto com Jul–Dez 2025 → total ~R$1.29M
  // Jan-Mai 2026: R$551k
  const historico2026 = [
    { mes: 1, fat: 92000, lb: 50000, ll: 3312 },
    { mes: 2, fat: 96000, lb: 52000, ll: 3256 },
    { mes: 3, fat: 115000, lb: 62500, ll: 4720 },
    { mes: 4, fat: 108000, lb: 59000, ll: 5224 },
    { mes: 5, fat: 125000, lb: 68000, ll: 7000 },
  ]

  // Salva historicos com upsert (force update)
  for (const h of historico2023) {
    await prisma.historico_faturamento_anual.upsert({
      where: { workspace_id_ano_mes: { workspace_id: ws.id, ano: 2023, mes: h.mes } },
      update: { faturamento: h.fat, lucro_bruto: h.lb, lucro_liquido: h.ll },
      create: { workspace_id: ws.id, ano: 2023, mes: h.mes, faturamento: h.fat, lucro_bruto: h.lb, lucro_liquido: h.ll, fonte: 'MANUAL' },
    })
  }
  console.log('✅ Histórico 2023 criado (R$374k)')

  for (const h of historico2024) {
    await prisma.historico_faturamento_anual.upsert({
      where: { workspace_id_ano_mes: { workspace_id: ws.id, ano: 2024, mes: h.mes } },
      update: { faturamento: h.fat, lucro_bruto: h.lb, lucro_liquido: h.ll },
      create: { workspace_id: ws.id, ano: 2024, mes: h.mes, faturamento: h.fat, lucro_bruto: h.lb, lucro_liquido: h.ll, fonte: 'MANUAL' },
    })
  }
  console.log('✅ Histórico 2024 criado (R$699k)')

  for (const h of historico2025) {
    await prisma.historico_faturamento_anual.upsert({
      where: { workspace_id_ano_mes: { workspace_id: ws.id, ano: 2025, mes: h.mes } },
      update: { faturamento: h.fat, lucro_bruto: h.lb, lucro_liquido: h.ll },
      create: { workspace_id: ws.id, ano: 2025, mes: h.mes, faturamento: h.fat, lucro_bruto: h.lb, lucro_liquido: h.ll, fonte: 'MANUAL' },
    })
  }
  console.log('✅ Histórico 2025 criado (R$1.148M)')

  for (const h of historico2026) {
    await prisma.historico_faturamento_anual.upsert({
      where: { workspace_id_ano_mes: { workspace_id: ws.id, ano: 2026, mes: h.mes } },
      update: { faturamento: h.fat, lucro_bruto: h.lb, lucro_liquido: h.ll },
      create: { workspace_id: ws.id, ano: 2026, mes: h.mes, faturamento: h.fat, lucro_bruto: h.lb, lucro_liquido: h.ll, fonte: 'SISTEMA' },
    })
  }
  console.log('✅ Histórico 2026 Jan-Mai criado (R$536k)')
  console.log('   → RBT12 Jun/2026 = R$1.291M (Simples ~8.96%)')

  // ─── FATURAMENTO MENSAL 2026 ───────────────────────────────────────────────
  // Margens apertadas pela operação em crescimento acelerado
  // Despesas altas incluem: tarifas ML, frete, ads, armazenagem, pro-labore 2 sócios,
  // contabilidade, erp, aluguel galpão, etc.
  //
  // RBT12 em Jun: R$1.291M → Simples 8.96% (faixa 4)
  // Lucro Real com R$75k aduaneiro → 4.75% ← ganhador do comparador
  //
  const meses2026 = [
    {
      mes: 1, receita: 92000, receita_ml: 68000, receita_shopee: 17000, receita_outros: 7000,
      cmv: 42000, tarifas: 8840, frete: 5440, ads_ml: 4760, armazenagem: 2800,
      pro_labore: 5500, contab: 650, erp: 199, aluguel: 3200, outras_taxas: 2160, fixas_outras: 7251,
      das: 5888, lucro_bruto: 50000, lucro_liq: 3312, ticket: 215.40, dias: 26, das_status: 'PAGO',
    },
    {
      mes: 2, receita: 96000, receita_ml: 71000, receita_shopee: 18000, receita_outros: 7000,
      cmv: 44000, tarifas: 9230, frete: 5680, ads_ml: 4970, armazenagem: 2900,
      pro_labore: 5500, contab: 650, erp: 199, aluguel: 3200, outras_taxas: 2268, fixas_outras: 7803,
      das: 6144, lucro_bruto: 52000, lucro_liq: 3256, ticket: 221.30, dias: 24, das_status: 'PAGO',
    },
    {
      mes: 3, receita: 115000, receita_ml: 86000, receita_shopee: 21000, receita_outros: 8000,
      cmv: 52500, tarifas: 11180, frete: 6880, ads_ml: 6020, armazenagem: 3450,
      pro_labore: 5500, contab: 650, erp: 199, aluguel: 3200, outras_taxas: 2665, fixas_outras: 9956,
      das: 8280, lucro_bruto: 62500, lucro_liq: 4720, ticket: 229.60, dias: 27, das_status: 'PAGO',
    },
    {
      mes: 4, receita: 108000, receita_ml: 80000, receita_shopee: 20000, receita_outros: 8000,
      cmv: 49000, tarifas: 10400, frete: 6400, ads_ml: 5600, armazenagem: 3200,
      pro_labore: 5500, contab: 650, erp: 199, aluguel: 3200, outras_taxas: 2540, fixas_outras: 8511,
      das: 7776, lucro_bruto: 59000, lucro_liq: 5224, ticket: 224.80, dias: 26, das_status: 'PAGO',
    },
    {
      mes: 5, receita: 125000, receita_ml: 93000, receita_shopee: 23000, receita_outros: 9000,
      cmv: 57000, tarifas: 12090, frete: 7440, ads_ml: 6510, armazenagem: 3750,
      pro_labore: 5500, contab: 650, erp: 199, aluguel: 3200, outras_taxas: 2921, fixas_outras: 9740,
      das: 9000, lucro_bruto: 68000, lucro_liq: 7000, ticket: 235.80, dias: 28, das_status: 'PAGO',
    },
    {
      // Jun 2026 — mês de referência para o simulador tributário
      // Simples (8.96%): R$10.618  |  LP (5.93%): R$7.027  |  LR (4.75%): R$5.629
      // → digitar valor aduaneiro R$75.000 no simulador para ver LR ganhar
      mes: 6, receita: 118500, receita_ml: 88000, receita_shopee: 22000, receita_outros: 8500,
      cmv: 54000, tarifas: 11440, frete: 7040, ads_ml: 6160, armazenagem: 4500,
      pro_labore: 5500, contab: 650, erp: 199, aluguel: 3200, outras_taxas: 2800, fixas_outras: 8511,
      das: 10618, lucro_bruto: 64500, lucro_liq: 3882, ticket: 241.20, dias: 27, das_status: 'PENDENTE',
    },
  ]

  for (const m of meses2026) {
    await prisma.faturamento_mes.upsert({
      where: { workspace_id_ano_mes: { workspace_id: ws.id, ano: 2026, mes: m.mes } },
      update: {
        receita_total: m.receita,
        receita_ml: m.receita_ml,
        receita_shopee: m.receita_shopee,
        receita_outros: m.receita_outros,
        desp_custo_produtos: m.cmv,
        desp_tarifas: m.tarifas,
        desp_frete: m.frete,
        desp_ads_ml: m.ads_ml,
        desp_armazenagem: m.armazenagem,
        desp_pro_labore: m.pro_labore,
        desp_contabilidade: m.contab,
        desp_erp: m.erp,
        desp_aluguel: m.aluguel,
        desp_outras_taxas: m.outras_taxas,
        desp_fixas_outras: m.fixas_outras,
        das_valor_calc: m.das,
        das_status: m.das_status,
        lucro_bruto: m.lucro_bruto,
        lucro_liquido: m.lucro_liq,
        ticket_medio: m.ticket,
        dias_com_venda: m.dias,
      },
      create: {
        workspace_id: ws.id, ano: 2026, mes: m.mes,
        aliquota_simples: 6.0, meta_mes: 110000, dias_no_mes: 30,
        receita_total: m.receita, receita_ml: m.receita_ml,
        receita_shopee: m.receita_shopee, receita_outros: m.receita_outros,
        desp_custo_produtos: m.cmv, desp_tarifas: m.tarifas,
        desp_frete: m.frete, desp_ads_ml: m.ads_ml,
        desp_armazenagem: m.armazenagem, desp_pro_labore: m.pro_labore,
        desp_contabilidade: m.contab, desp_erp: m.erp,
        desp_aluguel: m.aluguel, desp_outras_taxas: m.outras_taxas,
        desp_fixas_outras: m.fixas_outras,
        das_valor_calc: m.das, das_status: m.das_status,
        lucro_bruto: m.lucro_bruto, lucro_liquido: m.lucro_liq,
        ticket_medio: m.ticket, dias_com_venda: m.dias,
        fechado: m.mes < 6,
      },
    })
    console.log(`  📅 ${String(m.mes).padStart(2,'0')}/2026: R$${m.receita.toLocaleString('pt-BR')} → lucro liq R$${m.lucro_liq.toLocaleString('pt-BR')} (${((m.lucro_liq/m.receita)*100).toFixed(1)}%)`)
  }
  console.log('✅ Faturamento mensal 2026 atualizado')

  // Atualiza finance config
  await prisma.finance_config.upsert({
    where: { workspace_id_ano: { workspace_id: ws.id, ano: 2026 } },
    update: { meta_faturamento_anual: 1400000 },
    create: { workspace_id: ws.id, ano: 2026, meta_faturamento_anual: 1400000, percentual_dlr_socio: 0.5, percentual_reinvestimento: 0.5 },
  })

  console.log('\n🎉 Cenário demo atualizado!')
  console.log('─────────────────────────────────────────────────')
  console.log('📊 Crescimento: 2023 R$374k → 2024 R$699k → 2025 R$1.148M → 2026 track R$1.4M')
  console.log('📊 RBT12 Jun/2026: R$1.291M  →  Simples 8.96%')
  console.log('📊 Lucro Presumido: 5.93%')
  console.log('📊 Lucro Real (com R$75k aduaneiro): 4.75% ← GANHADOR')
  console.log('💰 Economia anual vs Simples: R$59.868/ano')
  console.log('─────────────────────────────────────────────────')
  console.log('👉 No simulador: inserir Valor Aduaneiro = R$75.000')
}

main()
  .catch(e => { console.error('❌', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
