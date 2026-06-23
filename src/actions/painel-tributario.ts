'use server'

import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'
import { calcularSimples } from '@/engines/impostos'
import type { AnexoSimples } from '@/engines/impostos'

export interface MesHistorico {
  ano: number
  mes: number
  mesNome: string
  faturamento: number
  dasEstimado: number
  cargaPct: number
}

export interface GuiaVencer {
  nome: string
  vencimento: Date
  valorEstimado: number
  status: 'vencida' | 'hoje' | 'proximos7' | 'proximos30' | 'futura'
}

export interface PainelTributarioData {
  // Mês de referência
  anoRef: number
  mesRef: number
  mesRefNome: string

  // Dados do mês atual
  faturamentoMes: number
  dasEstimado: number
  cargaEfetiva: number  // % sobre faturamento

  // Histórico 12 meses
  historico: MesHistorico[]

  // Config
  regime: string | null
  anexoSimples: AnexoSimples
  rbt12: number

  // Guias a vencer
  guias: GuiaVencer[]
}

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const MESES_FULL  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function statusGuia(venc: Date): GuiaVencer['status'] {
  const hoje = new Date()
  hoje.setHours(0,0,0,0)
  const diff = Math.floor((venc.getTime() - hoje.getTime()) / 86400000)
  if (diff < 0)  return 'vencida'
  if (diff === 0) return 'hoje'
  if (diff <= 7)  return 'proximos7'
  if (diff <= 30) return 'proximos30'
  return 'futura'
}

export async function getPainelTributarioData(): Promise<PainelTributarioData> {
  const { workspaceId } = await getAuthContext()

  const hoje = new Date()
  const anoAtual = hoje.getFullYear()
  const mesAtual = hoje.getMonth() + 1

  const [empresa, fatAtual, historico] = await Promise.all([
    prisma.empresa.findUnique({
      where: { workspace_id: workspaceId },
      select: { regime_tributario: true, aliquota_simples: true },
    }),
    prisma.faturamento_mes.findFirst({
      where: { workspace_id: workspaceId, receita_total: { gt: 0 } },
      orderBy: [{ ano: 'desc' }, { mes: 'desc' }],
      select: { receita_total: true, ano: true, mes: true },
    }),
    prisma.historico_faturamento_anual.findMany({
      where: { workspace_id: workspaceId },
      orderBy: [{ ano: 'desc' }, { mes: 'desc' }],
      take: 12,
    }),
  ])

  const anoRef = fatAtual?.ano ?? anoAtual
  const mesRef = fatAtual?.mes ?? mesAtual
  const faturamentoMes = fatAtual?.receita_total ?? 0
  const regime = empresa?.regime_tributario ?? null
  const isSimples = regime?.toLowerCase().includes('simples') ?? false
  const anexoSimples: AnexoSimples = 'comercio'
  // aliquota_simples pode ser 6.0 (%) ou 0.06 (decimal) dependendo do cliente
  const rawAliq = empresa?.aliquota_simples ?? 6
  const aliquotaSimples = rawAliq > 1 ? rawAliq / 100 : rawAliq

  // RBT12 — soma dos 12 meses anteriores ao mês de referência
  const histOrdenado = [...historico].sort((a, b) =>
    a.ano !== b.ano ? a.ano - b.ano : a.mes - b.mes
  )
  const rbt12 = histOrdenado
    .filter(h => h.ano < anoRef || (h.ano === anoRef && h.mes < mesRef))
    .slice(-12)
    .reduce((acc, h) => acc + h.faturamento, 0)

  function estimarDAS(fat: number, rbt: number): number {
    if (!fat) return 0
    if (!isSimples) return fat * aliquotaSimples
    const res = calcularSimples({ faturamentoMes: fat, rbt12: rbt > 0 ? rbt : fat * 12, anexo: anexoSimples })
    return res.ok ? res.valorDAS : fat * aliquotaSimples
  }

  const dasEstimado = estimarDAS(faturamentoMes, rbt12)
  const cargaEfetiva = faturamentoMes > 0 ? (dasEstimado / faturamentoMes) * 100 : 0

  // Histórico 12 meses com DAS estimado por mês
  let rbt12Acumulado = rbt12
  const historicoFormatado: MesHistorico[] = histOrdenado.slice(-12).map(h => {
    const das = estimarDAS(h.faturamento, rbt12Acumulado)
    const carga = h.faturamento > 0 ? (das / h.faturamento) * 100 : 0
    return {
      ano: h.ano,
      mes: h.mes,
      mesNome: MESES_ABREV[h.mes - 1],
      faturamento: h.faturamento,
      dasEstimado: das,
      cargaPct: carga,
    }
  })

  // Guias a vencer — DAS vence dia 20 do mês seguinte
  const guias: GuiaVencer[] = []

  // DAS do mês atual (se no Simples) vence dia 20 do próximo mês
  if (regime === 'simples' || !regime) {
    const vencDASMesRef = new Date(anoRef, mesRef, 20) // mês seguinte ao de ref
    guias.push({
      nome: `DAS — ${MESES_FULL[mesRef - 1]}/${anoRef}`,
      vencimento: vencDASMesRef,
      valorEstimado: dasEstimado,
      status: statusGuia(vencDASMesRef),
    })

    // DAS do mês anterior se ainda estiver pendente
    const mesAnt = mesRef === 1 ? 12 : mesRef - 1
    const anoAnt = mesRef === 1 ? anoRef - 1 : anoRef
    const fatAnteriores = histOrdenado.find(h => h.ano === anoAnt && h.mes === mesAnt)
    if (fatAnteriores) {
      const dasAnt = estimarDAS(fatAnteriores.faturamento, rbt12)
      const vencAnt = new Date(anoRef, mesRef - 1, 20) // dia 20 do mês de ref
      const stAnt = statusGuia(vencAnt)
      if (stAnt === 'vencida' || stAnt === 'hoje' || stAnt === 'proximos7') {
        guias.push({
          nome: `DAS — ${MESES_FULL[mesAnt - 1]}/${anoAnt}`,
          vencimento: vencAnt,
          valorEstimado: dasAnt,
          status: stAnt,
        })
      }
    }
  }

  // Ordena guias por vencimento
  guias.sort((a, b) => a.vencimento.getTime() - b.vencimento.getTime())

  return {
    anoRef,
    mesRef,
    mesRefNome: MESES_FULL[mesRef - 1],
    faturamentoMes,
    dasEstimado,
    cargaEfetiva,
    historico: historicoFormatado,
    regime,
    anexoSimples,
    rbt12,
    guias,
  }
}
