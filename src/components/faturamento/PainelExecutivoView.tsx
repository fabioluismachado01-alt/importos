'use client'

import { useState, useEffect } from 'react'
import { Brain, TrendingUp, TrendingDown, Wallet, BarChart2, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell,
} from 'recharts'
import { formatCurrency, getMesNome } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface MesDRE {
  mes: number; lucro_bruto: number; lucro_liquido: number; receita_total: number
  margem_contribuicao: number; desp_pro_labore: number; desp_ads_ml: number
  desp_ads_outros: number; das_valor_calc: number; desp_previdencia_privada: number
  dlr_socio: number; reinvestimento: number
}
interface Config { percentual_dlr_socio: number; meta_faturamento_anual: number }
interface Props { meses: MesDRE[]; config: Config; ano: number }

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export function PainelExecutivoView({ meses, config, ano }: Props) {
  const [mesAtivo, setMesAtivo] = useState<number | null>(null)
  const [analiseIA, setAnaliseIA] = useState<string>('')
  const [loadingIA, setLoadingIA] = useState(false)

  const mesesComDados = meses.filter(m => m.lucro_liquido !== 0)
  const mesAtual = mesAtivo !== null ? meses.find(m => m.mes === mesAtivo) : mesesComDados[mesesComDados.length - 1]

  const totalLucroLiq = mesesComDados.reduce((s, m) => s + m.lucro_liquido, 0)
  const totalDLR = mesesComDados.reduce((s, m) => s + m.dlr_socio, 0)
  const mediaLucroLiq = mesesComDados.length > 0 ? totalLucroLiq / mesesComDados.length : 0
  const melhorMes = mesesComDados.reduce((best, m) => m.lucro_liquido > (best?.lucro_liquido ?? -Infinity) ? m : best, mesesComDados[0])

  const dadosGrafico = meses.map(m => ({
    mes: MESES_ABREV[m.mes - 1],
    'Lucro Líquido': m.lucro_liquido,
    'Lucro Bruto': m.lucro_bruto,
  }))

  async function carregarIA(mes: MesDRE) {
    setLoadingIA(true)
    setAnaliseIA('')
    try {
      const mesIdx = meses.findIndex(m => m.mes === mes.mes)
      const anterior = mesIdx > 0 ? meses[mesIdx - 1] : undefined

      const payload = {
        mesAtual: {
          mes: getMesNome(mes.mes),
          faturamento: mes.receita_total,
          lucro_bruto: mes.lucro_bruto,
          lucro_liquido: mes.lucro_liquido,
          margem: mes.margem_contribuicao,
          das: mes.das_valor_calc,
          dlr_socio: mes.dlr_socio,
          desp_ads: mes.desp_ads_ml + mes.desp_ads_outros,
          desp_custo_produtos: 0,
        },
        mesAnterior: anterior && anterior.receita_total > 0 ? {
          mes: getMesNome(anterior.mes),
          faturamento: anterior.receita_total,
          lucro_bruto: anterior.lucro_bruto,
          lucro_liquido: anterior.lucro_liquido,
          margem: anterior.margem_contribuicao,
          das: anterior.das_valor_calc,
          dlr_socio: anterior.dlr_socio,
          desp_ads: anterior.desp_ads_ml + anterior.desp_ads_outros,
          desp_custo_produtos: 0,
        } : undefined,
      }

      const res = await fetch('/api/ia/analisar-mes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      setAnaliseIA(data.analise ?? '')
    } finally {
      setLoadingIA(false)
    }
  }

  useEffect(() => {
    if (mesAtual && mesAtual.lucro_liquido !== 0) {
      carregarIA(mesAtual)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesAtivo])

  if (mesesComDados.length === 0) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="p-12 text-center">
          <BarChart2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-500">Nenhum dado financeiro ainda</p>
          <p className="text-xs text-slate-400 mt-1">Lance receitas e despesas no Faturamento para ver a análise aqui</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Lucro Líquido Acumulado', value: formatCurrency(totalLucroLiq), color: totalLucroLiq >= 0 ? 'emerald' : 'red', sub: `${mesesComDados.length} meses` },
          { label: 'Média Mensal', value: formatCurrency(mediaLucroLiq), color: 'blue', sub: 'Por mês com dados' },
          { label: 'DLR Total Sócio', value: formatCurrency(totalDLR), color: 'emerald', sub: `${(config.percentual_dlr_socio * 100).toFixed(0)}% do lucro líq.` },
          { label: 'Melhor Mês', value: melhorMes ? formatCurrency(melhorMes.lucro_liquido) : '—', color: 'emerald', sub: melhorMes ? getMesNome(melhorMes.mes) : '' },
        ].map(kpi => (
          <Card key={kpi.label} className="border-0 shadow-sm">
            <CardContent className="p-5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{kpi.label}</p>
              <p className={cn('text-xl font-black font-mono mt-1', {
                'text-emerald-600': kpi.color === 'emerald',
                'text-blue-600': kpi.color === 'blue',
                'text-red-500': kpi.color === 'red',
              })}>{kpi.value}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{kpi.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gráfico principal + seletor de mês */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-black text-slate-500 uppercase tracking-wide">
            Evolução do Lucro Líquido — {ano}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dadosGrafico} onClick={(d: unknown) => {
              const dd = d as { activePayload?: Array<{ payload?: { mes?: string } }> }
              if (dd?.activePayload) {
                const m = dd.activePayload[0]?.payload?.mes
                if (m) {
                  const mesNum = MESES_ABREV.indexOf(m) + 1
                  if (mesNum > 0) setMesAtivo(mesNum)
                }
              }
            }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => formatCurrency(Number(v))}
                contentStyle={{ borderRadius: '8px', fontSize: '11px', border: '1px solid #E2E8F0' }} />
              <ReferenceLine y={0} stroke="#EF4444" strokeDasharray="4 2" />
              <Line type="monotone" dataKey="Lucro Bruto" stroke="#3B82F6" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              <Line type="monotone" dataKey="Lucro Líquido" stroke="#10B981" strokeWidth={2.5}
                dot={{ fill: '#10B981', r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-slate-400 text-center mt-2">Clique em um mês no gráfico para analisar</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Detalhes do mês selecionado */}
        {mesAtual && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-black text-slate-500 uppercase tracking-wide">
                  {getMesNome(mesAtual.mes)} — Composição
                </CardTitle>
                <div className="flex gap-1">
                  {mesesComDados.map(m => (
                    <button key={m.mes} onClick={() => setMesAtivo(m.mes)}
                      className={cn('w-6 h-6 rounded-full text-[9px] font-bold transition-all',
                        (mesAtivo ?? mesesComDados[mesesComDados.length - 1]?.mes) === m.mes
                          ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      )}>
                      {MESES_ABREV[m.mes - 1].slice(0, 1)}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: 'Faturamento Bruto', value: mesAtual.receita_total, cor: 'emerald' },
                { label: '− DAS', value: -mesAtual.das_valor_calc, cor: 'amber' },
                { label: '− Ads Total', value: -(mesAtual.desp_ads_ml + mesAtual.desp_ads_outros), cor: 'red' },
                { label: 'LUCRO BRUTO', value: mesAtual.lucro_bruto, cor: 'blue', bold: true },
                { label: '− Previdência Privada', value: -mesAtual.desp_previdencia_privada, cor: 'purple' },
                { label: 'LUCRO LÍQUIDO', value: mesAtual.lucro_liquido, cor: mesAtual.lucro_liquido >= 0 ? 'emerald' : 'red', bold: true, big: true },
              ].map(row => row.value !== 0 && (
                <div key={row.label} className={cn('flex justify-between items-center', row.big && 'py-1 border-t border-slate-200 mt-1')}>
                  <span className={cn('text-xs', row.bold ? 'font-black text-slate-900' : 'font-medium text-slate-600')}>{row.label}</span>
                  <span className={cn('text-xs font-mono font-bold', {
                    'text-emerald-600': row.cor === 'emerald',
                    'text-blue-600': row.cor === 'blue',
                    'text-amber-600': row.cor === 'amber',
                    'text-red-500': row.cor === 'red',
                    'text-purple-600': row.cor === 'purple',
                    'text-lg font-black': row.big,
                  })}>{formatCurrency(row.value)}</span>
                </div>
              ))}

              <div className="mt-3 pt-3 border-t border-slate-100 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-emerald-600 font-bold">DLR do Sócio ({(config.percentual_dlr_socio * 100).toFixed(0)}%)</span>
                  <span className="font-mono font-black text-emerald-600">{formatCurrency(mesAtual.dlr_socio)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-blue-600 font-bold">Reinvestimento ({(100 - config.percentual_dlr_socio * 100).toFixed(0)}%)</span>
                  <span className="font-mono font-black text-blue-600">{formatCurrency(mesAtual.reinvestimento)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Análise de IA */}
        <Card className="border-0 shadow-sm border-l-4 border-l-purple-400">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-500" />
              <CardTitle className="text-xs font-black text-slate-500 uppercase tracking-wide">
                Análise de IA — {mesAtual ? getMesNome(mesAtual.mes) : ''}
              </CardTitle>
              <Badge className="text-[8px] bg-purple-100 text-purple-700 border-purple-200 h-4 px-1.5">Groq · Llama 3.3</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {loadingIA ? (
              <div className="flex items-center gap-2 py-6">
                <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                <p className="text-xs text-slate-500">Analisando resultado...</p>
              </div>
            ) : analiseIA ? (
              <p className="text-sm text-slate-700 leading-relaxed">{analiseIA}</p>
            ) : (
              <p className="text-xs text-slate-400 py-6 text-center">
                {mesAtual ? 'Selecione um mês no gráfico para ver a análise' : 'Sem dados para analisar'}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Barras de margem por mês */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-black text-slate-500 uppercase tracking-wide">
            Margem de Contribuição por Mês (%)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={mesesComDados.map(m => ({ mes: MESES_ABREV[m.mes - 1], margem: parseFloat(m.margem_contribuicao.toFixed(1)) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} domain={[0, 100]} />
              <Tooltip formatter={(v) => `${v}%`} contentStyle={{ borderRadius: '8px', fontSize: '11px', border: '1px solid #E2E8F0' }} />
              <Bar dataKey="margem" radius={[4, 4, 0, 0]}>
                {mesesComDados.map((m, i) => (
                  <Cell key={i} fill={m.margem_contribuicao > 25 ? '#10B981' : m.margem_contribuicao > 10 ? '#F59E0B' : '#EF4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
