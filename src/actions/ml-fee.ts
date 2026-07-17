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

// Cache em memória do token ML (válido ~6h)
let mlTokenCache: { token: string; expiresAt: number } | null = null

async function getMLToken(): Promise<string | null> {
  const clientId = process.env.ML_CLIENT_ID
  const clientSecret = process.env.ML_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  if (mlTokenCache && Date.now() < mlTokenCache.expiresAt - 5 * 60 * 1000) {
    return mlTokenCache.token
  }

  try {
    const res = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`,
      cache: 'no-store',
    })
    if (!res.ok) {
      console.log('[ml-fee] token error:', res.status, await res.text())
      return null
    }
    const data: { access_token?: string; expires_in?: number } = await res.json()
    if (!data.access_token) return null
    mlTokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 21600) * 1000 }
    console.log('[ml-fee] novo token obtido, expira em', data.expires_in, 's')
    return mlTokenCache.token
  } catch (err) {
    console.log('[ml-fee] erro ao obter token:', err)
    return null
  }
}

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
  console.log('[ml-fee] input mlbId:', mlbId, 'price:', price)
  if (!mlbId || price <= 0) return FALLBACK

  try {
    const cutoff = new Date(Date.now() - CACHE_MS)
    const cached = await prisma.produto_catalogo.findFirst({
      where: { ml_item_id: mlbId, ml_fee_perc: { not: null }, ml_fee_checked: { gt: cutoff } },
      select: { ml_fee_perc: true, ml_category_id: true, ml_taxa_fixa: true },
    })
    if (cached?.ml_fee_perc != null) {
      console.log('[ml-fee] cache hit:', cached)
      return {
        comissao_perc: Number(cached.ml_fee_perc),
        taxa_fixa: Number(cached.ml_taxa_fixa ?? 0),
        category_id: cached.ml_category_id ?? undefined,
        source: 'cache',
      }
    }

    const token = await getMLToken()
    if (!token) {
      console.log('[ml-fee] sem credenciais ML_CLIENT_ID/ML_CLIENT_SECRET — usando fallback')
      return FALLBACK
    }
    const headers = { Authorization: `Bearer ${token}` }

    const itemRes = await fetch(
      `https://api.mercadolibre.com/items/${mlbId}?attributes=category_id`,
      { cache: 'no-store', headers }
    )
    console.log('[ml-fee] itemRes status:', itemRes.status)
    if (!itemRes.ok) return FALLBACK
    const item: { category_id?: string } = await itemRes.json()
    const categoryId = item.category_id
    console.log('[ml-fee] category_id:', categoryId)
    if (!categoryId) return FALLBACK

    const pricesRes = await fetch(
      `https://api.mercadolibre.com/sites/MLB/listing_prices?price=${price}&category_id=${categoryId}`,
      { cache: 'no-store', headers }
    )
    console.log('[ml-fee] pricesRes status:', pricesRes.status)
    if (!pricesRes.ok) return FALLBACK
    const prices: Array<Record<string, unknown>> = await pricesRes.json()
    console.log('[ml-fee] prices raw:', JSON.stringify(prices))

    const entry =
      prices.find(p => p.listing_type_id === 'gold_special') ??
      prices.find(p => p.listing_type_id === 'gold_pro') ??
      prices[0]
    console.log('[ml-fee] entry:', JSON.stringify(entry))
    if (!entry) return FALLBACK

    // sale_fee_amount = comissão percentual aplicada ao preço
    // amount = taxa fixa por unidade (pode ser 0 em alguns tipos)
    const saleFeeAmount = entry.sale_fee_amount as number | undefined
    const fixedAmount = entry.amount as number | undefined
    console.log('[ml-fee] sale_fee_amount:', saleFeeAmount, 'amount:', fixedAmount)

    if (!saleFeeAmount && !fixedAmount) return FALLBACK

    const comissao_perc = saleFeeAmount
      ? Math.round((saleFeeAmount / price) * 1000) / 10
      : Math.round(((fixedAmount ?? 0) / price) * 1000) / 10
    const taxa_fixa = fixedAmount && saleFeeAmount ? fixedAmount : 0

    await prisma.produto_catalogo.updateMany({
      where: { ml_item_id: mlbId },
      data: { ml_category_id: categoryId, ml_fee_perc: comissao_perc, ml_taxa_fixa: taxa_fixa, ml_fee_checked: new Date() },
    })

    console.log('[ml-fee] resultado:', { comissao_perc, taxa_fixa, categoryId })
    return { comissao_perc, taxa_fixa, category_id: categoryId, source: 'api' }
  } catch (err) {
    console.log('[ml-fee] erro:', err)
    return FALLBACK
  }
}
