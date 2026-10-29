import { getPainelCMV } from '@/actions/cmv'
import { CMVLotesView } from '@/components/faturamento/CMVLotesView'

export const metadata = { title: 'CMV por lote — ImportOS' }
export const dynamic = 'force-dynamic'

export default async function CMVPage() {
  const painel = await getPainelCMV()
  return <CMVLotesView painel={painel} />
}
