/**
 * Mercado Livre Product Ads — leitura de métricas diárias.
 * Docs: developers.mercadolivre.com.br/pt_br/product-ads-para-catalogo-e-user-products-leitura
 *   1) GET /advertising/advertisers?product_id=PADS            (Api-Version: 1) → advertiser_id + site_id
 *   2) GET /advertising/{site}/advertisers/{id}/product_ads/campaigns/search
 *        ?date_from&date_to&metrics=…&aggregation_type=DAILY   (api-version: 2) → results[] com date + métricas
 * Os endpoints antigos (/advertising/product_ads/…, product_ads_2) estão descontinuados.
 */

const API = 'https://api.mercadolibre.com'
const METRICAS = 'cost,clicks,prints,units_quantity,direct_amount,total_amount'

export type AdsDia = {
  data: string // YYYY-MM-DD
  custo: number
  receita: number
  receita_direta: number
  unidades: number
  cliques: number
  impressoes: number
}

type Anunciante = { advertiser_id: number | string; site_id: string }

export async function buscarAnuncianteML(token: string): Promise<Anunciante | null> {
  const res = await fetch(`${API}/advertising/advertisers?product_id=PADS`, {
    headers: { Authorization: `Bearer ${token}`, 'Api-Version': '1' },
  })
  if (!res.ok) return null
  const body = await res.json()
  const adv = body?.advertisers?.[0]
  return adv?.advertiser_id != null ? { advertiser_id: adv.advertiser_id, site_id: adv.site_id ?? 'MLB' } : null
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10)
}

/** Soma por data (a API pode devolver uma linha por campanha no mesmo dia). */
export function agregarPorDia(linhas: Array<Record<string, unknown>>): AdsDia[] {
  const mapa = new Map<string, AdsDia>()
  const n = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : 0)
  for (const l of linhas) {
    const data = typeof l.date === 'string' ? l.date.slice(0, 10) : null
    if (!data) continue
    const a = mapa.get(data) ?? { data, custo: 0, receita: 0, receita_direta: 0, unidades: 0, cliques: 0, impressoes: 0 }
    a.custo += n(l.cost)
    a.receita += n(l.total_amount)
    a.receita_direta += n(l.direct_amount)
    a.unidades += n(l.units_quantity)
    a.cliques += n(l.clicks)
    a.impressoes += n(l.prints)
    mapa.set(data, a)
  }
  return Array.from(mapa.values()).sort((a, b) => a.data.localeCompare(b.data))
}

/** Métricas diárias do anunciante entre as datas (inclusive). Retorna null se a conta não tem Product Ads. */
export async function buscarAdsDiariosML(token: string, desde: Date, ate: Date): Promise<AdsDia[] | null> {
  const adv = await buscarAnuncianteML(token)
  if (!adv) return null
  const linhas: Array<Record<string, unknown>> = []
  let offset = 0
  const limit = 50
  for (let pagina = 0; pagina < 40; pagina++) {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      date_from: iso(desde),
      date_to: iso(ate),
      metrics: METRICAS,
      aggregation_type: 'DAILY',
    })
    const res = await fetch(
      `${API}/advertising/${adv.site_id}/advertisers/${adv.advertiser_id}/product_ads/campaigns/search?${params}`,
      { headers: { Authorization: `Bearer ${token}`, 'api-version': '2' } },
    )
    if (!res.ok) throw new Error(`Product Ads ML: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
    const body = await res.json()
    const results: Array<Record<string, unknown>> = body?.results ?? []
    linhas.push(...results)
    const total = body?.paging?.total ?? 0
    offset += limit
    if (results.length === 0 || offset >= total) break
  }
  return agregarPorDia(linhas)
}
