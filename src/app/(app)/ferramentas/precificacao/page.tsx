import { PrecificacaoView } from '@/components/ferramentas/PrecificacaoView'
import { getAuthContext } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Precificação — ImportOS',
  description: 'Compare margens e ROAS em todos os canais simultaneamente.',
}

export default async function PrecificacaoPage() {
  const { workspaceId } = await getAuthContext()

  const [custom, sistema] = await Promise.all([
    prisma.canal.findMany({ where: { workspace_id: workspaceId }, include: { faixas: { orderBy: { ordem: 'asc' } } } }),
    prisma.canal.findMany({ where: { workspace_id: null }, include: { faixas: { orderBy: { ordem: 'asc' } } } }),
  ])
  const slugsCustom = new Set(custom.map(c => c.slug))
  const canais = [...custom, ...sistema.filter(s => !slugsCustom.has(s.slug))]

  // Keyed by slug para lookup rápido no client
  const canalFaixas: Record<string, { preco_min: number; preco_max: number | null; comissao_perc: number; taxa_fixa: number }[]> =
    Object.fromEntries(canais.map(c => [c.slug, c.faixas]))

  const canalModos: Record<string, string> =
    Object.fromEntries(canais.map(c => [c.slug, c.modo ?? 'AUTO']))

  return <PrecificacaoView workspaceId={workspaceId} canalFaixas={canalFaixas} canalModos={canalModos} />
}
