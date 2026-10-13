/**
 * Shopee Ads — classificação das linhas do extrato e custo econômico.
 *
 * Bug SHP-3: a rota devolvia `deducoes_total` como custo de Ads. As deduções são
 * o débito bruto da carteira; parte delas é paga com crédito concedido pela
 * própria Shopee (Free Ads Credit, ROAS Protection Rebate), que não sai do caixa
 * do vendedor. O custo econômico real é `deduções − créditos Shopee`.
 *
 * Recarga NÃO reduz custo: é dinheiro do próprio vendedor entrando na carteira.
 */

export type TipoLinhaAds = 'DEDUCAO' | 'RECARGA' | 'CREDITO_SHOPEE' | 'OUTRO'

function semAcento(s: unknown): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * Classifica uma linha do extrato pela descrição.
 * A ordem importa: "Crédito de Recarga" contém "crédito", então recarga é
 * testada antes dos créditos concedidos pela Shopee.
 */
export function classificarLinhaAds(descricao: unknown): TipoLinhaAds {
  const d = semAcento(descricao)
  if (!d) return 'OUTRO'
  if (d.includes('deduction') || d.includes('deducao')) return 'DEDUCAO'
  if (d.includes('recarga') || d.includes('recharge')) return 'RECARGA'
  if (d.includes('free ads') || d.includes('roas protection') || d.includes('rebate')) return 'CREDITO_SHOPEE'
  return 'OUTRO'
}

/**
 * Custo econômico de Ads no período.
 * Nunca retorna valor negativo: crédito excedente não vira receita de Ads.
 */
export function calcularCustoEconomicoAds(input: {
  deducoes_total: number
  creditos_shopee: number
}): number {
  const deducoes = Math.abs(Number(input.deducoes_total) || 0)
  const creditos = Math.abs(Number(input.creditos_shopee) || 0)
  return Math.max(0, Math.round((deducoes - creditos) * 100) / 100)
}
