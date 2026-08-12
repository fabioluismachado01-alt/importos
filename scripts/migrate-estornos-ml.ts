/**
 * MIGRAÇÃO: Estornos ML jan–jul/2026
 *
 * Converte lançamentos RECEITA/OUTRO_CANAL (bug) → RECUPERACAO_DESPESA/TARIFAS
 * com canal=MERCADO_LIVRE. Valor inalterado (já positivo).
 *
 * MODO PADRÃO: --dry-run  → imprime antes/depois, não escreve nada.
 * MODO ESCRITA: --execute  → somente após revisão explícita.
 *
 * Uso:
 *   npx tsx scripts/migrate-estornos-ml.ts --dry-run
 *   npx tsx scripts/migrate-estornos-ml.ts --execute
 *
 * Gera rollback em scripts/migrate-estornos-ml-rollback.json (somente em --execute)
 */

import { PrismaClient } from '@prisma/client'
import { calcularKPIs } from '../src/engines/finance'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } })
const WORKSPACE_ID = 'cmpx6dq5k000fvckk6d1aknfq'
const DRY_RUN = !process.argv.includes('--execute')

// ── helpers ─────────────────────────────────────────────────────────────────

function toDecimalAliq(v: number) { return v > 1 ? v / 100 : v }

async function lerConfigMes(fatId: string) {
  const fat = await prisma.faturamento_mes.findUnique({
    where: { id: fatId },
    select: {
      aliquota_simples: true, meta_mes: true, dias_no_mes: true,
      dlr_modo: true, dlr_percentual_custom: true, dlr_valor_fixo: true,
      das_valor_real: true, das_status: true,
      lucro_bruto: true, lucro_liquido: true,
    },
  })
  const empresa = await prisma.empresa.findUnique({
    where: { workspace_id: WORKSPACE_ID }, select: { aliquota_simples: true },
  })
  const finConfig = await prisma.finance_config.findFirst({
    where: { workspace_id: WORKSPACE_ID }, orderBy: { ano: 'desc' },
    select: { percentual_dlr_socio: true, percentual_reinvestimento: true, formula_previdencia: true },
  })
  return {
    fat,
    config: {
      aliquota_simples: toDecimalAliq(fat?.aliquota_simples ?? empresa?.aliquota_simples ?? 8),
      percentual_dlr_socio: finConfig?.percentual_dlr_socio ?? 0.5,
      percentual_reinvestimento: finConfig?.percentual_reinvestimento ?? 0.5,
      formula_previdencia: finConfig?.formula_previdencia ?? 'PRO_LABORE*0.20+LUCRO_BRUTO*0.11',
      dias_no_mes: fat?.dias_no_mes ?? 30,
      meta_mes: fat?.meta_mes ?? 0,
      das_valor_real: fat?.das_status === 'PAGO' ? fat?.das_valor_real : null,
    } as const,
  }
}

async function recalcularMesLocal(fatId: string, ano: number, mes: number) {
  const lancamentos = await prisma.lancamento.findMany({
    where: { faturamento_id: fatId, status: 'CONFIRMADO' },
    select: { tipo: true, categoria: true, canal: true, valor: true, data: true, descricao: true },
  })
  const { fat, config } = await lerConfigMes(fatId)

  const PEDIDOS_RE = /(\d+)\s+pedidos?/i
  let total_pedidos = 0
  lancamentos.forEach(l => {
    if (l.tipo === 'RECEITA' && l.canal) {
      const m = l.descricao.match(PEDIDOS_RE)
      if (m) total_pedidos += parseInt(m[1])
    }
  })
  if (total_pedidos > 0) (config as any).total_pedidos = total_pedidos

  const kpis = calcularKPIs(lancamentos as any, config as any)
  const mesVenc = mes === 12 ? 1 : mes + 1
  const anoVenc = mes === 12 ? ano + 1 : ano

  await prisma.faturamento_mes.update({
    where: { id: fatId },
    data: {
      receita_total: kpis.receita_total, receita_ml: kpis.receita_ml,
      receita_magalu: kpis.receita_magalu, receita_casas_bahia: kpis.receita_casas_bahia,
      receita_amazon: kpis.receita_amazon, receita_shopee: kpis.receita_shopee,
      receita_tiktok: kpis.receita_tiktok, receita_presencial: kpis.receita_presencial,
      receita_outros: kpis.receita_outros,
      desp_armazenagem: kpis.desp_armazenagem, desp_ads_ml: kpis.desp_ads_ml,
      desp_ads_outros: kpis.desp_ads_outros, desp_custo_produtos: kpis.desp_custo_produtos,
      desp_tarifas: kpis.desp_tarifas, desp_frete: kpis.desp_frete,
      desp_fatura_ml: kpis.desp_fatura_ml, desp_outras_taxas: kpis.desp_outras_taxas,
      das_valor_calc: kpis.das_valor_calc,
      das_vencimento: new Date(anoVenc, mesVenc - 1, 20),
      desp_pro_labore: kpis.desp_pro_labore, desp_inss: kpis.desp_inss,
      desp_contabilidade: kpis.desp_contabilidade, desp_erp: kpis.desp_erp,
      desp_emprestimo: kpis.desp_emprestimo, desp_aluguel: kpis.desp_aluguel,
      desp_pagina_ml: kpis.desp_pagina_ml, desp_previdencia_privada: kpis.desp_previdencia_privada,
      desp_fixas_outras: kpis.desp_fixas_outras,
      lucro_bruto: kpis.lucro_bruto, lucro_liquido: kpis.lucro_liquido,
      margem_contribuicao: kpis.margem_contribuicao, break_even: kpis.break_even,
      roas_atual: kpis.roas_atual,
    },
  })

  return { kpis, das_valor_real: fat?.das_valor_real, das_status: fat?.das_status }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== MIGRAÇÃO ESTORNOS ML ===')
  console.log(`MODO: ${DRY_RUN ? 'DRY-RUN (nenhuma escrita)' : '*** EXECUTE — ESCREVENDO NO BANCO ***'}`)
  console.log()

  // ── SELECT ANTES ───────────────────────────────────────────────────────────
  // "faturamento" é o nome da relação em lancamento → faturamento_mes
  const alvo = await prisma.lancamento.findMany({
    where: {
      faturamento: { workspace_id: WORKSPACE_ID, ano: 2026, mes: { gte: 1, lte: 7 } },
      tipo: 'RECEITA',
      categoria: 'OUTRO_CANAL',
      descricao: 'ML Import — Estornos e Cancelamentos de Tarifas',
      status: 'CONFIRMADO',
    },
    select: {
      id: true, tipo: true, categoria: true, canal: true, descricao: true, valor: true, data: true, status: true,
      faturamento: { select: { id: true, ano: true, mes: true, das_valor_real: true, das_status: true } },
    },
    orderBy: { faturamento: { mes: 'asc' } },
  })

  console.log(`ANTES: ${alvo.length} linha(s) encontrada(s)`)
  console.log()
  console.log('--- ESTADO ATUAL ---')
  console.log(`${'id'.padEnd(28)} ${'mes'.padEnd(7)} ${'tipo'.padEnd(20)} ${'cat'.padEnd(14)} ${'canal'.padEnd(14)} ${'valor'.padStart(10)}`)
  for (const r of alvo) {
    const mes = `${r.faturamento.ano}/${String(r.faturamento.mes).padStart(2,'0')}`
    console.log(`${r.id.padEnd(28)} ${mes.padEnd(7)} ${r.tipo.padEnd(20)} ${r.categoria.padEnd(14)} ${String(r.canal ?? 'null').padEnd(14)} ${r.valor.toFixed(2).padStart(10)}`)
  }

  if (alvo.length === 0) {
    console.log('\nNada a migrar.')
    await prisma.$disconnect()
    return
  }

  console.log()
  console.log('--- ALTERAÇÃO PROPOSTA ---')
  console.log('  tipo:      RECEITA          → RECUPERACAO_DESPESA')
  console.log('  categoria: OUTRO_CANAL       → TARIFAS')
  console.log('  canal:     null/OUTRO_CANAL  → MERCADO_LIVRE')
  console.log('  valor:     inalterado (já positivo)')
  console.log()

  // ── DRY-RUN: simula efeito no lucro por mês ──────────────────────────────
  if (DRY_RUN) {
    console.log('=== SIMULAÇÃO DE IMPACTO (dry-run) ===')
    console.log('Validação chave: todos os meses têm das_valor_real preenchido,')
    console.log('portanto a migração é reclassificação pura — lucro deve ser IDÊNTICO antes/depois.')
    console.log()

    const mesesAlvo = [...new Set(alvo.map(r => r.faturamento.id))].map(id => {
      const r = alvo.find(a => a.faturamento.id === id)!
      return { fatId: id, ano: r.faturamento.ano, mes: r.faturamento.mes }
    }).sort((a, b) => a.mes - b.mes)

    let algumLucroDiverge = false

    for (const m of mesesAlvo) {
      const { fat, config } = await lerConfigMes(m.fatId)

      const lancsAntes = await prisma.lancamento.findMany({
        where: { faturamento_id: m.fatId, status: 'CONFIRMADO' },
        select: { id: true, tipo: true, categoria: true, canal: true, valor: true, data: true },
      })

      const estornoIds = new Set(alvo.filter(r => r.faturamento.id === m.fatId).map(r => r.id))
      const lancsDepois = lancsAntes.map(l =>
        estornoIds.has(l.id)
          ? { ...l, tipo: 'RECUPERACAO_DESPESA', categoria: 'TARIFAS', canal: 'MERCADO_LIVRE' }
          : l
      )

      const kpisAntes  = calcularKPIs(lancsAntes  as any, config as any)
      const kpisDepois = calcularKPIs(lancsDepois as any, config as any)

      const lbDiff = Math.abs(kpisDepois.lucro_bruto - kpisAntes.lucro_bruto)
      const llDiff = Math.abs(kpisDepois.lucro_liquido - kpisAntes.lucro_liquido)
      const lucroOk = lbDiff < 0.02 && llDiff < 0.02

      if (!lucroOk) algumLucroDiverge = true

      console.log(`  ${m.ano}/${String(m.mes).padStart(2,'0')}:`)
      console.log(`    Receita  ANTES=${kpisAntes.receita_total.toFixed(2).padStart(11)}   DEPOIS=${kpisDepois.receita_total.toFixed(2).padStart(11)}`)
      console.log(`    Tarifas  ANTES=${kpisAntes.desp_tarifas.toFixed(2).padStart(11)}   DEPOIS=${kpisDepois.desp_tarifas.toFixed(2).padStart(11)}`)
      console.log(`    DAS      ANTES=${kpisAntes.das_valor_calc.toFixed(2).padStart(11)}   DEPOIS=${kpisDepois.das_valor_calc.toFixed(2).padStart(11)}  (das_valor_real=${config.das_valor_real?.toFixed(2) ?? 'null — pendente'})`)
      console.log(`    LucroBrt ANTES=${kpisAntes.lucro_bruto.toFixed(2).padStart(11)}   DEPOIS=${kpisDepois.lucro_bruto.toFixed(2).padStart(11)}  ${lucroOk ? '✓ IDÊNTICO' : `✗ DIFERE ${lbDiff.toFixed(4)}`}`)
      console.log(`    LucroLiq ANTES=${kpisAntes.lucro_liquido.toFixed(2).padStart(11)}   DEPOIS=${kpisDepois.lucro_liquido.toFixed(2).padStart(11)}  ${lucroOk ? '✓ IDÊNTICO' : `✗ DIFERE ${llDiff.toFixed(4)}`}`)
      console.log()
    }

    if (algumLucroDiverge) {
      console.log('⚠️  ATENÇÃO: algum mês tem lucro divergente — verifique antes de executar.')
    } else {
      console.log('✓  Validação OK: lucro_bruto e lucro_liquido idênticos em todos os meses.')
      console.log('   (reclassificação pura — DAS real absorve a diferença de receita)')
    }
    console.log()
    console.log('DRY-RUN: NENHUMA ESCRITA. Rode com --execute para persistir.')
    await prisma.$disconnect()
    return
  }

  // ── ROLLBACK ───────────────────────────────────────────────────────────────
  const rollbackPath = path.join(__dirname, 'migrate-estornos-ml-rollback.json')
  const rollbackData = alvo.map(r => ({
    id: r.id,
    tipo: r.tipo,
    categoria: r.categoria,
    canal: r.canal,
    faturamento_mes_id: r.faturamento.id,
    mes: r.faturamento.mes,
    ano: r.faturamento.ano,
  }))
  fs.writeFileSync(rollbackPath, JSON.stringify(rollbackData, null, 2))
  console.log(`ROLLBACK salvo em: ${rollbackPath}`)
  console.log()

  // ── UPDATE LANÇAMENTOS ────────────────────────────────────────────────────
  const ids = alvo.map(r => r.id)
  const updateResult = await prisma.lancamento.updateMany({
    where: { id: { in: ids } },
    data: { tipo: 'RECUPERACAO_DESPESA', categoria: 'TARIFAS', canal: 'MERCADO_LIVRE' },
  })
  console.log(`UPDATE lançamentos: ${updateResult.count} linha(s) afetada(s)`)
  console.log()

  // ── SELECT DEPOIS ─────────────────────────────────────────────────────────
  const depois = await prisma.lancamento.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, tipo: true, categoria: true, canal: true, valor: true,
      faturamento: { select: { ano: true, mes: true } }
    },
    orderBy: { faturamento: { mes: 'asc' } },
  })
  console.log('--- ESTADO APÓS UPDATE ---')
  console.log(`${'id'.padEnd(28)} ${'mes'.padEnd(7)} ${'tipo'.padEnd(22)} ${'cat'.padEnd(10)} ${'canal'.padEnd(14)} ${'valor'.padStart(10)}`)
  for (const r of depois) {
    const mes = `${r.faturamento.ano}/${String(r.faturamento.mes).padStart(2,'0')}`
    console.log(`${r.id.padEnd(28)} ${mes.padEnd(7)} ${r.tipo.padEnd(22)} ${r.categoria.padEnd(10)} ${String(r.canal ?? 'null').padEnd(14)} ${r.valor.toFixed(2).padStart(10)}`)
  }

  // ── RECALCULAR CADA MÊS ──────────────────────────────────────────────────
  const mesesAfetados = [...new Set(alvo.map(r => r.faturamento.id))].map(id => {
    const r = alvo.find(a => a.faturamento.id === id)!
    return { id, ano: r.faturamento.ano, mes: r.faturamento.mes,
             das_valor_real: r.faturamento.das_valor_real, das_status: r.faturamento.das_status }
  }).sort((a, b) => a.mes - b.mes)

  console.log()
  console.log('--- RECALCULANDO KPIs ---')
  for (const m of mesesAfetados) {
    const { kpis, das_valor_real, das_status } = await recalcularMesLocal(m.id, m.ano, m.mes)
    const fatPosRecalc = await prisma.faturamento_mes.findUnique({
      where: { id: m.id },
      select: { das_valor_real: true, das_status: true },
    })
    const dasIntacto = fatPosRecalc?.das_valor_real === das_valor_real && fatPosRecalc?.das_status === das_status
    console.log(
      `  ${m.ano}/${String(m.mes).padStart(2,'0')}` +
      `  receita=${kpis.receita_total.toFixed(2)}` +
      `  desp_tarifas=${kpis.desp_tarifas.toFixed(2)}` +
      `  lucro_liq=${kpis.lucro_liquido.toFixed(2)}` +
      `  das_calc=${kpis.das_valor_calc.toFixed(2)}` +
      `  DAS_INTACTO=${dasIntacto ? 'OK' : `ERRO (real=${fatPosRecalc?.das_valor_real} status=${fatPosRecalc?.das_status})`}`
    )
  }

  console.log()
  console.log('Migração concluída. Arquivo de rollback:')
  console.log(`  ${rollbackPath}`)

  await prisma.$disconnect()
}

main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1) })
