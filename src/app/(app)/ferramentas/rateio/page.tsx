import { RateioView } from '@/components/ferramentas/RateioView'
import { getAuthContext } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Rateio de Lote — ImportOS',
  description: 'Calcule o custo real por unidade e simule margens de venda em cada produto do lote.',
}

export default async function RateioPage() {
  const { workspaceId } = await getAuthContext()
  const produtos = await prisma.produto_catalogo.findMany({
    where: { workspace_id: workspaceId, ativo: true },
    select: { id: true, nome: true, sku_interno: true },
    orderBy: { nome: 'asc' },
  })
  return <RateioView workspaceId={workspaceId} produtos={produtos} />
}
