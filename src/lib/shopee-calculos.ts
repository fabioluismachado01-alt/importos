/**
 * Regras de cálculo dos pedidos da Shopee (via API) — funções puras, testadas em tests/shopee-calculos.test.ts.
 *
 * Mesma fórmula da tela de Vendas: Lucro = Valor − Tarifa − Outros − Frete − Imposto − Custo.
 *  - Tarifa = comissão + taxa de serviço (+ taxa de transação do vendedor). No Brasil a Shopee informa
 *    net_commission_fee / net_service_fee (já com o rebate proporcional): usamos o líquido quando existir.
 *  - Outros = comissão de afiliados (AMS) + cupom do vendedor + moedas pagas pelo vendedor +
 *    frete reverso/falha de entrega + demais taxas do extrato que reduzem o repasse.
 *  - Frete = o que sobra para o vendedor: frete real − subsídio Shopee − frete pago pelo comprador (nunca negativo).
 * Valores de pedido são rateados entre as linhas pelo valor de cada item.
 */
import type { EscrowShopee, PedidoShopee } from './shopee-api'

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

export type LinhaShopee = {
  chave: string          // `${item_id}:${model_id}`
  item_id: string
  model_id: string
  titulo: string
  sku: string | null
  foto_url: string | null
  quantidade: number
  valor_venda: number
  tarifa: number
  outros: number
  frete_vendedor: number
  repasse: number | null // escrow_amount rateado (null sem extrato)
}

/** Status Shopee → status ImportOS. UNPAID não é venda (retorna null). */
export function statusShopee(s: string): 'paid' | 'cancelled' | null {
  if (s === 'UNPAID') return null
  if (s === 'CANCELLED' || s === 'IN_CANCEL') return 'cancelled'
  return 'paid'
}

/** Pós-venda: devolução em andamento até o repasse zerar (reembolso integral). */
export function devolucaoShopee(status: string, escrow: EscrowShopee | null): string | null {
  const temDevolucao = status === 'TO_RETURN' || (escrow?.return_order_sn_list?.length ?? 0) > 0
  if (!temDevolucao) return null
  if (escrow && n(escrow.order_income.escrow_amount) <= 0) return 'reembolsado'
  return 'devolucao_em_andamento'
}

/** Componentes do extrato no nível do pedido. */
export function componentesEscrow(inc: Record<string, unknown>) {
  const comissao = typeof inc.net_commission_fee === 'number' ? inc.net_commission_fee : n(inc.commission_fee)
  const servico = typeof inc.net_service_fee === 'number' ? inc.net_service_fee : n(inc.service_fee)
  const tarifa = comissao + servico + n(inc.seller_transaction_fee)
  const frete = Math.max(0, n(inc.actual_shipping_fee) - n(inc.shopee_shipping_rebate) - n(inc.buyer_paid_shipping_fee))
  const afiliados = n(inc.order_ams_commission_fee)
  const outros = afiliados
    + n(inc.voucher_from_seller) + n(inc.seller_coin_cash_back)
    + n(inc.reverse_shipping_fee) + n(inc.final_return_to_seller_shipping_fee)
    + n(inc.seller_order_processing_fee) + n(inc.shipping_seller_protection_fee_amount)
    + n(inc.delivery_seller_protection_fee_premium_amount) + n(inc.pay_per_sale)
  return { comissao, servico, tarifa, frete, afiliados, outros, repasse: n(inc.escrow_amount) }
}

/**
 * Monta as linhas (pedido × item × variação) com valores rateados.
 * Sem extrato (escrow ainda indisponível) a tarifa/frete ficam 0 e repasse null — o sync tenta de novo depois.
 */
export function linhasPedidoShopee(pedido: PedidoShopee, escrow: EscrowShopee | null): LinhaShopee[] {
  const itensEscrow = escrow?.order_income.items ?? []
  const base = pedido.item_list.map(it => {
    const e = itensEscrow.find(x => String(x.item_id) === String(it.item_id) && String(x.model_id) === String(it.model_id))
    const qtd = it.model_quantity_purchased || e?.quantity_purchased || 1
    // discounted_price do extrato já é o subtotal da linha; no detalhe do pedido é unitário
    const valor = e?.discounted_price != null ? e.discounted_price : n(it.model_discounted_price) * qtd
    return { it, e, qtd, valor }
  })
  const totalValor = base.reduce((s, b) => s + b.valor, 0)
  const comp = escrow ? componentesEscrow(escrow.order_income) : null
  const amsItens = base.reduce((s, b) => s + n(b.e?.ams_commission_fee), 0)

  return base.map(({ it, e, qtd, valor }) => {
    const peso = totalValor > 0 ? valor / totalValor : 1 / base.length
    let outros = 0
    if (comp) {
      // afiliado: valor do próprio item quando a Shopee detalha; senão, rateio do total do pedido
      const ams = amsItens > 0 ? n(e?.ams_commission_fee) : comp.afiliados * peso
      outros = ams + (comp.outros - comp.afiliados) * peso
    }
    const sku = (it.model_sku || it.item_sku || '').trim()
    return {
      chave: `${it.item_id}:${it.model_id}`,
      item_id: String(it.item_id),
      model_id: String(it.model_id),
      titulo: it.item_name,
      sku: sku || null,
      foto_url: it.image_info?.image_url ?? null,
      quantidade: qtd,
      valor_venda: valor,
      tarifa: comp ? comp.tarifa * peso : 0,
      outros,
      frete_vendedor: comp ? comp.frete * peso : 0,
      repasse: comp ? comp.repasse * peso : null,
    }
  })
}

/** Diferença entre o que a fórmula calcula e o repasse real da Shopee (diagnóstico do sync). */
export function diferencaRepasse(linhas: LinhaShopee[]): number | null {
  if (linhas.some(l => l.repasse == null)) return null
  const calc = linhas.reduce((s, l) => s + l.valor_venda - l.tarifa - l.outros - l.frete_vendedor, 0)
  const real = linhas.reduce((s, l) => s + (l.repasse ?? 0), 0)
  return calc - real
}
