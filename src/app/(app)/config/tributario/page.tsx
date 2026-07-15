import { getEmpresa, getAliquotasHistorico, restaurarAliquotasJanAbr2026 } from '@/actions/config'
import { estimarAliquotasFuturas } from '@/actions/aliquotas'
import { getAuthContext } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { TributarioView } from '@/components/config/TributarioView'

export const metadata = { title: 'Configuração Tributária — ImportOS' }

export default async function TributarioPage() {
  const ano = new Date().getFullYear()
  const { workspaceId } = await getAuthContext()

  // Restaura alíquotas Jan–Abr/2026 que foram sobrescritas incorretamente
  await restaurarAliquotasJanAbr2026()

  const [empresa, aliquotas, mesesFaturamento, estimativas] = await Promise.all([
    getEmpresa(),
    getAliquotasHistorico(ano),
    prisma.faturamento_mes.findMany({
      where: { workspace_id: workspaceId, ano },
      select: { mes: true, aliquota_simples: true },
      orderBy: { mes: 'asc' },
    }),
    estimarAliquotasFuturas(ano),
  ])
  return <TributarioView empresa={empresa} aliquotas={aliquotas} mesesFaturamento={mesesFaturamento} ano={ano} estimativas={estimativas} />
}
