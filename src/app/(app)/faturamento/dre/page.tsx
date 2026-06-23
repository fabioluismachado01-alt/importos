import { getDREAnual, getFinanceConfig, getHistoricoAnual } from '@/actions/finance'
import { DREAnualView } from '@/components/faturamento/DREAnualView'

export const metadata = { title: 'DRE Anual — ImportOS' }

export default async function DREPage() {
  const anoAtual = new Date().getFullYear()

  const [meses, config, historico] = await Promise.all([
    getDREAnual(anoAtual),
    getFinanceConfig(anoAtual),
    getHistoricoAnual(), // todos os anos disponíveis no banco
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">DRE Anual</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Demonstrativo de Resultado — {anoAtual}
          </p>
        </div>
      </div>
      <DREAnualView ano={anoAtual} meses={meses} config={config} historico={historico} />
    </div>
  )
}
