'use client'

import dynamic from 'next/dynamic'

// ssr:false deve estar num Client Component — não pode ficar no page.tsx (Server Component)
const LandedCostView = dynamic(
  () => import('@/components/ferramentas/LandedCostView').then(m => ({ default: m.LandedCostView })),
  { ssr: false }
)

export function LandedCostClientWrapper({ workspaceId }: { workspaceId: string }) {
  return <LandedCostView workspaceId={workspaceId} />
}
