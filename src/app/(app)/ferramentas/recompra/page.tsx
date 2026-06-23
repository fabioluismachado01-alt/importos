import { RecompraView } from '@/components/ferramentas/RecompraView'
import { getAuthContext } from '@/lib/auth'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Ponto de Recompra — ImportOS',
  description: 'Calcule quando fazer o próximo pedido para nunca entrar em ruptura de estoque.',
}

export default async function RecompraPage() {
  const { workspaceId } = await getAuthContext()
  return <RecompraView workspaceId={workspaceId} />
}
