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
  const m = t.match(/MLB(\d+)/i)
  return m ? `MLB${m[1]}` : null
}

export async function buscarTaxaML(input: string, price: number): Promise<MLFeeResult> {
  const mlbId = parseMlbId(input)
  if (!mlbId || price <= 0) return FALLBACK

  try {
    // Check cache em produto_catalogo (30 dias)
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
      return {
        comissao_perc: Number(cached.ml_fee_perc),
        taxa_fixa: 0,
        category_id: cached.ml_category_id ?? undefined,
        source: 'cache',
      }
    }

    // Busca categoria do anúncio
    const itemRes = await fetch(
      `https://api.mercadolibre.com/items/${mlbId}?attributes=category_id`,
      { cache: 'no-store' }
    )
    if (!itemRes.ok) return FALLBACK
    const item: { category_id?: string } = await itemRes.json()
    const categoryId = item.category_id
    if (!categoryId) return FALLBACK

    // Busca tabela de comissões por categoria e preço
    const pricesRes = await fetch(
      `https://api.mercadolibre.com/sites/MLB/listing_prices?price=${price}&category_id=${categoryId}`,
      { cache: 'no-store' }
    )
    if (!pricesRes.ok) return FALLBACK
    const prices: Array<{ listing_type_id: string; amount?: number; sale_fee_amount?: number }> =
      await pricesRes.json()

    // Prefere Clássico (gold_special), depois Premium (gold_pro)
    const entry =
      prices.find(p => p.listing_type_id === 'gold_special') ??
      prices.find(p => p.listing_type_id === 'gold_pro') ??
      prices[0]
    const feeAmount = entry?.amount ?? entry?.sale_fee_amount
    if (!feeAmount) return FALLBACK

    const comissao_perc = Math.round((feeAmount / price) * 1000) / 10  // 1 casa decimal

    // Persiste cache no produto_catalogo se o produto existir com esse ml_item_id
    await prisma.produto_catalogo.updateMany({
      where: { ml_item_id: mlbId },
      data: {
        ml_category_id: categoryId,
        ml_fee_perc: comissao_perc,
        ml_fee_checked: new Date(),
      },
    })

    return { comissao_perc, taxa_fixa: 0, category_id: categoryId, source: 'api' }
  } catch {
    return FALLBACK
  }
}
