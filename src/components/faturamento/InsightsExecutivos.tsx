'use client'

import { cn, formatCurrency } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Trophy, TrendingUp, Star, Award } from 'lucide-react'
import { MarketplaceLogo } from '@/components/marketplace/MarketplaceLogo'

export interface CanalAnalise {
  key: string; label: string; cor: string
  receita: number; despesas: number; lucro: number; margem: number; participacao: number
}

interface Props {
  canais: CanalAnalise[]
  receitaTotal: number
  lucroLiquido: number
  cmv: number
  diasComVenda: number
  totalPedidos?: number
}

function InsightCard({ icon, titulo, valor, sub, cor, bg }: {
  icon: React.ReactNode; titulo: string; valor: string; sub?: string; cor: string; bg: string
}) {
  return (
    <div className={cn('rounded-2xl p-4 border', bg)}>
      <div className="flex items-start gap-3">
        <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center shrink-0', cor)}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-0.5">{titulo}</p>
          <p className="text-base font-black text-slate-900 leading-tight">{valor}</p>
          {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  )
}

export function InsightsExecutivos({ canais, receitaTotal, lucroLiquido, cmv, diasComVenda, totalPedidos }: Props) {
  if (canais.length === 0) return null

  // Canal com maior receita
  const maiorReceita = canais[0]
  // Canal com melhor margem (entre os com receita significativa > 1% do total)
  const canaisSignificativos = canais.filter(c => c.receita > receitaTotal * 0.01)
  const maisRentavel = [...canaisSignificativos].sort((a, b) => b.margem - a.margem)[0]
  // Canal com maior lucro absoluto
  const maiorLucro = [...canais].sort((a, b) => b.lucro - a.lucro)[0]
  // Métricas gerais
  const margemLiquida = receitaTotal > 0 ? (lucroLiquido / receitaTotal) * 100 : 0
  const cmvPerc = receitaTotal > 0 ? (cmv / receitaTotal) * 100 : 0
  const lucroPorPedido = totalPedidos && totalPedidos > 0 ? lucroLiquido / totalPedidos : 0

  // Ranking por margem — exibe todos os canais com receita (mesmo os pequenos, ex: TikTok)
  const ranking = [...canais].sort((a, b) => b.margem - a.margem)

  return (
    <div className="space-y-4">

      {/* Insights cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <InsightCard
          icon={<Trophy className="w-4 h-4 text-white" />}
          titulo="Canal com Maior Receita"
          valor={maiorReceita.label}
          sub={`${formatCurrency(maiorReceita.receita)} · ${maiorReceita.participacao.toFixed(1)}%`}
          cor="bg-amber-500" bg="bg-amber-50 border-amber-200"
        />
        <InsightCard
          icon={<Star className="w-4 h-4 text-white" />}
          titulo="Canal Mais Rentável"
          valor={maisRentavel.label}
          sub={`Margem ${maisRentavel.margem.toFixed(1)}% · Lucro ${formatCurrency(maisRentavel.lucro)}`}
          cor="bg-emerald-500" bg="bg-emerald-50 border-emerald-200"
        />
        <InsightCard
          icon={<TrendingUp className="w-4 h-4 text-white" />}
          titulo="Canal com Maior Lucro"
          valor={maiorLucro.label}
          sub={`${formatCurrency(maiorLucro.lucro)} · Margem ${maiorLucro.margem.toFixed(1)}%`}
          cor="bg-blue-500" bg="bg-blue-50 border-blue-200"
        />
        <InsightCard
          icon={<Award className="w-4 h-4 text-white" />}
          titulo="Margem Líquida Geral"
          valor={`${margemLiquida.toFixed(1)}%`}
          sub={lucroPorPedido > 0 ? `${formatCurrency(lucroPorPedido)}/pedido · CMV ${cmvPerc.toFixed(1)}%` : `CMV ${cmvPerc.toFixed(1)}% da receita`}
          cor="bg-purple-500" bg="bg-purple-50 border-purple-200"
        />
      </div>

      {/* Ranking por Margem + Participação detalhada */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Ranking */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-xs font-black text-slate-500 uppercase tracking-wide flex items-center gap-2">
              <Trophy className="w-3.5 h-3.5" /> Ranking — Canais por Margem
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4 space-y-2">
            {ranking.map((c, i) => (
              <div key={c.key} className="flex items-center gap-3">
                {/* Posição */}
                <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 text-white',
                  i === 0 ? 'bg-amber-400' : i === 1 ? 'bg-slate-400' : i === 2 ? 'bg-amber-700' : 'bg-slate-200 text-slate-600')}>
                  {i + 1}
                </div>
                {/* Canal */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <MarketplaceLogo id={c.key} size={18} rounded="rounded-md" />
                    <span className="text-xs font-bold text-slate-800">{c.label}</span>
                  </div>
                  {/* Barra de margem */}
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(c.margem, 100)}%`, background: c.margem >= 25 ? '#10b981' : c.margem >= 15 ? '#f59e0b' : '#ef4444' }} />
                  </div>
                </div>
                {/* Margem */}
                <div className="text-right shrink-0">
                  <span className={cn('text-sm font-black font-mono',
                    c.margem >= 25 ? 'text-emerald-600' : c.margem >= 15 ? 'text-amber-600' : 'text-red-500')}>
                    {c.margem.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Participação com Lucro + Margem */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-xs font-black text-slate-500 uppercase tracking-wide flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5" /> Participação Detalhada
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4 space-y-3">
            {canais.map(c => (
              <div key={c.key} className="space-y-1">
                <div className="flex items-center gap-2">
                  <MarketplaceLogo id={c.key} size={18} rounded="rounded-md" />
                  <span className="text-xs font-bold text-slate-800 flex-1">{c.label}</span>
                  <span className="text-[10px] font-bold text-slate-500">{c.participacao.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${c.participacao}%`, background: c.cor }} />
                </div>
                <div className="flex justify-between text-[9px] text-slate-400 pl-4">
                  <span>Rec: <span className="text-emerald-600 font-bold">{formatCurrency(c.receita)}</span></span>
                  <span>Lucro: <span className={cn('font-bold', c.lucro >= 0 ? 'text-emerald-600' : 'text-red-500')}>{formatCurrency(c.lucro)}</span></span>
                  <span>Mgm: <span className={cn('font-bold', c.margem >= 20 ? 'text-emerald-600' : c.margem >= 10 ? 'text-amber-600' : 'text-red-500')}>{c.margem.toFixed(1)}%</span></span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
