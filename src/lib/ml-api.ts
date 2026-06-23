/**
 * Cliente da API do Mercado Livre
 * Docs: https://developers.mercadolivre.com.br
 */

const ML_API_BASE = 'https://api.mercadolibre.com'
const ML_AUTH_URL = 'https://auth.mercadolivre.com.br/authorization'
const ML_TOKEN_URL = 'https://api.mercadolibre.com/oauth/token'

// ─── URL de Autorização OAuth ────────────────────────────────────────────────

export function getMLAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.ML_APP_ID!,
    redirect_uri: process.env.ML_REDIRECT_URI!,
    state,
  })
  return `${ML_AUTH_URL}?${params}`
}

// ─── Trocar código por tokens ─────────────────────────────────────────────────

export async function exchangeMLCode(code: string): Promise<MLTokenResponse> {
  const res = await fetch(ML_TOKEN_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.ML_APP_ID!,
      client_secret: process.env.ML_SECRET_KEY!,
      code,
      redirect_uri: process.env.ML_REDIRECT_URI!,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`ML token exchange error: ${err}`)
  }
  return res.json()
}

// ─── Renovar token expirado ───────────────────────────────────────────────────

export async function refreshMLToken(refreshToken: string): Promise<MLTokenResponse> {
  const res = await fetch(ML_TOKEN_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.ML_APP_ID!,
      client_secret: process.env.ML_SECRET_KEY!,
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`ML refresh token error: ${err}`)
  }
  return res.json()
}

// ─── Dados do vendedor ────────────────────────────────────────────────────────

export async function getMLUser(accessToken: string): Promise<MLUser> {
  const res = await fetch(`${ML_API_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Erro ao buscar usuário ML')
  return res.json()
}

// ─── Buscar pedidos ───────────────────────────────────────────────────────────

export async function getMLOrders(
  accessToken: string,
  sellerId: string,
  offset = 0,
  limit = 50,
  dateFrom?: Date,
  status: 'paid' | 'cancelled' = 'paid',
  useDateLastUpdated = false,
): Promise<MLOrdersResponse> {
  const params = new URLSearchParams({
    seller: sellerId,
    'order.status': status,
    sort: 'date_desc',
    offset: String(offset),
    limit: String(limit),
  })
  if (dateFrom) {
    const key = useDateLastUpdated ? 'order.date_last_updated.from' : 'order.date_created.from'
    params.set(key, dateFrom.toISOString())
  }

  const res = await fetch(`${ML_API_BASE}/orders/search?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Erro ao buscar pedidos ML: ${err}`)
  }
  return res.json()
}

// ─── Buscar IDs dos anúncios do vendedor ─────────────────────────────────────

export async function getMLUserItemIds(
  accessToken: string,
  userId: string,
  offset = 0,
  limit = 100,
): Promise<{ results: string[]; paging: { total: number; offset: number; limit: number } }> {
  const params = new URLSearchParams({
    status: 'active',
    offset: String(offset),
    limit: String(limit),
  })
  const res = await fetch(`${ML_API_BASE}/users/me/items/search?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Erro ao buscar itens do vendedor ML: ${res.status} ${body}`)
  }
  return res.json()
}

// ─── Buscar detalhes de itens em lote (até 20 por vez) ───────────────────────

export async function getMLItemsBatch(
  accessToken: string,
  itemIds: string[],
): Promise<MLItemDetail[]> {
  const ids = itemIds.slice(0, 20).join(',')
  const res = await fetch(
    `${ML_API_BASE}/items?ids=${ids}&attributes=id,title,thumbnail,available_quantity,status,shipping`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Erro ao buscar detalhes de itens ML: ${res.status} ${body}`)
  }
  const data: Array<{ code: number; body: MLItemDetail }> = await res.json()
  return data.filter(d => d.code === 200).map(d => d.body)
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface MLItemDetail {
  id: string
  title: string
  thumbnail?: string
  seller_sku?: string | null
  available_quantity: number
  status: string
  shipping?: {
    logistic_type?: string
    free_shipping?: boolean
    mode?: string
  }
}

export interface MLTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number   // segundos
  user_id: number
  token_type: string
}

export interface MLUser {
  id: number
  nickname: string
  email?: string
  permalink?: string
}

export interface MLOrderItem {
  item: {
    id: string
    title: string
    seller_sku: string | null
    thumbnail?: string
    picture_url?: string
  }
  quantity: number
  unit_price: number
  sale_fee: number
  currency_id: string
}

export interface MLOrder {
  id: number
  status: string
  date_created: string
  date_last_updated: string
  buyer: {
    id: number
    nickname: string
  }
  order_items: MLOrderItem[]
  shipping: {
    id?: number
    cost?: number | null
    status?: string
  } | null
  total_amount: number
  paid_amount: number
}

export interface MLOrdersResponse {
  results: MLOrder[]
  paging: {
    total: number
    offset: number
    limit: number
  }
}
