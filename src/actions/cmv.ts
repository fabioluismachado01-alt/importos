'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'
import { recalcularMes } from './finance'
import { alocarPEPS, consumoNaoRegistrado, suspeitasDuplicidade } from '@/lib/cmv-lotes'
import type { Lote } from '@/lib/cmv-lotes'
import { custoTotalLinha } from '@/lib/ml-calculos'

export type LoteDTO = { rateioId: string; nome: string; vigencia: string; qtd: number; custo: number }
export type VendaDTO = { id: string; data: string; qtd: number; custoGravado: number | null }
export type SkuCMV = { sku: string; nome: string; produtoId: string; lotes: LoteDTO[]; vendas: VendaDTO[] }
export type PainelCMV = {
  skus: SkuCMV[]
  duplicidades: { a: string; b: string; skusComuns: number }[]
  naoAplicados: { nome: string; itens: number; unidades: number }[]
}

async function carregar(workspaceId: string, skuFiltro?: string) {
  const rateios = await prisma.rateio.findMany({
    where: { workspace_id: workspaceId },
    include: { itens: { include: { produto: { select: { id: true, sku_interno: true, nome: true } } } } },
    orderBy: { created_at: 'asc' },
  })

  // Lotes = rateios com custo aplicado e vigência definida
  const porProduto = new Map<string, { sku: string; nome: string; lotes: Lote[] }>()
  for (const r of rateios) {
    if (!r.custos_aplicados || !r.custo_vigencia_data) continue
    for (const it of r.itens) {
      if (!it.produto?.sku_interno || !it.custo_unit_brl || it.qty <= 0) continue
      const sku = it.produto.sku_interno.toUpperCase()
      if (skuFiltro && sku !== skuFiltro.toUpperCase()) continue
      const g = porProduto.get(it.produto.id) ?? { sku, nome: it.produto.nome, lotes: [] }
      g.lotes.push({ rateioId: r.id, nome: r.nome, vigencia: r.custo_vigencia_data, qtd: it.qty, custo: it.custo_unit_brl })
      porProduto.set(it.produto.id, g)
    }
  }

  const skus = Array.from(porProduto.values()).map(g => g.sku)
  const pedidos = skus.length === 0 ? [] : await prisma.ml_pedido.findMany({
    where: {
      workspace_id: workspaceId, status: 'paid',
      // devolvido = o produto voltou ao estoque: não consome lote
      NOT: { devolucao_status: 'devolvido' },
      sku: { in: skus, mode: 'insensitive' },
    },
    select: { id: true, sku: true, data_compra: true, quantidade: true, custo_produto: true },
    orderBy: { data_compra: 'asc' },
  })

  return { rateios, porProduto, pedidos }
}

/** Dados do painel "CMV por lote". O PEPS é calculado no navegador para responder ao estoque digitado. */
export async function getPainelCMV(): Promise<PainelCMV> {
  const { workspaceId } = await getAuthContext()
  const { rateios, porProduto, pedidos } = await carregar(workspaceId)

  const skus: SkuCMV[] = Array.from(porProduto.entries()).map(([produtoId, g]) => ({
    sku: g.sku, nome: g.nome, produtoId,
    lotes: g.lotes.map(l => ({ rateioId: l.rateioId, nome: l.nome, vigencia: l.vigencia.toISOString(), qtd: l.qtd, custo: l.custo })),
    vendas: pedidos.filter(p => p.sku?.toUpperCase() === g.sku).map(p => ({
      id: p.id, data: p.data_compra.toISOString(), qtd: p.quantidade, custoGravado: p.custo_produto,
    })),
  })).sort((a, b) => b.vendas.length - a.vendas.length)

  const resumo = rateios.map(r => ({
    id: r.id, nome: r.nome, aplicado: r.custos_aplicados,
    itens: r.itens.filter(i => i.produto?.sku_interno).map(i => ({ sku: i.produto!.sku_interno!.toUpperCase(), qtd: i.qty })),
  }))

  return {
    skus,
    duplicidades: suspeitasDuplicidade(resumo),
    naoAplicados: rateios.filter(r => !r.custos_aplicados).map(r => ({
      nome: r.nome, itens: r.itens.length, unidades: r.itens.reduce((s, i) => s + i.qty, 0),
    })),
  }
}

/**
 * Grava o custo PEPS nos pedidos do SKU e recalcula o CMV dos meses afetados.
 * O cálculo é refeito aqui no servidor (não confia no navegador).
 * estoqueHoje: unidades em estoque hoje (todas as origens); null = sem calibração.
 */
export async function aplicarCustoPEPS(sku: string, estoqueHoje: number | null): Promise<{ pedidos: number; meses: number; cmvAntes: number; cmvDepois: number }> {
  const { workspaceId } = await getAuthContext()
  const { porProduto, pedidos } = await carregar(workspaceId, sku)
  const grupo = Array.from(porProduto.values())[0]
  if (!grupo) throw new Error(`SKU ${sku} não tem lote com custo aplicado`)

  const hoje = new Date()
  const importado = grupo.lotes.filter(l => l.vigencia <= hoje).reduce((s, l) => s + l.qtd, 0)
  const conhecidas = pedidos.reduce((s, p) => s + p.quantidade, 0)
  const previo = estoqueHoje == null ? 0 : Math.max(0, consumoNaoRegistrado(importado, estoqueHoje, conhecidas))

  const { alocacoes } = alocarPEPS(
    pedidos.map(p => ({ id: p.id, data: p.data_compra, qtd: p.quantidade })), grupo.lotes, previo,
  )

  // agrupa por custo (arredondado a centavos de centavo) para gravar em lote
  const porCusto = new Map<string, string[]>()
  const meses = new Set<string>()
  let cmvAntes = 0, cmvDepois = 0
  for (const a of alocacoes) {
    if (a.custoUnit == null) continue
    const p = pedidos.find(x => x.id === a.id)!
    cmvAntes += custoTotalLinha(p)
    cmvDepois += a.custoUnit * p.quantidade
    if (p.custo_produto != null && Math.abs(p.custo_produto - a.custoUnit) < 0.0001) continue
    const k = a.custoUnit.toFixed(4)
    porCusto.set(k, [...(porCusto.get(k) ?? []), a.id])
    meses.add(`${p.data_compra.getFullYear()}-${p.data_compra.getMonth() + 1}`)
  }
  let alterados = 0
  for (const [custo, ids] of porCusto) {
    const r = await prisma.ml_pedido.updateMany({ where: { id: { in: ids }, workspace_id: workspaceId }, data: { custo_produto: Number(custo) } })
    alterados += r.count
  }

  for (const m of meses) {
    const [ano, mes] = m.split('-').map(Number)
    await recalcularCMVMesML(workspaceId, ano, mes)
  }
  console.log(`[cmv-peps] ${sku}: ${alterados} pedidos, ${meses.size} meses, CMV ${cmvAntes.toFixed(2)} → ${cmvDepois.toFixed(2)} (consumo prévio ${previo})`)
  revalidatePath('/faturamento/cmv')
  revalidatePath('/marketplaces/pedidos')
  return { pedidos: alterados, meses: meses.size, cmvAntes, cmvDepois }
}

/** Atualiza o lançamento "CUSTO_PRODUTOS … ML Import" do mês com o CMV dos pedidos (mesma regra do rateio). */
async function recalcularCMVMesML(workspaceId: string, ano: number, mes: number) {
  const fat = await prisma.faturamento_mes.findUnique({
    where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano, mes } }, select: { id: true },
  })
  if (!fat) return
  const pedidosMes = await prisma.ml_pedido.findMany({
    where: {
      workspace_id: workspaceId, status: { not: 'cancelled' }, custo_produto: { not: null },
      data_compra: { gte: new Date(ano, mes - 1, 1), lt: new Date(ano, mes, 1) },
    },
    select: { custo_produto: true, quantidade: true },
  })
  const total = pedidosMes.reduce((s, p) => s + custoTotalLinha(p), 0)
  const lanc = await prisma.lancamento.findFirst({
    where: { faturamento_id: fat.id, categoria: 'CUSTO_PRODUTOS', descricao: { contains: 'ML Import' }, status: 'CONFIRMADO' },
    select: { id: true },
  })
  if (!lanc) return
  await prisma.lancamento.update({ where: { id: lanc.id }, data: { valor: total } })
  await recalcularMes(fat.id, workspaceId, ano, mes)
}
