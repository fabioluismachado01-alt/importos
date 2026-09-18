import { describe, it, expect } from 'vitest'
import { calcularKPIs } from '../src/engines/finance'
import type { FinanceConfig, LancamentoRaw } from '../src/engines/finance'

const D = new Date('2026-08-01')
const L = (tipo: string, categoria: string, valor: number): LancamentoRaw =>
  ({ tipo, categoria, canal: null, valor, data: D })

function configBase(overrides?: Partial<FinanceConfig>): FinanceConfig {
  return {
    aliquota_simples: 0.08,
    dias_no_mes: 30,
    meta_mes: 0,
    percentual_dlr_socio: 0.6,
    percentual_reinvestimento: 0.4,
    dlr_modo: 'PERCENTUAL',
    formula_previdencia: '',
    ...overrides,
  }
}

describe('calcularKPIs — margem de contribuição e break-even', () => {
  it('MC = (Receita − variáveis) / Receita — não usa lucro_bruto', () => {
    const lancamentos = [
      L('RECEITA', 'MERCADO_LIVRE', 10000),
      L('DESPESA_VARIAVEL', 'CUSTO_PRODUTOS', 4000),
      L('DESPESA_VARIAVEL', 'TARIFAS', 1000),
      L('DESPESA_FIXA', 'PRO_LABORE', 2000),
    ]
    // DAS = 10000 * 0.08 = 800 (variável)
    // total_variáveis = 4000 + 1000 + 800 = 5800
    // total_fixas = 2000
    // MC = (10000 - 5800) / 10000 = 0.42 = 42%
    // lucro_bruto = 10000 - 5800 - 2000 = 2200
    // lucro_bruto/receita = 22% ≠ MC (42%) — confirma que a fórmula antiga estava errada
    const kpis = calcularKPIs(lancamentos, configBase())
    expect(kpis.margem_contribuicao).toBeCloseTo(42, 0)
  })

  it('break-even = fixas / MC (inclui previdência)', () => {
    const lancamentos = [
      L('RECEITA', 'MERCADO_LIVRE', 10000),
      L('DESPESA_VARIAVEL', 'CUSTO_PRODUTOS', 4000),
      L('DESPESA_VARIAVEL', 'TARIFAS', 1000),
      L('DESPESA_FIXA', 'PRO_LABORE', 2000),
    ]
    const kpis = calcularKPIs(lancamentos, configBase())
    // MC decimal = 0.42 (sem previdência)
    // BE = 2000 / 0.42 ≈ 4762
    expect(kpis.break_even).toBeCloseTo(2000 / ((10000 - 5800) / 10000), 0)
  })

  it('break-even = 0 quando MC <= 0', () => {
    const lancamentos = [
      L('RECEITA', 'MERCADO_LIVRE', 1000),
      L('DESPESA_VARIAVEL', 'CUSTO_PRODUTOS', 2000),
    ]
    const kpis = calcularKPIs(lancamentos, configBase())
    expect(kpis.break_even).toBe(0)
  })
})

describe('calcularKPIs — arredondamento DLR/Reinvestimento', () => {
  it('dlr + reinvestimento = lucro_liquido (sem diferença de centavo)', () => {
    const lancamentos = [
      L('RECEITA', 'MERCADO_LIVRE', 3333.33),
      L('DESPESA_VARIAVEL', 'CUSTO_PRODUTOS', 1000),
    ]
    const kpis = calcularKPIs(lancamentos, configBase({
      percentual_dlr_socio: 1/3,
      percentual_reinvestimento: 2/3,
    }))
    const soma = kpis.dlr_socio + kpis.reinvestimento
    expect(Math.abs(soma - kpis.lucro_liquido)).toBeLessThanOrEqual(0.01)
  })
})
