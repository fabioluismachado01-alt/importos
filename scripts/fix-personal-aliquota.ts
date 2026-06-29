import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

async function main() {
  const ws = await p.workspace.findFirst({ where: { slug: { not: 'nacao-import-demo' } } })
  if (!ws) { console.log('Nenhuma workspace pessoal'); return }
  console.log(`Workspace: ${ws.nome} (${ws.slug})`)

  const emp = await p.empresa.findUnique({ where: { workspace_id: ws.id }, select: { aliquota_simples: true } })
  console.log('aliquota_simples atual:', emp?.aliquota_simples)

  const hist = await p.aliquota_historico.findMany({ where: { workspace_id: ws.id }, orderBy: [{ ano: 'desc' }, { mes: 'desc' }], take: 5 })
  console.log('historico aliquota (últimos 5):', hist.map(h => `${h.mes}/${h.ano}: ${h.aliquota}`))

  // Se aliquota_simples está como decimal (< 1), corrigir para porcentagem
  const aliq = emp?.aliquota_simples ?? 0
  if (aliq < 1 && aliq > 0) {
    const novaAliq = aliq * 100
    await p.empresa.update({ where: { workspace_id: ws.id }, data: { aliquota_simples: novaAliq } })
    console.log(`✅ aliquota_simples corrigida: ${aliq} → ${novaAliq}%`)

    // Corrigir histórico também
    for (const h of hist) {
      if (h.aliquota < 1) {
        await p.aliquota_historico.update({ where: { id: h.id }, data: { aliquota: h.aliquota * 100 } })
        console.log(`✅ historico ${h.mes}/${h.ano}: ${h.aliquota} → ${h.aliquota * 100}%`)
      }
    }
  } else {
    console.log('✅ Alíquota já está em formato de porcentagem, nenhuma correção necessária')
  }

  await p.$disconnect()
}

main().catch(e => { console.error('❌', e); process.exit(1) })
