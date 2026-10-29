import { describe, it, expect } from 'vitest'
import {
  sanitizeSaleFee, custoTotalLinha, alocarFretePorEnvio, metricasAds,
  classificarDevolucao, devolucaoConcluida, perdaDevolucao,
} from '../src/lib/ml-calculos'

describe('sanitizeSaleFee', () => {
  it('multiplica a tarifa unitária pela quantidade', () => {
    // caso real: INV02, 2 × R$ 67,80, sale_fee R$ 4,59 por unidade
    expect(sanitizeSaleFee(4.59, 67.8, 2)).toBeCloseTo(9.18, 2)
  })
  it('mantém pedido de 1 unidade igual', () => {
    expect(sanitizeSaleFee(21.24, 169.9, 1)).toBeCloseTo(21.24, 2)
  })
  it('limita a 35% do valor da linha quando o ML devolve o valor cheio', () => {
    expect(sanitizeSaleFee(67.8, 67.8, 2)).toBeCloseTo(67.8 * 2 * 0.35, 2)
  })
  it('trata nulo como zero', () => {
    expect(sanitizeSaleFee(null, 50, 1)).toBe(0)
  })
})

describe('custoTotalLinha', () => {
  it('multiplica custo unitário pela quantidade', () => {
    expect(custoTotalLinha({ custo_produto: 45, quantidade: 2 })).toBe(90)
  })
  it('sem custo cadastrado retorna zero', () => {
    expect(custoTotalLinha({ custo_produto: null, quantidade: 3 })).toBe(0)
  })
})

describe('alocarFretePorEnvio', () => {
  const item = (id: string, unit_price: number, quantity = 1) => ({ item: { id }, unit_price, quantity })

  it('divide o frete de um pacote entre pedidos, mesmo vindos de páginas diferentes da API', () => {
    // caso real: mesmo comprador, 2 pedidos BTS-1 de R$ 169,90 no mesmo envio, frete total R$ 48,70
    const pedidos = [
      { id: 1, shipping: { id: 'S1' }, order_items: [item('MLB1', 169.9)] },
      { id: 2, shipping: { id: 'S1' }, order_items: [item('MLB1', 169.9)] },
    ]
    const frete = alocarFretePorEnvio(pedidos, new Map([['S1', 48.7]]))
    expect(frete.get('1:MLB1')).toBeCloseTo(24.35, 2)
    expect(frete.get('2:MLB1')).toBeCloseTo(24.35, 2)
  })

  it('rateia proporcional ao valor da linha', () => {
    const pedidos = [{ id: 1, shipping: { id: 'S1' }, order_items: [item('A', 75), item('B', 25)] }]
    const frete = alocarFretePorEnvio(pedidos, new Map([['S1', 20]]))
    expect(frete.get('1:A')).toBeCloseTo(15, 2)
    expect(frete.get('1:B')).toBeCloseTo(5, 2)
  })

  it('retorna null quando o custo do envio não foi consultado (para não zerar o frete gravado)', () => {
    const pedidos = [{ id: 1, shipping: { id: 'S9' }, order_items: [item('A', 50)] }]
    expect(alocarFretePorEnvio(pedidos, new Map()).get('1:A')).toBeNull()
  })

  it('pedido sem envio tem frete zero', () => {
    const pedidos = [{ id: 1, shipping: null, order_items: [item('A', 50)] }]
    expect(alocarFretePorEnvio(pedidos, new Map()).get('1:A')).toBe(0)
  })
})

describe('metricasAds', () => {
  it('TACOS é ads sobre faturamento, não sobre lucro', () => {
    // caso real da tela: ads R$ 69,10, faturamento R$ 3.927,00 → 1,76% (a tela mostrava 9,7%)
    const m = metricasAds(69.1, 3927)
    expect(m.tacos).toBeCloseTo(1.76, 2)
    expect(m.atribuido).toBe(false)
  })
  it('usa receita atribuída quando existir', () => {
    const m = metricasAds(100, 5000, 1000)
    expect(m.roas).toBe(10)
    expect(m.acos).toBe(10)
    expect(m.tacos).toBe(2)
    expect(m.atribuido).toBe(true)
  })
})


describe('pós-venda', () => {
  it('classifica pela resposta de returns', () => {
    expect(classificarDevolucao(null)).toBe('em_mediacao')
    expect(classificarDevolucao({ status: 'delivered', status_money: 'refunded' })).toBe('devolvido')
    expect(classificarDevolucao({ status: 'shipped', status_money: 'refunded' })).toBe('reembolsado')
    expect(classificarDevolucao({ status: 'pending', status_money: 'retained' })).toBe('devolucao_em_andamento')
  })
  it('só devolução concluída sai da receita', () => {
    expect(devolucaoConcluida('reembolsado')).toBe(true)
    expect(devolucaoConcluida('em_mediacao')).toBe(false)
    expect(devolucaoConcluida(null)).toBe(false)
  })
  it('perda: frete sempre; CMV só quando o produto não voltou', () => {
    const base = { frete_vendedor: 10, custo_produto: 20, quantidade: 2 }
    expect(perdaDevolucao({ ...base, devolucao_status: 'reembolsado' })).toBe(50)
    expect(perdaDevolucao({ ...base, devolucao_status: 'devolvido' })).toBe(10)
    expect(perdaDevolucao({ ...base, devolucao_status: 'em_mediacao' })).toBe(0)
  })
})
