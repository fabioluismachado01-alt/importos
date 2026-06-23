/**
 * Migração: SQLite → Supabase (PostgreSQL)
 * Converte timestamps de milissegundos para ISO Date
 * Executa: node prisma/migrar-dados.js
 */

const Database = require('better-sqlite3')
const { Pool } = require('pg')

const DB_PATH = 'C:/Users/fabio/Documents/Claude/Mentoria/importos/prisma/prisma/dev.db'
const PG_URL  = 'postgresql://postgres:FabioLuis%2302@db.awajdpidhzzgxfmssfef.supabase.co:5432/postgres'

const sqlite = new Database(DB_PATH, { readonly: true })
const pg = new Pool({ connectionString: PG_URL, ssl: { rejectUnauthorized: false } })

function rows(table) {
  return sqlite.prepare(`SELECT * FROM "${table}"`).all()
}

// Converte timestamps numéricos (ms) para Date
function convertRow(row) {
  const out = {}
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'number' && v > 1_000_000_000_000) {
      // parece timestamp em milissegundos
      out[k] = new Date(v).toISOString()
    } else if (v === null || v === undefined) {
      out[k] = null
    } else {
      out[k] = v
    }
  }
  return out
}

async function upsert(table, data, conflictCol = 'id') {
  if (!data.length) return
  const cols = Object.keys(convertRow(data[0]))
  const colsStr = cols.map(c => `"${c}"`).join(', ')
  let ok = 0, fail = 0
  for (const rawRow of data) {
    const row = convertRow(rawRow)
    const vals = cols.map(c => row[c] === undefined ? null : row[c])
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ')
    try {
      await pg.query(
        `INSERT INTO "${table}" (${colsStr}) VALUES (${placeholders}) ON CONFLICT ("${conflictCol}") DO NOTHING`,
        vals
      )
      ok++
    } catch (e) {
      fail++
      if (fail <= 2) console.log(`  ⚠️  ${table}: ${e.message.slice(0, 100)}`)
    }
  }
  console.log(`  ✅ ${table}: ${ok} inseridos${fail ? `, ${fail} falhas` : ''}`)
}

async function main() {
  console.log('🚀 Iniciando migração SQLite → Supabase...\n')

  const tables = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all()
  console.log('📋 Tabelas:', tables.map(t => t.name).join(', '), '\n')

  // Ordem respeitando foreign keys
  const ordem = [
    'workspace',
    'empresa',
    'user',
    'workspace_membro',
    'sessao',
    'aliquota_historico',
    'aliquota_config',
    'canal',
    'ml_conexao',
    'produto_catalogo',
    'ml_pedido',
    'ml_estoque',
    'ml_analise_relatorio',
    'ml_analise_sku',
    'faturamento_mes',
    'lancamento',
    'historico_faturamento_anual',
    'das',
    'despesa_fixa_template',
    'socio_config',
    'simulacao',
    'simulacao_params',
    'simulacao_item',
    'calculadora_canal',
    'calculadora_marketplace',
    'rateio',
    'rateio_item',
    'finance_config',
    'fornecedor',
    'invoice',
    'invoice_item',
    'invoice_servico',
    'relatorio_marketplace',
    'comentario',
  ]

  for (const table of ordem) {
    const existe = tables.find(t => t.name === table)
    if (!existe) continue
    const data = rows(table)
    if (!data.length) { console.log(`  ⏭️  ${table}: vazia`) ; continue }
    console.log(`📤 ${table} (${data.length} registros)...`)
    await upsert(table, data)
  }

  // Restantes não listadas
  const feitas = new Set(ordem)
  for (const { name } of tables) {
    if (feitas.has(name) || name.startsWith('_')) continue
    const data = rows(name)
    if (!data.length) continue
    console.log(`📤 ${name} (${data.length} registros)...`)
    await upsert(name, data)
  }

  console.log('\n🎉 Migração concluída! Seus dados estão no Supabase em São Paulo.')
}

main()
  .catch(e => { console.error('\n❌ Erro:', e.message) ; process.exit(1) })
  .finally(async () => { sqlite.close() ; await pg.end() })
