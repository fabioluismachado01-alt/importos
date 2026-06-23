import { getImpostosData } from '@/actions/impostos'
import { ImpostosView } from '@/components/ferramentas/ImpostosView'

export const metadata = { title: 'Simulador Tributário — ImportOS' }

export default async function ImpostosPage() {
  const data = await getImpostosData()
  return <ImpostosView data={data} />
}
