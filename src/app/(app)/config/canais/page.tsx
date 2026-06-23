import { getCanais } from '@/actions/config'
import { CanaisView } from '@/components/config/CanaisView'

export const metadata = { title: 'Canais de Venda — ImportOS' }

export default async function CanaisPage() {
  const canais = await getCanais()
  return <CanaisView canais={canais} />
}
