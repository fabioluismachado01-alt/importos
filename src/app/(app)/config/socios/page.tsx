import { getSocios } from '@/actions/config'
import { getDREAnual } from '@/actions/finance'
import { SociosView } from '@/components/config/SociosView'

export const metadata = { title: 'Retirada dos Sócios — ImportOS' }

export default async function SociosPage() {
  const ano = new Date().getFullYear()
  const [{ socios, config }, meses] = await Promise.all([
    getSocios(),
    getDREAnual(ano),
  ])
  return <SociosView socios={socios} config={config} meses={meses} ano={ano} />
}
