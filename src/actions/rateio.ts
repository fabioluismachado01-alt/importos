'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'
import { upsertFreteDoRateio } from './fretes'
import { recalcularMes } from './finance'

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
  modal: 'MARITIMO' | 'AEREO'
  cambio: number
  cambio_frete?: number | null
  frete_usd: number
  imposto_simpl_brl?: number
  siscomex_brl?: number
  extras_brl?: number
  venda_imposto_perc: number
  venda_taxa_mkt_perc: number
  venda_taxa_fixa_brl: number
  ano_ref: number
  mes_ref: number
  valor_aduaneiro_brl: number
  cbm_total?: number
  origem?: string
  custo_vigencia_data?: Date | null
  itens: RateioItemInput[]
}

// ─── Salvar Rateio ────────────────────────────────────────────────────────────

export async function salvarRateio(input: SalvarRateioInput) {
  const { workspaceId, user } = await getAuthContext()

  // Calcular peso total e CBM a partir dos itens
  const pesoTotal = input.itens.reduce((acc, i) => acc + (i.peso * i.qty), 0)

  const rateio = await prisma.rateio.create({
    data: {
      workspace_id: workspaceId,
      nome: input.nome,
      modo: input.modo,
      modal: input.modal,
      cambio: input.cambio,
      cambio_frete: input.cambio_frete ?? null,
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
      cbm_total: input.cbm_total ?? null,
      peso_total_kg: pesoTotal,
      origem: input.origem ?? null,
      custo_vigencia_data: input.custo_vigencia_data ?? null,
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

  // Registrar no histórico de fretes automaticamente
  if (input.frete_usd > 0 && pesoTotal > 0) {
    await upsertFreteDoRateio({
      workspaceId,
      rateioId: rateio.id,
      modal: input.modal,
      origem: input.origem ?? null,
      dataEmbarque: new Date(),
      pesoKg: pesoTotal,
      cbm: input.cbm_total ?? null,
      freteUsd: input.frete_usd,
      cambio: input.cambio_frete ?? input.cambio,
    })
  }

  revalidatePath('/ferramentas/rateio')
  revalidatePath('/ferramentas/impostos')
  revalidatePath('/ferramentas/fretes')
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
      cambio: true, cambio_frete: true, frete_usd: true,
      custo_vigencia_data: true,
      custos_aplicados: true,
      custos_aplicados_em: true,
      created_at: true,
      itens: { select: { nome: true, qty: true, unit_usd: true, custo_unit_brl: true, produto_id: true } },
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
      cambio: true, cambio_frete: true, frete_usd: true,
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

// ─── Propagação retroativa de custo nos pedidos e DRE ───────────────────────
//
// Regra de vigência por janela:
//   Cada rateio é dono do custo de um SKU apenas no intervalo
//   [sua vigência → próxima vigência POSTERIOR do mesmo SKU em outro rateio aplicado).
//   Isso garante que o rateio mais novo prevalece para o seu período sem sobrescrever
//   períodos de rateios ainda mais novos que já tenham sido aplicados antes.

async function propagarCustoRetroativo(
  workspaceId: string,
  rateioId: string,
  itens: Array<{ produto_id: string; custo_unit_brl: number }>,
  vigenciaData: Date,
) {
  const hoje = new Date()

  for (const item of itens) {
    // Descobre a próxima vigência posterior desse SKU em outro rateio já aplicado.
    // Se existir, este rateio só é dono até essa data (exclusive).
    const proximoRateio = await prisma.rateio.findFirst({
      where: {
        workspace_id: workspaceId,
        id: { not: rateioId },
        custos_aplicados: true,
        custo_vigencia_data: { gt: vigenciaData },
        itens: { some: { produto_id: item.produto_id } },
      },
      orderBy: { custo_vigencia_data: 'asc' },
      select: { custo_vigencia_data: true },
    })
    const fimJanela = proximoRateio?.custo_vigencia_data ?? undefined

    // Atualiza ml_pedido apenas na janela [vigência, próxima vigência)
    await prisma.ml_pedido.updateMany({
      where: {
        workspace_id: workspaceId,
        produto_id: item.produto_id,
        data_compra: { gte: vigenciaData, ...(fimJanela ? { lt: fimJanela } : {}) },
        status: { not: 'cancelled' },
      },
      data: { custo_produto: item.custo_unit_brl },
    })
  }

  // Determina meses afetados respeitando a menor janela entre todos os SKUs
  // (usa o fim de janela mais cedo para não recalcular meses fora do escopo)
  const fimGlobal = (() => {
    const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
    return fim
  })()

  const meses: { ano: number; mes: number }[] = []
  const cur = new Date(vigenciaData.getFullYear(), vigenciaData.getMonth(), 1)
  while (cur <= fimGlobal) {
    meses.push({ ano: cur.getFullYear(), mes: cur.getMonth() + 1 })
    cur.setMonth(cur.getMonth() + 1)
  }

  for (const { ano, mes } of meses) {
    const fat = await prisma.faturamento_mes.findUnique({
      where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano, mes } },
      select: { id: true },
    })
    if (!fat) continue

    const inicioMes = new Date(ano, mes - 1, 1)
    const fimMes = new Date(ano, mes, 1)

    const { _sum } = await prisma.ml_pedido.aggregate({
      where: {
        workspace_id: workspaceId,
        data_compra: { gte: inicioMes, lt: fimMes },
        status: { not: 'cancelled' },
        custo_produto: { not: null },
      },
      _sum: { custo_produto: true },
    })
    const totalCustoMes = _sum.custo_produto ?? 0

    const lancExistente = await prisma.lancamento.findFirst({
      where: {
        faturamento_id: fat.id,
        categoria: 'CUSTO_PRODUTOS',
        descricao: { contains: 'ML Import' },
        status: 'CONFIRMADO',
      },
      select: { id: true },
    })

    if (lancExistente) {
      await prisma.lancamento.update({
        where: { id: lancExistente.id },
        data: { valor: totalCustoMes },
      })
      await recalcularMes(fat.id, workspaceId, ano, mes)
    }
  }
}

// ─── Aplicar custos ao catálogo ──────────────────────────────────────────────

export async function aplicarCustosRateio(id: string, vigenciaData?: Date) {
  const { workspaceId } = await getAuthContext()
  const rateio = await prisma.rateio.findFirst({
    where: { id, workspace_id: workspaceId },
    include: { itens: { where: { produto_id: { not: null } } } },
  })
  if (!rateio) throw new Error('Rateio não encontrado')

  const itensComProduto = rateio.itens.filter(i => i.produto_id && i.custo_unit_brl)
  if (itensComProduto.length === 0) throw new Error('Nenhum item com produto vinculado e custo calculado')

  const vigencia = vigenciaData ?? rateio.custo_vigencia_data ?? new Date()

  for (const item of itensComProduto) {
    await prisma.produto_catalogo.update({
      where: { id: item.produto_id! },
      data: { custo_brl: item.custo_unit_brl! },
    })
  }

  await prisma.rateio.update({
    where: { id },
    data: {
      custos_aplicados: true,
      custos_aplicados_em: new Date(),
      custo_vigencia_data: vigencia,
    },
  })

  // Propaga retroativamente nos pedidos e DRE de cada mês afetado
  const itensParaPropagar = itensComProduto
    .filter(i => i.produto_id && i.custo_unit_brl)
    .map(i => ({ produto_id: i.produto_id!, custo_unit_brl: i.custo_unit_brl! }))

  await propagarCustoRetroativo(workspaceId, id, itensParaPropagar, vigencia)

  revalidatePath('/ferramentas/rateio')
  revalidatePath('/produtos')
  revalidatePath('/faturamento/dre')
  revalidatePath('/faturamento')
  return { ok: true, count: itensComProduto.length }
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
