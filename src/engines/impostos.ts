// ─── Tabelas do Simples Nacional (vigência 2024+) ───────────────────────────

export type AnexoSimples = 'comercio' | 'industria' | 'servicos3' | 'servicos4' | 'servicos5'

interface FaixaSimples {
  faixa: number
  min: number
  max: number
  aliquota: number  // nominal %
  deducao: number   // R$
}

export type { FaixaSimples }
export const TABELAS_SIMPLES: Record<AnexoSimples, FaixaSimples[]> = {
  comercio: [
    { faixa: 1, min: 0,             max: 180000,    aliquota: 4.0,  deducao: 0 },
    { faixa: 2, min: 180000.01,     max: 360000,    aliquota: 7.3,  deducao: 5940 },
    { faixa: 3, min: 360000.01,     max: 720000,    aliquota: 9.5,  deducao: 13860 },
    { faixa: 4, min: 720000.01,     max: 1800000,   aliquota: 10.7, deducao: 22500 },
    { faixa: 5, min: 1800000.01,    max: 3600000,   aliquota: 14.3, deducao: 87300 },
    { faixa: 6, min: 3600000.01,    max: 4800000,   aliquota: 19.0, deducao: 378000 },
  ],
  industria: [
    { faixa: 1, min: 0,             max: 180000,    aliquota: 4.5,  deducao: 0 },
    { faixa: 2, min: 180000.01,     max: 360000,    aliquota: 7.8,  deducao: 5940 },
    { faixa: 3, min: 360000.01,     max: 720000,    aliquota: 10.0, deducao: 13860 },
    { faixa: 4, min: 720000.01,     max: 1800000,   aliquota: 11.2, deducao: 22500 },
    { faixa: 5, min: 1800000.01,    max: 3600000,   aliquota: 14.7, deducao: 85500 },
    { faixa: 6, min: 3600000.01,    max: 4800000,   aliquota: 30.0, deducao: 720000 },
  ],
  servicos3: [
    { faixa: 1, min: 0,             max: 180000,    aliquota: 6.0,  deducao: 0 },
    { faixa: 2, min: 180000.01,     max: 360000,    aliquota: 11.2, deducao: 9360 },
    { faixa: 3, min: 360000.01,     max: 720000,    aliquota: 13.5, deducao: 17640 },
    { faixa: 4, min: 720000.01,     max: 1800000,   aliquota: 16.0, deducao: 35640 },
    { faixa: 5, min: 1800000.01,    max: 3600000,   aliquota: 21.0, deducao: 125640 },
    { faixa: 6, min: 3600000.01,    max: 4800000,   aliquota: 33.0, deducao: 648000 },
  ],
  servicos4: [
    { faixa: 1, min: 0,             max: 180000,    aliquota: 4.5,  deducao: 0 },
    { faixa: 2, min: 180000.01,     max: 360000,    aliquota: 9.0,  deducao: 8100 },
    { faixa: 3, min: 360000.01,     max: 720000,    aliquota: 10.2, deducao: 12420 },
    { faixa: 4, min: 720000.01,     max: 1800000,   aliquota: 14.0, deducao: 39780 },
    { faixa: 5, min: 1800000.01,    max: 3600000,   aliquota: 22.0, deducao: 183780 },
    { faixa: 6, min: 3600000.01,    max: 4800000,   aliquota: 33.0, deducao: 828000 },
  ],
  servicos5: [
    { faixa: 1, min: 0,             max: 180000,    aliquota: 15.5, deducao: 0 },
    { faixa: 2, min: 180000.01,     max: 360000,    aliquota: 18.0, deducao: 4500 },
    { faixa: 3, min: 360000.01,     max: 720000,    aliquota: 19.5, deducao: 9900 },
    { faixa: 4, min: 720000.01,     max: 1800000,   aliquota: 20.5, deducao: 17100 },
    { faixa: 5, min: 1800000.01,    max: 3600000,   aliquota: 23.0, deducao: 62100 },
    { faixa: 6, min: 3600000.01,    max: 4800000,   aliquota: 30.5, deducao: 540000 },
  ],
}

export const NOMES_ANEXO: Record<AnexoSimples, string> = {
  comercio:  'Anexo I — Comércio',
  industria: 'Anexo II — Indústria',
  servicos3: 'Anexo III — Serviços (ISS incluso)',
  servicos4: 'Anexo IV — Serviços (ISSQN separado)',
  servicos5: 'Anexo V — Serviços (fator R)',
}

// ─── Resultado Simples Nacional ──────────────────────────────────────────────

export interface ResultadoSimples {
  ok: true
  faixa: number
  aliquotaNominal: number
  aliquotaEfetiva: number
  valorDAS: number
  valorLiquido: number
  rbt12: number
  faturamentoMes: number
  // Alerta de faixa
  proximaFaixa: FaixaSimples | null
  valorParaProximaFaixa: number
  mesesParaProximaFaixa: number | null
}

export interface ErroSimples {
  ok: false
  erro: string
}

export function calcularSimples(params: {
  faturamentoMes: number
  rbt12: number           // soma dos 12 meses anteriores; se 0 usa projeção anual
  anexo: AnexoSimples
}): ResultadoSimples | ErroSimples {
  const { faturamentoMes, rbt12, anexo } = params
  if (faturamentoMes <= 0) return { ok: false, erro: 'Informe o faturamento do mês.' }

  const tabela = TABELAS_SIMPLES[anexo]
  // Se não tem histórico de 12 meses, usa projeção (faturamento mês × 12)
  const rbt = rbt12 > 0 ? rbt12 : faturamentoMes * 12

  if (rbt > 4800000) return { ok: false, erro: 'Faturamento acima do limite do Simples Nacional (R$ 4,8 milhões).' }

  const faixa = tabela.find(f => rbt >= f.min && rbt <= f.max)
  if (!faixa) return { ok: false, erro: 'Faixa não encontrada.' }

  const aliqEfetiva = Math.max(0, (rbt * (faixa.aliquota / 100) - faixa.deducao) / rbt * 100)
  const valorDAS = faturamentoMes * (aliqEfetiva / 100)
  const valorLiquido = faturamentoMes - valorDAS

  // Alerta de proximidade de faixa
  const proximaFaixaObj = tabela.find(f => f.faixa === faixa.faixa + 1) ?? null
  const valorParaProxima = proximaFaixaObj ? Math.max(0, proximaFaixaObj.min - rbt) : 0
  // Quantos meses faltam com o ritmo atual
  const mesesParaProxima =
    proximaFaixaObj && faturamentoMes > 0 && valorParaProxima > 0
      ? Math.ceil(valorParaProxima / faturamentoMes)
      : null

  return {
    ok: true,
    faixa: faixa.faixa,
    aliquotaNominal: faixa.aliquota,
    aliquotaEfetiva: aliqEfetiva,
    valorDAS,
    valorLiquido,
    rbt12: rbt,
    faturamentoMes,
    proximaFaixa: proximaFaixaObj,
    valorParaProximaFaixa: valorParaProxima,
    mesesParaProximaFaixa: mesesParaProxima,
  }
}

// ─── Lucro Presumido ─────────────────────────────────────────────────────────

export type AtividadePresumido = 'comercio' | 'servicos'

export interface ResultadoPresumido {
  faturamento: number
  basePresuncaoIRPJ: number
  basePresuncaoCSLL: number
  totalIRPJ: number
  adicionalIRPJ: number
  totalCSLL: number
  totalPIS: number
  totalCOFINS: number
  totalImpostos: number
  cargaEfetiva: number   // %
  lucroPosImpostos: number
}

export function calcularPresumido(params: {
  faturamento: number
  atividade: AtividadePresumido
}): ResultadoPresumido {
  const { faturamento, atividade } = params

  const percIRPJ = atividade === 'comercio' ? 0.08 : 0.32
  const percCSLL = atividade === 'comercio' ? 0.12 : 0.32

  const baseIRPJ = faturamento * percIRPJ
  const baseCSLL = faturamento * percCSLL

  const irpj = baseIRPJ * 0.15
  // Adicional: (base mensal - R$20.000) × 10% se positivo
  const adicional = Math.max(0, baseIRPJ - 20000) * 0.10
  const csll = baseCSLL * 0.09

  const pis = faturamento * 0.0065
  const cofins = faturamento * 0.03

  const total = irpj + adicional + csll + pis + cofins
  const carga = faturamento > 0 ? (total / faturamento) * 100 : 0

  return {
    faturamento,
    basePresuncaoIRPJ: baseIRPJ,
    basePresuncaoCSLL: baseCSLL,
    totalIRPJ: irpj,
    adicionalIRPJ: adicional,
    totalCSLL: csll,
    totalPIS: pis,
    totalCOFINS: cofins,
    totalImpostos: total,
    cargaEfetiva: carga,
    lucroPosImpostos: faturamento - total,
  }
}

// ─── Lucro Real ──────────────────────────────────────────────────────────────

export interface ResultadoLucroReal {
  faturamento: number
  cmv: number
  despesas: number
  lucroBruto: number
  despesasTotais: number
  lucroLiquido: number
  prejuizoCompensado: number
  lucroAjustado: number
  totalIRPJ: number
  adicionalIRPJ: number
  totalCSLL: number
  // PIS/COFINS bruto (sobre vendas)
  pisBruto: number
  cofinsBruto: number
  // Créditos de importação (PIS-importação 2,1% + COFINS-importação 9,65%)
  creditoPIS: number
  creditoCOFINS: number
  // PIS/COFINS líquido a recolher (nunca negativo — saldo fica para o mês seguinte)
  totalPIS: number
  totalCOFINS: number
  totalImpostos: number
  cargaEfetiva: number   // % sobre faturamento
  resultadoFinal: number
}

export function calcularLucroReal(params: {
  faturamento: number
  cmv: number                  // custo dos produtos vendidos
  despesas: number             // despesas operacionais totais
  prejuizoAcumulado?: number   // saldo de prejuízo fiscal a compensar
  valorImportacoes?: number    // valor aduaneiro das mercadorias importadas no mês
}): ResultadoLucroReal {
  const { faturamento, cmv, despesas, prejuizoAcumulado = 0, valorImportacoes = 0 } = params

  const lucroBruto = faturamento - cmv
  const lucroLiquido = lucroBruto - despesas

  // Compensação de prejuízo: máx 30% do lucro
  const maxCompensacao = Math.max(0, lucroLiquido) * 0.30
  const compensado = Math.min(prejuizoAcumulado, maxCompensacao)
  const lucroAjustado = Math.max(0, lucroLiquido - compensado)

  const irpj = lucroAjustado * 0.15
  const adicional = Math.max(0, lucroAjustado - 20000) * 0.10
  const csll = lucroAjustado * 0.09

  // PIS/COFINS não-cumulativo — regime de apuração de créditos
  const pisBruto = faturamento * 0.0165
  const cofinsBruto = faturamento * 0.076

  // Créditos de PIS/COFINS na importação (Lei 10.865/2004)
  // PIS-importação: 2,10% | COFINS-importação: 9,65%
  const creditoPIS = valorImportacoes * 0.021
  const creditoCOFINS = valorImportacoes * 0.0965

  // PIS/COFINS líquido: diferença tributo - crédito (nunca negativo por mês)
  const totalPIS = Math.max(0, pisBruto - creditoPIS)
  const totalCOFINS = Math.max(0, cofinsBruto - creditoCOFINS)

  const total = irpj + adicional + csll + totalPIS + totalCOFINS
  const carga = faturamento > 0 ? (total / faturamento) * 100 : 0

  return {
    faturamento,
    cmv,
    despesas,
    lucroBruto,
    despesasTotais: despesas,
    lucroLiquido,
    prejuizoCompensado: compensado,
    lucroAjustado,
    totalIRPJ: irpj,
    adicionalIRPJ: adicional,
    totalCSLL: csll,
    pisBruto,
    cofinsBruto,
    creditoPIS,
    creditoCOFINS,
    totalPIS,
    totalCOFINS,
    totalImpostos: total,
    cargaEfetiva: carga,
    resultadoFinal: lucroLiquido - total,
  }
}

// ─── Comparador ──────────────────────────────────────────────────────────────

export interface ResultadoComparador {
  simples: { totalImpostos: number; cargaEfetiva: number; aliquotaEfetiva: number } | null
  presumido: { totalImpostos: number; cargaEfetiva: number }
  lucroReal: { totalImpostos: number; cargaEfetiva: number }
  melhorRegime: 'simples' | 'presumido' | 'lucroReal'
  economiaVsMelhor: { presumido: number; lucroReal: number; simples: number | null }
}

export function comparar(params: {
  faturamento: number
  rbt12: number
  anexo: AnexoSimples
  atividade: AtividadePresumido
  cmv: number
  despesas: number
  valorImportacoes?: number
}): ResultadoComparador {
  const { faturamento, rbt12, anexo, atividade, cmv, despesas, valorImportacoes = 0 } = params

  const simplesResult = calcularSimples({ faturamentoMes: faturamento, rbt12, anexo })
  const presumidoResult = calcularPresumido({ faturamento, atividade })
  const realResult = calcularLucroReal({ faturamento, cmv, despesas, valorImportacoes })

  const simplesImpostos = simplesResult.ok ? simplesResult.valorDAS : null
  const simplesAliq = simplesResult.ok ? simplesResult.aliquotaEfetiva : null
  const simplesData = simplesImpostos !== null
    ? { totalImpostos: simplesImpostos, cargaEfetiva: faturamento > 0 ? simplesImpostos / faturamento * 100 : 0, aliquotaEfetiva: simplesAliq! }
    : null

  const impostosPorRegime: { regime: 'simples' | 'presumido' | 'lucroReal'; valor: number }[] = [
    { regime: 'presumido', valor: presumidoResult.totalImpostos },
    { regime: 'lucroReal', valor: realResult.totalImpostos },
  ]
  if (simplesData) impostosPorRegime.push({ regime: 'simples', valor: simplesData.totalImpostos })

  const melhor = impostosPorRegime.reduce((a, b) => a.valor <= b.valor ? a : b)

  return {
    simples: simplesData,
    presumido: { totalImpostos: presumidoResult.totalImpostos, cargaEfetiva: presumidoResult.cargaEfetiva },
    lucroReal: { totalImpostos: realResult.totalImpostos, cargaEfetiva: realResult.cargaEfetiva },
    melhorRegime: melhor.regime,
    economiaVsMelhor: {
      presumido: presumidoResult.totalImpostos - melhor.valor,
      lucroReal: realResult.totalImpostos - melhor.valor,
      simples: simplesData ? simplesData.totalImpostos - melhor.valor : null,
    },
  }
}
