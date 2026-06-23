import { EtiquetasView } from '@/components/ferramentas/EtiquetasView'
import { getProdutosEtiquetas } from '@/actions/etiquetas'
import { getAuthContext } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Etiquetas — ImportOS',
  description: 'Gerador de etiquetas com código de barras EAN integrado ao catálogo de produtos.',
}

export default async function EtiquetasPage() {
  const { workspaceId } = await getAuthContext()
  const [produtos, empresa] = await Promise.all([
    getProdutosEtiquetas(),
    prisma.empresa.findUnique({
      where: { workspace_id: workspaceId },
      select: { razao_social: true, nome_fantasia: true },
    }),
  ])

  const empresaNome = empresa?.nome_fantasia ?? empresa?.razao_social ?? 'Minha Empresa'

  return <EtiquetasView produtos={produtos} empresaNome={empresaNome} />
}
