const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
async function main() {
  const fat = await prisma.faturamento_mes.findFirst({
    where:{ano:2026,mes:5},
    include:{lancamentos:{where:{status:'CONFIRMADO'},orderBy:{tipo:'asc'}}}
  })

  const fixas = fat.lancamentos.filter(l => l.tipo === 'DESPESA_FIXA')
  const var_  = fat.lancamentos.filter(l => l.tipo === 'DESPESA_VARIAVEL')
  const rec   = fat.lancamentos.filter(l => l.tipo === 'RECEITA')

  console.log('=== LANÇAMENTOS DE MAIO 2026 ===')
  console.log('Receitas:          ', rec.length, 'lançamentos')
  console.log('Despesas Variáveis:', var_.length, 'lançamentos')
  console.log('Despesas FIXAS:    ', fixas.length, 'lançamentos ←')

  if (fixas.length > 0) {
    console.log('\nFixas encontradas:')
    fixas.forEach(l => console.log(' ', l.categoria.padEnd(25), 'R$'+l.valor.toFixed(2), l.descricao))
  } else {
    console.log('\n⚠ NENHUMA despesa fixa como lançamento em Maio!')
    console.log('  O Break-Even precisa de despesas fixas LANÇADAS no mês.')
    console.log('  Os templates existem mas precisam ser replicados para o mês.')
  }

  console.log('\n=== TEMPLATES DE DESPESAS FIXAS ===')
  const membro = await prisma.workspace_membro.findFirst({orderBy:{created_at:'asc'},select:{workspace_id:true}})
  const templates = await prisma.despesa_fixa_template.findMany({
    where:{workspace_id:membro.workspace_id, ativo:true},
    orderBy:{ordem:'asc'}
  })
  templates.forEach(t => {
    const valor = t.formula ? '(fórmula)' : 'R$'+t.valor_padrao.toFixed(2)+'/mês'
    console.log(' ', t.nome.padEnd(28), valor)
  })
  const totalFixas = templates.filter(t=>!t.formula&&t.valor_padrao>0).reduce((s,t)=>s+t.valor_padrao,0)
  console.log('\nTotal mensal (sem previdência): R$'+totalFixas.toFixed(2))

  // Mostra o break-even atual no banco
  console.log('\n=== BREAK-EVEN ATUAL NO BANCO ===')
  console.log('break_even no banco: R$'+fat.break_even.toFixed(2))
  const margem = fat.margem_contribuicao / 100
  if (margem > 0) {
    const beCorreto = totalFixas / margem
    console.log('Break-Even correto seria: R$'+beCorreto.toFixed(2), '(fixas R$'+totalFixas.toFixed(2)+' / margem '+fat.margem_contribuicao.toFixed(1)+'%)')
  }
}
main().catch(console.error).finally(() => prisma.$disconnect())
