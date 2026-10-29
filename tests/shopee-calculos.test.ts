import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { statusShopee, devolucaoShopee, componentesEscrow, linhasPedidoShopee, diferencaRepasse } from '../src/lib/shopee-calculos'
import { assinarShopee } from '../src/lib/shopee-api'
import type { PedidoShopee, EscrowShopee } from '../src/lib/shopee-api'

describe('assinatura Shopee', () => {
  it('é HMAC-SHA256 hex da concatenação', () => {
    const esperado = createHmac('sha256', 'chave').update('1001/api/v2/order/get_order_list1700000000tok123').digest('hex')
    expect(assinarShopee('chave', [1001, '/api/v2/order/get_order_list', 1700000000, 'tok', 123])).toBe(esperado)
  })
})

describe('status', () => {
  it('não pago fica fora; cancelado sai das vendas', () => {
    expect(statusShopee('UNPAID')).toBeNull()
    expect(statusShopee('CANCELLED')).toBe('cancelled')
    expect(statusShopee('IN_CANCEL')).toBe('cancelled')
    expect(statusShopee('COMPLETED')).toBe('paid')
    expect(statusShopee('READY_TO_SHIP')).toBe('paid')
  })
  it('devolução', () => {
    expect(devolucaoShopee('COMPLETED', null)).toBeNull()
    expect(devolucaoShopee('TO_RETURN', null)).toBe('devolucao_em_andamento')
    const esc = (escrow_amount: number): EscrowShopee => ({ order_sn: 'X', return_order_sn_list: ['R1'], order_income: { escrow_amount } })
    expect(devolucaoShopee('COMPLETED', esc(0))).toBe('reembolsado')
    expect(devolucaoShopee('COMPLETED', esc(5))).toBe('devolucao_em_andamento')
  })
})

describe('componentesEscrow', () => {
  it('tarifa = comissão + serviço (caso da regra: R$ 2,77 + R$ 5,46)', () => {
    const c = componentesEscrow({ commission_fee: 2.77, service_fee: 5.46, escrow_amount: 6.67 })
    expect(c.tarifa).toBeCloseTo(8.23, 2)
    expect(c.frete).toBe(0)
  })
  it('usa a comissão líquida do Brasil quando informada', () => {
    const c = componentesEscrow({ commission_fee: 3, net_commission_fee: 2.5, service_fee: 5, net_service_fee: 4 })
    expect(c.tarifa).toBeCloseTo(6.5, 6)
  })
  it('afiliado e cupom do vendedor vão em Outros; frete nunca negativo', () => {
    const c = componentesEscrow({ order_ams_commission_fee: 1.27, voucher_from_seller: 2, actual_shipping_fee: 10, shopee_shipping_rebate: 8, buyer_paid_shipping_fee: 5 })
    expect(c.outros).toBeCloseTo(3.27, 6)
    expect(c.frete).toBe(0)
  })
})

describe('linhasPedidoShopee', () => {
  const pedido: PedidoShopee = {
    order_sn: 'A1', order_status: 'COMPLETED', create_time: 1700000000, buyer_username: 'cli',
    item_list: [
      { item_id: 1, item_name: 'Escova', item_sku: 'ESC', model_id: 0, model_quantity_purchased: 2, model_discounted_price: 30 },
      { item_id: 2, item_name: 'Pote', model_id: 9, model_sku: 'POTE-9', model_quantity_purchased: 1, model_discounted_price: 40 },
    ],
  }
  const escrow: EscrowShopee = {
    order_sn: 'A1',
    order_income: {
      escrow_amount: 70, commission_fee: 10, service_fee: 10, order_ams_commission_fee: 0,
      voucher_from_seller: 0,
      items: [
        { item_id: 1, model_id: 0, discounted_price: 60, quantity_purchased: 2 },
        { item_id: 2, model_id: 9, discounted_price: 40, quantity_purchased: 1 },
      ],
    },
  }
  it('rateia tarifas pelo valor e usa o SKU da variação', () => {
    const l = linhasPedidoShopee(pedido, escrow)
    expect(l).toHaveLength(2)
    expect(l[0]).toMatchObject({ sku: 'ESC', quantidade: 2, valor_venda: 60 })
    expect(l[0].tarifa).toBeCloseTo(12, 6)
    expect(l[1]).toMatchObject({ sku: 'POTE-9', valor_venda: 40 })
    expect(l[1].tarifa).toBeCloseTo(8, 6)
    expect(diferencaRepasse(l)).toBeCloseTo(10, 6) // 100 − 20 − 70: diferença vira diagnóstico
  })
  it('afiliado do item vai só para o item', () => {
    const e2: EscrowShopee = { ...escrow, order_income: { ...escrow.order_income, order_ams_commission_fee: 3, items: [
      { item_id: 1, model_id: 0, discounted_price: 60, ams_commission_fee: 3 },
      { item_id: 2, model_id: 9, discounted_price: 40, ams_commission_fee: 0 },
    ] } }
    const l = linhasPedidoShopee(pedido, e2)
    expect(l[0].outros).toBeCloseTo(3, 6)
    expect(l[1].outros).toBeCloseTo(0, 6)
  })
  it('sem extrato: valor do detalhe × qtd e repasse null', () => {
    const l = linhasPedidoShopee(pedido, null)
    expect(l[0].valor_venda).toBe(60)
    expect(l[0].tarifa).toBe(0)
    expect(diferencaRepasse(l)).toBeNull()
  })
})
