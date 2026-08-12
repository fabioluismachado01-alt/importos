/**
 * Passo 3 da sequência: ler os 7 KPIs de julho/2026 DO BANCO depois do reimporte.
 * Rode após zerizar e reimportar pela UI.
 *
 * Uso: node scripts/ler-kpis-julho.cjs
 */
const { Client } = require('pg')
const c = new Client({ connectionString: 'postgresql://postgres:FabioLuis%2302@db.awajdpidhzzgxfmssfef.supabase.co:5432/postgres' })

async function main() {
  await c.connect()

  const { rows } = await c.query(`
    SELECT
      fm.receita_total,
      fm.receita_outros,
      fm.desp_tarifas,
      fm.das_valor_calc,
      fm.das_valor_real,
      fm.das_status,
      fm.lucro_bruto,
      fm.desp_previdencia_privada,
      fm.lucro_liquido
    FROM faturamento_mes fm
    WHERE fm.workspace_id = 'cmpx6dq5k000fvckk6d1aknfq'
      AND fm.ano = 2026 AND fm.mes = 7
  `)
  if (!rows.length) { console.error('julho/2026 não encontrado'); process.exit(1) }
  const r = rows[0]

  // Tarifas de Venda ML: bruta − estorno (lida dos lançamentos)
  const { rows: lancs } = await c.query(`
    SELECT tipo, categoria, canal, valor, descricao
    FROM lancamento l
    JOIN faturamento_mes fm ON fm.id = l.faturamento_id
    WHERE fm.workspace_id = 'cmpx6dq5k000fvckk6d1aknfq'
      AND fm.ano = 2026 AND fm.mes = 7
      AND l.status = 'CONFIRMADO'
    ORDER BY l.tipo, l.categoria
  `)

  const tarifaBrutaML = lancs
    .filter(l => l.tipo === 'DESPESA_VARIAVEL' && l.categoria === 'TARIFAS' && l.descricao.includes('ML Import'))
    .reduce((s, l) => s + parseFloat(l.valor), 0)
  const estornoML = lancs
    .filter(l => l.tipo === 'RECUPERACAO_DESPESA' && l.descricao.includes('ML Import'))
    .reduce((s, l) => s + parseFloat(l.valor), 0)

  const ALVO = {
    receita_total:          88828.32,
    desp_tarifas:           9998.81,
    das_valor_calc:         6262.40,
    lucro_bruto:            15089.06,
    desp_previdencia_privada: 1659.80,
    lucro_liquido:          13429.26,
    receita_outros:         0,
    tarifas_venda_ml_liq:   5501.51,
  }

  function fmt(v) { return 'R$ ' + parseFloat(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) }
  function chk(label, real, esp) {
    const diff = Math.abs(real - esp)
    const ok = diff <= 0.02
    console.log(`  ${ok ? '✓' : '✗'}  ${label.padEnd(30)} alvo=${fmt(esp)}   obtido=${fmt(real)}${ok ? '' : `  ← DIFF ${diff.toFixed(4)}`}`)
    return ok
  }

  console.log('=== KPIs JULHO/2026 — PÓS-REIMPORTE (valores do banco) ===')
  console.log()
  console.log('Lançamentos ML encontrados:')
  for (const l of lancs.filter(x => x.descricao.includes('ML Import') || x.canal === 'MERCADO_LIVRE')) {
    console.log(`  [${l.tipo.padEnd(22)}|${(l.canal ?? l.categoria).padEnd(15)}] R$${parseFloat(l.valor).toFixed(2).padStart(10)}  "${l.descricao}"`)
  }
  console.log()

  let ok = true
  ok = chk('Faturamento bruto',     parseFloat(r.receita_total), ALVO.receita_total)  && ok
  ok = chk('Tarifas Venda ML líq.', tarifaBrutaML - estornoML,  ALVO.tarifas_venda_ml_liq) && ok
  ok = chk('Tarifas Mkt (total)',   parseFloat(r.desp_tarifas), ALVO.desp_tarifas)   && ok
  ok = chk('DAS',                   parseFloat(r.das_valor_calc),ALVO.das_valor_calc) && ok
  ok = chk('Lucro bruto',           parseFloat(r.lucro_bruto),  ALVO.lucro_bruto)    && ok
  ok = chk('Previdência',           parseFloat(r.desp_previdencia_privada), ALVO.desp_previdencia_privada) && ok
  ok = chk('Lucro líquido',         parseFloat(r.lucro_liquido),ALVO.lucro_liquido)  && ok
  ok = chk('Receita "Outros"',      parseFloat(r.receita_outros),ALVO.receita_outros) && ok

  console.log()
  console.log(`DAS status: ${r.das_status}  |  das_valor_real: ${r.das_valor_real ?? 'null'}`)
  console.log()

  // Análise por Canal — ML: despesas = var+fixa com 'ML Import' − RECUPERACAO_DESPESA com 'ML Import'
  const despML = lancs
    .filter(l => (l.tipo === 'DESPESA_VARIAVEL' || l.tipo === 'DESPESA_FIXA') && l.descricao.includes('ML Import'))
    .reduce((s, l) => s + parseFloat(l.valor), 0)
  const credML = lancs
    .filter(l => l.tipo === 'RECUPERACAO_DESPESA' && l.descricao.includes('ML Import'))
    .reduce((s, l) => s + parseFloat(l.valor), 0)
  const recML = lancs
    .filter(l => l.tipo === 'RECEITA' && l.canal === 'MERCADO_LIVRE')
    .reduce((s, l) => s + parseFloat(l.valor), 0)
  const lucroML = recML - despML + credML

  console.log('Análise por Canal — Mercado Livre:')
  console.log(`  Receita:  ${fmt(recML)}`)
  console.log(`  Despesas: -${fmt(despML)}  (var+fixa, descrição contém "ML Import")`)
  console.log(`  Créditos: +${fmt(credML)}  (RECUPERACAO_DESPESA, descrição contém "ML Import")`)
  console.log(`  Lucro ML: ${fmt(lucroML)}`)
  console.log()
  console.log(ok ? 'RESULTADO: TODOS OS VALORES CONFEREM ✓' : 'RESULTADO: DIVERGÊNCIA — veja itens com ✗')

  await c.end()
}

main().catch(e => { console.error(e); c.end() })
