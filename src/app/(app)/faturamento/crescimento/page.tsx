import { getFaturamentoAnual, getHistoricoAnual, seedHistorico2023a2025 } from '@/actions/finance'
import { CrescimentoView } from '@/components/faturamento/CrescimentoView'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Crescimento Anual — ImportOS',
  description: 'Comparativo de faturamento mensal com meta de crescimento.',
}

export default async function CrescimentoPage() {
  const anoAtual = new Date().getFullYear()
  const anosHist = [anoAtual - 3, anoAtual - 2, anoAtual - 1] // ex: [2023, 2024, 2025]

  // Roda seed se não tiver os 36 registros completos (12 meses × 3 anos)
  const historicoBruto = await getHistoricoAnual(anosHist)
  if (historicoBruto.length < 36) {
    await seedHistorico2023a2025()
  }

  const [historico, mesAtual] = await Promise.all([
    getHistoricoAnual(anosHist), // apenas anos históricos, 2026 vem só do sistema ao vivo
    getFaturamentoAnual(anoAtual),
  ])

  // Monta mapa { ano: { mes: valor } } apenas para anos históricos
  const mapa: Record<number, Record<number, number>> = {}
  for (const h of historico) {
    if (!mapa[h.ano]) mapa[h.ano] = {}
    mapa[h.ano][h.mes] = h.faturamento
  }

  // Ano atual vem 100% dos dados ao vivo do sistema
  mapa[anoAtual] = {}
  for (const m of mesAtual) {
    mapa[anoAtual][m.mes] = m.receita_total
  }

  return <CrescimentoView mapa={mapa} anoAtual={anoAtual} />
}
