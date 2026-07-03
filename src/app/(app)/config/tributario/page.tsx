import { getEmpresa, getAliquotasHistorico } from '@/actions/config'
import { getAuthContext } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { TributarioView } from '@/components/config/TributarioView'

export const metadata = { title: 'Configuração Tributária — ImportOS' }

export default async function TributarioPage() {
  const ano = new Date().getFullYear()
  const { workspaceId } = await getAuthContext()
  const [empresa, aliquotas, mesesFaturamento] = await Promise.all([
    getEmpresa(),
    getAliquotasHistorico(ano),
    prisma.faturamento_mes.findMany({
      where: { workspace_id: workspaceId, ano },
      select: { mes: true, aliquota_simples: true },
      orderBy: { mes: 'asc' },
    }),
  ])
  return <TributarioView empresa={empresa} aliquotas={aliquotas} mesesFaturamento={mesesFaturamento} ano={ano} />
}
