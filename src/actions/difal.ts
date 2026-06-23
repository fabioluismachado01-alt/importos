'use server'

import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'
import type { UF } from '@/engines/difal'

export interface DIFALPageData {
  ufOrigem: UF | string
  faturamentoMesAtual: number
  percInterestadualEstimado: number
  mesRefNome: string
  anoRef: number
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export async function getDIFALData(): Promise<DIFALPageData> {
  const { workspaceId } = await getAuthContext()

  const [empresa, fatRef] = await Promise.all([
    prisma.empresa.findUnique({
      where: { workspace_id: workspaceId },
      select: { estado_uf: true },
    }),
    prisma.faturamento_mes.findFirst({
      where: { workspace_id: workspaceId, receita_total: { gt: 0 } },
      orderBy: [{ ano: 'desc' }, { mes: 'desc' }],
      select: { receita_total: true, ano: true, mes: true },
    }),
  ])

  const hoje = new Date()
  const anoRef = fatRef?.ano ?? hoje.getFullYear()
  const mesRef = fatRef?.mes ?? (hoje.getMonth() + 1)

  return {
    ufOrigem: (empresa?.estado_uf ?? 'SP') as UF,
    faturamentoMesAtual: fatRef?.receita_total ?? 0,
    percInterestadualEstimado: 40, // ponto de partida razoável para e-commerce
    mesRefNome: MESES[mesRef - 1],
    anoRef,
  }
}
