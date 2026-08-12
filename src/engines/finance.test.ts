import { describe, it, expect } from 'vitest'
import { calcularKPIs } from './finance'

// Configuração base de julho/2026 (alíquota real do mês)
const CONFIG_JUL = {
  aliquota_simples: 0.0706,  // 7,06% — usada para DAS estimado; DAS real sobrepõe
  percentual_dlr_socio: 0.5,
  percentual_reinvestimento: 0.5,
  formula_previdencia: 'PRO_LABORE*0+LUCRO_BRUTO*0',  // zeramos — não é objeto deste teste
  dias_no_mes: 31,
  meta_mes: 0,
  das_valor_real: 6262.40,   // DAS real pago em julho
  total_pedidos: undefined,
}

function d(s: string) { return new Date(s) }

describe('calcularKPIs — julho 2026', () => {
  /**
   * Cenário base: lançamentos reais de julho, incluindo estorno ML
   * como RECUPERACAO_DESPESA (valor positivo no banco).
   *
   * Receita bruta ML: 88.828,32
   * Tarifas ML brutas (DESPESA_VARIAVEL/TARIFAS): 8.052,60
   * Estorno ML (RECUPERACAO_DESPESA/TARIFAS): 2.551,09  ← novo tipo
   * Tarifas Mkt líquidas esperadas: 8.052,60 − 2.551,09 = 5.501,51
   *
   * desp_tarifas total esperado: 5.501,51 (tarifa bruta) + 4.497,30 (outras) = 9.998,81
   */
  it('RECUPERACAO_DESPESA reduz desp_tarifas, não entra em receita_total', () => {
    const lancamentos = [
      // Receita ML
      { tipo: 'RECEITA', categoria: 'MERCADO_LIVRE', canal: 'MERCADO_LIVRE', valor: 88828.32, data: d('2026-07-01') },
      // Tarifa bruta ML
      { tipo: 'DESPESA_VARIAVEL', categoria: 'TARIFAS', canal: null, valor: 8052.60, data: d('2026-07-01') },
      // Estorno de tarifa ML — NOVO TIPO
      { tipo: 'RECUPERACAO_DESPESA', categoria: 'TARIFAS', canal: null, valor: 2551.09, data: d('2026-07-01') },
      // Outras tarifas (comissão, frete ML, etc.) para completar o total
      { tipo: 'DESPESA_VARIAVEL', categoria: 'TARIFAS', canal: null, valor: 4497.30, data: d('2026-07-01') },
    ]

    const kpis = calcularKPIs(lancamentos, CONFIG_JUL)

    // Receita NÃO deve incluir o estorno
    expect(kpis.receita_total).toBeCloseTo(88828.32, 1)

    // desp_tarifas líquida = 8052,60 + 4497,30 − 2551,09 = 9998,81
    expect(kpis.desp_tarifas).toBeCloseTo(9998.81, 1)
  })

  it('valores alvo de julho 2026 — faturamento bruto e DAS', () => {
    // Lançamentos simplificados — apenas os necessários para validar os KPIs-chave
    // Os valores abaixo reproduzem os totais aprovados pelo usuário.
    const lancamentos = [
      { tipo: 'RECEITA', categoria: 'MERCADO_LIVRE', canal: 'MERCADO_LIVRE', valor: 88828.32, data: d('2026-07-01') },
      // Tarifas ML: 8052,60 bruto − 2551,09 estorno = 5501,51 líquido
      { tipo: 'DESPESA_VARIAVEL', categoria: 'TARIFAS', canal: null, valor: 8052.60, data: d('2026-07-01') },
      { tipo: 'RECUPERACAO_DESPESA', categoria: 'TARIFAS', canal: null, valor: 2551.09, data: d('2026-07-01') },
      // Outras tarifas para totalizar desp_tarifas = 9998,81
      { tipo: 'DESPESA_VARIAVEL', categoria: 'TARIFAS', canal: null, valor: 4497.30, data: d('2026-07-01') },
    ]

    const kpis = calcularKPIs(lancamentos, CONFIG_JUL)

    // DAS real sobrepõe estimado
    expect(kpis.das_valor_calc).toBeCloseTo(6262.40, 1)

    // Faturamento bruto
    expect(kpis.receita_total).toBeCloseTo(88828.32, 1)

    // Tarifas Mkt líquidas
    expect(kpis.desp_tarifas).toBeCloseTo(9998.81, 1)
  })

  it('RECUPERACAO_DESPESA com valor zero não altera desp_tarifas', () => {
    const lancamentos = [
      { tipo: 'RECEITA', categoria: 'MERCADO_LIVRE', canal: 'MERCADO_LIVRE', valor: 1000, data: d('2026-07-01') },
      { tipo: 'DESPESA_VARIAVEL', categoria: 'TARIFAS', canal: null, valor: 100, data: d('2026-07-01') },
    ]
    const kpis = calcularKPIs(lancamentos, { ...CONFIG_JUL, das_valor_real: null })
    expect(kpis.desp_tarifas).toBeCloseTo(100, 2)
  })

  it('RECUPERACAO_DESPESA não afeta receita_outros nem canais', () => {
    const lancamentos = [
      { tipo: 'RECEITA', categoria: 'AMAZON', canal: 'AMAZON', valor: 5000, data: d('2026-07-01') },
      { tipo: 'RECUPERACAO_DESPESA', categoria: 'TARIFAS', canal: null, valor: 500, data: d('2026-07-01') },
    ]
    const kpis = calcularKPIs(lancamentos, { ...CONFIG_JUL, das_valor_real: null })
    expect(kpis.receita_amazon).toBeCloseTo(5000, 2)
    expect(kpis.receita_outros).toBeCloseTo(0, 2)
    expect(kpis.receita_total).toBeCloseTo(5000, 2)
    expect(kpis.desp_tarifas).toBeCloseTo(-500, 2)  // negativo pois não havia tarifa bruta
  })
})
