/**
 * Cria faturamento_mes para Jul-Dez/2025 que não existem no DB.
 * Usa as mesmas proporções de CMV/despesas de Jul/2026 (empresa consistente)
 * e distribui a receita por canal com a mesma mix (51/22/10/9/6/2%).
 */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

const MESES_HISTORICO = [
  { ano: 2025, mes:  7, fat: 318_000 },
  { ano: 2025, mes:  8, fat: 324_000 },
  { ano: 2025, mes:  9, fat: 330_000 },
  { ano: 2025, mes: 10, fat: 335_000 },
  { ano: 2025, mes: 11, fat: 328_000 },
  { ano: 2025, mes: 12, fat: 310_000 },
]

// Proporções de Jul/2026 (base coerente)
const CMV_PCT  = 230_000 / 380_000   // 60.53%
const DESP_PCT = 82_000  / 380_000   // 21.58%
const ALIQ_EF  = 0.097805            // Simples 9.78%

const CANAIS = [
  { canal: 'ML Import', descPfx: '[ML] Receita Mercado Livre',  field: 'receita_ml',     pct: 0.51, taxa: 0.165 },
  { canal: '[Shopee]',  descPfx: '[Shopee] Receita Shopee',     field: 'receita_shopee',  pct: 0.22, taxa: 0.120 },
  { canal: '[Amazon]',  descPfx: '[Amazon] Receita Amazon',     field: 'receita_amazon',  pct: 0.10, taxa: 0.150 },
  { canal: '[Magalu]',  descPfx: '[Magalu] Receita Magalu',     field: 'receita_magalu',  pct: 0.09, taxa: 0.140 },
  { canal: '[TikTok]',  descPfx: '[TikTok] Receita TikTok Shop',field: 'receita_tiktok',  pct: 0.06, taxa: 0.065 },
  { canal: '[Avulsas]', descPfx: '[Avulsas] Vendas Avulsas',    field: 'receita_outros',  pct: 0.02, taxa: 0.000 },
]

// Despesas fixas aproximadas (proporcionais + pequena variação sazonal)
function calcDesp(fat: number) {
  const base = fat * DESP_PCT
  return {
    desp_armazenagem:          Math.round(base * 0.110 / 100) * 100,
    desp_ads_ml:               Math.round(fat * 0.018 / 100) * 100,
    desp_ads_outros:           Math.round(fat * 0.007 / 100) * 100,
    desp_tarifas:              Math.round(fat * 0.020 / 100) * 100,
    desp_frete:                Math.round(base * 0.156 / 100) * 100,
    desp_fatura_ml:            0,
    desp_outras_taxas:         Math.round(base * 0.043 / 100) * 100,
    desp_pro_labore:           18_000,
    desp_inss:                 2_376,
    desp_contabilidade:        3_200,
    desp_erp:                  649,
    desp_emprestimo:           0,
    desp_aluguel:              12_000,
    desp_pagina_ml:            399,
    desp_previdencia_privada:  0,
    desp_fixas_outras:         2_976,
  }
}

async function main() {
  const ws = await p.workspace.findUnique({ where: { slug: 'nacao-import-demo' } })
  if (!ws) throw new Error('Workspace não encontrado')

  const emp = await p.empresa.findUnique({ where: { workspace_id: ws.id } })
  const conexao = await p.ml_conexao.findFirst({ where: { workspace_id: ws.id } })

  for (const { ano, mes, fat } of MESES_HISTORICO) {
    // Verifica se já existe
    const exists = await p.faturamento_mes.findUnique({
      where: { workspace_id_ano_mes: { workspace_id: ws.id, ano, mes } }
    })
    if (exists) { console.log(`  → ${mes}/${ano}: já existe, pulando`); continue }

    const cmv = Math.round(fat * CMV_PCT / 100) * 100
    const desp = calcDesp(fat)
    const totalDesp = Object.values(desp).reduce((s, v) => s + v, 0)
    const lucro_bruto = fat - cmv - totalDesp
    const das = parseFloat((fat * ALIQ_EF).toFixed(2))
    const lucro_liquido = parseFloat((lucro_bruto - das).toFixed(2))

    // Receita por canal (arredondada, ultimo absorve resto)
    const canalValores: { canal: typeof CANAIS[0]; valor: number }[] = []
    let restante = fat
    for (let i = 0; i < CANAIS.length - 1; i++) {
      const v = Math.round(fat * CANAIS[i].pct / 100) * 100
      canalValores.push({ canal: CANAIS[i], valor: v })
      restante -= v
    }
    canalValores.push({ canal: CANAIS[CANAIS.length - 1], valor: Math.max(0, restante) })

    const receitaFields = Object.fromEntries(
      canalValores.map(({ canal, valor }) => [canal.field, valor])
    )

    const diasUteis = 22
    const ticket = 280
    const numVendas = Math.round(fat / ticket / diasUteis)

    const fatMes = await p.faturamento_mes.create({
      data: {
        workspace_id: ws.id,
        ano,
        mes,
        receita_total: fat,
        ...receitaFields,
        receita_casas_bahia: 0,
        receita_presencial: 0,
        desp_custo_produtos: cmv,
        ...desp,
        aliquota_simples: parseFloat((ALIQ_EF * 100).toFixed(4)),
        das_valor_calc: das,
        das_status: 'PENDENTE',
        lucro_bruto,
        lucro_liquido,
        meta_mes: Math.round(fat * 1.08 / 1000) * 1000,
        dias_no_mes: new Date(ano, mes, 0).getDate(),
        dias_com_venda: diasUteis,
        ticket_medio: ticket,
        fechado: true, // meses passados estão fechados
      }
    })

    // Cria lançamentos de receita por canal
    const dia15 = new Date(ano, mes - 1, 15)
    for (const { canal, valor } of canalValores) {
      if (valor <= 0) continue
      await p.lancamento.create({
        data: {
          faturamento_id: fatMes.id,
          tipo: 'RECEITA',
          categoria: 'RECEITA_MARKETPLACE',
          canal: canal.canal,
          descricao: canal.descPfx,
          valor,
          data: dia15,
          status: 'CONFIRMADO',
          e_fixo: false,
        }
      })
    }

    // Cria lançamentos de despesas fixas principais
    const despFixas = [
      { cat: 'PRO_LABORE', desc: 'Pró-labore — Carlos Mendes', val: 9_000 },
      { cat: 'PRO_LABORE', desc: 'Pró-labore — Fernanda Costa', val: 9_000 },
      { cat: 'INSS',       desc: 'INSS Sócios', val: 2_376 },
      { cat: 'CONTABILIDADE', desc: 'Contabilidade Mensal', val: 3_200 },
      { cat: 'ERP',        desc: 'ImportOS — Licença Mensal', val: 649 },
      { cat: 'ALUGUEL',    desc: 'Aluguel galpão logístico', val: 12_000 },
    ]
    for (const df of despFixas) {
      await p.lancamento.create({
        data: {
          faturamento_id: fatMes.id,
          tipo: 'DESPESA_FIXA',
          categoria: df.cat,
          descricao: df.desc,
          valor: df.val,
          data: new Date(ano, mes - 1, 5),
          status: 'CONFIRMADO',
          e_fixo: true,
        }
      })
    }

    console.log(`  ✓ ${String(mes).padStart(2,'0')}/${ano}: R$${fat.toLocaleString('pt-BR')} | CMV ${(cmv/fat*100).toFixed(1)}% | lucro_liq: R$${lucro_liquido.toFixed(0)} | DAS: R$${das.toFixed(0)}`)
  }

  console.log('\n✅ Histórico Jul-Dez/2025 criado!')

  // Resumo final de todos os meses
  const todos = await p.faturamento_mes.findMany({
    where: { workspace_id: ws.id },
    orderBy: [{ ano: 'asc' }, { mes: 'asc' }],
  })
  console.log('\n══ TODOS OS MESES ═══════════════════════════════════')
  for (const m of todos) {
    const lancRec = await p.lancamento.count({ where: { faturamento_id: m.id, tipo: 'RECEITA' } })
    console.log(`  ${String(m.mes).padStart(2,'0')}/${m.ano} | R$${m.receita_total.toLocaleString('pt-BR')} | lucro: R$${m.lucro_liquido.toFixed(0)} | ${lancRec} lançamentos receita ${m.fechado ? '🔒' : '📝'}`)
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1) }).finally(() => p.$disconnect())
