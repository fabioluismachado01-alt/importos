import { describe, it, expect } from 'vitest'
import {
  sanitizeSaleFee, custoTotalLinha, alocarFretePorEnvio, metricasAds,
  classificarDevolucao, devolucaoConcluida, perdaDevolucao, statusNormalizado,
  simularLucro, precoParaMargem, equilibrioAds, resumoAReceber,
} from '../src/lib/ml-calculos'
import { agregarPorDia } from '../src/lib/ml-ads'

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

describe('statusNormalizado', () => {
  it('inválido e cancelado saem das vendas', () => {
    expect(statusNormalizado('cancelled')).toBe('cancelled')
    expect(statusNormalizado('invalid')).toBe('cancelled')
    expect(statusNormalizado('partially_refunded')).toBe('paid')
    expect(statusNormalizado('paid')).toBe('paid')
  })
})


describe('agregarPorDia (Product Ads)', () => {
  it('soma campanhas do mesmo dia e ignora linhas sem data', () => {
    const r = agregarPorDia([
      { date: '2026-10-01', cost: 2.5, total_amount: 30, direct_amount: 20, units_quantity: 1, clicks: 10, prints: 100 },
      { date: '2026-10-01', cost: 1.5, total_amount: 10, direct_amount: 10, units_quantity: 1, clicks: 5, prints: 50 },
      { date: '2026-10-02', cost: 3, total_amount: 0 },
      { cost: 99 },
    ])
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ data: '2026-10-01', custo: 4, receita: 40, receita_direta: 30, unidades: 2, cliques: 15, impressoes: 150 })
    expect(r[1].custo).toBe(3)
  })
})

describe('calculadora', () => {
  // caso real: INV02 a R$ 99,90 — tarifa 11,5%, frete R$ 13,85, custo R$ 45,00, Simples 8%
  const base = { preco: 99.9, custo: 45, tarifaPct: 0.115, tarifaFixa: 0, frete: 13.85, impostoPct: 0.08 }
  it('simula o lucro por unidade', () => {
    expect(simularLucro(base).lucro).toBeCloseTo(99.9 * 0.805 - 13.85 - 45, 2)
  })
  it('preço mínimo zera o lucro e preço ideal entrega a margem pedida', () => {
    const min = precoParaMargem(base, 0)!
    expect(simularLucro({ ...base, preco: min }).lucro).toBeCloseTo(0, 6)
    const ideal = precoParaMargem(base, 0.2)!
    expect(simularLucro({ ...base, preco: ideal }).margem).toBeCloseTo(20, 6)
  })
  it('margem impossível retorna null', () => {
    expect(precoParaMargem({ ...base, tarifaPct: 0.5, impostoPct: 0.3 }, 0.25)).toBeNull()
  })
  it('ACOS máximo e ROAS mínimo de equilíbrio', () => {
    const { acosMax, roasMin } = equilibrioAds(base)
    const l0 = simularLucro(base).lucroAntesAds
    expect(acosMax).toBeCloseTo((l0 / 99.9) * 100, 6)
    expect(roasMin).toBeCloseTo(99.9 / l0, 6)
    expect(simularLucro({ ...base, adsPorUnidade: l0 }).lucro).toBeCloseTo(0, 6)
  })
})

describe('resumoAReceber', () => {
  const base = { status: 'paid', devolucao_status: null, valor_venda: 100, tarifa: 12, frete_vendedor: 8 }
  it('soma só o que está pendente de repasse e pega a próxima data', () => {
    const r = resumoAReceber([
      { ...base, liquidacao_status: 'pending', liquidacao_data: '2026-11-05T00:00:00Z' },
      { ...base, liquidacao_status: 'pending', liquidacao_data: '2026-11-02T00:00:00Z' },
      { ...base, liquidacao_status: 'released', liquidacao_data: '2026-10-20T00:00:00Z' },
      { ...base, liquidacao_status: null, liquidacao_data: null },
      { ...base, status: 'cancelled', liquidacao_status: 'pending', liquidacao_data: null },
      { ...base, devolucao_status: 'reembolsado', liquidacao_status: 'pending', liquidacao_data: null },
    ])
    expect(r.total).toBe(160)
    expect(r.pedidos).toBe(2)
    expect(r.proxima?.toISOString().slice(0, 10)).toBe('2026-11-02')
  })
})
