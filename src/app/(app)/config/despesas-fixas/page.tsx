import { getDespesasFixas } from '@/actions/config'
import { DespesasFixasView } from '@/components/config/DespesasFixasView'

export const metadata = { title: 'Despesas Fixas — ImportOS' }

export default async function DespesasFixasPage() {
  const despesas = await getDespesasFixas()
  return <DespesasFixasView despesas={despesas} />
}
