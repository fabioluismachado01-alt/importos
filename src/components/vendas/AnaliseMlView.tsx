'use client'

import React, { useState, useRef } from 'react'
import {
  Upload, FileSpreadsheet, CheckCircle2, Loader2, AlertTriangle,
  TrendingDown, TrendingUp, ArrowRight, X, ShoppingCart,
  Package, DollarSign, Truck, Tag, BarChart2, Info,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn, formatCurrency } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'

interface PrecoBreakdown {
  preco_unit: number; unidades: number; receita: number
  tarifas: number; frete: number; custo_total: number
  lucro_bruto: number; lucro_unit: number; margem_perc: number
}
interface SkuAnalise {
  sku: string; titulo: string; unidades: number; pedidos: number
  receita: number; tarifas: number; frete: number
  custo_unit: number; custo_total: number
  lucro_bruto: number; margem_perc: number
  ticket_medio: number; lucro_unit: number
  sem_custo: boolean
  multiplos_precos?: boolean
  tem_preco_prejuizo?: boolean
  precos_breakdown?: PrecoBreakdown[]
}
interface Analise {
  arquivo: string; marketplace: string
  periodo: { inicio: string; fim: string; ano: number; mes: number }
  pedidos: number; cancelados: number; devolucoes: number; unidades: number
  receita_bruta: number; tarifas_ml: number; frete_custo: number
  custo_produtos: number; lucro_bruto: number; margem_perc: number; ticket_medio: number
  skus: SkuAnalise[]
  alertas: { sem_custo: string[]; margem_negativa: {sku:string;margem:string}[]; margem_critica: {sku:string;margem:string}[] }
  difal?: {
    estimado: number; receita_interestadual: number; pedidos_interestaduais: number
    perc_interestadual: number; uf_origem: string
    top_estados: { uf: string; nome: string; pedidos: number; receita: number; difal: number; fcp: number }[]
  }
}

type Estado = 'idle' | 'lendo' | 'preview' | 'importando' | 'resultado' | 'erro'

// Produtos marcados como liquidação (sem alerta de margem)
const LIQUIDACAO_SKUS = new Set(['INV068'])

const CORES_MARGEM = (m: number) =>
  m < 0 ? '#EF4444' : m < 10 ? '#F59E0B' : m < 20 ? '#3B82F6' : '#10B981'

export function AnaliseMlView() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [estado, setEstado] = useState<Estado>('idle')
  const [analise, setAnalise] = useState<Analise | null>(null)
  const [erro, setErro] = useState('')
  const [aliquota, setAliquota] = useState('8.0') // alíquota do mês para DAS
  const [arquivo, setArquivo] = useState<File | null>(null)

  async function handleFile(file: File) {
    setArquivo(file)
    setEstado('lendo')
    const form = new FormData()
    form.append('file', file)
    form.append('preview', 'true')
    try {
      const res = await fetch('/api/analisar-ml', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAnalise(data)
      setEstado('preview')
    } catch (e) { setErro(String(e)); setEstado('erro') }
  }

  async function handleSalvar() {
    if (!arquivo) return
    setEstado('importando')
    const form = new FormData()
    form.append('file', arquivo)
    form.append('preview', 'false')
    try {
      const res = await fetch('/api/analisar-ml', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAnalise(data)
      setEstado('resultado')
    } catch (e) { setErro(String(e)); setEstado('erro') }
  }

  // Calcula lucro líquido com DAS
  const aliq = parseFloat(aliquota) / 100 || 0.08
  const dasTotal = analise ? analise.receita_bruta * aliq : 0
  const lucroLiquido = analise ? analise.lucro_bruto - dasTotal : 0

  const skusComAlerta = analise?.skus.filter(s =>
    !LIQUIDACAO_SKUS.has(s.sku) && s.margem_perc < 0 && !s.sem_custo
  ) ?? []

  if (estado === 'idle' || estado === 'erro') {
    return (
      <div className="space-y-5 max-w-2xl">
        <div
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
          onDragOver={e => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/20 transition-all group"
        >
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 bg-yellow-50 rounded-2xl flex items-center justify-center group-hover:bg-yellow-100 transition-colors">
              <FileSpreadsheet className="w-7 h-7 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-700">Arraste o relatório ML ou clique para selecionar</p>
              <p className="text-xs text-slate-400 mt-1">
                Painel Vendedor → Relatórios → Relatório de Vendas → .xlsx
              </p>
            </div>
            <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">
              Ciclo ML: dia 30 ao dia 29 do mês seguinte
            </Badge>
          </div>
          {erro && <p className="mt-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{erro}</p>}
        </div>

        {/* Instrução de alíquota */}
        <Card className="border-0 shadow-sm bg-slate-50">
          <CardContent className="p-4 flex items-start gap-3">
            <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-slate-600">Configure a alíquota do mês antes de importar</p>
              <p className="text-xs text-slate-400 mt-0.5">
                O sistema deduz o DAS da receita para mostrar o lucro líquido real.
                A alíquota muda todo mês — consulte sua guia PGDAS-D.
              </p>
              <div className="flex items-center gap-2 mt-2">
                <Input type="number" step="0.01" value={aliquota}
                  onChange={e => setAliquota(e.target.value)}
                  className="w-24 h-8 text-sm font-mono text-center" />
                <span className="text-xs text-slate-500">% alíquota Simples</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (estado === 'lendo' || estado === 'importando') {
    return (
      <Card className="border-0 shadow-sm max-w-2xl">
        <CardContent className="p-12 flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-yellow-500 animate-spin" />
          <p className="text-sm font-semibold text-slate-700">
            {estado === 'lendo' ? 'Lendo relatório e cruzando com o catálogo...' : 'Salvando análise...'}
          </p>
        </CardContent>
      </Card>
    )
  }

  if (!analise) return null

  return (
    <div className="space-y-5">

      {/* ── HEADER com alerta de margem negativa ── */}
      {skusComAlerta.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-black text-red-800">
              {skusComAlerta.length === 1 ? '1 produto' : `${skusComAlerta.length} produtos`} com margem negativa
            </p>
            <p className="text-xs text-red-700 mt-0.5">
              {skusComAlerta.map(s => `${s.sku} (${s.margem_perc.toFixed(1)}%)`).join(', ')} — revise precificação ou custo
            </p>
          </div>
        </div>
      )}

      {/* ── PERÍODO e configuração de alíquota ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-slate-500">
            Relatório: <strong>{analise.arquivo}</strong> · Ciclo ML do mês de competência
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {analise.pedidos} pedidos válidos · {analise.cancelados} cancelados · {analise.devolucoes} devoluções
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Alíquota DAS:</span>
          <Input type="number" step="0.01" value={aliquota}
            onChange={e => setAliquota(e.target.value)}
            className="w-20 h-8 text-sm font-mono text-center" />
          <span className="text-xs text-slate-400">%</span>
        </div>
      </div>

      {/* ── KPI STRIP ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: DollarSign, label: 'Receita Bruta', value: formatCurrency(analise.receita_bruta), color: 'emerald', sub: `${analise.unidades} unidades vendidas` },
          { icon: Tag, label: 'Tarifas ML', value: `-${formatCurrency(analise.tarifas_ml)}`, color: 'amber', sub: `${analise.receita_bruta>0?((analise.tarifas_ml/analise.receita_bruta)*100).toFixed(1):0}% da receita` },
          { icon: Truck, label: 'Frete (custo)', value: `-${formatCurrency(analise.frete_custo)}`, color: 'amber', sub: `${analise.receita_bruta>0?((analise.frete_custo/analise.receita_bruta)*100).toFixed(1):0}% da receita` },
          { icon: Package, label: 'Custo Produtos', value: `-${formatCurrency(analise.custo_produtos)}`, color: 'slate', sub: `${analise.skus.filter(s=>s.sem_custo).length>0?`⚠ ${analise.skus.filter(s=>s.sem_custo).length} SKU sem custo`:'Todos com custo'}` },
        ].map(kpi => (
          <Card key={kpi.label} className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <kpi.icon className={cn('w-3.5 h-3.5', {
                  'text-emerald-500': kpi.color === 'emerald',
                  'text-amber-500': kpi.color === 'amber',
                  'text-slate-400': kpi.color === 'slate',
                })} />
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{kpi.label}</p>
              </div>
              <p className={cn('text-lg font-black font-mono', {
                'text-emerald-600': kpi.color === 'emerald',
                'text-amber-600': kpi.color === 'amber',
                'text-slate-700': kpi.color === 'slate',
              })}>{kpi.value}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{kpi.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── RESULTADO FINAL ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="border-0 shadow-sm bg-slate-900 text-white">
          <CardContent className="p-5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lucro Bruto</p>
            <p className={cn('text-2xl font-black font-mono mt-1', analise.lucro_bruto >= 0 ? 'text-emerald-400' : 'text-red-400')}>
              {formatCurrency(analise.lucro_bruto)}
            </p>
            <p className="text-[10px] text-slate-500 mt-1">Receita − Tarifas − Frete − Custo</p>
            <p className="text-[10px] font-bold text-slate-400 mt-2">{analise.margem_perc.toFixed(1)}% de margem bruta</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm border-amber-300 bg-amber-50">
          <CardContent className="p-5">
            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">DAS ({aliquota}%)</p>
            <p className="text-2xl font-black font-mono text-amber-700 mt-1">-{formatCurrency(dasTotal)}</p>
            <p className="text-[10px] text-amber-600 mt-1">{aliquota}% sobre R${analise.receita_bruta.toFixed(2)}</p>
            <p className="text-[10px] text-amber-500 mt-2">Configure a alíquota real do mês →</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm border-l-4 border-l-emerald-500">
          <CardContent className="p-5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lucro Líquido</p>
            <p className={cn('text-2xl font-black font-mono mt-1', lucroLiquido >= 0 ? 'text-emerald-600' : 'text-red-500')}>
              {formatCurrency(lucroLiquido)}
            </p>
            <p className="text-[10px] text-slate-500 mt-1">Após DAS · Ticket Médio: {formatCurrency(analise.ticket_medio)}</p>
            <p className="text-[10px] font-bold mt-2 text-slate-600">
              {analise.receita_bruta > 0 ? ((lucroLiquido / analise.receita_bruta) * 100).toFixed(1) : 0}% margem líquida
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── DIFAL INTERESTADUAL ── */}
      {analise.difal && analise.difal.pedidos_interestaduais > 0 && (
        <Card className="border-0 shadow-sm bg-slate-900 text-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-black text-slate-300 uppercase tracking-wide flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-red-400" />
              DIFAL — Vendas Interestaduais
              <span className="text-[10px] bg-red-500/20 text-red-300 px-2 py-0.5 rounded-full normal-case font-medium ml-1">
                Você está no Simples? Este campo é zero ✓
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white/5 rounded-xl p-3">
                <p className="text-[10px] text-slate-400">Vendas interestaduais</p>
                <p className="text-base font-black font-mono text-white">{formatCurrency(analise.difal.receita_interestadual)}</p>
                <p className="text-[10px] text-slate-500">{analise.difal.perc_interestadual.toFixed(1)}% da receita</p>
              </div>
              <div className="bg-white/5 rounded-xl p-3">
                <p className="text-[10px] text-slate-400">Pedidos interestaduais</p>
                <p className="text-base font-black font-mono text-white">{analise.difal.pedidos_interestaduais}</p>
                <p className="text-[10px] text-slate-500">de {analise.pedidos} pedidos totais</p>
              </div>
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                <p className="text-[10px] text-red-300">DIFAL estimado</p>
                <p className="text-base font-black font-mono text-red-200">{formatCurrency(analise.difal.estimado)}</p>
                <p className="text-[10px] text-red-400">se não estiver no Simples</p>
              </div>
              <div className="bg-white/5 rounded-xl p-3">
                <p className="text-[10px] text-slate-400">UF origem</p>
                <p className="text-base font-black text-white">{analise.difal.uf_origem}</p>
                <p className="text-[10px] text-slate-500">estado da empresa</p>
              </div>
            </div>

            {analise.difal.top_estados.length > 0 && (
              <div>
                <p className="text-[10px] text-slate-400 font-semibold mb-2 uppercase tracking-wider">Top destinos (maior exposição DIFAL)</p>
                <div className="space-y-1.5">
                  {analise.difal.top_estados.map(e => (
                    <div key={e.uf} className="flex items-center gap-3 text-xs">
                      <span className="font-bold text-slate-300 w-6 shrink-0">{e.uf}</span>
                      <span className="text-slate-400 flex-1 truncate">{e.nome}</span>
                      <span className="text-slate-300 font-mono">{e.pedidos} ped.</span>
                      <span className="text-slate-300 font-mono w-24 text-right">{formatCurrency(e.receita)}</span>
                      <span className="text-red-300 font-mono font-bold w-20 text-right">{formatCurrency(e.difal + e.fcp)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[10px] text-slate-500 border-t border-white/10 pt-3">
              * DIFAL calculado por alíquota interna do estado de destino menos a interestadual. Simples Nacional é isento — se você é optante, ignore este campo. Lucro Presumido e Real devem recolher o DIFAL sobre cada venda interestadual.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── GRÁFICO DE MARGEM POR SKU ── */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-black text-slate-500 uppercase tracking-wide flex items-center gap-2">
            <BarChart2 className="w-4 h-4" />
            Margem Bruta % por Produto
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={analise.skus.map(s => ({ sku: s.sku, margem: parseFloat(s.margem_perc.toFixed(1)) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="sku" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
              <Tooltip formatter={v => `${v}%`} contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
              <ReferenceLine y={0} stroke="#EF4444" strokeDasharray="4 2" />
              <ReferenceLine y={aliq * 100} stroke="#F59E0B" strokeDasharray="4 2" label={{ value: `DAS ${aliquota}%`, fontSize: 9, fill: '#F59E0B' }} />
              <Bar dataKey="margem" radius={[4, 4, 0, 0]}>
                {analise.skus.map((s, i) => (
                  <Cell key={i} fill={CORES_MARGEM(s.margem_perc)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-slate-400 text-center mt-1">
            Linha amarela = alíquota DAS ({aliquota}%) — itens abaixo desta linha: custo ML + DAS engole o lucro
          </p>
        </CardContent>
      </Card>

      {/* ── TABELA DE SKUs ── */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <CardHeader className="pb-0">
          <CardTitle className="text-xs font-black text-slate-500 uppercase tracking-wide">
            Análise por Produto (ordenado por Lucro Bruto)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 mt-3">
          <div className="overflow-x-auto">
            <table className="w-full text-left" style={{ minWidth: '900px' }}>
              <thead>
                <tr className="bg-slate-900 text-white">
                  {['SKU / Produto','Un.','Receita Bruta','Tarifas ML','Frete','Custo Prod.','Lucro Bruto','Imposto (DAS)','Lucro Líquido','Margem Líq.','Lucro/Un. Líq.','Ticket Méd.'].map(h => (
                    <th key={h} className={`px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-right first:text-left ${h.includes('DAS') ? 'bg-amber-900/30' : h.includes('Líquido') || h.includes('Líq') ? 'bg-emerald-900/30' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {analise.skus.map((s, i) => {
                  const dasUnid = s.ticket_medio * aliq
                  const lucroLiqUnid = s.lucro_unit - dasUnid
                  const isLiquidacao = LIQUIDACAO_SKUS.has(s.sku)
                  const isAlerta = !isLiquidacao && !s.sem_custo && s.margem_perc < 0
                  const temVariacaoPreco = s.multiplos_precos && (s.precos_breakdown?.length ?? 0) > 1

                  return (
                    <React.Fragment key={s.sku}>
                    <tr className={cn('hover:bg-slate-50 transition-colors', isAlerta && 'bg-red-50/40', i % 2 === 1 && !isAlerta && 'bg-slate-50/30')}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-black font-mono text-slate-800">{s.sku}</span>
                              {s.sem_custo && <Badge className="text-[8px] bg-amber-100 text-amber-700 h-4 px-1">Sem custo</Badge>}
                              {isLiquidacao && <Badge className="text-[8px] bg-slate-100 text-slate-600 h-4 px-1">Liquidação</Badge>}
                              {isAlerta && !temVariacaoPreco && <Badge className="text-[8px] bg-red-100 text-red-700 h-4 px-1">⚠ Revisar preço</Badge>}
                              {temVariacaoPreco && <Badge className="text-[8px] bg-purple-100 text-purple-700 h-4 px-1">↕ Múltiplos preços</Badge>}
                              {s.tem_preco_prejuizo && !isLiquidacao && <Badge className="text-[8px] bg-orange-100 text-orange-700 h-4 px-1">⚠ Tem faixa c/ prejuízo</Badge>}
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5 max-w-xs truncate">{s.titulo}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs font-mono font-bold text-slate-700">{s.unidades}</span>
                        <p className="text-[9px] text-slate-400">{s.pedidos} ped.</p>
                      </td>
                      <td className="px-4 py-3 text-right"><span className="text-xs font-mono text-slate-800">{formatCurrency(s.receita)}</span></td>
                      <td className="px-4 py-3 text-right"><span className="text-xs font-mono text-amber-700">-{formatCurrency(s.tarifas)}</span></td>
                      <td className="px-4 py-3 text-right"><span className="text-xs font-mono text-amber-700">-{formatCurrency(s.frete)}</span></td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs font-mono text-slate-600">-{formatCurrency(s.custo_total)}</span>
                        <p className="text-[9px] text-slate-400">{formatCurrency(s.custo_unit)}/un.</p>
                      </td>
                      {/* Lucro Bruto */}
                      <td className="px-4 py-3 text-right">
                        <span className={cn('text-sm font-black font-mono', s.lucro_bruto >= 0 ? 'text-blue-600' : 'text-red-500')}>
                          {formatCurrency(s.lucro_bruto)}
                        </span>
                        <p className="text-[9px] text-slate-400">{s.margem_perc.toFixed(1)}% marg.</p>
                      </td>
                      {/* Imposto DAS por SKU */}
                      <td className="px-4 py-3 text-right bg-amber-50/30">
                        <span className="text-xs font-black font-mono text-amber-700">
                          -{formatCurrency(s.receita * aliq)}
                        </span>
                        <p className="text-[9px] text-amber-500">{(aliq * 100).toFixed(1)}% s/ receita</p>
                      </td>
                      {/* Lucro Líquido (após DAS) */}
                      <td className="px-4 py-3 text-right bg-emerald-50/20">
                        {(() => {
                          const ll = s.lucro_bruto - s.receita * aliq
                          const mlLiq = s.receita > 0 ? (ll / s.receita) * 100 : 0
                          return (
                            <>
                              <span className={cn('text-sm font-black font-mono', ll >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                                {formatCurrency(ll)}
                              </span>
                              <p className="text-[9px] text-slate-400">{mlLiq.toFixed(1)}% marg.</p>
                            </>
                          )
                        })()}
                      </td>
                      {/* Margem Líquida % */}
                      <td className="px-4 py-3 text-right bg-emerald-50/20">
                        {(() => {
                          const mlPerc = s.receita > 0 ? ((s.lucro_bruto - s.receita * aliq) / s.receita) * 100 : 0
                          return (
                            <span className="text-xs font-black font-mono" style={{ color: CORES_MARGEM(mlPerc) }}>
                              {mlPerc.toFixed(1)}%
                            </span>
                          )
                        })()}
                      </td>
                      {/* Lucro/Un. Líquido */}
                      <td className="px-4 py-3 text-right">
                        <span className={cn('text-xs font-mono font-bold', lucroLiqUnid >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                          {formatCurrency(lucroLiqUnid)}
                        </span>
                        <p className="text-[9px] text-slate-400">por unidade</p>
                      </td>
                      {/* Ticket Médio */}
                      <td className="px-4 py-3 text-right"><span className="text-xs font-mono text-slate-700">{formatCurrency(s.ticket_medio)}</span></td>
                    </tr>
                    {/* Linha de breakdown por preço de venda — aparece quando SKU tem múltiplos preços */}
                    {temVariacaoPreco && s.precos_breakdown && (
                      <tr key={`${s.sku}-breakdown`} className="bg-purple-50/40 border-b border-purple-100">
                        <td colSpan={12} className="px-6 py-2">
                          <p className="text-[9px] font-black text-purple-700 uppercase tracking-wide mb-1.5">
                            ↕ {s.sku} vendido em {s.precos_breakdown.length} faixas de preço diferentes neste ciclo:
                          </p>
                          <div className="flex gap-4 flex-wrap">
                            {s.precos_breakdown.map(p => (
                              <div key={p.preco_unit} className={cn(
                                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-mono border',
                                p.lucro_unit >= 0
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                  : 'bg-red-50 border-red-200 text-red-800'
                              )}>
                                <span className="font-black">{formatCurrency(p.preco_unit)}</span>
                                <span className="text-slate-500">×{p.unidades}un</span>
                                <span>→</span>
                                <span className={cn('font-black', p.lucro_unit >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                                  {p.lucro_unit >= 0 ? '+' : ''}{formatCurrency(p.lucro_unit)}/un
                                </span>
                                <span className="text-[9px]">({p.margem_perc.toFixed(1)}%)</span>
                                {p.lucro_unit < 0 && <span>❌ prejuízo</span>}
                                {p.lucro_unit >= 0 && <span>✅</span>}
                              </div>
                            ))}
                          </div>
                          {s.tem_preco_prejuizo && (
                            <p className="text-[9px] text-orange-700 mt-1.5 font-bold">
                              ⚠ Padronize o preço para {formatCurrency(s.precos_breakdown[0].preco_unit)} (mais alto) — os preços menores geram prejuízo.
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  )
                })}
              </tbody>
              {/* Totais */}
              <tfoot>
                <tr className="bg-slate-900 text-white">
                  <td className="px-4 py-3 text-xs font-black">TOTAL</td>
                  <td className="px-4 py-3 text-right text-xs font-mono">{analise.unidades}</td>
                  <td className="px-4 py-3 text-right text-xs font-mono text-emerald-400">{formatCurrency(analise.receita_bruta)}</td>
                  <td className="px-4 py-3 text-right text-xs font-mono text-amber-400">-{formatCurrency(analise.tarifas_ml)}</td>
                  <td className="px-4 py-3 text-right text-xs font-mono text-amber-400">-{formatCurrency(analise.frete_custo)}</td>
                  <td className="px-4 py-3 text-right text-xs font-mono text-slate-400">-{formatCurrency(analise.custo_produtos)}</td>
                  {/* Lucro Bruto total */}
                  <td className="px-4 py-3 text-right text-sm font-black font-mono text-blue-400">
                    {formatCurrency(analise.lucro_bruto)}
                    <p className="text-[9px] text-slate-400">{analise.margem_perc.toFixed(1)}%</p>
                  </td>
                  {/* DAS total */}
                  <td className="px-4 py-3 text-right bg-amber-900/30 text-amber-400 font-black font-mono text-sm">
                    -{formatCurrency(dasTotal)}
                    <p className="text-[9px] text-amber-500">{aliquota}% receita</p>
                  </td>
                  {/* Lucro Líquido total */}
                  <td className="px-4 py-3 text-right bg-emerald-900/20">
                    <span className={cn('text-lg font-black font-mono', lucroLiquido >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {formatCurrency(lucroLiquido)}
                    </span>
                  </td>
                  {/* Margem líquida total */}
                  <td className="px-4 py-3 text-right bg-emerald-900/20 text-xs font-black text-emerald-400">
                    {analise.receita_bruta>0?((lucroLiquido/analise.receita_bruta)*100).toFixed(1):0}%
                  </td>
                  {/* Lucro/un. líquido total */}
                  <td className="px-4 py-3 text-right text-xs font-mono text-emerald-400">
                    {formatCurrency(lucroLiquido / analise.unidades)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-mono text-slate-400">{formatCurrency(analise.ticket_medio)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Ações */}
      {estado === 'preview' && (
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => { setEstado('idle'); setAnalise(null); setArquivo(null) }}>
            <X className="w-4 h-4 mr-1.5" /> Cancelar
          </Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2" onClick={handleSalvar}>
            Salvar Análise <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      )}
      {estado === 'resultado' && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <p className="text-sm font-bold text-emerald-800">Análise salva com sucesso!</p>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => { setEstado('idle'); setAnalise(null); setArquivo(null) }}>
            Novo relatório
          </Button>
        </div>
      )}
    </div>
  )
}
