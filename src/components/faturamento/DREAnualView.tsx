'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Line, ComposedChart, Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn, formatCurrency, getMesNome } from '@/lib/utils'
import { ExternalLink } from 'lucide-react'

interface MesDRE {
  mes: number
  receita_total: number
  desp_armazenagem: number
  desp_ads_ml: number
  desp_ads_outros: number
  desp_custo_produtos: number
  desp_tarifas: number
  desp_frete: number
  desp_fatura_ml: number
  desp_outras_taxas: number
  das_valor_calc: number
  desp_pro_labore: number
  desp_inss: number
  desp_contabilidade: number
  desp_erp: number
  desp_emprestimo: number
  desp_aluguel: number
  desp_pagina_ml: number
  desp_previdencia_privada: number
  desp_fixas_outras: number
  lucro_bruto: number
  lucro_liquido: number
  margem_contribuicao: number
  roas_atual: number
  dlr_socio: number
  reinvestimento: number
  das_status: string
}

interface Historico { ano: number; mes: number; faturamento: number; lucro_bruto?: number | null }
interface Config { meta_faturamento_anual: number }

interface Props {
  ano: number
  meses: MesDRE[]
  config: Config
  historico: Historico[]
}

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

// Linhas do DRE — igual à aba "Demonstrativo" da planilha
const DRE_ROWS: { key: keyof MesDRE | 'total_variaveis' | 'total_fixas'; label: string; tipo: 'receita' | 'despesa' | 'total' | 'separador' }[] = [
  { key: 'receita_total',       label: 'FATURAMENTO',           tipo: 'receita' },
  { key: 'desp_armazenagem',    label: '− Armazenagem',         tipo: 'despesa' },
  { key: 'desp_ads_ml',         label: '− Ads Mercado Livre',   tipo: 'despesa' },
  { key: 'desp_ads_outros',     label: '− Ads Outras Plat.',    tipo: 'despesa' },
  { key: 'desp_custo_produtos', label: '− Custo c/ Produtos',   tipo: 'despesa' },
  { key: 'desp_tarifas',        label: '− Tarifas Mkt',         tipo: 'despesa' },
  { key: 'desp_frete',          label: '− Frete',               tipo: 'despesa' },
  { key: 'desp_fatura_ml',      label: '− Fatura ML',           tipo: 'despesa' },
  { key: 'das_valor_calc',      label: '− DAS',                 tipo: 'despesa' },
  { key: 'desp_outras_taxas',   label: '− Outras Taxas',        tipo: 'despesa' },
  { key: 'desp_pro_labore',     label: '− Pró Labore',          tipo: 'despesa' },
  { key: 'desp_inss',           label: '− INSS',                tipo: 'despesa' },
  { key: 'desp_contabilidade',  label: '− Contabilidade',       tipo: 'despesa' },
  { key: 'desp_erp',            label: '− ERP Mensal',          tipo: 'despesa' },
  { key: 'desp_emprestimo',     label: '− Empréstimo',          tipo: 'despesa' },
  { key: 'desp_aluguel',        label: '− Aluguel',             tipo: 'despesa' },
  { key: 'desp_pagina_ml',      label: '− Página ML',           tipo: 'despesa' },
  { key: 'lucro_bruto',         label: 'LUCRO BRUTO',           tipo: 'total' },
  { key: 'desp_previdencia_privada', label: '− Previdência Privada', tipo: 'despesa' },
  { key: 'lucro_liquido',       label: 'LUCRO LÍQUIDO',         tipo: 'total' },
  { key: 'dlr_socio',           label: 'DLR do Sócio (50%)',    tipo: 'total' },
  { key: 'reinvestimento',      label: 'Reinvestimento (50%)',   tipo: 'total' },
  { key: 'margem_contribuicao', label: 'Margem %',              tipo: 'total' },
  { key: 'roas_atual',          label: 'ROAS',                  tipo: 'total' },
]

export function DREAnualView({ ano, meses, config, historico }: Props) {
  const [aba, setAba] = useState<'dre' | 'grafico' | 'historico'>('dre')

  // Preenche meses faltantes com zeros
  const mesesCompletos = Array.from({ length: 12 }, (_, i) => {
    const m = meses.find(x => x.mes === i + 1)
    if (m) return m
    const zero: MesDRE = {
      mes: i + 1, receita_total: 0, desp_armazenagem: 0, desp_ads_ml: 0,
      desp_ads_outros: 0, desp_custo_produtos: 0, desp_tarifas: 0, desp_frete: 0,
      desp_fatura_ml: 0, desp_outras_taxas: 0, das_valor_calc: 0, desp_pro_labore: 0,
      desp_inss: 0, desp_contabilidade: 0, desp_erp: 0, desp_emprestimo: 0,
      desp_aluguel: 0, desp_pagina_ml: 0, desp_previdencia_privada: 0,
      desp_fixas_outras: 0, lucro_bruto: 0, lucro_liquido: 0,
      margem_contribuicao: 0, roas_atual: 0, dlr_socio: 0, reinvestimento: 0, das_status: 'PENDENTE',
    }
    return zero
  })

  // Totais anuais
  const totais = mesesCompletos.reduce((acc, m) => {
    DRE_ROWS.forEach(row => {
      const k = row.key as keyof MesDRE
      const val = m[k]
      if (typeof val === 'number') {
        const prev = acc[k]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(acc as any)[k] = ((typeof prev === 'number' ? prev : 0)) + val
      }
    })
    return acc
  }, {} as Partial<MesDRE>)

  // Dados para o gráfico
  const dadosGrafico = mesesCompletos.map(m => ({
    mes: MESES_ABREV[m.mes - 1],
    Faturamento: m.receita_total,
    'Lucro Bruto': m.lucro_bruto,
    'Lucro Líquido': m.lucro_liquido,
  })).filter(d => d.Faturamento > 0)

  // Histórico multi-ano
  const anosHistorico = [...new Set(historico.map(h => h.ano))].sort()
  const mesesHistorico = Array.from({ length: 12 }, (_, i) => {
    const row: Record<string, string | number> = { mes: MESES_ABREV[i] }
    anosHistorico.forEach(a => {
      const h = historico.find(x => x.ano === a && x.mes === i + 1)
      row[String(a)] = h?.faturamento ?? 0
    })
    return row
  })

  const totalReceita = (totais.receita_total as number) || 0
  const totalLucroBruto = (totais.lucro_bruto as number) || 0
  const totalLucroLiq = (totais.lucro_liquido as number) || 0
  const totalDAS = (totais.das_valor_calc as number) || 0
  const metaPorc = config.meta_faturamento_anual > 0
    ? (totalReceita / config.meta_faturamento_anual) * 100 : 0

  function getCellValue(mes: MesDRE, key: string): number {
    return (mes[key as keyof MesDRE] as number) || 0
  }

  function formatCell(key: string, value: number): string {
    if (key === 'margem_contribuicao') return value !== 0 ? `${value.toFixed(1)}%` : '—'
    if (key === 'roas_atual') return value !== 0 ? `${value.toFixed(2)}x` : '—'
    if (value === 0) return '—'
    return formatCurrency(value)
  }

  function getCellColor(row: typeof DRE_ROWS[0], value: number): string {
    if (value === 0) return 'text-slate-300'
    if (row.tipo === 'receita') return 'text-emerald-600 font-black'
    if (row.tipo === 'despesa') return 'text-red-500'
    if (row.key === 'lucro_bruto' || row.key === 'lucro_liquido') {
      return value >= 0 ? 'text-blue-600 font-black' : 'text-red-600 font-black'
    }
    if (row.key === 'dlr_socio' || row.key === 'reinvestimento') return 'text-emerald-600 font-bold'
    if (row.key === 'margem_contribuicao') return value > 20 ? 'text-emerald-600' : value > 10 ? 'text-amber-600' : 'text-red-500'
    return 'text-slate-700'
  }

  return (
    <div className="space-y-5">
      {/* KPIs do ano */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: `Receita ${ano}`, value: formatCurrency(totalReceita), color: 'emerald', sub: metaPorc > 0 ? `${metaPorc.toFixed(1)}% da meta` : undefined },
          { label: 'Lucro Bruto', value: formatCurrency(totalLucroBruto), color: 'blue', sub: totalReceita > 0 ? `${((totalLucroBruto/totalReceita)*100).toFixed(1)}% da receita` : '—' },
          { label: 'Lucro Líquido', value: formatCurrency(totalLucroLiq), color: totalLucroLiq >= 0 ? 'emerald' : 'red', sub: 'Após previdência' },
          { label: 'DAS Total', value: formatCurrency(totalDAS), color: 'amber', sub: totalReceita > 0 ? `${((totalDAS/totalReceita)*100).toFixed(1)}% da receita` : '—' },
        ].map(kpi => (
          <Card key={kpi.label} className="border-0 shadow-sm">
            <CardContent className="p-5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{kpi.label}</p>
              <p className={cn('text-xl font-black font-mono mt-1', {
                'text-emerald-600': kpi.color === 'emerald',
                'text-blue-600': kpi.color === 'blue',
                'text-amber-600': kpi.color === 'amber',
                'text-red-500': kpi.color === 'red',
              })}>{kpi.value}</p>
              {kpi.sub && <p className="text-[10px] text-slate-400 mt-0.5">{kpi.sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Abas */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {[
          { key: 'dre', label: 'DRE Mensal' },
          { key: 'grafico', label: 'Gráficos' },
          { key: 'historico', label: 'Histórico Multi-Ano' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setAba(tab.key as typeof aba)}
            className={cn(
              'px-4 py-2 rounded-lg text-xs font-bold transition-all',
              aba === tab.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── ABA DRE ── */}
      {aba === 'dre' && (
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left" style={{ minWidth: '1100px' }}>
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider w-44 sticky left-0 bg-slate-900">
                    Categoria
                  </th>
                  {MESES_ABREV.map((m, i) => (
                    <th key={m} className="px-3 py-3 text-[10px] font-black uppercase tracking-wider text-right w-24">
                      <Link
                        href={`/faturamento/${ano}/${i + 1}`}
                        className="hover:text-emerald-400 flex items-center justify-end gap-1 transition-colors"
                      >
                        {m}
                        <ExternalLink className="w-2.5 h-2.5 opacity-50" />
                      </Link>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-right bg-slate-800 w-28">
                    TOTAL
                  </th>
                </tr>
              </thead>
              <tbody>
                {DRE_ROWS.map((row, rowIdx) => {
                  const isTotalRow = row.tipo === 'total'
                  const isLucroRow = row.key === 'lucro_bruto' || row.key === 'lucro_liquido'
                  const totalAnual = (totais[row.key as keyof MesDRE] as number) || 0

                  return (
                    <tr
                      key={row.key}
                      className={cn(
                        'border-b transition-colors',
                        isLucroRow ? 'bg-slate-50 border-slate-200' :
                        isTotalRow ? 'bg-slate-50/50 border-slate-100' :
                        rowIdx % 2 === 0 ? 'bg-white border-slate-50 hover:bg-slate-50/50' : 'bg-slate-50/30 border-slate-50 hover:bg-slate-50/50'
                      )}
                    >
                      <td className={cn(
                        'px-4 py-2.5 sticky left-0 text-xs',
                        isTotalRow ? 'font-black text-slate-900 bg-slate-50' : 'font-medium text-slate-600 bg-white',
                        isLucroRow && 'bg-slate-50 text-slate-900'
                      )}>
                        {row.label}
                      </td>
                      {mesesCompletos.map(mes => {
                        const value = getCellValue(mes, row.key)
                        return (
                          <td key={mes.mes} className="px-3 py-2.5 text-right">
                            <span className={cn('text-[11px] font-mono', getCellColor(row, value))}>
                              {formatCell(row.key, value)}
                            </span>
                          </td>
                        )
                      })}
                      <td className={cn(
                        'px-4 py-2.5 text-right bg-slate-50',
                        isLucroRow && 'bg-slate-100'
                      )}>
                        <span className={cn('text-[11px] font-mono font-bold', getCellColor(row, totalAnual))}>
                          {formatCell(row.key, totalAnual)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── ABA GRÁFICOS ── */}
      {aba === 'grafico' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-black text-slate-500 uppercase tracking-wide">
                Faturamento vs Lucro — {ano}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dadosGrafico.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-12">Nenhum dado ainda</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={dadosGrafico}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="mes" tick={{ fontSize: 10, fontFamily: 'Inter' }} />
                    <YAxis tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(v) => formatCurrency(Number(v))}
                      contentStyle={{ borderRadius: '8px', fontSize: '11px', border: '1px solid #E2E8F0' }}
                    />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="Faturamento" fill="#10B981" radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="Lucro Bruto" stroke="#3B82F6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="Lucro Líquido" stroke="#8B5CF6" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-black text-slate-500 uppercase tracking-wide">
                Margem % por Mês
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dadosGrafico.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-12">Nenhum dado ainda</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={mesesCompletos.filter(m => m.receita_total > 0).map(m => {
                    const margem = m.margem_contribuicao !== 0
                      ? m.margem_contribuicao
                      : m.receita_total > 0 ? (m.lucro_bruto / m.receita_total) * 100 : 0
                    return { mes: MESES_ABREV[m.mes - 1], 'Margem %': parseFloat(margem.toFixed(1)), _margem: margem }
                  })}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                    <Tooltip formatter={(v) => `${v}%`} contentStyle={{ borderRadius: '8px', fontSize: '11px', border: '1px solid #E2E8F0' }} />
                    <Bar dataKey="Margem %" radius={[4, 4, 0, 0]}>
                      {mesesCompletos.filter(m => m.receita_total > 0).map((m, i) => {
                        const margem = m.margem_contribuicao !== 0 ? m.margem_contribuicao : m.receita_total > 0 ? (m.lucro_bruto / m.receita_total) * 100 : 0
                        return <Cell key={i} fill={margem > 25 ? '#10B981' : margem > 10 ? '#F59E0B' : '#EF4444'} />
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── ABA HISTÓRICO ── */}
      {aba === 'historico' && (
        <div className="space-y-5">
          <Card className="border-0 shadow-sm overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-black text-slate-500 uppercase tracking-wide">
                  Faturamento Histórico
                </CardTitle>
                <Link href="/faturamento/importar" className="text-xs text-emerald-600 font-bold hover:underline">
                  + Importar planilha histórica →
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {historico.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-sm text-slate-500">Nenhum histórico importado ainda.</p>
                  <Link href="/faturamento/importar" className="text-emerald-600 text-sm font-bold hover:underline mt-2 inline-block">
                    Importar planilha histórica →
                  </Link>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full" style={{ minWidth: '600px' }}>
                    <thead>
                      <tr className="bg-slate-900 text-white">
                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-left">Mês</th>
                        {anosHistorico.map(a => (
                          <th key={a} className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-right">{a}</th>
                        ))}
                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-right bg-slate-800">Crescimento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 12 }, (_, i) => {
                        const mesNum = i + 1
                        const valoresPorAno = anosHistorico.map(a =>
                          historico.find(h => h.ano === a && h.mes === mesNum)?.faturamento ?? 0
                        )
                        const penultimo = valoresPorAno[valoresPorAno.length - 2] || 0
                        const ultimo = valoresPorAno[valoresPorAno.length - 1] || 0
                        const crescimento = penultimo > 0 ? ((ultimo - penultimo) / penultimo) * 100 : null

                        return (
                          <tr key={mesNum} className={cn('border-b border-slate-50', i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30')}>
                            <td className="px-4 py-2.5 text-xs font-semibold text-slate-700">{getMesNome(mesNum)}</td>
                            {valoresPorAno.map((v, ai) => (
                              <td key={ai} className="px-4 py-2.5 text-right">
                                <span className={cn('text-[11px] font-mono', v > 0 ? 'text-slate-800 font-semibold' : 'text-slate-300')}>
                                  {v > 0 ? formatCurrency(v) : '—'}
                                </span>
                              </td>
                            ))}
                            <td className="px-4 py-2.5 text-right">
                              {crescimento !== null && ultimo > 0 ? (
                                <Badge className={cn('text-[9px] border font-bold', crescimento >= 0 ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-red-100 text-red-700 border-red-200')}>
                                  {crescimento >= 0 ? '+' : ''}{crescimento.toFixed(1)}%
                                </Badge>
                              ) : <span className="text-slate-300 text-[10px]">—</span>}
                            </td>
                          </tr>
                        )
                      })}
                      {/* Total */}
                      <tr className="bg-slate-900 text-white">
                        <td className="px-4 py-3 text-xs font-black">TOTAL</td>
                        {anosHistorico.map(a => {
                          const total = historico.filter(h => h.ano === a).reduce((s, h) => s + h.faturamento, 0)
                          return (
                            <td key={a} className="px-4 py-3 text-right text-xs font-black font-mono text-emerald-400">
                              {total > 0 ? formatCurrency(total) : '—'}
                            </td>
                          )
                        })}
                        <td className="px-4 py-3 bg-slate-800" />
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {historico.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-black text-slate-500 uppercase tracking-wide">
                  Evolução por Ano
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={mesesHistorico}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={{ borderRadius: '8px', fontSize: '11px', border: '1px solid #E2E8F0' }} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                    {anosHistorico.map((a, i) => (
                      <Bar key={a} dataKey={String(a)} fill={['#CBD5E1', '#94A3B8', '#10B981'][i] || '#10B981'} radius={[3, 3, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
