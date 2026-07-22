import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
async function run() {
  const ws = await p.workspace.findUnique({ where: { slug: 'nacao-import-demo' } })
  const meses = await p.faturamento_mes.findMany({
    where: { workspace_id: ws!.id },
    orderBy: [{ ano: 'asc' }, { mes: 'asc' }],
    select: { ano: true, mes: true, receita_total: true, lucro_liquido: true, lucro_bruto: true, desp_custo_produtos: true }
  })
  console.log(`Meses no faturamento_mes: ${meses.length}`)
  for (const m of meses) {
    console.log(`  ${String(m.mes).padStart(2,'0')}/${m.ano} | receita: R$${m.receita_total.toLocaleString('pt-BR')} | CMV: R$${m.desp_custo_produtos.toLocaleString('pt-BR')} | lucro_bruto: R$${m.lucro_bruto.toLocaleString('pt-BR')} | lucro_liq: R$${m.lucro_liquido.toLocaleString('pt-BR')}`)
  }
}
run().catch(e => console.error(e.message)).finally(() => p.$disconnect())
