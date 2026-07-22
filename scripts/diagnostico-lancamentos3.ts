import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
async function main() {
  const ws = await p.workspace.findUnique({ where: { slug: 'nacao-import-demo' } })
  if (!ws) throw new Error()

  // Verifica Jun/2026 completo (funciona corretamente)
  const fat = await p.faturamento_mes.findUnique({
    where: { workspace_id_ano_mes: { workspace_id: ws.id, ano: 2026, mes: 6 } },
    include: { lancamentos: { orderBy: [{ tipo: 'asc' }, { categoria: 'asc' }] } }
  })
  console.log(`\n═══ JUNHO/2026 COMPLETO (${fat?.lancamentos.length} lançamentos) ════`)
  for (const l of fat?.lancamentos ?? []) {
    console.log(`  ${l.tipo.padEnd(20)} | ${l.categoria.padEnd(18)} | canal=${String(l.canal??'null').padEnd(12)} | R$${l.valor.toFixed(2).padStart(12)} | ${l.descricao.slice(0,60)}`)
  }

  // Mostra campos calculados de Jun
  const fatJun = await p.faturamento_mes.findUnique({
    where: { workspace_id_ano_mes: { workspace_id: ws.id, ano: 2026, mes: 6 } }
  })
  console.log('\n═══ CAMPOS CALCULADOS JUN/2026 ════')
  const campos = ['ticket_medio','lucro_bruto','lucro_liquido','desp_custo_produtos',
    'desp_armazenagem','desp_ads_ml','desp_ads_outros','desp_tarifas','desp_frete',
    'desp_outras_taxas','total_pedidos','dias_com_venda','receita_total']
  for (const c of campos) {
    // @ts-ignore
    console.log(`  ${c.padEnd(25)}: ${fatJun?.[c]}`)
  }
}
main().catch(e => console.error(e.message)).finally(() => p.$disconnect())
