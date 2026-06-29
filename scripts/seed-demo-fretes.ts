import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// Padrão sazonal realista de frete marítimo da China → Brasil ($/kg)
// Jan-Fev: alto (pós-Ano Novo Chinês)
// Mar-Jun: queda gradual (off-season)
// Jul-Set: subida moderada (pré-natalino)
// Out-Dez: pico (temporada de Natal / Black Friday)
const SAZONALIDADE_MAR: Record<number, number> = {
  1: 4.80,  // Jan — alto (recuperação pós-CNY)
  2: 5.10,  // Fev — pico CNY
  3: 3.90,  // Mar — queda
  4: 3.20,  // Abr — mínima
  5: 3.10,  // Mai — mínima
  6: 3.30,  // Jun — leve alta
  7: 3.80,  // Jul — subindo
  8: 4.20,  // Ago — subindo
  9: 4.60,  // Set — pré-natalino
  10: 5.40, // Out — alta temporada
  11: 6.20, // Nov — pico Black Friday
  12: 6.80, // Dez — pico Natal
}

const SAZONALIDADE_AER: Record<number, number> = {
  1: 9.50,
  2: 10.80,
  3: 8.20,
  4: 7.50,
  5: 7.20,
  6: 7.80,
  7: 8.50,
  8: 9.00,
  9: 9.80,
  10: 11.50,
  11: 13.20,
  12: 14.00,
}

// Variação aleatória ±10%
function vary(base: number, factor = 0.10): number {
  return +(base * (1 + (Math.random() * 2 - 1) * factor)).toFixed(2)
}

// Lotes: mistura de marítimo e aéreo por mês
// Marítimo: lotes grandes mensais ou bimestrais
// Aéreo: lotes pequenos pontuais (não todo mês)
interface Lote {
  mes: number
  ano: number
  modal: 'MARITIMO' | 'AEREO'
  pesoKg: number
  cbm: number | null
  freteUsd: number
  cambio: number
  origem: string
  notas?: string
}

const LOTES: Lote[] = [
  // ── 2024 ──────────────────────────────────────────────────────
  { mes: 6,  ano: 2024, modal: 'MARITIMO', pesoKg: 310, cbm: 2.1,  freteUsd: 0, cambio: 5.10, origem: 'Guangzhou' },
  { mes: 8,  ano: 2024, modal: 'MARITIMO', pesoKg: 420, cbm: 2.8,  freteUsd: 0, cambio: 5.25, origem: 'Guangzhou' },
  { mes: 8,  ano: 2024, modal: 'AEREO',    pesoKg: 45,  cbm: null, freteUsd: 0, cambio: 5.25, origem: 'Yiwu', notas: 'Reposição urgente anti-ronco' },
  { mes: 10, ano: 2024, modal: 'MARITIMO', pesoKg: 380, cbm: 2.5,  freteUsd: 0, cambio: 5.45, origem: 'Guangzhou', notas: 'Lote pré-natal' },
  { mes: 11, ano: 2024, modal: 'AEREO',    pesoKg: 60,  cbm: null, freteUsd: 0, cambio: 5.80, origem: 'Shenzhen', notas: 'Black Friday — urgente' },
  { mes: 12, ano: 2024, modal: 'MARITIMO', pesoKg: 290, cbm: 1.9,  freteUsd: 0, cambio: 6.10, origem: 'Guangzhou', notas: 'Pico de Natal — frete caro' },

  // ── 2025 ──────────────────────────────────────────────────────
  { mes: 1,  ano: 2025, modal: 'MARITIMO', pesoKg: 350, cbm: 2.3,  freteUsd: 0, cambio: 6.05, origem: 'Guangzhou', notas: 'Pós Ano Novo Chinês' },
  { mes: 2,  ano: 2025, modal: 'AEREO',    pesoKg: 38,  cbm: null, freteUsd: 0, cambio: 5.95, origem: 'Yiwu', notas: 'CNY — frete aéreo no pico' },
  { mes: 3,  ano: 2025, modal: 'MARITIMO', pesoKg: 480, cbm: 3.2,  freteUsd: 0, cambio: 5.75, origem: 'Guangzhou', notas: 'Melhor período do ano' },
  { mes: 4,  ano: 2025, modal: 'MARITIMO', pesoKg: 520, cbm: 3.5,  freteUsd: 0, cambio: 5.70, origem: 'Guangzhou' },
  { mes: 5,  ano: 2025, modal: 'MARITIMO', pesoKg: 390, cbm: 2.6,  freteUsd: 0, cambio: 5.65, origem: 'Guangzhou' },
  { mes: 5,  ano: 2025, modal: 'AEREO',    pesoKg: 42,  cbm: null, freteUsd: 0, cambio: 5.65, origem: 'Shenzhen', notas: 'Reposição rápida' },
  { mes: 6,  ano: 2025, modal: 'MARITIMO', pesoKg: 360, cbm: 2.4,  freteUsd: 0, cambio: 5.72, origem: 'Guangzhou' },
  { mes: 7,  ano: 2025, modal: 'MARITIMO', pesoKg: 410, cbm: 2.7,  freteUsd: 0, cambio: 5.80, origem: 'Guangzhou' },
  { mes: 8,  ano: 2025, modal: 'MARITIMO', pesoKg: 445, cbm: 3.0,  freteUsd: 0, cambio: 5.88, origem: 'Guangzhou', notas: 'Subindo para Q4' },
  { mes: 8,  ano: 2025, modal: 'AEREO',    pesoKg: 55,  cbm: null, freteUsd: 0, cambio: 5.88, origem: 'Yiwu' },
  { mes: 9,  ano: 2025, modal: 'MARITIMO', pesoKg: 370, cbm: 2.5,  freteUsd: 0, cambio: 5.95, origem: 'Guangzhou' },
  { mes: 10, ano: 2025, modal: 'MARITIMO', pesoKg: 400, cbm: 2.7,  freteUsd: 0, cambio: 6.05, origem: 'Guangzhou', notas: 'Pré Black Friday' },
  { mes: 11, ano: 2025, modal: 'AEREO',    pesoKg: 70,  cbm: null, freteUsd: 0, cambio: 6.20, origem: 'Shenzhen', notas: 'Black Friday urgente' },
  { mes: 11, ano: 2025, modal: 'MARITIMO', pesoKg: 320, cbm: 2.1,  freteUsd: 0, cambio: 6.20, origem: 'Guangzhou' },
  { mes: 12, ano: 2025, modal: 'MARITIMO', pesoKg: 280, cbm: 1.8,  freteUsd: 0, cambio: 6.30, origem: 'Guangzhou', notas: 'Pico Natal — frete no máximo' },

  // ── 2026 ──────────────────────────────────────────────────────
  { mes: 1,  ano: 2026, modal: 'MARITIMO', pesoKg: 490, cbm: 3.3,  freteUsd: 0, cambio: 6.20, origem: 'Guangzhou' },
  { mes: 2,  ano: 2026, modal: 'AEREO',    pesoKg: 48,  cbm: null, freteUsd: 0, cambio: 6.10, origem: 'Yiwu', notas: 'CNY 2026' },
  { mes: 3,  ano: 2026, modal: 'MARITIMO', pesoKg: 530, cbm: 3.6,  freteUsd: 0, cambio: 5.90, origem: 'Guangzhou', notas: 'Baixa temporada — maior lote' },
  { mes: 4,  ano: 2026, modal: 'MARITIMO', pesoKg: 510, cbm: 3.4,  freteUsd: 0, cambio: 5.82, origem: 'Guangzhou' },
  { mes: 5,  ano: 2026, modal: 'MARITIMO', pesoKg: 460, cbm: 3.1,  freteUsd: 0, cambio: 5.78, origem: 'Guangzhou' },
  { mes: 6,  ano: 2026, modal: 'MARITIMO', pesoKg: 312, cbm: 2.1,  freteUsd: 0, cambio: 5.40, origem: 'Guangzhou', notas: 'Lote Jun/2026 — demo' },
]

// Preencher freteUsd com base na sazonalidade
for (const lote of LOTES) {
  const base = lote.modal === 'MARITIMO'
    ? SAZONALIDADE_MAR[lote.mes] * lote.pesoKg
    : SAZONALIDADE_AER[lote.mes] * lote.pesoKg
  lote.freteUsd = +vary(base, 0.08).toFixed(2)
}

async function main() {
  const ws = await p.workspace.findFirst({ where: { slug: 'nacao-import-demo' } })
  if (!ws) { console.error('❌ Workspace demo não encontrado'); return }

  // Limpar histórico existente (sem vínculo com rateio)
  await p.frete_historico.deleteMany({ where: { workspace_id: ws.id, rateio_id: null } })
  console.log('🗑  Histórico anterior limpo')

  let criados = 0
  for (const lote of LOTES) {
    const frete_brl = lote.freteUsd * lote.cambio
    const custo_kg_usd = +(lote.freteUsd / lote.pesoKg).toFixed(4)
    const custo_cbm_usd = lote.cbm ? +(lote.freteUsd / lote.cbm).toFixed(2) : null
    const data_embarque = new Date(lote.ano, lote.mes - 1, 10) // dia 10 do mês

    await p.frete_historico.create({
      data: {
        workspace_id: ws.id,
        modal: lote.modal,
        origem: lote.origem,
        data_embarque,
        peso_kg: lote.pesoKg,
        cbm: lote.cbm,
        frete_usd: lote.freteUsd,
        cambio: lote.cambio,
        frete_brl,
        custo_kg_usd,
        custo_cbm_usd,
        notas: lote.notas ?? null,
      },
    })

    const modal = lote.modal === 'MARITIMO' ? '🚢' : '✈️'
    console.log(`${modal} ${String(lote.mes).padStart(2,'0')}/${lote.ano} — ${lote.pesoKg}kg — $${custo_kg_usd.toFixed(2)}/kg — $${lote.freteUsd.toFixed(0)} total`)
    criados++
  }

  console.log(`\n✅ ${criados} registros de frete criados na conta demo`)

  // Resumo por mês (sazonalidade marítima)
  console.log('\n📊 Sazonalidade marítima seedada:')
  for (const [mes, base] of Object.entries(SAZONALIDADE_MAR)) {
    const bar = '█'.repeat(Math.round(base / 0.5))
    console.log(`  ${String(mes).padStart(2,'0')}: $${base.toFixed(2)}/kg ${bar}`)
  }

  await p.$disconnect()
}

main().catch(e => { console.error('❌', e); process.exit(1) })
