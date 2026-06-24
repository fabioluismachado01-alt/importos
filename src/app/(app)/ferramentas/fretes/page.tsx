import { getFreteHistorico } from '@/actions/fretes'
import { FretesDashboard } from '@/components/ferramentas/FretesDashboard'

export default async function FretesPage() {
  const fretes = await getFreteHistorico()
  return <FretesDashboard fretes={fretes} />
}
