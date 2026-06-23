import { PrecificacaoView } from '@/components/ferramentas/PrecificacaoView'
import { getAuthContext } from '@/lib/auth'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Precificação — ImportOS',
  description: 'Compare margens e ROAS em todos os canais simultaneamente.',
}

export default async function PrecificacaoPage() {
  const { workspaceId } = await getAuthContext()
  return <PrecificacaoView workspaceId={workspaceId} />
}
