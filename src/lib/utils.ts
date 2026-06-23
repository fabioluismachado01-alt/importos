import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// =============================================
// FORMATAÇÃO DE VALORES
// =============================================

export function formatCurrency(value: number, currency = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(value)
}

export function formatCurrencyUSD(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value)
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`
}

export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

// =============================================
// FORMATAÇÃO DE DATAS
// =============================================

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(date))
}

export function formatMonthYear(ano: number, mes: number): string {
  const date = new Date(ano, mes - 1, 1)
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date)
}

export function getMesNome(mes: number): string {
  const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ]
  return meses[mes - 1] ?? ''
}

// =============================================
// SLUGIFY
// =============================================

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

// =============================================
// CÁLCULO DAS
// =============================================

export function calcularDAS(receitaBruta: number, aliquota: number): number {
  return receitaBruta * (aliquota / 100)
}

export function calcularVencimentoDAS(ano: number, mes: number): Date {
  // DAS vence todo dia 20 do mês seguinte à competência
  const proximo = mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 }
  return new Date(proximo.ano, proximo.mes - 1, 20)
}

export function getDiasParaVencimento(vencimento: Date): number {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const diff = vencimento.getTime() - hoje.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}
