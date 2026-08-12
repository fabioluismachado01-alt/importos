/**
 * MIGRAÇÃO: Estornos ML jan–jul/2026
 *
 * Converte lançamentos criados como RECEITA/OUTRO_CANAL pelo bug no salvar-analise-ml.ts
 * para RECUPERACAO_DESPESA/TARIFAS, com valor positivo (sem alteração de valor).
 *
 * MODO PADRÃO: --dry-run  → imprime antes/depois, não escreve nada.
 * MODO ESCRITA: --execute  → somente após revisão explícita.
 *
 * Uso:
 *   node scripts/migrate-estornos-ml.cjs --dry-run
 *   node scripts/migrate-estornos-ml.cjs --execute
 */

const { Client } = require('pg')

const DIRECT_URL = 'postgresql://postgres:FabioLuis%2302@db.awajdpidhzzgxfmssfef.supabase.co:5432/postgres'
const WORKSPACE_ID = 'cmpx6dq5k000fvckk6d1aknfq'

const DRY_RUN = !process.argv.includes('--execute')

async function main() {
  const client = new Client({ connectionString: DIRECT_URL })
  await client.connect()

  console.log('=== MIGRAÇÃO ESTORNOS ML ===')
  console.log(`MODO: ${DRY_RUN ? 'DRY-RUN (nenhuma escrita)' : '*** EXECUTE — ESCREVENDO NO BANCO ***'}`)
  console.log()

  // ── SELECT ANTES ─────────────────────────────────────────────────────────
  const { rows: antes } = await client.query(`
    SELECT
      l.id,
      l.tipo,
      l.categoria,
      l.descricao,
      l.valor,
      l.data,
      l.status,
      fm.ano,
      fm.mes
    FROM lancamento l
    JOIN faturamento_mes fm ON fm.id = l.faturamento_id
    WHERE fm.workspace_id = $1
      AND l.tipo = 'RECEITA'
      AND l.categoria = 'OUTRO_CANAL'
      AND l.descricao = 'ML Import — Estornos e Cancelamentos de Tarifas'
      AND fm.ano = 2026
      AND fm.mes BETWEEN 1 AND 7
    ORDER BY fm.mes, l.data
  `, [WORKSPACE_ID])

  console.log(`ANTES: ${antes.length} linha(s) encontrada(s)`)
  console.log()
  console.log('--- LINHAS A MIGRAR ---')
  for (const r of antes) {
    console.log(`  id=${r.id}  mes=${r.ano}/${String(r.mes).padStart(2,'0')}  tipo=${r.tipo}  cat=${r.categoria}  valor=${r.valor}  desc="${r.descricao}"`)
  }

  if (antes.length === 0) {
    console.log('\nNada a migrar.')
    await client.end()
    return
  }

  console.log()
  console.log('--- ALTERAÇÃO PROPOSTA ---')
  console.log('  tipo:      RECEITA        → RECUPERACAO_DESPESA')
  console.log('  categoria: OUTRO_CANAL    → TARIFAS')
  console.log('  valor:     inalterado (já positivo)')
  console.log()

  if (DRY_RUN) {
    console.log('DRY-RUN: UPDATE NÃO EXECUTADO. Rode com --execute para persistir.')
    await client.end()
    return
  }

  // ── UPDATE ────────────────────────────────────────────────────────────────
  const ids = antes.map(r => r.id)
  const { rowCount } = await client.query(`
    UPDATE lancamento
    SET tipo = 'RECUPERACAO_DESPESA',
        categoria = 'TARIFAS'
    WHERE id = ANY($1::text[])
  `, [ids])

  console.log(`UPDATE executado. Linhas afetadas: ${rowCount}`)
  console.log()

  // ── SELECT DEPOIS ─────────────────────────────────────────────────────────
  const { rows: depois } = await client.query(`
    SELECT
      l.id,
      l.tipo,
      l.categoria,
      l.descricao,
      l.valor,
      fm.ano,
      fm.mes
    FROM lancamento l
    JOIN faturamento_mes fm ON fm.id = l.faturamento_id
    WHERE l.id = ANY($1::text[])
    ORDER BY fm.mes, l.data
  `, [ids])

  console.log(`DEPOIS: ${depois.length} linha(s)`)
  for (const r of depois) {
    console.log(`  id=${r.id}  mes=${r.ano}/${String(r.mes).padStart(2,'0')}  tipo=${r.tipo}  cat=${r.categoria}  valor=${r.valor}`)
  }

  if (rowCount !== antes.length) {
    console.error(`\nATENÇÃO: esperava ${antes.length} linhas, afetou ${rowCount}. Verifique o banco.`)
  } else {
    console.log('\nMigração concluída com sucesso.')
  }

  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
