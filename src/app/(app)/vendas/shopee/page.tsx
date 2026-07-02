import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'
import { ShopeeAnaliseView } from '@/components/vendas/ShopeeAnaliseView'

export const metadata = { title: 'Análise Shopee — ImportOS' }

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

export default async function ShopeePage() {
  const { workspaceId } = await getAuthContext()

  const lancamentos = await prisma.lancamento.findMany({
    where: {
      descricao: { contains: '[Shopee]' },
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
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Análise de Vendas — Shopee</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Importe o Relatório de Vendas e o Relatório de Ads — o sistema cruza com os custos cadastrados e gera a DRE completa.
        </p>
      </div>
      <ShopeeAnaliseView salvas={salvas} />
    </div>
  )
}
