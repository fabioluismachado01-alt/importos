import {
  ShoppingBag, Package, Music2, Heart, Home, Store, type LucideIcon,
} from 'lucide-react'

/**
 * Identidade visual de cada marketplace (cor + ícone) usada em todo o
 * sistema (cards de importação, seleção de relatório, listagens, etc.)
 *
 * Aceita tanto os ids em MAIÚSCULO usados no banco/back-end (MERCADO_LIVRE,
 * CASAS_BAHIA, ...) quanto os ids curtos usados em algumas telas (ml, amazon...).
 */
export interface MarketplaceBrand {
  nome: string
  cor: string       // cor principal (fundo do badge)
  iconCor: string   // cor do ícone/glifo
  icon: LucideIcon
}

const BRANDS: Record<string, MarketplaceBrand> = {
  MERCADO_LIVRE: { nome: 'Mercado Livre', cor: '#FFE600', iconCor: '#2D3277', icon: ShoppingBag },
  ML:            { nome: 'Mercado Livre', cor: '#FFE600', iconCor: '#2D3277', icon: ShoppingBag },
  SHOPEE:        { nome: 'Shopee',        cor: '#EE4D2D', iconCor: '#FFFFFF', icon: ShoppingBag },
  AMAZON:        { nome: 'Amazon',        cor: '#FF9900', iconCor: '#131921', icon: Package },
  MAGALU:        { nome: 'Magalu',        cor: '#0086FF', iconCor: '#FFFFFF', icon: Heart },
  TIKTOK:        { nome: 'TikTok Shop',   cor: '#010101', iconCor: '#FFFFFF', icon: Music2 },
  CASAS_BAHIA:   { nome: 'Casas Bahia',   cor: '#004A93', iconCor: '#FFFFFF', icon: Home },
  OUTRO:         { nome: 'Outro',         cor: '#64748B', iconCor: '#FFFFFF', icon: Store },
}

const FALLBACK: MarketplaceBrand = BRANDS.OUTRO

/** Resolve a identidade visual de um marketplace a partir do id (case-insensitive). */
export function getMarketplaceBrand(id: string): MarketplaceBrand {
  return BRANDS[id?.toUpperCase()] ?? FALLBACK
}

interface MarketplaceLogoProps {
  id: string
  size?: number
  className?: string
  rounded?: string
}

/** Badge/"capa" com a cor e o ícone característicos do marketplace. */
export function MarketplaceLogo({ id, size = 40, className = '', rounded = 'rounded-xl' }: MarketplaceLogoProps) {
  const brand = getMarketplaceBrand(id)
  const Icon = brand.icon
  return (
    <div
      className={`${rounded} flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size, background: brand.cor }}
      title={brand.nome}
    >
      <Icon size={Math.round(size * 0.55)} color={brand.iconCor} strokeWidth={2.25} />
    </div>
  )
}
