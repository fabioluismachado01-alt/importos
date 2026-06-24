'use server'

import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export type FreteHistoricoRow = {
  id: string
  rateio_id: string | null
  modal: string
  origem: string | null
  data_embarque: Date
  peso_kg: number
  cbm: number | null
  frete_usd: number
  cambio: number
  frete_brl: number
  armazenagem_brl: number
  custo_total_brl: number
  custo_kg_usd: number
  custo_cbm_usd: number | null
  custo_total_kg_brl: number
  custo_total_cbm_brl: number | null
  notas: string | null
}

function calcularDerivedos(p: {
  frete_usd: number; cambio: number; peso_kg: number; cbm?: number | null; armazenagem_brl?: number
}) {
  const frete_brl = p.frete_usd * p.cambio
  const armazenagem_brl = p.armazenagem_brl ?? 0
  const custo_total_brl = frete_brl + armazenagem_brl
  const custo_kg_usd = p.frete_usd / p.peso_kg
  const custo_cbm_usd = p.cbm ? p.frete_usd / p.cbm : null
  const custo_total_kg_brl = custo_total_brl / p.peso_kg
  const custo_total_cbm_brl = p.cbm ? custo_total_brl / p.cbm : null
  return { frete_brl, armazenagem_brl, custo_total_brl, custo_kg_usd, custo_cbm_usd, custo_total_kg_brl, custo_total_cbm_brl }
}

export async function getFreteHistorico(): Promise<FreteHistoricoRow[]> {
  const { workspaceId } = await getAuthContext()
  return prisma.frete_historico.findMany({
    where: { workspace_id: workspaceId },
    orderBy: { data_embarque: 'desc' },
  })
}

export async function salvarFreteManual(data: {
  modal: string
  origem?: string
  data_embarque: Date
  peso_kg: number
  cbm?: number
  frete_usd: number
  cambio: number
  armazenagem_brl?: number
  notas?: string
}) {
  const { workspaceId } = await getAuthContext()
  const d = calcularDerivedos({ ...data, armazenagem_brl: data.armazenagem_brl ?? 0 })

  await prisma.frete_historico.create({
    data: {
      workspace_id: workspaceId,
      modal: data.modal,
      origem: data.origem ?? null,
      data_embarque: data.data_embarque,
      peso_kg: data.peso_kg,
      cbm: data.cbm ?? null,
      frete_usd: data.frete_usd,
      cambio: data.cambio,
      notas: data.notas ?? null,
      ...d,
    },
  })

  revalidatePath('/ferramentas/fretes')
}

export async function excluirFrete(id: string) {
  const { workspaceId } = await getAuthContext()
  await prisma.frete_historico.deleteMany({ where: { id, workspace_id: workspaceId } })
  revalidatePath('/ferramentas/fretes')
}

export async function upsertFreteDoRateio(params: {
  workspaceId: string
  rateioId: string
  modal: string
  origem: string | null
  dataEmbarque: Date
  pesoKg: number
  cbm: number | null
  freteUsd: number
  cambio: number
}) {
  const d = calcularDerivedos({ frete_usd: params.freteUsd, cambio: params.cambio, peso_kg: params.pesoKg, cbm: params.cbm })

  await prisma.frete_historico.upsert({
    where: { rateio_id: params.rateioId },
    create: {
      workspace_id: params.workspaceId,
      rateio_id: params.rateioId,
      modal: params.modal,
      origem: params.origem,
      data_embarque: params.dataEmbarque,
      peso_kg: params.pesoKg,
      cbm: params.cbm,
      frete_usd: params.freteUsd,
      cambio: params.cambio,
      ...d,
    },
    update: {
      modal: params.modal,
      origem: params.origem,
      data_embarque: params.dataEmbarque,
      peso_kg: params.pesoKg,
      cbm: params.cbm,
      frete_usd: params.freteUsd,
      cambio: params.cambio,
      ...d,
    },
  })
}
