import { LandedCostView } from '@/components/ferramentas/LandedCostView'
import { getAuthContext } from '@/lib/auth'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Simulador de Custos — ImportOS',
  description: 'Simule o custo de desembarque por produto: Simplificada, Formal Aérea e Formal Marítima.',
}

export default async function LandedCostPage() {
  const { workspaceId } = await getAuthContext()
  return <LandedCostView workspaceId={workspaceId} />
}
