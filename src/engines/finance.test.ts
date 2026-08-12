import { describe, it, expect } from 'vitest'
import { calcularKPIs } from './finance'

function d(s: string) { return new Date(s) }

// ── Lançamentos base de julho/2026 (pós-migração, comuns aos dois cenários) ──
// Receita: sem estorno na receita, sem "Outros"
// Tarifas ML: bruto 8.052,60 − RECUPERACAO_DESPESA 2.551,09 = líquido 5.501,51
// Despesas fixas reais de julho: PRO_LABORE 1.442,69, INSS 178,31,
//   Contabilidade 195,15, ERP 191,92, Aluguel 400,00, Pronampe 1.519,95, Pagina_ML 99,00
const LANCAMENTOS_JUL: Parameters<typeof calcularKPIs>[0] = [
  // ── Receitas ──
  { tipo: 'RECEITA', categoria: 'MERCADO_LIVRE', canal: 'MERCADO_LIVRE', valor: 72554.40, data: d('2026-07-01') },
  { tipo: 'RECEITA', categoria: 'AMAZON',        canal: 'AMAZON',        valor: 9617.90,  data: d('2026-07-01') },
  { tipo: 'RECEITA', categoria: 'SHOPEE',        canal: 'SHOPEE',        valor: 2447.43,  data: d('2026-07-01') },
  { tipo: 'RECEITA', categoria: 'TIKTOK',        canal: 'TIKTOK',        valor: 3808.99,  data: d('2026-07-01') },
  { tipo: 'RECEITA', categoria: 'MAGALU',        canal: 'MAGALU',        valor: 399.60,   data: d('2026-07-01') },
  // ── Tarifas ──
  { tipo: 'DESPESA_VARIAVEL',    categoria: 'TARIFAS', canal: null,             valor: 8052.60, data: d('2026-07-01') },
  { tipo: 'RECUPERACAO_DESPESA', categoria: 'TARIFAS', canal: 'MERCADO_LIVRE',  valor: 2551.09, data: d('2026-07-01') },
  { tipo: 'DESPESA_VARIAVEL',    categoria: 'TARIFAS', canal: null,             valor: 853.21,  data: d('2026-07-01') },
  { tipo: 'DESPESA_VARIAVEL',    categoria: 'TARIFAS', canal: null,             valor: 78.26,   data: d('2026-07-01') },
  { tipo: 'DESPESA_VARIAVEL',    categoria: 'TARIFAS', canal: null,             valor: 2538.28, data: d('2026-07-01') },
  { tipo: 'DESPESA_VARIAVEL',    categoria: 'TARIFAS', canal: null,             valor: 391.34,  data: d('2026-07-01') },
  { tipo: 'DESPESA_VARIAVEL',    categoria: 'TARIFAS', canal: null,             valor: 636.21,  data: d('2026-07-01') },
  // ── Demais variáveis ──
  { tipo: 'DESPESA_VARIAVEL', categoria: 'CUSTO_PRODUTOS', canal: null, valor: 30989.72 + 952.90 + 180.00 + 1963.04 + 4429.30, data: d('2026-07-01') },
  { tipo: 'DESPESA_VARIAVEL', categoria: 'FRETE',          canal: null, valor: 15472.33 + 394.92 + 4.46, data: d('2026-07-01') },
  { tipo: 'DESPESA_VARIAVEL', categoria: 'ADS_ML',         canal: null, valor: 2059.23, data: d('2026-07-01') },
  { tipo: 'DESPESA_VARIAVEL', categoria: 'ADS_OUTROS',     canal: null, valor: 249.01 + 184.14 + 181.56, data: d('2026-07-01') },
  { tipo: 'DESPESA_VARIAVEL', categoria: 'ARMAZENAGEM',    canal: null, valor: 316.10, data: d('2026-07-01') },
  { tipo: 'DESPESA_VARIAVEL', categoria: 'OUTRAS_TAXAS',   canal: null, valor: 2.34,   data: d('2026-07-01') },
  // ── Fixas (replicadas em julho) ──
  { tipo: 'DESPESA_FIXA', categoria: 'PRO_LABORE',    canal: null, valor: 1442.69, data: d('2026-07-01') },
  { tipo: 'DESPESA_FIXA', categoria: 'INSS',          canal: null, valor: 178.31,  data: d('2026-07-01') },
  { tipo: 'DESPESA_FIXA', categoria: 'CONTABILIDADE', canal: null, valor: 195.15,  data: d('2026-07-01') },
  { tipo: 'DESPESA_FIXA', categoria: 'ERP',           canal: null, valor: 191.92,  data: d('2026-07-01') },
  { tipo: 'DESPESA_FIXA', categoria: 'ALUGUEL',       canal: null, valor: 400.00,  data: d('2026-07-01') },
  { tipo: 'DESPESA_FIXA', categoria: 'EMPRESTIMO',    canal: null, valor: 1519.95, data: d('2026-07-01') },
  { tipo: 'DESPESA_FIXA', categoria: 'PAGINA_ML',     canal: null, valor: 99.00,   data: d('2026-07-01') },
]

const CONFIG_BASE = {
  aliquota_simples: 0.0705,
  percentual_dlr_socio: 0.5,
  percentual_reinvestimento: 0.5,
  formula_previdencia: 'PRO_LABORE*0.20+LUCRO_BRUTO*0.11',
  dias_no_mes: 31,
  meta_mes: 0,
  total_pedidos: undefined,
}

describe('calcularKPIs — julho 2026 pós-migração estorno', () => {
  /**
   * Cenário A — DAS REAL PREENCHIDO (das_valor_real = 5.493,02, PAGO)
   *
   * Estado atual de produção em jul/2026:
   *   Faturamento   R$ 91.379,41  (inclui estorno 2.551,09 na receita)
   *   DAS real      R$ 5.493,02 (pago, abatido por NF de entrada)
   *   Lucro bruto   R$ 11.930,42
   *   Previdência  -R$  1.600,88  (1.442,69×0,20 + 11.930,42×0,11)
   *   Lucro líquido R$ 10.329,53
   *
   * Após migração: estorno sai da receita e vira RECUPERACAO_DESPESA.
   * DAS fixo → lucro INALTERADO. Apenas reclassificação.
   *
   * Esperado pós-migração:
   *   Faturamento   R$ 88.828,32
   *   Tarifas Mkt   R$  9.998,81
   *   Receita Outros R$  0,00
   *   DAS           R$  5.493,02  ← IGUAL
   *   Lucro bruto   R$ 11.930,42  ← IGUAL
   *   Previdência  -R$  1.600,88  ← IGUAL
   *   Lucro líquido R$ 10.329,53  ← IGUAL
   */
  it('Cenário A — com das_valor_real: reclassificação pura, lucro não muda', () => {
    const config = { ...CONFIG_BASE, das_valor_real: 5493.02 }
    const kpis = calcularKPIs(LANCAMENTOS_JUL, config)

    expect(kpis.receita_total).toBeCloseTo(88828.32, 1)
    expect(kpis.desp_tarifas).toBeCloseTo(9998.81, 1)
    expect(kpis.receita_outros).toBeCloseTo(0, 1)
    expect(kpis.das_valor_calc).toBeCloseTo(5493.02, 1)   // usa das_valor_real
    expect(kpis.lucro_bruto).toBeCloseTo(11930.42, 1)
    expect(kpis.desp_previdencia_privada).toBeCloseTo(1600.88, 1)
    expect(kpis.lucro_liquido).toBeCloseTo(10329.53, 1)
  })

  /**
   * Cenário B — SEM das_valor_real (DAS estimado pela receita)
   *
   * Quando DAS é PENDENTE, o engine usa receita × alíquota.
   * A migração remove o estorno da receita → receita cai → DAS estimado cai → lucro sobe.
   *
   * ANTES da migração: estorno entra como RECEITA/OUTRO_CANAL (+2.551,09)
   *   receita       = 91.379,41  →  DAS = 91.379,41 × 7,05% = 6.442,25
   *
   * DEPOIS da migração: estorno vira RECUPERACAO_DESPESA (reduz desp_tarifas)
   *   receita       = 88.828,32  →  DAS = 88.828,32 × 7,05% = 6.262,40
   *   economia DAS  =    179,85  →  lucro_bruto SOBE nesse valor
   *
   * Validação: lucro_bruto pós > lucro_bruto pré, diferença ≈ 179,85
   */
  it('Cenário B — sem das_valor_real: DAS cai com receita menor, lucro sobe', () => {
    const config = { ...CONFIG_BASE, das_valor_real: null }

    // Estado ANTES: estorno como RECEITA (+ Outros)
    const lancamentosAntes = [
      ...LANCAMENTOS_JUL.filter(l => l.tipo !== 'RECUPERACAO_DESPESA'),
      { tipo: 'RECEITA', categoria: 'OUTRO_CANAL', canal: null, valor: 2551.09, data: d('2026-07-01') },
    ]
    const kpisAntes = calcularKPIs(lancamentosAntes, config)

    // Estado DEPOIS: estorno como RECUPERACAO_DESPESA (LANCAMENTOS_JUL padrão)
    const kpisDepois = calcularKPIs(LANCAMENTOS_JUL, config)

    // Receita cai
    expect(kpisDepois.receita_total).toBeCloseTo(88828.32, 1)
    expect(kpisAntes.receita_total).toBeCloseTo(91379.41, 1)

    // DAS cai
    expect(kpisDepois.das_valor_calc).toBeCloseTo(6262.40, 1)
    expect(kpisAntes.das_valor_calc).toBeCloseTo(6442.25, 1)

    // Tarifas caem (estorno reduz desp_tarifas)
    expect(kpisDepois.desp_tarifas).toBeCloseTo(9998.81, 1)
    expect(kpisAntes.desp_tarifas).toBeCloseTo(12549.90, 1)  // sem o crédito

    // Receita Outros some
    expect(kpisDepois.receita_outros).toBeCloseTo(0, 1)
    expect(kpisAntes.receita_outros).toBeCloseTo(2551.09, 1)

    // Lucro sobe ≈ 179,85 (economia de DAS)
    const diffLucro = kpisDepois.lucro_bruto - kpisAntes.lucro_bruto
    expect(diffLucro).toBeCloseTo(179.85, 0)
  })

  // ── Testes unitários de comportamento do tipo ──────────────────────────────

  it('RECUPERACAO_DESPESA reduz desp_tarifas, não entra em receita_total', () => {
    const lancamentos = [
      { tipo: 'RECEITA',             categoria: 'MERCADO_LIVRE', canal: 'MERCADO_LIVRE', valor: 88828.32, data: d('2026-07-01') },
      { tipo: 'DESPESA_VARIAVEL',    categoria: 'TARIFAS',       canal: null,            valor: 8052.60,  data: d('2026-07-01') },
      { tipo: 'RECUPERACAO_DESPESA', categoria: 'TARIFAS',       canal: null,            valor: 2551.09,  data: d('2026-07-01') },
      { tipo: 'DESPESA_VARIAVEL',    categoria: 'TARIFAS',       canal: null,            valor: 4497.30,  data: d('2026-07-01') },
    ]
    const kpis = calcularKPIs(lancamentos, { ...CONFIG_BASE, das_valor_real: null })
    expect(kpis.receita_total).toBeCloseTo(88828.32, 1)
    expect(kpis.desp_tarifas).toBeCloseTo(9998.81, 1)   // 8052,60 + 4497,30 − 2551,09
  })

  it('RECUPERACAO_DESPESA não afeta receita_outros nem receita_total', () => {
    const lancamentos = [
      { tipo: 'RECEITA',             categoria: 'AMAZON', canal: 'AMAZON', valor: 5000, data: d('2026-07-01') },
      { tipo: 'RECUPERACAO_DESPESA', categoria: 'TARIFAS', canal: null,    valor: 500,  data: d('2026-07-01') },
    ]
    const kpis = calcularKPIs(lancamentos, { ...CONFIG_BASE, das_valor_real: null })
    expect(kpis.receita_amazon).toBeCloseTo(5000, 2)
    expect(kpis.receita_outros).toBeCloseTo(0, 2)
    expect(kpis.receita_total).toBeCloseTo(5000, 2)
    expect(kpis.desp_tarifas).toBeCloseTo(-500, 2)  // negativo pois não havia tarifa bruta
  })
})
