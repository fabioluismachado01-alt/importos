const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const meses = await prisma.faturamento_mes.findMany({
    where: { receita_total: { gt: 0 } },
    select: { ano:true, mes:true, receita_total:true, fechado:true, _count:{select:{lancamentos:true}} },
    orderBy: [{ano:'asc'},{mes:'asc'}]
  })
  console.log('\n=== MESES COM DADOS ===')
  meses.forEach(m => console.log(
    ' ', m.ano+'/'+String(m.mes).padStart(2,'0'),
    'Receita: R$'+m.receita_total.toFixed(2),
    'Lançamentos:', m._count.lancamentos,
    m.fechado?'[FECHADO]':''
  ))

  const junho = await prisma.faturamento_mes.findFirst({
    where:{ano:2026,mes:6},
    include:{lancamentos:{select:{tipo:true,categoria:true,canal:true,descricao:true,valor:true}}}
  })
  if(junho) {
    console.log('\n=== JUNHO 2026 — TODOS OS LANÇAMENTOS ===')
    junho.lancamentos.forEach(l => console.log(
      ' ', l.tipo.padEnd(18), l.categoria.padEnd(18),
      'R$'+l.valor.toFixed(2).padStart(10), l.descricao.slice(0,45)
    ))
  }

  const analises = await prisma.ml_analise_relatorio.findMany({
    orderBy:{created_at:'desc'},take:5,
    select:{marketplace:true,ano:true,mes:true,receita_bruta:true,created_at:true}
  })
  console.log('\n=== ANÁLISES ML SALVAS ===')
  analises.forEach(a => console.log(
    ' ', a.marketplace, a.ano+'/'+a.mes,
    'R$'+a.receita_bruta.toFixed(2),
    a.created_at.toLocaleDateString('pt-BR')
  ))
}
main().catch(console.error).finally(() => prisma.$disconnect())
