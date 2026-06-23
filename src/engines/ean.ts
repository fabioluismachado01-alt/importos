// ─── EAN-13 check digit calculation ──────────────────────────────────────────

export function calcularDigitoEAN13(doze: string): number {
  const digits = doze.slice(0, 12).split('').map(Number)
  const soma = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0)
  return (10 - (soma % 10)) % 10
}

export function validarEAN13(ean: string): boolean {
  if (!/^\d{13}$/.test(ean)) return false
  const check = calcularDigitoEAN13(ean.slice(0, 12))
  return check === parseInt(ean[12])
}

// Gera EAN-13 com prefixo 789 (Brasil) a partir de um número sequencial
export function gerarEAN13(seq: number): string {
  const base = `789${String(seq).padStart(9, '0')}`
  const check = calcularDigitoEAN13(base)
  return `${base}${check}`
}

// Gera um EAN-13 aleatório válido (para uso interno — não registrado GS1)
export function gerarEAN13Aleatorio(): string {
  const rand = Math.floor(Math.random() * 1_000_000_000)
  return gerarEAN13(rand)
}
