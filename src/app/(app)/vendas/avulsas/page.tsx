import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'
import { VendasAvulsasView } from '@/components/vendas/VendasAvulsasView'

export const metadata = { title: 'Vendas Avulsas — ImportOS' }

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

export default async function VendasAvulsasPage() {
  const { workspaceId } = await getAuthContext()

  // Busca faturamentos que têm lançamentos Avulsas
  const lancamentos = await prisma.lancamento.findMany({
    where: {
      descricao: { contains: '[Avulsas]' },
      faturamento: { workspace_id: workspaceId },
    },
    include: { faturamento: { select: { ano: true, mes: true } } },
    orderBy: [
      { faturamento: { ano: 'desc' } },
      { faturamento: { mes: 'desc' } },
    ],
  })

  // Agrupa por mês/ano e soma receita
  const mesesMap: Record<string, { ano: number; mes: number; label: string; receita: number }> = {}
  for (const l of lancamentos) {
    const { ano, mes } = l.faturamento
    const key = `${ano}-${mes}`
    if (!mesesMap[key]) {
      mesesMap[key] = { ano, mes, label: `${MESES[mes - 1]} ${ano}`, receita: 0 }
    }
    if (l.tipo === 'RECEITA') mesesMap[key].receita += l.valor
  }

  const salvas = Object.values(mesesMap).sort((a, b) => b.ano - a.ano || b.mes - a.mes)

  return <VendasAvulsasView salvas={salvas} />
}
