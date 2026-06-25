'use server'

import { getAuthContext } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTokenValido } from '@/actions/ml'

const ML_API = 'https://api.mercadolibre.com'

// Extrai o ID MLB do link do anúncio
function extractMLBId(url: string): string | null {
  // Formatos: /p/MLB123, /MLB123, ?item_id=MLB123, MLB123 direto
  const patterns = [
    /MLB[\w]+/i,
    /item_id=(MLB[\w]+)/i,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return (m[1] ?? m[0]).toUpperCase()
  }
  return null
}

export interface MLListingTaxas {
  itemId: string
  title: string
  price: number
  listingTypeId: string
  listingTypeLabel: string
  feePercent: number       // comissão % (ex: 11.5)
  fixedFee: number         // taxa fixa em R$ (ex: 6.50)
  freeShipping: boolean
  categoryId: string
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

// Taxa fixa padrão do ML por tipo de anúncio
const LISTING_FIXED_FEES: Record<string, number> = {
  gold_pro:     6.50,
  gold_premium: 6.50,
  gold_special: 6.50,
  gold:         6.50,
  silver:       0,
  bronze:       0,
  free:         0,
}

export async function getMLListingTaxas(url: string): Promise<MLListingTaxas> {
  const { workspaceId } = await getAuthContext()

  const itemId = extractMLBId(url)
  if (!itemId) throw new Error('URL inválida. Cole o link completo do anúncio do Mercado Livre.')

  // Pega o token do workspace (primeira conexão ativa)
  const conexao = await prisma.ml_conexao.findFirst({
    where: { workspace_id: workspaceId, ativo: true },
    orderBy: { created_at: 'asc' },
  })
  if (!conexao) throw new Error('Nenhuma conta ML conectada. Conecte sua conta em Marketplaces.')

  const token = await getTokenValido(conexao.id, workspaceId)

  // Busca o item na API do ML
  const res = await fetch(`${ML_API}/items/${itemId}`, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 0 },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Erro ao buscar anúncio ML: ${err}`)
  }
  const item = await res.json()

  // Extrai a taxa de comissão do sale_terms
  const saleFeeTerm = item.sale_terms?.find((t: { id: string }) => t.id === 'SALE_FEE')
  const feePercent: number = saleFeeTerm?.value_struct?.number ?? item.sale_fee ?? 11.5

  const listingTypeId: string = item.listing_type_id ?? 'gold_special'
  const fixedFee = LISTING_FIXED_FEES[listingTypeId] ?? 6.50

  return {
    itemId,
    title:            item.title ?? '',
    price:            item.price ?? 0,
    listingTypeId,
    listingTypeLabel: LISTING_TYPE_LABELS[listingTypeId] ?? listingTypeId,
    feePercent,
    fixedFee,
    freeShipping:     item.shipping?.free_shipping ?? false,
    categoryId:       item.category_id ?? '',
  }
}
