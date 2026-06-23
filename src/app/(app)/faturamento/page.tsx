import { getFaturamentoAnual, getFinanceConfig } from '@/actions/finance'
import { FaturamentoAnualView } from '@/components/faturamento/FaturamentoAnualView'

export const metadata = { title: 'Faturamento — ImportOS' }

export default async function FaturamentoPage() {
  const anoAtual = new Date().getFullYear()
  const [meses, config] = await Promise.all([
    getFaturamentoAnual(anoAtual),
    getFinanceConfig(anoAtual),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Faturamento</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Controle de receitas, despesas, DAS e resultados — {anoAtual}
          </p>
        </div>
      </div>
      <FaturamentoAnualView ano={anoAtual} mesesIniciais={meses} config={config} />
    </div>
  )
}
