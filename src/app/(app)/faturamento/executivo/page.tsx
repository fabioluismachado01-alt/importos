import { getDREAnual, getFinanceConfig } from '@/actions/finance'
import { PainelExecutivoView } from '@/components/faturamento/PainelExecutivoView'

export const metadata = { title: 'Painel Executivo — ImportOS' }

export default async function ExecutivoPage() {
  const ano = new Date().getFullYear()
  const [meses, config] = await Promise.all([getDREAnual(ano), getFinanceConfig(ano)])
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Painel Executivo</h1>
        <p className="text-sm text-slate-500 mt-0.5">Análise profunda do Lucro Líquido com insights de IA</p>
      </div>
      <PainelExecutivoView meses={meses} config={config} ano={ano} />
    </div>
  )
}
