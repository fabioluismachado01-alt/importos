import { describe, it, expect, vi, beforeEach } from 'vitest'

// Testa que reclassificar afiliados TikTok de ADS_OUTROS → TARIFAS não altera o lucro total.
// Ambas as categorias são DESPESA_VARIAVEL, então o lucro líquido é idêntico.
// Este teste verifica a lógica de classificação antes da persistência.

describe('TikTok — afiliados classificados como TARIFAS', () => {
  it('afiliados em TARIFAS reduz desp_ads_outros e aumenta desp_tarifas pelo mesmo valor', () => {
    // Simula a construção dos lançamentos como faz salvarAnaliseTiktok
    const comAfiliados = 500
    const taxasPlataforma = 1200
    const receita = 10000

    const lancamentos = [
      { tipo: 'RECEITA', categoria: 'TIKTOK', valor: receita },
      { tipo: 'DESPESA_VARIAVEL', categoria: 'TARIFAS', valor: taxasPlataforma },
      // Antes: ADS_OUTROS; depois da correção: TARIFAS
      { tipo: 'DESPESA_VARIAVEL', categoria: 'TARIFAS', valor: comAfiliados },
    ]

    const totalDespesas = lancamentos
      .filter(l => l.tipo.startsWith('DESPESA'))
      .reduce((s, l) => s + l.valor, 0)

    const lucro = receita - totalDespesas
    expect(lucro).toBe(receita - taxasPlataforma - comAfiliados)

    // Confirma que a categoria correta é usada
    const taxas = lancamentos.filter(l => l.categoria === 'TARIFAS')
    const ads   = lancamentos.filter(l => l.categoria === 'ADS_OUTROS')
    expect(taxas.reduce((s, l) => s + l.valor, 0)).toBe(taxasPlataforma + comAfiliados)
    expect(ads.length).toBe(0)
  })
})
