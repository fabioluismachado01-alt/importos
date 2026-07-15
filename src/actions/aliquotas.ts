'use server'

import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'
import { calcularSimples } from '@/engines/impostos'

export type EstimativaAliquota = {
  mes: number
  aliquota: number
  rbt12: number
  tipo: 'exato' | 'estimativa'
}

export async function estimarAliquotasFuturas(ano: number): Promise<EstimativaAliquota[]> {
  const { workspaceId } = await getAuthContext()

  const mesesFechados = await prisma.faturamento_mes.findMany({
    where: { workspace_id: workspaceId, ano, fechado: true },
    select: { mes: true },
    orderBy: { mes: 'desc' },
  })
  if (mesesFechados.length === 0) return []

  const lastClosed = mesesFechados[0].mes

  const historicoFat = await prisma.historico_faturamento_anual.findMany({
    where: { workspace_id: workspaceId, ano: { gte: ano - 1, lte: ano } },
    orderBy: [{ ano: 'asc' }, { mes: 'asc' }],
  })
  const fatMap = new Map<string, number>()
  for (const h of historicoFat) fatMap.set(`${h.ano}-${h.mes}`, h.faturamento)

  const last3Fats = mesesFechados.slice(0, 3).map(m => fatMap.get(`${ano}-${m.mes}`) ?? 0)
  const avgLast3 = last3Fats.length > 0
    ? last3Fats.reduce((a, b) => a + b, 0) / last3Fats.length
    : 0
  if (avgLast3 <= 0) return []

  const estimativas: EstimativaAliquota[] = []

  for (let m = lastClosed + 1; m <= 12; m++) {
    let rbt12 = 0
    let allReal = true

    for (let offset = 1; offset <= 12; offset++) {
      let tMes = m - offset
      let tAno = ano
      if (tMes <= 0) { tMes += 12; tAno = ano - 1 }

      const isReal = tAno < ano || (tAno === ano && tMes <= lastClosed)
      if (isReal) {
        rbt12 += fatMap.get(`${tAno}-${tMes}`) ?? 0
      } else {
        rbt12 += avgLast3
        allReal = false
      }
    }

    const resultado = calcularSimples({ faturamentoMes: avgLast3, rbt12, anexo: 'comercio' })
    if (!resultado.ok) continue

    estimativas.push({
      mes: m,
      aliquota: parseFloat(resultado.aliquotaEfetiva.toFixed(2)),
      rbt12: Math.round(rbt12),
      tipo: allReal ? 'exato' : 'estimativa',
    })
  }

  return estimativas
}
