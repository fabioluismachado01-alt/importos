import { getEmpresa, getAliquotasHistorico } from '@/actions/config'
import { TributarioView } from '@/components/config/TributarioView'

export const metadata = { title: 'Configuração Tributária — ImportOS' }

export default async function TributarioPage() {
  const ano = new Date().getFullYear()
  const [empresa, aliquotas] = await Promise.all([
    getEmpresa(),
    getAliquotasHistorico(ano),
  ])
  return <TributarioView empresa={empresa} aliquotas={aliquotas} ano={ano} />
}
