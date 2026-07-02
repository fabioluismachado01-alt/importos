'use client'

import React, { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2, Loader2, AlertTriangle, Download,
  Package, ShoppingBag, Upload, Trash2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn, formatCurrency } from '@/lib/utils'
import { salvarAnaliseAvulsas } from '@/actions/salvar-analise-avulsas'
import { excluirAnaliseAvulsas } from '@/actions/excluir-analise-avulsas'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SkuAvulso {
  sku: string; nome_catalogo: string; nome_produto: string; canal: string
  unidades: number; receita: number; taxas: number
  custo_unit: number; custo_total: number; sem_custo: boolean
  lucro_bruto: number; margem_perc: number; ticket_medio: number
}

interface CanalAvulso {
  canal: string; receita: number; taxas: number; pedidos: number
}

interface AvulsasData {
  arquivo: string; periodo: { ano: number; mes: number }
  receita_total: number; taxas_total: number; liquido_total: number
  cmv_total: number; pedidos: number; unidades_total: number
  canais: CanalAvulso[]; skus: SkuAvulso[]
  alertas: { sku_sem_custo: string[] }
}

type UploadEstado = 'idle' | 'carregando' | 'ok' | 'erro'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// ─── DRE Linha ─────────────────────────────────────────────────────────────────

function DRELinha({ label, valor, cor, indent = false, destaque = false }: {
  label: string; valor: number | null; cor?: string
  indent?: boolean; destaque?: boolean
}) {
  return (
    <div className={cn('flex items-center justify-between py-1.5', indent && 'pl-4',
      destaque && 'bg-slate-50 rounded-lg px-2 my-0.5')}>
      <span className={cn('text-xs', indent ? 'text-slate-400' : 'text-slate-600 font-medium',
        destaque && 'font-black text-slate-700')}>{label}</span>
      {valor !== null
        ? <span className={cn('text-xs font-black font-mono', cor ?? 'text-slate-800',
            destaque && 'text-sm')}>{formatCurrency(valor)}</span>
        : <span className="text-xs text-slate-300">—</span>}
    </div>
  )
}

interface MesSalvo {
  ano: number; mes: number; label: string; receita: number
}

// ─── View Principal ─────────────────────────────────────────────────────────────

export function VendasAvulsasView({ salvas = [] }: { salvas?: MesSalvo[] }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const hoje = new Date()

  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [ano, setAno] = useState(hoje.getFullYear())
  const [periodoOk, setPeriodoOk] = useState(false)

  const [estado, setEstado] = useState<UploadEstado>('idle')
  const [dados, setDados] = useState<AvulsasData | null>(null)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [excluindo, setExcluindo] = useState<string | null>(null)

  const [baixandoTemplate, setBaixandoTemplate] = useState(false)

  async function baixarTemplate() {
    setBaixandoTemplate(true)
    try {
      const res = await fetch('/api/template-vendas-avulsas')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'template_vendas_avulsas.xlsx'; a.click()
      URL.revokeObjectURL(url)
    } finally {
      setBaixandoTemplate(false)
    }
  }

  async function processarArquivo(file: File) {
    setEstado('carregando'); setDados(null); setErro('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('mes', String(mes))
      fd.append('ano', String(ano))
      const res = await fetch('/api/analisar-vendas-avulsas', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) { setErro(json.error ?? 'Erro ao processar arquivo'); setEstado('erro'); return }
      setDados(json); setEstado('ok')
    } catch (e) {
      setErro(String(e)); setEstado('erro')
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (f) processarArquivo(f)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files[0]; if (f) processarArquivo(f)
  }

  async function handleExcluir(ano: number, mes: number, label: string) {
    if (!confirm(`Excluir todas as vendas avulsas de ${label}?`)) return
    const key = `${ano}-${mes}`
    setExcluindo(key)
    try {
      const result = await excluirAnaliseAvulsas(ano, mes)
      if (result.ok) router.refresh()
      else alert(result.error)
    } finally {
      setExcluindo(null)
    }
  }

  async function handleSalvar() {
    if (!dados) return
    setSalvando(true)
    setErro('')
    try {
      const result = await salvarAnaliseAvulsas(dados)
      if (result.ok) {
        setEstado('idle')
        setDados(null)
        router.push('/vendas')
        router.refresh()
      } else {
        setErro(result.error ?? 'Erro ao salvar')
      }
    } finally {
      setSalvando(false)
    }
  }

  const lucro_bruto = dados ? dados.liquido_total - dados.cmv_total : 0

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Vendas Avulsas</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Registre vendas em canais sem integração — Casas Bahia, OLX, feiras, venda direta e outros
        </p>
      </div>

      {/* Mês de referência */}
      <div className={cn('rounded-2xl border-2 p-5 transition-all',
        periodoOk ? 'border-emerald-400 bg-emerald-50/20' : 'border-blue-400 bg-blue-50/20')}>
        <div className="flex items-center gap-2 mb-1">
          <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-black',
            periodoOk ? 'bg-emerald-500' : 'bg-blue-500')}>
            {periodoOk ? '✓' : '1'}
          </div>
          <p className="text-sm font-black text-slate-800">Mês de referência</p>
          <span className="text-xs text-slate-400">período das vendas avulsas</span>
          {periodoOk && (
            <button onClick={() => { setPeriodoOk(false); setEstado('idle'); setDados(null) }}
              className="ml-auto text-slate-400 hover:text-slate-600 text-xs underline">
              alterar
            </button>
          )}
        </div>
        {!periodoOk ? (
          <div className="flex items-center gap-3 mt-3 ml-8">
            <select value={mes} onChange={e => setMes(Number(e.target.value))}
              className="h-10 px-3 rounded-xl border-2 border-blue-300 text-sm font-bold bg-white">
              {MESES.map((n, i) => <option key={i+1} value={i+1}>{n}</option>)}
            </select>
            <select value={ano} onChange={e => setAno(Number(e.target.value))}
              className="h-10 px-3 rounded-xl border-2 border-blue-300 text-sm font-bold bg-white">
              {[2024,2025,2026,2027].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <Button onClick={() => setPeriodoOk(true)} className="bg-blue-500 hover:bg-blue-600 h-10">
              Confirmar
            </Button>
          </div>
        ) : (
          <p className="ml-8 mt-1 text-lg font-black text-emerald-700">{MESES[mes-1]} {ano}</p>
        )}
      </div>

      {/* Meses salvos */}
      {salvas.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-black text-slate-700">Análises salvas</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="flex flex-wrap gap-2">
              {salvas.map(s => {
                const key = `${s.ano}-${s.mes}`
                const loading = excluindo === key
                return (
                  <div key={key} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <div>
                      <p className="text-xs font-bold text-slate-700">{s.label}</p>
                      <p className="text-[10px] text-slate-400">{formatCurrency(s.receita)} receita</p>
                    </div>
                    <button
                      onClick={() => handleExcluir(s.ano, s.mes, s.label)}
                      disabled={loading}
                      className="ml-2 p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors disabled:opacity-50"
                      title="Excluir"
                    >
                      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Download template + Upload — só aparece após confirmar mês */}
      {periodoOk && <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Card template */}
        <Card className="border-0 shadow-sm bg-violet-50 border-t-2 border-t-violet-400">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Download className="w-4 h-4 text-violet-600" />
              <p className="text-sm font-black text-violet-800">1. Baixe o template</p>
            </div>
            <p className="text-xs text-violet-600 mb-4">
              Preencha com suas vendas avulsas. O sistema busca os custos pelo SKU cadastrado no catálogo.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="border-violet-300 text-violet-700 hover:bg-violet-100 font-bold text-xs"
              onClick={baixarTemplate}
              disabled={baixandoTemplate}
            >
              {baixandoTemplate ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
              template_vendas_avulsas.xlsx
            </Button>
            <div className="mt-3 space-y-1">
              {['Data, Canal, SKU, Produto', 'Qtd, Preço, Desconto, Taxa (%)', 'Observação livre'].map(item => (
                <p key={item} className="text-[11px] text-violet-500 flex items-center gap-1.5">
                  <span className="text-violet-400">✓</span> {item}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Card upload */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-black text-slate-700 flex items-center gap-2">
              <Upload className="w-4 h-4" />
              2. Faça o upload
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div
              className={cn(
                'border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors p-8',
                dragOver ? 'border-violet-400 bg-violet-50' : 'border-slate-200 hover:border-violet-300 hover:bg-slate-50',
                estado === 'carregando' && 'pointer-events-none opacity-60'
              )}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
              {estado === 'carregando' ? (
                <><Loader2 className="w-6 h-6 animate-spin text-violet-500" />
                <p className="text-xs text-slate-500">Processando…</p></>
              ) : estado === 'ok' ? (
                <><CheckCircle2 className="w-6 h-6 text-emerald-500" />
                <p className="text-xs text-emerald-600 font-bold">Arquivo processado!</p>
                <p className="text-[11px] text-slate-400">Clique para trocar o arquivo</p></>
              ) : (
                <><ShoppingBag className="w-6 h-6 text-slate-300" />
                <p className="text-xs text-slate-500 font-medium">Arraste o template preenchido</p>
                <p className="text-[11px] text-slate-400">.xlsx</p></>
              )}
            </div>
            {estado === 'erro' && (
              <div className="mt-2 p-2.5 bg-red-50 rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                <p className="text-xs text-red-600">{erro}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>}

      {/* Resultados */}
      {dados && (
        <>
          {/* Alertas */}
          {dados.alertas.sku_sem_custo.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-bold text-amber-700">SKUs sem custo no catálogo</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  {dados.alertas.sku_sem_custo.join(', ')} — cadastre o custo para calcular o CMV corretamente
                </p>
              </div>
            </div>
          )}

          {/* Grid principal */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* DRE */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-black text-slate-700">
                  DRE — Vendas Avulsas
                </CardTitle>
                <p className="text-xs text-slate-400">
                  {MESES[(dados.periodo.mes - 1)]} {dados.periodo.ano} · {dados.pedidos} linha{dados.pedidos !== 1 ? 's' : ''} · {dados.unidades_total} unid.
                </p>
              </CardHeader>
              <CardContent className="px-5 pb-5 divide-y divide-slate-100">
                <DRELinha label="Receita bruta" valor={dados.receita_total} cor="text-emerald-600" />
                <DRELinha label="Taxas de plataforma" valor={-dados.taxas_total} cor="text-red-500" indent />
                <DRELinha label="Receita líquida" valor={dados.liquido_total} destaque />
                <DRELinha label="CMV" valor={-dados.cmv_total} cor="text-red-500" indent />
                <DRELinha
                  label="Lucro bruto"
                  valor={lucro_bruto}
                  cor={lucro_bruto >= 0 ? 'text-emerald-600' : 'text-red-500'}
                  destaque
                />
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-xs text-slate-500">Margem bruta</span>
                  <span className={cn('text-xs font-black', dados.receita_total > 0 && lucro_bruto / dados.receita_total >= 0.1 ? 'text-emerald-600' : 'text-amber-600')}>
                    {dados.receita_total > 0 ? ((lucro_bruto / dados.receita_total) * 100).toFixed(1) : '0.0'}%
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Por canal */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-black text-slate-700">Por Canal</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <div className="space-y-2">
                  {dados.canais.map(c => {
                    const pct = dados.receita_total > 0 ? (c.receita / dados.receita_total) * 100 : 0
                    return (
                      <div key={c.canal}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-bold text-slate-700">{c.canal}</span>
                          <span className="text-xs font-black text-slate-800 font-mono">{formatCurrency(c.receita)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-violet-400 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] text-slate-400 w-8 text-right">{pct.toFixed(0)}%</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">{c.pedidos} linha{c.pedidos !== 1 ? 's' : ''}</p>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabela SKUs */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2 pt-4 px-5">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-slate-400" />
                <CardTitle className="text-sm font-black text-slate-700">Por SKU</CardTitle>
                <Badge variant="secondary" className="text-[10px]">{dados.skus.length} itens</Badge>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-y border-slate-100">
                      {['SKU','Canal','Produto','Unid.','Receita','Taxas','CMV','Lucro','Margem'].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-[10px] font-black text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {dados.skus.map((s, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-bold text-slate-700 whitespace-nowrap">{s.sku}</td>
                        <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{s.canal}</td>
                        <td className="px-4 py-2.5 text-slate-500 max-w-[200px] truncate">
                          {s.nome_catalogo || s.nome_produto || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-center text-slate-700 font-mono">{s.unidades}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-800 whitespace-nowrap">{formatCurrency(s.receita)}</td>
                        <td className="px-4 py-2.5 font-mono text-red-500 whitespace-nowrap">{formatCurrency(s.taxas)}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-500 whitespace-nowrap">
                          {s.sem_custo
                            ? <span className="text-amber-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />—</span>
                            : formatCurrency(s.custo_total)}
                        </td>
                        <td className={cn('px-4 py-2.5 font-mono font-black whitespace-nowrap',
                          s.lucro_bruto >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                          {formatCurrency(s.lucro_bruto)}
                        </td>
                        <td className={cn('px-4 py-2.5 font-black whitespace-nowrap',
                          s.margem_perc >= 20 ? 'text-emerald-600' : s.margem_perc >= 0 ? 'text-amber-600' : 'text-red-500')}>
                          {s.margem_perc.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Salvar */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" size="sm" className="text-xs" onClick={() => { setEstado('idle'); setDados(null) }}>
              Cancelar
            </Button>
            <Button size="sm" className="text-xs bg-violet-600 hover:bg-violet-700" onClick={handleSalvar} disabled={salvando}>
              {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
              Salvar análise
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
