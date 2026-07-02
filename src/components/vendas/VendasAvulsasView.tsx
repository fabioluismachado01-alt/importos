'use client'

import React, { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2, Loader2, AlertTriangle, ArrowRight, Download,
  Package, ShoppingBag, Upload,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn, formatCurrency } from '@/lib/utils'
import { salvarAnaliseAvulsas } from '@/actions/salvar-analise-avulsas'

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

// ─── View Principal ─────────────────────────────────────────────────────────────

export function VendasAvulsasView() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [estado, setEstado] = useState<UploadEstado>('idle')
  const [dados, setDados] = useState<AvulsasData | null>(null)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [dragOver, setDragOver] = useState(false)

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

  async function handleSalvar() {
    if (!dados) return
    setSalvando(true)
    try {
      const result = await salvarAnaliseAvulsas(dados)
      if (result.ok) router.push('/vendas/avulsas/historico')
      else setErro(result.error ?? 'Erro ao salvar')
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

      {/* Download template + Upload */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

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
      </div>

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
