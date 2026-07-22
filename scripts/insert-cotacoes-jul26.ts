/**
 * Insere cotações de frete marítimo FCL recebidas em julho/2026.
 * DATABASE_URL="..." npx tsx scripts/insert-cotacoes-jul26.ts
 */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

async function main() {
  const user = await p.user.findFirst({
    where: { email: 'namavestore@gmail.com' },
    include: { membros: { include: { workspace: true } } },
  })
  const ws = user?.membros.find(m => m.workspace.slug === 'minha-operacao')?.workspace
  if (!ws) { console.error('❌ Workspace minha-operacao não encontrado'); return }

  const CAMBIO  = 5.82
  const PESO_KG = 26_000   // referência padrão 40' container
  const CBM_NOR = 67.0
  const CBM_HC  = 76.0
  const DATA    = new Date('2026-07-21')

  const cotacoes = [
    { tipo_container: 'FCL_40NOR', frete_usd: 3800, cbm: CBM_NOR },
    { tipo_container: 'FCL_40HC',  frete_usd: 4700, cbm: CBM_HC  },
  ]

  for (const c of cotacoes) {
    const frete_brl           = parseFloat((c.frete_usd * CAMBIO).toFixed(2))
    const custo_kg_usd        = parseFloat((c.frete_usd / PESO_KG).toFixed(4))
    const custo_cbm_usd       = parseFloat((c.frete_usd / c.cbm).toFixed(2))
    const custo_total_kg_brl  = parseFloat((frete_brl / PESO_KG).toFixed(4))
    const custo_total_cbm_brl = parseFloat((frete_brl / c.cbm).toFixed(2))

    await p.frete_historico.create({
      data: {
        workspace_id:       ws.id,
        tipo:               'COTACAO',
        tipo_container:     c.tipo_container,
        modal:              'MARITIMO',
        origem:             'Shanghai',
        data_embarque:      DATA,
        peso_kg:            PESO_KG,
        cbm:                c.cbm,
        frete_usd:          c.frete_usd,
        cambio:             CAMBIO,
        frete_brl,
        armazenagem_brl:    0,
        custo_total_brl:    frete_brl,
        custo_kg_usd,
        custo_cbm_usd,
        custo_total_kg_brl,
        custo_total_cbm_brl,
      },
    })

    console.log(`🚢 COTAÇÃO ${c.tipo_container}: $${c.frete_usd} → R$${frete_brl.toLocaleString('pt-BR')} (câmbio ${CAMBIO})`)
  }

  console.log(`\n✅ 2 cotações inseridas em ${ws.nome}`)
  await p.$disconnect()
}

main().catch(e => { console.error('❌', e); process.exit(1) })
