/**
 * Cliente da Shopee Open Platform (API v2).
 *
 * Assinatura (HMAC-SHA256 com a Partner Key, hex):
 *  - APIs públicas (auth):  partner_id + path + timestamp
 *  - APIs da loja:          partner_id + path + timestamp + access_token + shop_id
 *
 * Variáveis de ambiente (criadas pelo dono no Vercel, nunca no código):
 *  SHOPEE_PARTNER_ID, SHOPEE_PARTNER_KEY
 *  SHOPEE_API_HOST (opcional) — padrão produção; para sandbox use https://partner.test-stable.shopeemobile.com
 */
import { createHmac } from 'crypto'

const HOST_PADRAO = 'https://partner.shopeemobile.com'

export function shopeeConfigurada(): boolean {
  return !!process.env.SHOPEE_PARTNER_ID && !!process.env.SHOPEE_PARTNER_KEY
}

function config() {
  const partnerId = process.env.SHOPEE_PARTNER_ID
  const partnerKey = process.env.SHOPEE_PARTNER_KEY
  if (!partnerId || !partnerKey) throw new Error('Shopee não configurada: crie SHOPEE_PARTNER_ID e SHOPEE_PARTNER_KEY no Vercel.')
  return { partnerId: Number(partnerId), partnerKey, host: process.env.SHOPEE_API_HOST || HOST_PADRAO }
}

/** Assinatura da Shopee — exportada para teste. */
export function assinarShopee(partnerKey: string, partes: Array<string | number>): string {
  return createHmac('sha256', partnerKey).update(partes.join('')).digest('hex')
}

const agora = () => Math.floor(Date.now() / 1000)

/** Link de autorização da loja. A Shopee devolve ?code=&shop_id= no redirect. */
export function urlAutorizacaoShopee(redirect: string): string {
  const { partnerId, partnerKey, host } = config()
  const path = '/api/v2/shop/auth_partner'
  const ts = agora()
  const sign = assinarShopee(partnerKey, [partnerId, path, ts])
  const q = new URLSearchParams({ partner_id: String(partnerId), timestamp: String(ts), sign, redirect })
  return `${host}${path}?${q}`
}

export type TokensShopee = { access_token: string; refresh_token: string; expire_in: number }

async function chamarPublica<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const { partnerId, partnerKey, host } = config()
  const ts = agora()
  const sign = assinarShopee(partnerKey, [partnerId, path, ts])
  const res = await fetch(`${host}${path}?partner_id=${partnerId}&timestamp=${ts}&sign=${sign}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, partner_id: partnerId }),
    cache: 'no-store',
  })
  const json = await res.json()
  if (json.error) throw new Error(`Shopee ${path}: ${json.error} ${json.message ?? ''}`)
  return json as T
}

export function trocarCodigoShopee(code: string, shopId: number) {
  return chamarPublica<TokensShopee>('/api/v2/auth/token/get', { code, shop_id: shopId })
}

export function renovarTokenShopee(refreshToken: string, shopId: number) {
  return chamarPublica<TokensShopee>('/api/v2/auth/access_token/get', { refresh_token: refreshToken, shop_id: shopId })
}

/** Chamada GET de API da loja (com retry simples em limite de taxa). */
export async function shopeeGet<T = any>( // eslint-disable-line @typescript-eslint/no-explicit-any
  path: string, accessToken: string, shopId: number, params: Record<string, string | number> = {},
): Promise<T> {
  const { partnerId, partnerKey, host } = config()
  for (let tentativa = 0; ; tentativa++) {
    const ts = agora()
    const sign = assinarShopee(partnerKey, [partnerId, path, ts, accessToken, shopId])
    const q = new URLSearchParams({
      partner_id: String(partnerId), timestamp: String(ts), sign,
      access_token: accessToken, shop_id: String(shopId),
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    })
    const res = await fetch(`${host}${path}?${q}`, { cache: 'no-store' })
    const json = await res.json()
    const limite = typeof json.error === 'string' && /rate_limit|system_busy|too_many/i.test(json.error)
    if (limite && tentativa < 3) { await new Promise(r => setTimeout(r, 1500 * (tentativa + 1))); continue }
    if (json.error) throw new Error(`Shopee ${path}: ${json.error} ${json.message ?? ''}`)
    return json as T
  }
}

// ─── Pedidos ──────────────────────────────────────────────────────────────────

/**
 * Lista os order_sn de um intervalo. A Shopee limita cada consulta a 15 dias,
 * então o intervalo é fatiado em janelas.
 */
export async function listarPedidosShopee(
  accessToken: string, shopId: number, desde: Date, ate: Date,
  campo: 'create_time' | 'update_time' = 'create_time',
): Promise<string[]> {
  const JANELA = 15 * 86400
  const sns = new Set<string>()
  let ini = Math.floor(desde.getTime() / 1000)
  const fim = Math.floor(ate.getTime() / 1000)
  while (ini < fim) {
    const fimJanela = Math.min(ini + JANELA - 1, fim)
    let cursor = ''
    for (let pagina = 0; pagina < 50; pagina++) {
      const r = await shopeeGet(`/api/v2/order/get_order_list`, accessToken, shopId, {
        time_range_field: campo, time_from: ini, time_to: fimJanela, page_size: 100, cursor,
      })
      for (const o of r.response?.order_list ?? []) sns.add(o.order_sn)
      if (!r.response?.more) break
      cursor = r.response.next_cursor ?? ''
    }
    ini = fimJanela + 1
  }
  return Array.from(sns)
}

export type ItemPedidoShopee = {
  item_id: number; item_name: string; item_sku?: string; model_id: number; model_sku?: string
  model_quantity_purchased: number; model_discounted_price?: number; image_info?: { image_url?: string }
}
export type PedidoShopee = {
  order_sn: string; order_status: string; create_time: number; buyer_username?: string
  item_list: ItemPedidoShopee[]
}

/** Detalhe de pedidos (até 50 por chamada). */
export async function detalharPedidosShopee(accessToken: string, shopId: number, sns: string[]): Promise<PedidoShopee[]> {
  const out: PedidoShopee[] = []
  for (let i = 0; i < sns.length; i += 50) {
    const r = await shopeeGet(`/api/v2/order/get_order_detail`, accessToken, shopId, {
      order_sn_list: sns.slice(i, i + 50).join(','),
      response_optional_fields: 'buyer_username,item_list,total_amount,pay_time',
    })
    out.push(...(r.response?.order_list ?? []))
  }
  return out
}

/** Extrato financeiro do pedido (comissão, serviço, frete, afiliados, repasse). */
export async function escrowPedidoShopee(accessToken: string, shopId: number, orderSn: string) {
  const r = await shopeeGet(`/api/v2/payment/get_escrow_detail`, accessToken, shopId, { order_sn: orderSn })
  return r.response as EscrowShopee
}

export type EscrowShopee = {
  order_sn: string
  return_order_sn_list?: string[]
  order_income: Record<string, unknown> & {
    escrow_amount?: number
    items?: Array<{ item_id: number; model_id: number; discounted_price?: number; quantity_purchased?: number; ams_commission_fee?: number }>
  }
}

// ─── Ads ──────────────────────────────────────────────────────────────────────

export type AdsDiaShopee = { date: string; expense: number; broad_gmv: number; direct_gmv: number; broad_item_sold: number; clicks: number; impression: number }

/** Shopee Ads (CPC) por dia — no máximo 1 mês por consulta, até 6 meses atrás; início ≠ fim. */
export async function adsDiariosShopee(accessToken: string, shopId: number, desde: Date, ate: Date): Promise<AdsDiaShopee[]> {
  const dmy = (d: Date) => `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
  const out: AdsDiaShopee[] = []
  const limite = new Date(Date.now() - 179 * 86400000)
  let ini = desde < limite ? limite : new Date(desde)
  while (ini < ate) {
    const fim = new Date(Math.min(ini.getTime() + 29 * 86400000, ate.getTime()))
    // a API recusa início = fim e datas futuras: recua o início um dia (o dia repetido é sobrescrito no upsert)
    if (dmy(fim) === dmy(ini)) ini = new Date(ini.getTime() - 86400000)
    const r = await shopeeGet(`/api/v2/ads/get_all_cpc_ads_daily_performance`, accessToken, shopId, {
      start_date: dmy(ini), end_date: dmy(fim),
    })
    out.push(...(r.response ?? []))
    ini = new Date(fim.getTime() + 86400000)
  }
  return out
}
