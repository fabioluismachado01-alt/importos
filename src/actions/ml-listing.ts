'use server'

import { getAuthContext } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTokenValido } from '@/actions/ml'

const ML_API = 'https://api.mercadolibre.com'

function extractMLBId(url: string): string | null {
  // Prioriza item_id= do query param (variante específica vs grupo de produto)
  const qpMatch = url.match(/item_id=(MLB[\w]+)/i)
  if (qpMatch) return qpMatch[1].toUpperCase()
  // Fallback: primeiro MLB encontrado na URL
  const pathMatch = url.match(/MLB[\w]+/i)
  if (pathMatch) return pathMatch[0].toUpperCase()
  return null
}

export interface MLListingTaxas {
  itemId: string
  title: string
  price: number
  listingTypeId: string
  listingTypeLabel: string
  feePercent: number      // % comissão efetiva (ex: 12.50)
  fixedFee: number        // taxa fixa R$ (0 quando já embutida no %)
  freight: number         // frete vendedor médio R$ (do histórico, ou 0)
  freeShipping: boolean
  fonte: 'historico' | 'api_default'  // de onde veio o dado
  pedidosAnalisados: number
}

const LISTING_TYPE_LABELS: Record<string, string> = {
  gold_pro:      'Premium',
  gold_premium:  'Premium',
  gold_special:  'Clássico',
  gold:          'Clássico',
  silver:        'Prata',
  bronze:        'Bronze',
  free:          'Grátis',
}

export async function getMLListingTaxas(url: string): Promise<MLListingTaxas> {
  const { workspaceId } = await getAuthContext()

  const itemId = extractMLBId(url)
  if (!itemId) throw new Error('URL inválida. Cole o link completo do anúncio do Mercado Livre.')

  // Token ML do workspace
  const conexao = await prisma.ml_conexao.findFirst({
    where: { workspace_id: workspaceId, ativo: true },
    orderBy: { created_at: 'asc' },
  })
  if (!conexao) throw new Error('Nenhuma conta ML conectada. Conecte sua conta em Marketplaces.')

  const token = await getTokenValido(conexao.id, workspaceId)

  // Busca dados básicos do anúncio na API ML
  const res = await fetch(
    `${ML_API}/items/${itemId}?attributes=id,title,price,listing_type_id,category_id,shipping`,
    { headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 0 } }
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anúncio não encontrado (${res.status}). Verifique o link.`)
  }
  const item = await res.json()

  const listingTypeId: string = item.listing_type_id ?? 'gold_special'
  const price: number = item.price ?? 0

  // Estratégia 1: histórico de pedidos reais deste item no workspace
  const historico = await prisma.ml_pedido.findMany({
    where: {
      workspace_id: workspaceId,
      ml_item_id: itemId,
      status: 'paid',
      tarifa: { gt: 0 },
      valor_venda: { gt: 0 },
    },
    select: { tarifa: true, frete_vendedor: true, valor_venda: true, quantidade: true },
    orderBy: { data_compra: 'desc' },
    take: 20,
  })

  if (historico.length > 0) {
    // Calcula % efetiva média: tarifa / (valor_venda * quantidade)
    const avgFeePct = historico.reduce((sum, p) => {
      return sum + (p.tarifa / (p.valor_venda * p.quantidade)) * 100
    }, 0) / historico.length

    // Frete médio dos pedidos com frete > 0
    const freteOrders = historico.filter(p => p.frete_vendedor > 0)
    const avgFrete = freteOrders.length > 0
      ? freteOrders.reduce((s, p) => s + p.frete_vendedor, 0) / freteOrders.length
      : 0

    return {
      itemId,
      title:             item.title ?? '',
      price,
      listingTypeId,
      listingTypeLabel:  LISTING_TYPE_LABELS[listingTypeId] ?? listingTypeId,
      feePercent:        Math.round(avgFeePct * 100) / 100,
      fixedFee:          0, // já embutido no % histórico
      freight:           Math.round(avgFrete * 100) / 100,
      freeShipping:      item.shipping?.free_shipping ?? false,
      fonte:             'historico',
      pedidosAnalisados: historico.length,
    }
  }

  // Estratégia 2 (fallback): tabela base do tipo de anúncio
  // Busca % base na API do tipo de anúncio
  const ltRes = await fetch(`${ML_API}/sites/MLB/listing_types/${listingTypeId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  let feePercent = 11.5
  let fixedFee   = 6.50
  if (ltRes.ok) {
    const lt = await ltRes.json()
    const pct = lt.configuration?.sale_fee_criteria?.percentage_of_fee_amount
    if (typeof pct === 'number' && pct > 0) {
      feePercent = pct
      fixedFee   = 0
    }
  }

  return {
    itemId,
    title:             item.title ?? '',
    price,
    listingTypeId,
    listingTypeLabel:  LISTING_TYPE_LABELS[listingTypeId] ?? listingTypeId,
    feePercent,
    fixedFee,
    freight:           0,
    freeShipping:      item.shipping?.free_shipping ?? false,
    fonte:             'api_default',
    pedidosAnalisados: 0,
  }
}
