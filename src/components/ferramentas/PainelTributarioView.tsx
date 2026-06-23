'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  Receipt, AlertTriangle, CheckCircle2, Clock,
  TrendingUp, TrendingDown, Minus, Calendar, Info,
} from 'lucide-react'
import type { PainelTributarioData, GuiaVencer } from '@/actions/painel-tributario'

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const PCT = (v: number) => `${v.toFixed(2)}%`

// ─── Barra SVG simples (sem dep. de chart lib) ──────────────────────────────

function GraficoHistorico({ historico }: { historico: PainelTributarioData['historico'] }) {
  const maxFat = Math.max(...historico.map(h => h.faturamento), 1)
  const maxDas = Math.max(...historico.map(h => h.dasEstimado), 1)

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1.5 h-40 pb-1">
        {historico.map((h, i) => {
          const fatH = (h.faturamento / maxFat) * 100
          const dasH = (h.dasEstimado / maxFat) * 100  // mesma escala do faturamento
          const isLast = i === historico.length - 1
          return (
            <div key={`${h.ano}-${h.mes}`} className="flex-1 flex flex-col items-center gap-0.5 group relative">
              {/* Tooltip */}
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] rounded-lg px-2 py-1.5 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
                <p className="font-bold">{h.mesNome}/{h.ano}</p>
                <p className="text-slate-300">Fat: {BRL(h.faturamento)}</p>
                <p className="text-red-300">DAS: {BRL(h.dasEstimado)}</p>
                <p className="text-amber-300">Carga: {PCT(h.cargaPct)}</p>
              </div>
              {/* Barras */}
              <div className="w-full flex items-end gap-0.5 h-32">
                <div
                  className={cn('flex-1 rounded-t-sm transition-all', isLast ? 'bg-emerald-400' : 'bg-emerald-200')}
                  style={{ height: `${fatH}%` }}
                />
                <div
                  className={cn('flex-1 rounded-t-sm transition-all', isLast ? 'bg-red-500' : 'bg-red-300')}
                  style={{ height: `${dasH}%` }}
                />
              </div>
              <span className={cn('text-[9px] font-medium', isLast ? 'text-slate-700' : 'text-slate-400')}>
                {h.mesNome}
              </span>
            </div>
          )
        })}
      </div>
      {/* Legenda */}
      <div className="flex gap-4 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-2 rounded-sm bg-emerald-400 inline-block" /> Faturamento
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-2 rounded-sm bg-red-400 inline-block" /> DAS estimado
        </span>
      </div>
    </div>
  )
}

// ─── Carga por mês (linha) ────────────────────────────────────────────────────

function GraficoCarga({ historico }: { historico: PainelTributarioData['historico'] }) {
  const valores = historico.map(h => h.cargaPct)
  const minV = Math.min(...valores) * 0.9
  const maxV = Math.max(...valores) * 1.1 || 10
  const range = maxV - minV || 1

  const W = 600
  const H = 80
  const pad = 20

  const pts = historico.map((h, i) => {
    const x = pad + (i / Math.max(historico.length - 1, 1)) * (W - pad * 2)
    const y = H - pad - ((h.cargaPct - minV) / range) * (H - pad * 2)
    return { x, y, h }
  })

  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaD = pts.length > 0
    ? `M ${pts[0].x} ${H - pad} ` + pts.map(p => `L ${p.x} ${p.y}`).join(' ') + ` L ${pts[pts.length - 1].x} ${H - pad} Z`
    : ''

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 80 }}>
        <defs>
          <linearGradient id="cgr" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
          </linearGradient>
        </defs>
        {areaD && <path d={areaD} fill="url(#cgr)" />}
        {pathD && <path d={pathD} fill="none" stroke="#f97316" strokeWidth="2" strokeLinejoin="round" />}
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill="#f97316" />
        ))}
      </svg>
      <div className="flex justify-between text-[9px] text-slate-400 mt-1">
        {historico.map(h => <span key={`${h.ano}-${h.mes}`}>{h.mesNome}</span>)}
      </div>
    </div>
  )
}

// ─── Card de guia ─────────────────────────────────────────────────────────────

function CardGuia({ guia }: { guia: GuiaVencer }) {
  const CONFIG = {
    vencida:    { bg: 'bg-red-50 border-red-200',      icon: AlertTriangle, iconCor: 'text-red-500',    label: 'Vencida',        badge: 'bg-red-100 text-red-700' },
    hoje:       { bg: 'bg-orange-50 border-orange-200', icon: AlertTriangle, iconCor: 'text-orange-500', label: 'Vence hoje',     badge: 'bg-orange-100 text-orange-700' },
    proximos7:  { bg: 'bg-amber-50 border-amber-200',   icon: Clock,         iconCor: 'text-amber-500',  label: 'Próx. 7 dias',   badge: 'bg-amber-100 text-amber-700' },
    proximos30: { bg: 'bg-blue-50 border-blue-200',     icon: Calendar,      iconCor: 'text-blue-500',   label: 'Próx. 30 dias',  badge: 'bg-blue-100 text-blue-700' },
    futura:     { bg: 'bg-slate-50 border-slate-200',   icon: CheckCircle2,  iconCor: 'text-slate-400',  label: 'Programada',     badge: 'bg-slate-100 text-slate-600' },
  }

  const c = CONFIG[guia.status]
  const Icon = c.icon
  const vencStr = guia.vencimento.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div className={cn('border rounded-xl p-4 flex items-center gap-4', c.bg)}>
      <Icon className={cn('w-5 h-5 shrink-0', c.iconCor)} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{guia.nome}</p>
        <p className="text-xs text-slate-500">Vencimento: {vencStr}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-black text-slate-800 font-mono">{BRL(guia.valorEstimado)}</p>
        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', c.badge)}>{c.label}</span>
      </div>
    </div>
  )
}

// ─── View principal ───────────────────────────────────────────────────────────

export function PainelTributarioView({ data }: { data: PainelTributarioData }) {
  const tendencia = useMemo(() => {
    if (data.historico.length < 3) return null
    const ultimo3 = data.historico.slice(-3).map(h => h.cargaPct)
    const delta = ultimo3[ultimo3.length - 1] - ultimo3[0]
    return delta
  }, [data.historico])

  const mediaHistorica = useMemo(() => {
    if (!data.historico.length) return 0
    return data.historico.reduce((acc, h) => acc + h.cargaPct, 0) / data.historico.length
  }, [data.historico])

  const regimeLabel = data.regime === 'simples' ? 'Simples Nacional'
    : data.regime === 'presumido' ? 'Lucro Presumido'
    : data.regime === 'lucro_real' ? 'Lucro Real'
    : 'Simples Nacional'

  const guiasUrgentes = data.guias.filter(g => g.status === 'vencida' || g.status === 'hoje' || g.status === 'proximos7')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Painel Tributário</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Referência: <strong>{data.mesRefNome}/{data.anoRef}</strong> · Regime: <strong>{regimeLabel}</strong>
          </p>
        </div>
        {guiasUrgentes.length > 0 && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            <span><strong>{guiasUrgentes.length} guia(s)</strong> vencendo em breve</span>
          </div>
        )}
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* DAS estimado */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <Receipt className="w-3.5 h-3.5" /> DAS estimado do mês
          </div>
          <p className="text-2xl font-black text-slate-800 font-mono">{BRL(data.dasEstimado)}</p>
          <p className="text-xs text-slate-400">
            sobre {BRL(data.faturamentoMes)} faturados
          </p>
        </div>

        {/* Carga efetiva */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <TrendingUp className="w-3.5 h-3.5" /> Carga efetiva s/ faturamento
          </div>
          <p className="text-2xl font-black text-slate-800 font-mono">{PCT(data.cargaEfetiva)}</p>
          <p className="text-xs text-slate-400">
            Média histórica: {PCT(mediaHistorica)}
          </p>
        </div>

        {/* Tendência */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            {tendencia !== null && tendencia > 0.3
              ? <TrendingUp className="w-3.5 h-3.5 text-red-500" />
              : tendencia !== null && tendencia < -0.3
              ? <TrendingDown className="w-3.5 h-3.5 text-emerald-500" />
              : <Minus className="w-3.5 h-3.5 text-slate-400" />
            }
            Tendência da carga (3 meses)
          </div>
          {tendencia !== null ? (
            <>
              <p className={cn('text-2xl font-black font-mono',
                tendencia > 0.3 ? 'text-red-600' : tendencia < -0.3 ? 'text-emerald-600' : 'text-slate-600'
              )}>
                {tendencia > 0 ? '+' : ''}{tendencia.toFixed(2)} pp
              </p>
              <p className="text-xs text-slate-400">
                {tendencia > 0.3 ? 'Carga aumentando — verifique faixa do Simples'
                  : tendencia < -0.3 ? 'Carga caindo — boa gestão do RBT12'
                  : 'Carga estável nos últimos 3 meses'}
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-400">Dados insuficientes</p>
          )}
        </div>
      </div>

      {/* Gráfico histórico faturamento vs DAS */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Faturamento vs. DAS estimado — últimos 12 meses</h2>
        </div>
        {data.historico.length > 0 ? (
          <GraficoHistorico historico={data.historico} />
        ) : (
          <p className="text-sm text-slate-400 py-8 text-center">Sem dados históricos ainda. Importe o faturamento para ver o gráfico.</p>
        )}
      </div>

      {/* Gráfico de carga */}
      {data.historico.length >= 3 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-700">Carga tributária efetiva — evolução mensal</h2>
            <span className="text-[10px] text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full font-medium">% do faturamento</span>
          </div>
          <GraficoCarga historico={data.historico} />
          <p className="text-xs text-slate-400 flex gap-1 items-start">
            <Info className="w-3 h-3 shrink-0 mt-0.5" />
            Variações na carga indicam mudança de faixa do Simples conforme o RBT12 evolui.
            Monitorar permite antecipar a troca de regime antes de escalar o faturamento.
          </p>
        </div>
      )}

      {/* Guias a vencer */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">Guias e vencimentos</h2>
        {data.guias.length > 0 ? (
          <div className="space-y-3">
            {data.guias.map((g, i) => <CardGuia key={i} guia={g} />)}
          </div>
        ) : (
          <p className="text-sm text-slate-400 py-4 text-center">Nenhuma guia próxima do vencimento.</p>
        )}
        <div className="bg-slate-50 rounded-xl px-4 py-3 text-xs text-slate-500 flex gap-2">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            DAS do Simples Nacional vence no dia 20 do mês seguinte ao período de apuração.
            Os valores são <strong>estimativas</strong> baseadas no faturamento lançado — o valor definitivo é o calculado no PGDAS-D.
          </span>
        </div>
      </div>

      {/* Nota sobre RBT12 */}
      {data.rbt12 > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex gap-3">
          <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
          <div className="text-xs text-indigo-700 space-y-0.5">
            <p className="font-semibold">RBT12 atual: {BRL(data.rbt12)}</p>
            <p>
              O DAS é calculado pela alíquota efetiva sobre o RBT12. Se o faturamento continuar crescendo,
              fique atento à próxima faixa — pode ser o momento de avaliar a mudança de regime com seu contador.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
