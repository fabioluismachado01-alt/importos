/**
 * TESTE E2E — Julho/2026 após RECUPERACAO_DESPESA
 *
 * Lê os lançamentos ATUAIS de julho do banco (sem alterar nada),
 * aplica a conversão do estorno em memória (como a migração fará),
 * roda calcularKPIs e compara com os valores esperados.
 *
 * Uso: npx tsx scripts/testar-julho-2026.ts
 */

import { PrismaClient } from '@prisma/client'
import { calcularKPIs } from '../src/engines/finance'

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } })
const WORKSPACE_ID = 'cmpx6dq5k000fvckk6d1aknfq'
const ANO = 2026
const MES = 7

// Valores alvo aprovados pelo usuário
const ESPERADO = {
  receita_total:  88828.32,
  desp_tarifas:   9998.81,   // "Tarifas Mkt (total)" — negativo na DRE
  das_valor_calc: 6262.40,
  lucro_bruto:    15089.06,
  lucro_liquido:  13449.05,
  receita_outros: 0,
  // "Tarifas de Venda ML" = desp_tarifas sem outras tarifas. Verificado via canalAnalise (not aqui)
}

const TOLERANCIA = 0.02  // R$ 0,02 de margem para float

function br(v: number) {
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function check(label: string, real: number, esperado: number) {
  const diff = Math.abs(real - esperado)
  const ok = diff <= TOLERANCIA
  const status = ok ? '✓' : `✗  DIFF ${diff.toFixed(4)}`
  console.log(`  ${ok ? '✓' : '✗'}  ${label.padEnd(28)}  esperado=${br(esperado)}   obtido=${br(real)}  ${ok ? '' : `← DIFF ${diff.toFixed(4)}`}`)
  return ok
}

async function main() {
  const fat = await prisma.faturamento_mes.findUnique({
    where: { workspace_id_ano_mes: { workspace_id: WORKSPACE_ID, ano: ANO, mes: MES } },
    select: {
      id: true,
      aliquota_simples: true, meta_mes: true, dias_no_mes: true,
      dlr_modo: true, dlr_percentual_custom: true, dlr_valor_fixo: true,
      das_valor_real: true, das_status: true,
    },
  })
  if (!fat) { console.error('faturamento_mes de julho/2026 não encontrado'); process.exit(1) }

  const lancamentosDB = await prisma.lancamento.findMany({
    where: { faturamento_id: fat.id, status: 'CONFIRMADO' },
    select: { id: true, tipo: true, categoria: true, canal: true, valor: true, data: true, descricao: true },
    orderBy: { tipo: 'asc' },
  })

  // ── Estado ATUAL do banco ─────────────────────────────────────────────────
  console.log('=== ESTADO ATUAL DO BANCO (julho/2026) ===')
  console.log()
  console.log('Lançamentos:')
  for (const l of lancamentosDB) {
    console.log(`  [${l.tipo.padEnd(22)} | ${(l.canal ?? l.categoria).padEnd(16)}] R$${l.valor.toFixed(2).padStart(11)}  "${l.descricao}"`)
  }
  console.log()

  // ── Calcula com tipo ATUAL (antes da migração) ────────────────────────────
  const toDecimalAliq = (v: number) => v > 1 ? v / 100 : v
  const empresa = await prisma.empresa.findUnique({ where: { workspace_id: WORKSPACE_ID }, select: { aliquota_simples: true } })
  const finConfig = await prisma.finance_config.findUnique({
    where: { workspace_id_ano: { workspace_id: WORKSPACE_ID, ano: ANO } },
    select: { percentual_dlr_socio: true, percentual_reinvestimento: true, formula_previdencia: true },
  })

  const configBase = {
    aliquota_simples: toDecimalAliq(fat.aliquota_simples ?? empresa?.aliquota_simples ?? 8),
    percentual_dlr_socio: finConfig?.percentual_dlr_socio ?? 0.5,
    percentual_reinvestimento: finConfig?.percentual_reinvestimento ?? 0.5,
    formula_previdencia: finConfig?.formula_previdencia ?? 'PRO_LABORE*0.20+LUCRO_BRUTO*0.11',
    dias_no_mes: fat.dias_no_mes ?? 30,
    meta_mes: fat.meta_mes ?? 0,
    dlr_modo: (fat.dlr_modo as 'PERCENTUAL' | 'FIXO') ?? 'PERCENTUAL',
    dlr_percentual_custom: fat.dlr_percentual_custom ?? undefined,
    dlr_valor_fixo: fat.dlr_valor_fixo ?? undefined,
    das_valor_real: fat.das_status === 'PAGO' ? fat.das_valor_real : null,
  }

  const PEDIDOS_RE = /(\d+)\s+pedidos?/i
  let total_pedidos = 0
  lancamentosDB.forEach(l => {
    if (l.tipo === 'RECEITA' && l.canal) {
      const m = l.descricao.match(PEDIDOS_RE)
      if (m) total_pedidos += parseInt(m[1])
    }
  })
  if (total_pedidos > 0) (configBase as any).total_pedidos = total_pedidos

  const kpisAntes = calcularKPIs(lancamentosDB as any, configBase as any)

  console.log('=== ANTES DA MIGRAÇÃO (tipos atuais do banco) ===')
  console.log(`  receita_total   = ${br(kpisAntes.receita_total)}`)
  console.log(`  desp_tarifas    = ${br(kpisAntes.desp_tarifas)}`)
  console.log(`  das_valor_calc  = ${br(kpisAntes.das_valor_calc)}`)
  console.log(`  lucro_bruto     = ${br(kpisAntes.lucro_bruto)}`)
  console.log(`  lucro_liquido   = ${br(kpisAntes.lucro_liquido)}`)
  console.log(`  receita_outros  = ${br(kpisAntes.receita_outros)}`)
  console.log()

  // ── Simula migração em memória ────────────────────────────────────────────
  const lancamentosSimulados = lancamentosDB.map(l => {
    if (
      l.tipo === 'RECEITA' &&
      l.categoria === 'OUTRO_CANAL' &&
      l.descricao === 'ML Import — Estornos e Cancelamentos de Tarifas'
    ) {
      return { ...l, tipo: 'RECUPERACAO_DESPESA', categoria: 'TARIFAS', canal: 'MERCADO_LIVRE' }
    }
    return l
  })

  const estornos = lancamentosDB.filter(
    l => l.tipo === 'RECEITA' && l.descricao === 'ML Import — Estornos e Cancelamentos de Tarifas'
  )
  console.log(`Estornos simulados como RECUPERACAO_DESPESA: ${estornos.length} linha(s)`)
  for (const e of estornos) {
    console.log(`  id=${e.id}  valor=${e.valor.toFixed(2)}`)
  }
  console.log()

  const kpisDepois = calcularKPIs(lancamentosSimulados as any, configBase as any)

  // ── Resultado e comparação ────────────────────────────────────────────────
  console.log('=== APÓS MIGRAÇÃO (simulado em memória) — COMPARAÇÃO COM ESPERADO ===')
  console.log()
  let todos_ok = true
  todos_ok = check('Faturamento bruto',    kpisDepois.receita_total,  ESPERADO.receita_total)  && todos_ok
  todos_ok = check('Tarifas Mkt (total)',  kpisDepois.desp_tarifas,   ESPERADO.desp_tarifas)   && todos_ok
  todos_ok = check('DAS',                 kpisDepois.das_valor_calc,  ESPERADO.das_valor_calc) && todos_ok
  todos_ok = check('Lucro bruto',         kpisDepois.lucro_bruto,     ESPERADO.lucro_bruto)    && todos_ok
  todos_ok = check('Lucro líquido',       kpisDepois.lucro_liquido,   ESPERADO.lucro_liquido)  && todos_ok
  todos_ok = check('Receita "Outros"',    kpisDepois.receita_outros,  ESPERADO.receita_outros) && todos_ok
  console.log()

  // Tarifas de Venda ML: desp_tarifas total inclui outras tarifas além das ML
  // Reportar o componente ML separado (desp_fatura_ml é o canal ML especificamente)
  // O valor 5501,51 é a tarifa líquida ML = tarifa_bruta - estorno
  const tarifaBrutaML = lancamentosDB
    .filter(l => l.tipo === 'DESPESA_VARIAVEL' && l.categoria === 'TARIFAS' && l.descricao.includes('ML Import'))
    .reduce((s, l) => s + l.valor, 0)
  const estornoML = estornos.reduce((s, l) => s + l.valor, 0)
  console.log(`  Tarifa bruta ML (DESPESA_VARIAVEL/Tarifa de venda): ${br(tarifaBrutaML)}`)
  console.log(`  Estorno ML (simulado como RECUPERACAO_DESPESA):    -${br(estornoML)}`)
  console.log(`  Tarifas de Venda ML líquidas:                       ${br(tarifaBrutaML - estornoML)}`)
  console.log(`  Esperado:                                           R$ 5.501,51`)
  console.log()

  if (todos_ok) {
    console.log('RESULTADO: TODOS OS VALORES CONFEREM ✓')
    console.log('A migração pode ser executada com --execute após aprovação.')
  } else {
    console.log('RESULTADO: DIVERGÊNCIA ENCONTRADA — verifique os itens com ✗ acima.')
  }

  await prisma.$disconnect()
}

main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1) })
