import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

async function main() {
  const ws = await p.workspace.findUnique({ where: { slug: 'nacao-import-demo' } })
  if (!ws) throw new Error('Workspace não encontrado')

  // Descobre modelo de lançamentos
  // @ts-ignore
  const models = Object.keys(p).filter(k => !k.startsWith('_') && !k.startsWith('$'))
  console.log('Modelos Prisma disponíveis:', models.join(', '))

  // Tenta lancamento
  try {
    // @ts-ignore
    const lans = await p.lancamento.findMany({
      where: { workspace_id: ws.id },
      orderBy: { data: 'desc' },
      take: 20
    })
    console.log(`\nlancamento: ${lans.length} registros`)
    if (lans.length > 0) {
      console.log('Campos:', Object.keys(lans[0]).join(', '))
      // Agrupado por mês
      const porMes = new Map<string, { count: number; total: number; canais: Set<string> }>()
      for (const l of lans) {
        const mes = (l.data as Date).toISOString().slice(0,7)
        if (!porMes.has(mes)) porMes.set(mes, { count: 0, total: 0, canais: new Set() })
        const m = porMes.get(mes)!
        m.count++
        m.total += l.valor ?? 0
        m.canais.add(l.canal ?? l.tipo ?? l.origem ?? 'N/A')
      }
      for (const [mes, data] of [...porMes.entries()].sort()) {
        console.log(`  ${mes}: ${data.count} lançamentos | R$${data.total.toFixed(0)} | canais: ${[...data.canais].join(', ')}`)
      }
      // Mostra 3 exemplos completos
      console.log('\nExemplos:')
      for (const l of lans.slice(0,3)) console.log(JSON.stringify(l))
    }
  } catch(e: any) { console.log('lancamento: não existe ou erro —', e.message?.slice(0,80)) }

  // Tenta faturamento_lancamento
  try {
    // @ts-ignore
    const flans = await p.faturamento_lancamento.findMany({
      where: { workspace_id: ws.id },
      orderBy: { created_at: 'desc' },
      take: 20
    })
    console.log(`\nfaturamento_lancamento: ${flans.length} registros`)
    if (flans.length > 0) {
      console.log('Campos:', Object.keys(flans[0]).join(', '))
      for (const l of flans.slice(0,5)) console.log(JSON.stringify(l))
    }
  } catch(e: any) { console.log('faturamento_lancamento: não existe —', e.message?.slice(0,80)) }

  // Tenta receita_canal
  try {
    // @ts-ignore
    const rc = await p.receita_canal.findMany({ where: { workspace_id: ws.id }, take: 10 })
    console.log(`\nreceita_canal: ${rc.length}`)
    if (rc.length > 0) console.log('Campos:', Object.keys(rc[0]).join(', '))
  } catch(e: any) { console.log('receita_canal: não existe —', e.message?.slice(0,80)) }

  // Verifica campos do faturamento_mes
  const fat = await p.faturamento_mes.findUnique({
    where: { workspace_id_ano_mes: { workspace_id: ws.id, ano: 2026, mes: 7 } }
  })
  if (fat) {
    console.log('\nfaturamento_mes Jul/2026 campos receita:')
    for (const [k,v] of Object.entries(fat)) {
      if (k.startsWith('receita')) console.log(`  ${k}: ${v}`)
    }
  }

  // Verifica Jun/2026 (que aparece correto no screenshot)
  const fatJun = await p.faturamento_mes.findUnique({
    where: { workspace_id_ano_mes: { workspace_id: ws.id, ano: 2026, mes: 6 } }
  })
  if (fatJun) {
    console.log('\nfaturamento_mes Jun/2026:')
    for (const [k,v] of Object.entries(fatJun)) {
      if (k.startsWith('receita') || k === 'receita_total') console.log(`  ${k}: ${v}`)
    }
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1) }).finally(() => p.$disconnect())
