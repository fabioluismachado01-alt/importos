import { PainelTributarioView } from '@/components/ferramentas/PainelTributarioView'
import { getPainelTributarioData } from '@/actions/painel-tributario'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Painel Tributário — ImportOS',
  description: 'DAS estimado do mês, histórico de carga tributária e vencimentos.',
}

export default async function PainelTributarioPage() {
  const data = await getPainelTributarioData()
  return <PainelTributarioView data={data} />
}
