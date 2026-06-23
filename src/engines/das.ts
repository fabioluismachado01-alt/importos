/**
 * Engine de Cálculo do DAS — Simples Nacional
 * Lógica pura, sem dependências de React ou banco.
 * Totalmente testável em isolamento.
 */

export interface DASInput {
  receitaBruta: number
  aliquota: number // percentual, ex: 6.0
  ano: number
  mes: number // 1-12
}

export interface DASResult {
  valor: number
  aliquota: number
  receitaBruta: number
  periodo: string // "2026-05"
  vencimento: Date
  diasParaVencer: number
  statusAlerta: 'OK' | 'PROXIMO' | 'URGENTE' | 'VENCIDO'
}

export function calcularDAS(input: DASInput): DASResult {
  const { receitaBruta, aliquota, ano, mes } = input

  const valor = receitaBruta * (aliquota / 100)

  // Vencimento: dia 20 do mês seguinte à competência
  const mesVenc = mes === 12 ? 1 : mes + 1
  const anoVenc = mes === 12 ? ano + 1 : ano
  const vencimento = new Date(anoVenc, mesVenc - 1, 20)

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  vencimento.setHours(0, 0, 0, 0)

  const diasParaVencer = Math.ceil(
    (vencimento.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)
  )

  let statusAlerta: DASResult['statusAlerta'] = 'OK'
  if (diasParaVencer < 0) statusAlerta = 'VENCIDO'
  else if (diasParaVencer <= 1) statusAlerta = 'URGENTE'
  else if (diasParaVencer <= 5) statusAlerta = 'PROXIMO'

  const periodo = `${ano}-${String(mes).padStart(2, '0')}`

  return {
    valor,
    aliquota,
    receitaBruta,
    periodo,
    vencimento,
    diasParaVencer,
    statusAlerta,
  }
}

export function getStatusDASLabel(status: DASResult['statusAlerta']): string {
  const labels = {
    OK: 'Em dia',
    PROXIMO: 'Vence em breve',
    URGENTE: 'Vence amanhã',
    VENCIDO: 'Vencido',
  }
  return labels[status]
}

/**
 * Calcula o DAS acumulado de um array de meses
 */
export function calcularDASAnual(
  meses: Array<{ receita_bruta: number; aliquota_simples: number; das_valor_real?: number | null }>
): {
  totalReceita: number
  totalDASCalc: number
  totalDASPago: number
  mediaMensal: number
} {
  const totalReceita = meses.reduce((sum, m) => sum + m.receita_bruta, 0)
  const totalDASCalc = meses.reduce(
    (sum, m) => sum + m.receita_bruta * (m.aliquota_simples / 100),
    0
  )
  const totalDASPago = meses.reduce((sum, m) => sum + (m.das_valor_real ?? 0), 0)
  const mediaMensal = meses.length > 0 ? totalReceita / meses.length : 0

  return { totalReceita, totalDASCalc, totalDASPago, mediaMensal }
}
