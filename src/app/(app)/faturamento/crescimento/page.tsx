import { getFaturamentoAnual, getHistoricoAnual, seedHistorico2023a2025 } from '@/actions/finance'
import { CrescimentoView } from '@/components/faturamento/CrescimentoView'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Crescimento Anual — ImportOS',
  description: 'Comparativo de faturamento mensal com meta de crescimento.',
}

export default async function CrescimentoPage() {
  const anoAtual = new Date().getFullYear()

  const [historico, mesAtual] = await Promise.all([
    getHistoricoAnual(), // todos os anos disponíveis no banco
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
