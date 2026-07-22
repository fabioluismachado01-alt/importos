import dynamic from 'next/dynamic'
import { getAuthContext } from '@/lib/auth'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Simulador de Custos — ImportOS',
  description: 'Simule o custo de desembarque por produto: Simplificada, Formal Aérea e Formal Marítima.',
}

// ssr:false evita hydration mismatch — o componente usa localStorage via usePersistedState,
// que retorna valores diferentes no servidor (default) e no cliente (dado salvo).
const LandedCostView = dynamic(
  () => import('@/components/ferramentas/LandedCostView').then(m => ({ default: m.LandedCostView })),
  { ssr: false }
)

export default async function LandedCostPage() {
  const { workspaceId } = await getAuthContext()
  return <LandedCostView workspaceId={workspaceId} />
}
