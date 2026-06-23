import { DocumentacaoView } from '@/components/ferramentas/DocumentacaoView'
import { getAuthContext } from '@/lib/auth'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Documentação Comex — ImportOS',
  description: 'Gere Proforma Invoice (PI), Commercial Invoice (CI) e Packing List (PL) prontos para impressão em A4 paisagem.',
}

export default async function DocumentacaoPage() {
  const { workspaceId } = await getAuthContext()
  return <DocumentacaoView workspaceId={workspaceId} />
}
