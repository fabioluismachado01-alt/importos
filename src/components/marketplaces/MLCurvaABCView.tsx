'use client'

import { useState } from 'react'
import Image from 'next/image'
import { AlertTriangle, XCircle } from 'lucide-react'
import type { CurvaABCItem } from '@/actions/ml'

interface Props {
  itens: CurvaABCItem[]
}

type Modo = 'faturamento' | 'lucro'

const BRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const PCT = (v: number) =>
  (v >= 0 ? '+' : '') + v.toFixed(1) + '%'

const CLASSE_CLS: Record<string, string> = {
  A: 'bg-emerald-100 text-emerald-700',
  B: 'bg-yellow-100 text-yellow-700',
  C: 'bg-red-100 text-red-600',
}

export function MLCurvaABCView({ itens }: Props) {
  const [modo, setModo] = useState<Modo>('faturamento')
  const [search, setSearch] = useState('')
  const [apenasNegativo, setApenasNegativo] = useState(false)

  const sorted = [...itens].sort((a, b) =>
    modo === 'faturamento' ? b.faturamento - a.faturamento : b.lucro - a.lucro
  )

  const filtrados = sorted.filter(i => {
    if (apenasNegativo && i.lucro >= 0) return false
    if (!search) return true
    return (
      i.titulo.toLowerCase().includes(search.toLowerCase()) ||
      (i.sku ?? '').toLowerCase().includes(search.toLowerCase())
    )
  })

  const classeKey = modo === 'faturamento' ? 'classe_fat' : 'classe_lucro'
  const cntA = itens.filter(i => i[classeKey] === 'A').length
  const cntB = itens.filter(i => i[classeKey] === 'B').length
  const cntC = itens.filter(i => i[classeKey] === 'C').length
  const cntNegativo = itens.filter(i => i.lucro < 0).length
  const cntCanceladas = itens.reduce((s, i) => s + i.canceladas, 0)

  const totalFat      = itens.reduce((s, i) => s + i.faturamento, 0)
  const totalLucro    = itens.reduce((s, i) => s + i.lucro, 0)
  const margemGeral   = totalFat > 0 ? (totalLucro / totalFat) * 100 : 0

  const chartData = sorted.slice(0, 30)
  const maxVal = Math.max(...chartData.map(i => modo === 'faturamento' ? i.faturamento : Math.max(i.lucro, 0)), 1)
  const W = 600, H = 160, PAD = 8
  const BAR_W = Math.max(4, (W - PAD * 2) / Math.max(chartData.length, 1) - 2)

  return (
    <div className="p-6 space-y-5">
      {/* Header + toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs text-slate-400">A = 80% · B = 80–95% · C = 95–100% do total acumulado</p>
        <div className="flex bg-slate-100 rounded-lg p-0.5 border border-slate-200">
          {(['faturamento', 'lucro'] as Modo[]).map(m => (
            <button
              key={m}
              onClick={() => setModo(m)}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                modo === m ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Por {m === 'faturamento' ? 'Faturamento' : 'Lucro'}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs de classe + alertas */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {([
          { cls: 'A', count: cntA, sub: 'Top (80%)',     bg: 'from-emerald-500 to-emerald-600', light: 'bg-emerald-400/20' },
          { cls: 'B', count: cntB, sub: '80–95%',         bg: 'from-amber-400 to-amber-500',    light: 'bg-amber-300/20' },
          { cls: 'C', count: cntC, sub: '95–100%',        bg: 'from-red-400 to-red-500',        light: 'bg-red-300/20' },
        ] as const).map(({ cls, count, sub, bg, light }) => (
          <div key={cls} className={`bg-gradient-to-r ${bg} rounded-xl px-4 py-3 shadow-sm relative overflow-hidden flex items-center gap-3`}>
            <div className={`absolute top-0 right-0 w-14 h-14 rounded-full ${light} -translate-y-3 translate-x-3`} />
            <span className="px-2 py-0.5 rounded-md text-xs font-black bg-white/25 text-white flex-shrink-0">{cls}</span>
            <div className="relative">
              <p className="text-2xl font-black text-white leading-none">{count}</p>
              <p className="text-[10px] text-white/70 mt-0.5">{sub}</p>
            </div>
          </div>
        ))}
        {/* Alerta lucro negativo */}
        <div
          onClick={() => setApenasNegativo(v => !v)}
          className={`rounded-xl px-4 py-3 shadow-sm flex items-center gap-3 cursor-pointer transition-all border ${
            apenasNegativo ? 'bg-red-600 border-red-600' : 'bg-white border-red-200 hover:border-red-400'
          }`}
        >
          <AlertTriangle className={`w-5 h-5 shrink-0 ${apenasNegativo ? 'text-white' : 'text-red-500'}`} />
          <div>
            <p className={`text-xl font-black leading-none ${apenasNegativo ? 'text-white' : 'text-red-600'}`}>{cntNegativo}</p>
            <p className={`text-[10px] mt-0.5 ${apenasNegativo ? 'text-white/80' : 'text-red-400'}`}>Lucro negativo</p>
          </div>
        </div>
        {/* Canceladas */}
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm flex items-center gap-3">
          <XCircle className="w-5 h-5 text-slate-400 shrink-0" />
          <div>
            <p className="text-xl font-black text-slate-700 leading-none">{cntCanceladas}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Cancelamentos</p>
          </div>
        </div>
      </div>

      {/* Margem geral */}
      <div className="flex items-center gap-4 px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-sm">
        <div className="text-slate-500">Margem geral do período:</div>
        <div className={`font-black text-lg ${margemGeral >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
          {PCT(margemGeral)}
        </div>
        <div className="text-slate-400 text-xs">({BRL(totalLucro)} de lucro sobre {BRL(totalFat)} faturados)</div>
      </div>

      {/* Gráfico Pareto */}
      {chartData.length > 0 && (
        <div className="bg-slate-900 rounded-2xl p-5 shadow-lg overflow-x-auto">
          <p className="text-xs text-slate-400 mb-4 font-black uppercase tracking-widest">
            Pareto — Top {chartData.length} SKUs ({modo === 'faturamento' ? 'faturamento' : 'lucro'})
          </p>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 400, height: H }}>
            <line x1={0} y1={H * 0.2} x2={W} y2={H * 0.2} stroke="#34d399" strokeWidth={1} strokeDasharray="4 4" opacity={0.5} />
            <text x={W - 4} y={H * 0.2 - 3} fill="#34d399" fontSize={9} textAnchor="end" opacity={0.8}>80%</text>
            {chartData.map((item, i) => {
              const val = modo === 'faturamento' ? item.faturamento : Math.max(item.lucro, 0)
              const barH = Math.max(2, (val / maxVal) * (H - PAD * 2))
              const x = PAD + i * (BAR_W + 2)
              const y = H - PAD - barH
              const classe = (item[classeKey] as 'A' | 'B' | 'C')
              const color = item.lucro < 0 ? '#7c3aed' : classe === 'A' ? '#10b981' : classe === 'B' ? '#f59e0b' : '#ef4444'
              return (
                <g key={item.chave}>
                  <rect x={x} y={y} width={BAR_W} height={barH} fill={color} rx={2} opacity={0.85} />
                  <title>{item.titulo} — {BRL(modo === 'faturamento' ? item.faturamento : item.lucro)} · Margem: {item.margem.toFixed(1)}%</title>
                </g>
              )
            })}
            {chartData.length > 1 && (
              <polyline
                points={chartData.map((item, i) => {
                  const acum = modo === 'faturamento' ? item.acum_fat : item.acum_lucro
                  const x = PAD + i * (BAR_W + 2) + BAR_W / 2
                  const y = H - PAD - (acum / 100) * (H - PAD * 2)
                  return `${x},${y}`
                }).join(' ')}
                fill="none" stroke="#94a3b8" strokeWidth={1.5} opacity={0.8}
              />
            )}
          </svg>
          <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-emerald-500 inline-block" /> Classe A</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-amber-400 inline-block" /> Classe B</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-red-500 inline-block" /> Classe C</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-violet-600 inline-block" /> Lucro negativo</span>
            <span className="flex items-center gap-1.5"><span className="w-8 border-t border-slate-500 inline-block" /> % Acumulado</span>
          </div>
        </div>
      )}

      {/* Busca */}
      <div className="flex gap-2">
        <input
          type="text" placeholder="Buscar título ou SKU..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
        />
        {apenasNegativo && (
          <button
            onClick={() => setApenasNegativo(false)}
            className="px-3 py-2 rounded-lg bg-red-100 text-red-600 text-xs font-bold hover:bg-red-200 transition-colors"
          >
            Limpar filtro
          </button>
        )}
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-100">
              <th className="px-3 py-3 text-left">#</th>
              <th className="px-3 py-3 text-left">Produto</th>
              <th className="px-3 py-3 text-left">SKU</th>
              <th className="px-3 py-3 text-right">Vendas</th>
              <th className="px-3 py-3 text-right">Cancel.</th>
              <th className="px-3 py-3 text-right">Ticket Médio</th>
              <th className="px-3 py-3 text-right">Faturamento</th>
              <th className="px-3 py-3 text-right">Lucro</th>
              <th className="px-3 py-3 text-right">Margem</th>
              <th className="px-3 py-3 text-right">% Acum.</th>
              <th className="px-3 py-3 text-center">Cl.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-10 text-center text-slate-400 text-sm">
                  {itens.length === 0 ? 'Sincronize pedidos para calcular a Curva ABC.' : 'Nenhum resultado.'}
                </td>
              </tr>
            ) : filtrados.map((item, idx) => (
              <tr
                key={item.chave}
                className={`hover:bg-slate-50 transition-colors ${item.lucro < 0 ? 'bg-red-50/40' : ''}`}
              >
                <td className="px-3 py-2 text-slate-400 text-xs">{idx + 1}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {item.foto_url ? (
                      <Image src={item.foto_url} alt="" width={28} height={28} className="rounded object-cover shrink-0" />
                    ) : (
                      <div className="w-7 h-7 bg-slate-100 rounded shrink-0 flex items-center justify-center text-[10px] font-bold text-slate-400">
                        {item.titulo.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <span className="text-slate-700 line-clamp-1 max-w-xs block">{item.titulo}</span>
                      {item.lucro < 0 && (
                        <span className="text-[10px] text-red-500 font-bold flex items-center gap-0.5">
                          <AlertTriangle className="w-2.5 h-2.5" /> Lucro negativo
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-slate-400 text-xs">{item.sku ?? '—'}</td>
                <td className="px-3 py-2 text-right text-slate-700">{item.vendas}</td>
                <td className="px-3 py-2 text-right">
                  {item.canceladas > 0 ? (
                    <span className="text-red-500 font-medium">{item.canceladas}</span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-slate-500 text-xs font-mono">{BRL(item.ticket_medio)}</td>
                <td className="px-3 py-2 text-right font-mono font-bold text-slate-800">{BRL(item.faturamento)}</td>
                <td className={`px-3 py-2 text-right font-mono font-medium ${item.lucro >= 0 ? 'text-emerald-600' : 'text-red-500 font-bold'}`}>
                  {BRL(item.lucro)}
                </td>
                <td className={`px-3 py-2 text-right text-xs font-bold ${item.margem >= 15 ? 'text-emerald-600' : item.margem >= 0 ? 'text-amber-600' : 'text-red-500'}`}>
                  {item.margem.toFixed(1)}%
                </td>
                <td className="px-3 py-2 text-right text-slate-400 text-xs">
                  {(modo === 'faturamento' ? item.acum_fat : item.acum_lucro).toFixed(1)}%
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${CLASSE_CLS[item[classeKey]]}`}>
                    {item[classeKey]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          {itens.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 text-slate-500 text-xs font-semibold border-t border-slate-100">
                <td colSpan={6} className="px-3 py-2 text-right">Totais</td>
                <td className="px-3 py-2 text-right font-mono font-bold text-slate-800">{BRL(totalFat)}</td>
                <td className={`px-3 py-2 text-right font-mono font-medium ${totalLucro >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {BRL(totalLucro)}
                </td>
                <td className={`px-3 py-2 text-right text-xs font-bold ${margemGeral >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {margemGeral.toFixed(1)}%
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
