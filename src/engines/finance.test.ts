import { describe, it, expect } from 'vitest'
import { calcularKPIs } from './finance'

// Configuração base de julho/2026 (alíquota e previdência reais)
const CONFIG_JUL = {
  aliquota_simples: 0.0705,  // 7,05% — DAS pendente, estimado sobre receita
  percentual_dlr_socio: 0.5,
  percentual_reinvestimento: 0.5,
  formula_previdencia: 'PRO_LABORE*0.20+LUCRO_BRUTO*0.11',  // fallback real do sistema
  dias_no_mes: 31,
  meta_mes: 0,
  das_valor_real: null,      // DAS pendente em julho (não pago)
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

  /**
   * Critério de aceite corrigido (aprovado pelo usuário):
   *   Faturamento bruto   R$ 88.828,32
   *   Tarifas Venda ML   -R$ 5.501,51  (8052,60 − 2551,09)
   *   Tarifas Mkt total  -R$ 9.998,81
   *   DAS                 R$ 6.262,40  (estimado: 88828,32 × 7,05%)
   *   Lucro bruto         R$ 15.089,06
   *   Previdência        -R$ 1.659,80  (15089,06 × 11% — fallback, pro_labore=0)
   *   Lucro líquido       R$ 13.429,26
   *   Receita "Outros"    R$ 0,00
   *
   * Nota: previdência recalcula sobre o novo lucro_bruto — não congela no valor anterior.
   */
  it('critério de aceite completo — julho 2026 pós-migração', () => {
    const lancamentos = [
      // Receita ML
      { tipo: 'RECEITA', categoria: 'MERCADO_LIVRE', canal: 'MERCADO_LIVRE', valor: 72554.40, data: d('2026-07-01') },
      // Outras receitas (Amazon, Shopee, TikTok, Magalu) — sem estorno aqui
      { tipo: 'RECEITA', categoria: 'AMAZON',  canal: 'AMAZON',  valor: 9617.90,  data: d('2026-07-01') },
      { tipo: 'RECEITA', categoria: 'SHOPEE',  canal: 'SHOPEE',  valor: 2447.43,  data: d('2026-07-01') },
      { tipo: 'RECEITA', categoria: 'TIKTOK',  canal: 'TIKTOK',  valor: 3808.99,  data: d('2026-07-01') },
      { tipo: 'RECEITA', categoria: 'MAGALU',  canal: 'MAGALU',  valor: 399.60,   data: d('2026-07-01') },
      // Tarifas ML: bruto 8052,60 − estorno 2551,09 = líquido 5501,51
      { tipo: 'DESPESA_VARIAVEL', categoria: 'TARIFAS', canal: null, valor: 8052.60, data: d('2026-07-01') },
      { tipo: 'RECUPERACAO_DESPESA', categoria: 'TARIFAS', canal: 'MERCADO_LIVRE', valor: 2551.09, data: d('2026-07-01') },
      // Outras tarifas (TikTok, Magalu, Amazon, Shopee)
      { tipo: 'DESPESA_VARIAVEL', categoria: 'TARIFAS', canal: null, valor: 853.21,  data: d('2026-07-01') },
      { tipo: 'DESPESA_VARIAVEL', categoria: 'TARIFAS', canal: null, valor: 78.26,   data: d('2026-07-01') },
      { tipo: 'DESPESA_VARIAVEL', categoria: 'TARIFAS', canal: null, valor: 2538.28, data: d('2026-07-01') },
      { tipo: 'DESPESA_VARIAVEL', categoria: 'TARIFAS', canal: null, valor: 391.34,  data: d('2026-07-01') },
      { tipo: 'DESPESA_VARIAVEL', categoria: 'TARIFAS', canal: null, valor: 636.21,  data: d('2026-07-01') },
      // demais despesas variáveis
      { tipo: 'DESPESA_VARIAVEL', categoria: 'CUSTO_PRODUTOS', canal: null, valor: 30989.72 + 952.90 + 180.00 + 1963.04 + 4429.30, data: d('2026-07-01') },
      { tipo: 'DESPESA_VARIAVEL', categoria: 'FRETE',          canal: null, valor: 15472.33 + 394.92 + 4.46, data: d('2026-07-01') },
      { tipo: 'DESPESA_VARIAVEL', categoria: 'ADS_ML',         canal: null, valor: 2059.23, data: d('2026-07-01') },
      { tipo: 'DESPESA_VARIAVEL', categoria: 'ADS_OUTROS',     canal: null, valor: 249.01 + 184.14 + 181.56, data: d('2026-07-01') },
      { tipo: 'DESPESA_VARIAVEL', categoria: 'ARMAZENAGEM',    canal: null, valor: 316.10, data: d('2026-07-01') },
      { tipo: 'DESPESA_VARIAVEL', categoria: 'OUTRAS_TAXAS',   canal: null, valor: 2.34,   data: d('2026-07-01') },
      // despesas fixas
      { tipo: 'DESPESA_FIXA', categoria: 'PAGINA_ML', canal: null, valor: 99.00, data: d('2026-07-01') },
    ]

    const kpis = calcularKPIs(lancamentos, CONFIG_JUL)

    expect(kpis.receita_total).toBeCloseTo(88828.32, 1)
    expect(kpis.desp_tarifas).toBeCloseTo(9998.81, 1)
    expect(kpis.das_valor_calc).toBeCloseTo(6262.40, 1)   // 88828,32 × 7,05%
    expect(kpis.lucro_bruto).toBeCloseTo(15089.06, 1)
    expect(kpis.desp_previdencia_privada).toBeCloseTo(1659.80, 1)  // 15089,06 × 11%
    expect(kpis.lucro_liquido).toBeCloseTo(13429.26, 1)
    expect(kpis.receita_outros).toBeCloseTo(0, 1)
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
