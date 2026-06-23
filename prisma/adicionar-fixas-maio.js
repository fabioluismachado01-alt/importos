/**
 * Adiciona as despesas fixas como lançamentos em Maio 2026
 * Pula PAGINA_ML (já veio do import ML como FATURA_ML)
 * Pula PREVIDENCIA_PRIVADA (calculada automaticamente pela engine)
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const membro = await prisma.workspace_membro.findFirst({ orderBy:{created_at:'asc'}, select:{workspace_id:true} })
  const wid = membro.workspace_id

  const fat = await prisma.faturamento_mes.findFirst({ where:{ano:2026,mes:5} })
  if (!fat) { console.log('Maio não encontrado'); return }

  // Remove fixas já existentes (evita duplicação)
  const del = await prisma.lancamento.deleteMany({
    where:{ faturamento_id:fat.id, tipo:'DESPESA_FIXA' }
  })
  if (del.count > 0) console.log('Removidas', del.count, 'fixas anteriores')

  // Templates ativos, exceto Página ML (já no ML import) e Previdência (automática)
  const templates = await prisma.despesa_fixa_template.findMany({
    where:{
      workspace_id: wid,
      ativo: true,
      categoria: { notIn: ['PAGINA_ML', 'PREVIDENCIA_PRIVADA'] },
      valor_padrao: { gt: 0 },
      formula: null,
    },
    orderBy:{ ordem:'asc' }
  })

  const primeiroDia = new Date(2026, 4, 1) // 01/05/2026

  const lancamentos = templates.map(t => ({
    faturamento_id: fat.id,
    tipo: 'DESPESA_FIXA',
    categoria: t.categoria,
    descricao: t.nome,
    valor: t.valor_padrao,
    data: primeiroDia,
    e_fixo: true,
    status: 'CONFIRMADO',
  }))

  await prisma.lancamento.createMany({ data: lancamentos })

  console.log('\n=== DESPESAS FIXAS ADICIONADAS EM MAIO 2026 ===')
  templates.forEach(t => console.log(' ✓', t.nome.padEnd(30), 'R$'+t.valor_padrao.toFixed(2)))
  console.log('\n  Página ML: PULADA (já veio do import ML como FATURA_ML)')
  console.log('  Previdência: CALCULADA automaticamente pela engine')

  const totalFixas = templates.reduce((s,t)=>s+t.valor_padrao,0)
  console.log('\nTotal fixas adicionadas: R$'+totalFixas.toFixed(2))
  console.log('Break-Even estimado: R$'+(totalFixas / (fat.margem_contribuicao/100)).toFixed(2))
  console.log('\nAgora recalcule os KPIs no sistema.')
}
main().catch(console.error).finally(() => prisma.$disconnect())
