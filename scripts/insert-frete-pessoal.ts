import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

async function main() {
  const user = await p.user.findFirst({
    where: { email: 'namavestore@gmail.com' },
    include: { membros: { include: { workspace: true } } },
  })
  const ws = user?.membros.find(m => m.workspace.slug === 'minha-operacao')?.workspace
  if (!ws) { console.error('❌ Workspace minha-operacao não encontrado'); return }
  console.log(`✅ Workspace: ${ws.nome}`)

  const fretes = [
    {
      modal: 'AEREO',
      data_embarque: new Date('2024-09-03'),
      peso_kg: 10,
      cbm: null,
      frete_usd: 193.80,
      cambio: 5.44,
      notas: 'DHL — importação simplificada',
      origem: null,
    },
    {
      modal: 'AEREO',
      data_embarque: new Date('2024-09-30'),
      peso_kg: 27,
      cbm: null,
      frete_usd: 302.28,
      cambio: 5.44,
      notas: 'DHL — importação simplificada',
      origem: null,
    },
  ]

  for (const f of fretes) {
    const frete_brl = f.frete_usd * f.cambio
    const custo_kg_usd = f.frete_usd / f.peso_kg
    const custo_cbm_usd = f.cbm ? f.frete_usd / f.cbm : null

    await p.frete_historico.create({
      data: {
        workspace_id: ws.id,
        modal: f.modal,
        origem: f.origem,
        data_embarque: f.data_embarque,
        peso_kg: f.peso_kg,
        cbm: f.cbm,
        frete_usd: f.frete_usd,
        cambio: f.cambio,
        frete_brl,
        custo_kg_usd,
        custo_cbm_usd,
        notas: f.notas,
      },
    })

    const icon = f.modal === 'AEREO' ? '✈️' : '🚢'
    console.log(`${icon} ${f.data_embarque.toLocaleDateString('pt-BR')} — ${f.peso_kg}kg — $${custo_kg_usd.toFixed(2)}/kg — $${f.frete_usd} total — R$${frete_brl.toFixed(2)}`)
  }

  console.log(`\n✅ ${fretes.length} frete(s) inserido(s) na conta ${ws.nome}`)
  await p.$disconnect()
}

main().catch(e => { console.error('❌', e); process.exit(1) })
