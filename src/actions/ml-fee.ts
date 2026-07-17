'use server'

import { prisma } from '@/lib/prisma'

export interface MLFeeResult {
  comissao_perc: number
  taxa_fixa: number
  category_id?: string
  source: 'cache' | 'api' | 'fallback'
}

const FALLBACK: MLFeeResult = { comissao_perc: 11.5, taxa_fixa: 6.50, source: 'fallback' }
const CACHE_MS = 30 * 24 * 60 * 60 * 1000

function parseMlbId(input: string): string | null {
  const t = input.trim()
  if (/^MLB\d+$/i.test(t)) return t.toUpperCase()
  // Prefer item_id: param (specific listing) over catalog ID (/p/MLB...)
  const itemParam = t.match(/item_id:(MLB\d+)/i)
  if (itemParam) return itemParam[1].toUpperCase()
  const m = t.match(/MLB(\d+)/i)
  return m ? `MLB${m[1]}` : null
}

export async function buscarTaxaML(input: string, price: number): Promise<MLFeeResult> {
  const mlbId = parseMlbId(input)
  console.log('[ml-fee] input:', input, '→ mlbId:', mlbId, 'price:', price)
  if (!mlbId || price <= 0) return FALLBACK

  try {
    const cutoff = new Date(Date.now() - CACHE_MS)
    const cached = await prisma.produto_catalogo.findFirst({
      where: {
        ml_item_id: mlbId,
        ml_fee_perc: { not: null },
        ml_fee_checked: { gt: cutoff },
      },
      select: { ml_fee_perc: true, ml_category_id: true },
    })
    if (cached?.ml_fee_perc != null) {
      console.log('[ml-fee] cache hit:', cached)
      return {
        comissao_perc: Number(cached.ml_fee_perc),
        taxa_fixa: 0,
        category_id: cached.ml_category_id ?? undefined,
        source: 'cache',
      }
    }

    const itemRes = await fetch(
      `https://api.mercadolibre.com/items/${mlbId}?attributes=category_id`,
      { cache: 'no-store' }
    )
    console.log('[ml-fee] itemRes status:', itemRes.status)
    if (!itemRes.ok) {
      const body = await itemRes.text()
      console.log('[ml-fee] itemRes error body:', body)
      return FALLBACK
    }
    const item: { category_id?: string } = await itemRes.json()
    console.log('[ml-fee] item:', item)
    const categoryId = item.category_id
    if (!categoryId) return FALLBACK

    const pricesRes = await fetch(
      `https://api.mercadolibre.com/sites/MLB/listing_prices?price=${price}&category_id=${categoryId}`,
      { cache: 'no-store' }
    )
    console.log('[ml-fee] pricesRes status:', pricesRes.status)
    if (!pricesRes.ok) {
      const body = await pricesRes.text()
      console.log('[ml-fee] pricesRes error body:', body)
      return FALLBACK
    }
    const prices: Array<Record<string, unknown>> = await pricesRes.json()
    console.log('[ml-fee] prices raw:', JSON.stringify(prices))

    const entry =
      prices.find(p => p.listing_type_id === 'gold_special') ??
      prices.find(p => p.listing_type_id === 'gold_pro') ??
      prices[0]
    console.log('[ml-fee] entry:', JSON.stringify(entry))

    const feeAmount = (entry?.amount ?? entry?.sale_fee_amount) as number | undefined
    console.log('[ml-fee] feeAmount:', feeAmount)
    if (!feeAmount) return FALLBACK

    const comissao_perc = Math.round((feeAmount / price) * 1000) / 10

    await prisma.produto_catalogo.updateMany({
      where: { ml_item_id: mlbId },
      data: {
        ml_category_id: categoryId,
        ml_fee_perc: comissao_perc,
        ml_fee_checked: new Date(),
      },
    })

    return { comissao_perc, taxa_fixa: 0, category_id: categoryId, source: 'api' }
  } catch (err) {
    console.log('[ml-fee] caught error:', err)
    return FALLBACK
  }
}
