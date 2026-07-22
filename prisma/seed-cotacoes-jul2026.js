// Script para registrar cotações 40NOR e 40HC de julho/2026
// Uso: $env:DATABASE_URL = "<DIRECT_URL>"; node prisma/seed-cotacoes-jul2026.js

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const WORKSPACE_ID = 'cmqqz1ycp0001vcz8f4m59i7c' // Nação Import Ltda

async function main() {
  const ws = await prisma.workspace.findFirst({ where: { id: WORKSPACE_ID } })
  if (!ws) throw new Error('Workspace não encontrado: ' + WORKSPACE_ID)

  const hoje = new Date('2026-07-16')
  const peso = 26500
  const cbm = 67.50
  const cambio = 5.75
  const origem = 'Shanghai'

  const cotacoes = [
    { tipo_container: 'FCL_40NOR', frete_usd: 4000 },
    { tipo_container: 'FCL_40HC',  frete_usd: 4500 },
  ]

  for (const c of cotacoes) {
    const frete_brl = c.frete_usd * cambio
    const custo_kg_usd = c.frete_usd / peso
    const custo_cbm_usd = c.frete_usd / cbm
    const custo_total_kg_brl = frete_brl / peso
    const custo_total_cbm_brl = frete_brl / cbm

    const created = await prisma.frete_historico.create({
      data: {
        workspace_id: WORKSPACE_ID,
        modal: 'MARITIMO',
        tipo: 'COTACAO',
        tipo_container: c.tipo_container,
        origem,
        data_embarque: hoje,
        peso_kg: peso,
        cbm,
        frete_usd: c.frete_usd,
        cambio,
        frete_brl,
        armazenagem_brl: 0,
        custo_total_brl: frete_brl,
        custo_kg_usd,
        custo_cbm_usd,
        custo_total_kg_brl,
        custo_total_cbm_brl,
      },
    })
    console.log(`✅ ${c.tipo_container} $${c.frete_usd} registrado — id: ${created.id}`)
  }
}

main()
  .catch(e => { console.error('❌', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
