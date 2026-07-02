import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'
import { AmazonAnaliseView } from '@/components/vendas/AmazonAnaliseView'

export const metadata = { title: 'Análise Amazon — ImportOS' }

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

export default async function VendasAmazonPage() {
  const { workspaceId } = await getAuthContext()

  const lancamentos = await prisma.lancamento.findMany({
    where: {
      descricao: { contains: '[Amazon]' },
      faturamento: { workspace_id: workspaceId },
    },
    include: { faturamento: { select: { ano: true, mes: true } } },
    orderBy: [
      { faturamento: { ano: 'desc' } },
      { faturamento: { mes: 'desc' } },
    ],
  })

  const mesesMap: Record<string, { ano: number; mes: number; label: string; receita: number }> = {}
  for (const l of lancamentos) {
    const { ano, mes } = l.faturamento
    const key = `${ano}-${mes}`
    if (!mesesMap[key]) mesesMap[key] = { ano, mes, label: `${MESES[mes - 1]} ${ano}`, receita: 0 }
    if (l.tipo === 'RECEITA') mesesMap[key].receita += l.valor
  }
  const salvas = Object.values(mesesMap).sort((a, b) => b.ano - a.ano || b.mes - a.mes)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          Análise de Vendas — Amazon
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Importe o relatório unificado mensal — vendas, taxas FBA e cobranças em um só arquivo
        </p>
      </div>
      <AmazonAnaliseView salvas={salvas} />
    </div>
  )
}
