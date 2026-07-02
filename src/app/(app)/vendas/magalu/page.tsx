import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'
import { MagaluAnaliseView } from '@/components/vendas/MagaluAnaliseView'

export const metadata = { title: 'Análise Magalu — ImportOS' }

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

export default async function MagaluPage() {
  const { workspaceId } = await getAuthContext()

  const lancamentos = await prisma.lancamento.findMany({
    where: {
      descricao: { contains: '[Magalu]' },
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
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Análise de Vendas — Magalu</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Importe o relatório de pedidos — SKUs normalizados automaticamente, CMV do catálogo e DRE com breakdown completo de taxas.
        </p>
      </div>
      <MagaluAnaliseView salvas={salvas} />
    </div>
  )
}
