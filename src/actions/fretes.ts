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
  custo_kg_usd: number
  custo_cbm_usd: number | null
  notas: string | null
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
  notas?: string
}) {
  const { workspaceId } = await getAuthContext()

  const frete_brl = data.frete_usd * data.cambio
  const custo_kg_usd = data.frete_usd / data.peso_kg
  const custo_cbm_usd = data.cbm ? data.frete_usd / data.cbm : null

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
      frete_brl,
      custo_kg_usd,
      custo_cbm_usd,
      notas: data.notas ?? null,
    },
  })

  revalidatePath('/ferramentas/fretes')
}

export async function excluirFrete(id: string) {
  const { workspaceId } = await getAuthContext()
  await prisma.frete_historico.deleteMany({ where: { id, workspace_id: workspaceId } })
  revalidatePath('/ferramentas/fretes')
}

// Chamado ao salvar rateio — cria/atualiza entrada no histórico automaticamente
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
  const frete_brl = params.freteUsd * params.cambio
  const custo_kg_usd = params.pesoKg > 0 ? params.freteUsd / params.pesoKg : 0
  const custo_cbm_usd = params.cbm && params.cbm > 0 ? params.freteUsd / params.cbm : null

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
      frete_brl,
      custo_kg_usd,
      custo_cbm_usd,
    },
    update: {
      modal: params.modal,
      origem: params.origem,
      data_embarque: params.dataEmbarque,
      peso_kg: params.pesoKg,
      cbm: params.cbm,
      frete_usd: params.freteUsd,
      cambio: params.cambio,
      frete_brl,
      custo_kg_usd,
      custo_cbm_usd,
    },
  })
}
