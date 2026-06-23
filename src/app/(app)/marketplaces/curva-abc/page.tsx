import { getMLCurvaABC } from '@/actions/ml'
import { MLCurvaABCView } from '@/components/marketplaces/MLCurvaABCView'

export default async function CurvaABCPage({
  searchParams,
}: {
  searchParams: { dias?: string; conexaoId?: string }
}) {
  const dias = Number(searchParams.dias ?? 30)
  const conexaoId = searchParams.conexaoId

  const itens = await getMLCurvaABC({ dias, conexaoId })

  return (
    <div className="flex flex-col min-h-full">
      <div className="border-b border-slate-100 px-6 py-4">
        <h1 className="text-xl font-bold text-slate-800">Curva ABC Automática</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Classificação Pareto calculada a partir dos pedidos sincronizados — últimos {dias} dias
        </p>
      </div>
      <MLCurvaABCView itens={itens} />
    </div>
  )
}
