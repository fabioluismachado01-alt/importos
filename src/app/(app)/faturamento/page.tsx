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
    <FaturamentoAnualView ano={anoAtual} mesesIniciais={meses} config={config} />
  )
}
