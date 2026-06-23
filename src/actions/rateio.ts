'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface RateioItemInput {
  nome: string
  produto_id?: string
  qty: number
  unit_usd: number
  peso: number
  ii: number
  ipi: number
  pis: number
  cofins: number
  icms: number
  target_price: number
  custo_unit_brl: number
  valor_aduaneiro_unit_brl: number
}

export interface SalvarRateioInput {
  nome: string
  modo: 'SIMPLIFICADA' | 'FORMAL'
  cambio: number
  frete_usd: number
  imposto_simpl_brl?: number
  siscomex_brl?: number
  extras_brl?: number
  venda_imposto_perc: number
  venda_taxa_mkt_perc: number
  venda_taxa_fixa_brl: number
  ano_ref: number
  mes_ref: number
  // Valor aduaneiro CIF total do lote em R$ (calculado no cliente)
  valor_aduaneiro_brl: number
  itens: RateioItemInput[]
}

// ─── Salvar Rateio ────────────────────────────────────────────────────────────

export async function salvarRateio(input: SalvarRateioInput) {
  const { workspaceId, user } = await getAuthContext()

  const rateio = await prisma.rateio.create({
    data: {
      workspace_id: workspaceId,
      nome: input.nome,
      modo: input.modo,
      cambio: input.cambio,
      frete_usd: input.frete_usd,
      imposto_simpl_brl: input.imposto_simpl_brl ?? null,
      siscomex_brl: input.siscomex_brl ?? null,
      extras_brl: input.extras_brl ?? null,
      venda_imposto_perc: input.venda_imposto_perc,
      venda_taxa_mkt_perc: input.venda_taxa_mkt_perc,
      venda_taxa_fixa_brl: input.venda_taxa_fixa_brl,
      ano_ref: input.ano_ref,
      mes_ref: input.mes_ref,
      valor_aduaneiro_brl: input.valor_aduaneiro_brl,
      status: 'SALVO',
      created_by: user.id,
      itens: {
        create: input.itens.map(item => ({
          nome: item.nome,
          produto_id: item.produto_id ?? null,
          qty: item.qty,
          unit_usd: item.unit_usd,
          peso: item.peso,
          ii: item.ii,
          ipi: item.ipi,
          pis: item.pis,
          cofins: item.cofins,
          icms: item.icms,
          target_price: item.target_price,
          custo_unit_brl: item.custo_unit_brl,
          valor_aduaneiro_unit_brl: item.valor_aduaneiro_unit_brl,
        })),
      },
    },
  })

  revalidatePath('/ferramentas/rateio')
  revalidatePath('/ferramentas/impostos')
  return { ok: true, id: rateio.id }
}

// ─── Listar Rateios salvos ────────────────────────────────────────────────────

export async function listarRateios() {
  const { workspaceId } = await getAuthContext()
  return prisma.rateio.findMany({
    where: { workspace_id: workspaceId, status: 'SALVO' },
    orderBy: [{ ano_ref: 'desc' }, { mes_ref: 'desc' }, { created_at: 'desc' }],
    select: {
      id: true, nome: true, modo: true,
      ano_ref: true, mes_ref: true,
      valor_aduaneiro_brl: true,
      cambio: true, frete_usd: true,
      created_at: true,
      itens: { select: { nome: true, qty: true, unit_usd: true, custo_unit_brl: true } },
    },
  })
}

// ─── Valor aduaneiro acumulado do mês (para Simulador Tributário) ─────────────

export async function getValorAduaneiroMes(ano: number, mes: number): Promise<number> {
  const { workspaceId } = await getAuthContext()
  const rateios = await prisma.rateio.findMany({
    where: { workspace_id: workspaceId, ano_ref: ano, mes_ref: mes, status: 'SALVO' },
    select: { valor_aduaneiro_brl: true },
  })
  return rateios.reduce((acc, r) => acc + (r.valor_aduaneiro_brl ?? 0), 0)
}

// ─── Buscar Rateio completo para edição ──────────────────────────────────────

export async function getRateioCompleto(id: string) {
  const { workspaceId } = await getAuthContext()
  return prisma.rateio.findFirst({
    where: { id, workspace_id: workspaceId },
    select: {
      id: true, nome: true, modo: true,
      cambio: true, frete_usd: true,
      imposto_simpl_brl: true, siscomex_brl: true, extras_brl: true,
      venda_imposto_perc: true, venda_taxa_mkt_perc: true, venda_taxa_fixa_brl: true,
      ano_ref: true, mes_ref: true,
      itens: {
        select: {
          id: true, produto_id: true, nome: true,
          qty: true, unit_usd: true, peso: true,
          dim_c: true, dim_l: true, dim_a: true,
          ii: true, ipi: true, pis: true, cofins: true, icms: true,
          target_price: true,
        },
      },
    },
  })
}

// ─── Deletar Rateio ───────────────────────────────────────────────────────────

export async function deletarRateio(id: string) {
  const { workspaceId } = await getAuthContext()
  const r = await prisma.rateio.findFirst({ where: { id, workspace_id: workspaceId } })
  if (!r) throw new Error('Rateio não encontrado')
  await prisma.rateio.delete({ where: { id } })
  revalidatePath('/ferramentas/rateio')
  revalidatePath('/ferramentas/impostos')
}
