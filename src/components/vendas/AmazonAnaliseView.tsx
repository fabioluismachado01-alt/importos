'use client'

import React, { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileSpreadsheet, FileText, CheckCircle2, Loader2,
  AlertTriangle, ArrowRight, X, Package, Info,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn, formatCurrency } from '@/lib/utils'
import { salvarAnaliseAmazon } from '@/actions/salvar-analise-amazon'

// ─── Types ────────────────────────────────────────────────────────────────────

interface VendasData {
  arquivo: string
  periodo: { inicio: string; fim: string; ano: number; mes: number }
  receita_bruta: number; descontos: number; comissao_amazon: number
  pedidos: number; unidades: number; dias_com_venda: number; ticket_medio: number
  produtos: Array<{
    nome: string; unidades: number; receita: number; comissao: number
    custo_unit: number; custo_total: number; margem_perc: number
    ticket_medio: number; sem_custo: boolean
  }>
}

interface SkuGeral {
  sku: string; titulo: string; nome_catalogo: string
  unidades: number; venda: number; taxa_fba: number
  custo_unit: number; custo_total: number; margem_perc: number
  ticket_medio: number; sem_custo: boolean
}
interface GeralData {
  arquivo: string
  fba_fulfillment: number; fba_armazenagem: number; mensalidade: number
  outras_taxas_servico: number
  reembolsos_count: number
  reembolsos_bruto: number; reembolsos_comissao: number
  reembolsos_fba: number; reembolsos_liquido: number
  ajustes: number; publicidade_interno: number
  skus: SkuGeral[]
}

interface PubData {
  success: boolean; total_publicidade: number | null
  arquivo: string; contexto?: string
  todos_valores?: Array<{ contexto: string; valor: number }>
}

type UploadEstado = 'idle' | 'carregando' | 'ok' | 'erro'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// ─── Componente de Upload ─────────────────────────────────────────────────────

function UploadBox({
  numero, titulo, subtitulo, obrigatorio, aceita, estado,
  onFile, onRemover, criancas, cor = 'orange',
}: {
  numero: number; titulo: string; subtitulo: string; obrigatorio: boolean
  aceita: string; estado: UploadEstado; onFile: (f: File) => void
  onRemover: () => void; criancas?: React.ReactNode; cor?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  const cores: Record<string, string> = {
    orange: 'border-orange-400 hover:border-orange-500 hover:bg-orange-50/20',
    blue:   'border-blue-400   hover:border-blue-500   hover:bg-blue-50/20',
    purple: 'border-purple-400 hover:border-purple-500 hover:bg-purple-50/20',
  }

  return (
    <Card className={cn('border-2 transition-all',
      estado === 'ok'   ? 'border-emerald-400 bg-emerald-50/5'
      : estado === 'erro' ? 'border-red-300'
      : 'border-slate-200')}>
      <CardContent className="p-5">
        {/* Cabeçalho */}
        <div className="flex items-center gap-2.5 mb-4">
          <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-black shrink-0',
            estado === 'ok' ? 'bg-emerald-500' : 'bg-slate-700')}>
            {estado === 'carregando' ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : estado === 'ok'      ? <CheckCircle2 className="w-3.5 h-3.5" />
              : estado === 'erro'    ? <AlertTriangle className="w-3.5 h-3.5" />
              : numero}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-slate-800">{titulo}</p>
            <p className="text-[10px] text-slate-400 truncate">{subtitulo}</p>
          </div>
          <Badge className={cn('text-[8px] h-4 px-1.5 shrink-0',
            obrigatorio ? 'bg-red-100 text-red-700 border-red-200' : 'bg-slate-100 text-slate-500 border-slate-200')}>
            {obrigatorio ? 'Obrigatório' : 'Obrigatório'}
          </Badge>
        </div>

        {/* Área de upload ou conteúdo */}
        {estado === 'idle' || estado === 'carregando' ? (
          <div
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
            onDragOver={e => e.preventDefault()}
            onClick={() => ref.current?.click()}
            className={cn('border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all',
              cores[cor] || cores.orange)}>
            <input ref={ref} type="file" accept={aceita} className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
            {estado === 'carregando'
              ? <><Loader2 className="w-5 h-5 animate-spin text-orange-500 mx-auto mb-1.5" /><p className="text-xs font-semibold text-slate-500">Analisando arquivo...</p></>
              : <><p className="text-xs font-semibold text-slate-600">Arraste ou clique para enviar</p><p className="text-[10px] text-slate-400 mt-0.5">{aceita.replace(/\./g, '').toUpperCase()}</p></>
            }
          </div>
        ) : estado === 'erro' ? (
          <div className="space-y-2">
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
              {criancas}
            </div>
            <button onClick={onRemover} className="text-[9px] text-slate-300 hover:text-red-400">× Tentar novamente</button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {criancas}
            <button onClick={onRemover} className="text-[9px] text-slate-300 hover:text-red-400 mt-1 block">× Remover</button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Linha de DRE ─────────────────────────────────────────────────────────────

function DRELinha({ label, valor, cor, sub, indent = false }: {
  label: string; valor: number | null; cor?: string; sub?: string; indent?: boolean
}) {
  return (
    <div className={cn('flex items-center justify-between py-1.5', indent && 'pl-4')}>
      <span className={cn('text-xs', indent ? 'text-slate-400' : 'text-slate-600 font-medium')}>{label}</span>
      <div className="text-right">
        {valor !== null
          ? <span className={cn('text-xs font-black font-mono', cor ?? 'text-slate-800')}>{formatCurrency(valor)}</span>
          : <span className="text-xs text-slate-300">—</span>}
        {sub && <p className="text-[9px] text-slate-400">{sub}</p>}
      </div>
    </div>
  )
}

// ─── View Principal ───────────────────────────────────────────────────────────

export function AmazonAnaliseView() {
  const router = useRouter()
  const hoje = new Date()

  const [mes, setMes]         = useState(hoje.getMonth() + 1)
  const [ano, setAno]         = useState(hoje.getFullYear())
  const [periodoOk, setPeriodoOk] = useState(false)
  const [aliquota, setAliquota] = useState('8.0')

  // Estado dos 3 uploads
  const [estV, setEstV] = useState<UploadEstado>('idle')
  const [dadosV, setDadosV] = useState<VendasData | null>(null)
  const [erroV, setErroV]   = useState('')

  const [estG, setEstG] = useState<UploadEstado>('idle')
  const [dadosG, setDadosG] = useState<GeralData | null>(null)
  const [erroG, setErroG]   = useState('')

  const [estP, setEstP] = useState<UploadEstado>('idle')
  const [dadosP, setDadosP] = useState<PubData | null>(null)
  const [pubManual, setPubManual] = useState('')
  const [erroP, setErroP]   = useState('')

  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo]       = useState(false)
  const [erroSalvar, setErroSalvar] = useState('')

  // ─── Handlers ─────────────────────────────────────────────────────────────

  async function handleVendas(file: File) {
    setEstV('carregando'); setErroV('')
    const form = new FormData()
    form.append('file', file)
    form.append('mes', String(mes))
    form.append('ano', String(ano))
    try {
      const res = await fetch('/api/analisar-relatorio-vendas', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDadosV(data); setEstV('ok')
    } catch (e) { setErroV(String(e)); setEstV('erro') }
  }

  async function handleGeral(file: File) {
    setEstG('carregando'); setErroG('')
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch('/api/analisar-relatorio-geral', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDadosG(data); setEstG('ok')
    } catch (e) { setErroG(String(e)); setEstG('erro') }
  }

  async function handlePdf(file: File) {
    setEstP('carregando'); setErroP('')
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch('/api/publicidade-amazon', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDadosP(data)
      if (data.total_publicidade) setPubManual(data.total_publicidade.toFixed(2))
      setEstP('ok')
    } catch (e) { setErroP(String(e)); setEstP('erro') }
  }

  async function handleSalvar() {
    if (!dadosV) return
    const aliq = parseFloat(aliquota.replace(',', '.')) / 100 || 0.08
    const pub  = parseFloat(pubManual.replace(',', '.')) || 0

    setSalvando(true); setErroSalvar('')
    try {
      await salvarAnaliseAmazon({
        mes, ano, aliquota: aliq,
        // Relatório de Vendas
        receita_bruta:     dadosV.receita_bruta,
        comissao_amazon:   dadosV.comissao_amazon,
        descontos:         dadosV.descontos,
        pedidos:           dadosV.pedidos,
        unidades:          dadosV.unidades,
        dias_com_venda:    dadosV.dias_com_venda,
        // Relatório Geral
        fba_fulfillment:       dadosG?.fba_fulfillment       ?? 0,
        fba_armazenagem:       dadosG?.fba_armazenagem       ?? 0,
        mensalidade:           dadosG?.mensalidade            ?? 0,
        reembolsos_bruto:      dadosG?.reembolsos_bruto       ?? 0,
        reembolsos_comissao:   dadosG?.reembolsos_comissao    ?? 0,
        reembolsos_fba:        dadosG?.reembolsos_fba         ?? 0,
        ajustes:               dadosG?.ajustes                ?? 0,
        outras_taxas_servico:  dadosG?.outras_taxas_servico   ?? 0,
        // Fatura PDF
        publicidade: pub,
        // CMV — usa SKUs do Relatorio Geral (tem custo real por SKU) ou fallback p/ Vendas
        custo_produtos: dadosG
          ? dadosG.skus.reduce((s, sk) => s + (sk.custo_total ?? 0), 0)
          : dadosV.produtos.reduce((s, p) => s + (p.custo_total ?? 0), 0),
      })
      setSalvo(true)
      setTimeout(() => router.push(`/faturamento/${ano}/${mes}`), 1500)
    } catch (e) { setErroSalvar(String(e)) }
    finally { setSalvando(false) }
  }

  // ─── Cálculos DRE ─────────────────────────────────────────────────────────

  const aliq       = parseFloat(aliquota.replace(',', '.')) / 100 || 0.08
  const pub        = parseFloat(pubManual.replace(',', '.')) || 0
  const rec        = dadosV?.receita_bruta ?? 0
  const comissao   = dadosV?.comissao_amazon ?? 0
  const fbaFull    = dadosG?.fba_fulfillment ?? 0
  const fbaArm     = dadosG?.fba_armazenagem ?? 0
  const mensal     = dadosG?.mensalidade ?? 0
  const reembolso  = dadosG?.reembolsos_liquido ?? 0
  const ajuste     = dadosG?.ajustes ?? 0
  const outrasTax  = dadosG?.outras_taxas_servico ?? 0
  const custoProd  = dadosG
    ? dadosG.skus.reduce((s, sk) => s + (sk.custo_total ?? 0), 0)
    : (dadosV?.produtos.reduce((s, p) => s + (p.custo_total ?? 0), 0) ?? 0)
  const das        = rec * aliq

  const lucro_bruto = rec - comissao - fbaFull - fbaArm - mensal - reembolso + ajuste - outrasTax - pub
  const lucro_liq   = lucro_bruto - custoProd - das

  const podeSalvar  = estV === 'ok'   // pelo menos o relatório de vendas é obrigatório
  const dre_completa = estV === 'ok' && estG === 'ok' && estP === 'ok'

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Mês */}
      <div className={cn('rounded-2xl border-2 p-5 transition-all',
        periodoOk ? 'border-emerald-400 bg-emerald-50/20' : 'border-blue-400 bg-blue-50/20')}>
        <div className="flex items-center gap-2 mb-1">
          <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-black',
            periodoOk ? 'bg-emerald-500' : 'bg-blue-500')}>
            {periodoOk ? '✓' : '1'}
          </div>
          <p className="text-sm font-black text-slate-800">Mês de referência</p>
          <span className="text-xs text-slate-400">Amazon: período 01 ao 31</span>
          {periodoOk && (
            <button onClick={() => setPeriodoOk(false)} className="ml-auto text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
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

      {periodoOk && (
        <>
          {/* Alíquota */}
          <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
            <Info className="w-4 h-4 text-orange-600 shrink-0" />
            <p className="text-xs font-bold text-orange-800">Alíquota Simples — {MESES[mes-1]}:</p>
            <div className="flex items-center gap-1.5 ml-auto">
              <Input type="number" step="0.01" value={aliquota}
                onChange={e => setAliquota(e.target.value)}
                className="w-20 h-8 text-sm font-mono text-center border-orange-300" />
              <span className="text-xs text-orange-700 font-bold">%</span>
            </div>
          </div>

          {/* Aviso 3 arquivos */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-3">
            <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
            <div className="text-xs text-blue-800">
              <p className="font-black mb-0.5">3 arquivos obrigatórios para DRE completa</p>
              <p className="text-blue-600">Relatório de Vendas (Receita) · Relatório Geral (FBA/Taxas) · Fatura Ads (Publicidade)</p>
            </div>
          </div>

          {/* 3 Uploads */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Upload 1 — Relatório de Vendas */}
            <UploadBox
              numero={1} titulo="Relatório de Vendas" subtitulo="Receita, SKUs e Comissões (.csv)"
              obrigatorio aceita=".csv,.xlsx" estado={estV} cor="orange"
              onFile={handleVendas}
              onRemover={() => { setEstV('idle'); setDadosV(null); setErroV('') }}
              criancas={estV === 'ok' && dadosV ? (
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-slate-400">Arquivo</span><span className="font-semibold truncate max-w-[120px]">{dadosV.arquivo}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Pedidos</span><span className="font-bold">{dadosV.pedidos} · {dadosV.unidades} un.</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Receita Bruta</span><span className="font-black text-emerald-600 font-mono">{formatCurrency(dadosV.receita_bruta)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Comissão</span><span className="font-bold text-red-500 font-mono">-{formatCurrency(dadosV.comissao_amazon)}</span></div>
                </div>
              ) : erroV ? <p className="text-xs text-red-600">{erroV}</p> : null}
            />

            {/* Upload 2 — Relatório Geral */}
            <UploadBox
              numero={2} titulo="Relatório Geral" subtitulo="FBA, Armazenagem e Taxas (.csv)"
              obrigatorio aceita=".csv,.xlsx" estado={estG} cor="blue"
              onFile={handleGeral}
              onRemover={() => { setEstG('idle'); setDadosG(null); setErroG('') }}
              criancas={estG === 'ok' && dadosG ? (
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-slate-400">Arquivo</span><span className="font-semibold truncate max-w-[120px]">{dadosG.arquivo}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">FBA Fulfillment</span><span className="font-bold text-red-500 font-mono">-{formatCurrency(dadosG.fba_fulfillment)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">FBA Armazenagem</span><span className="font-bold text-red-500 font-mono">-{formatCurrency(dadosG.fba_armazenagem)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Mensalidade</span><span className="font-bold text-red-500 font-mono">-{formatCurrency(dadosG.mensalidade)}</span></div>
                  {dadosG.reembolsos_bruto > 0 && <div className="flex justify-between"><span className="text-slate-400">Reembolsos</span><span className="font-bold text-amber-600 font-mono">{formatCurrency(dadosG.reembolsos_bruto)}</span></div>}
                  {dadosG.publicidade_interno > 0 && (
                    <div className="flex justify-between opacity-50"><span className="text-slate-400 line-through">Pub. no relatório</span><span className="font-mono">{formatCurrency(dadosG.publicidade_interno)}</span></div>
                  )}
                </div>
              ) : erroG ? <p className="text-xs text-red-600">{erroG}</p> : null}
            />

            {/* Upload 3 — Fatura de Publicidade */}
            <UploadBox
              numero={3} titulo="Fatura de Publicidade" subtitulo="Amazon Advertising — fatura mensal (.pdf)"
              obrigatorio aceita=".pdf" estado={estP} cor="purple"
              onFile={handlePdf}
              onRemover={() => { setEstP('idle'); setDadosP(null); setPubManual(''); setErroP('') }}
              criancas={estP === 'ok' ? (
                <div className="space-y-2">
                  {dadosP?.success && dadosP.total_publicidade ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                      <p className="text-[10px] font-black text-emerald-700 uppercase tracking-wide">✅ Detectado automaticamente</p>
                      <p className="text-lg font-black font-mono text-emerald-700 mt-0.5">-{formatCurrency(dadosP.total_publicidade)}</p>
                    </div>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-700">
                      ⚠ Não detectado. Informe abaixo:
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold mb-1">Total Publicidade (R$)</p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-500">R$</span>
                      <Input type="number" step="0.01" value={pubManual}
                        onChange={e => setPubManual(e.target.value)}
                        placeholder="0,00" className="font-mono h-8 text-sm" />
                    </div>
                  </div>
                </div>
              ) : estP === 'idle' ? (
                <div className="space-y-2 pt-1">
                  <p className="text-[10px] text-slate-400">Ou informe manualmente:</p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-500">R$</span>
                    <Input type="number" step="0.01" value={pubManual}
                      onChange={e => setPubManual(e.target.value)}
                      placeholder="0,00" className="font-mono h-8 text-sm" />
                  </div>
                </div>
              ) : erroP ? <p className="text-xs text-red-600">{erroP}</p> : null}
            />
          </div>

          {/* DRE — aparece assim que o Relatório de Vendas for carregado */}
          {dadosV && (
            <>
              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-900 px-5 py-3 flex items-center justify-between">
                  <p className="text-xs font-black text-white uppercase tracking-widest">DRE — {MESES[mes-1]} {ano}</p>
                  {!dre_completa && (
                    <span className="text-[9px] text-slate-400 font-medium">
                      {!dadosG && !dadosP ? '⬛ Aguardando Relatório Geral + Fatura'
                        : !dadosG ? '⬛ Aguardando Relatório Geral'
                        : '⬛ Aguardando Fatura de Publicidade'}
                    </span>
                  )}
                </div>
                <div className="divide-y divide-slate-100 px-5">
                  <DRELinha label="Receita Bruta" valor={rec} cor="text-emerald-600"
                    sub={`${dadosV.unidades} un · ${dadosV.pedidos} pedidos`} />
                  <DRELinha label="(−) Comissão Amazon" valor={-comissao} cor="text-red-500" indent />
                  {dadosG && <DRELinha label="(−) FBA Fulfillment" valor={-fbaFull} cor="text-red-500" indent />}
                  {dadosG && <DRELinha label="(−) Armazenagem FBA" valor={-fbaArm} cor="text-red-500" indent />}
                  {dadosG && mensal > 0 && <DRELinha label="(−) Mensalidade Amazon" valor={-mensal} cor="text-red-500" indent />}
                  {dadosG && outrasTax > 0 && <DRELinha label="(−) Outras Taxas Amazon" valor={-outrasTax} cor="text-red-500" indent />}
                  {dadosG && reembolso > 0 && <DRELinha label={`(−) Reembolsos (${dadosG.reembolsos_count}x)`} valor={-reembolso} cor="text-red-500" sub="fonte: Relatório Geral" indent />}
                  {dadosG && ajuste > 0 && <DRELinha label="(+) Ajustes Financeiros" valor={ajuste} cor="text-blue-500" indent />}
                  {pub > 0 && <DRELinha label="(−) Publicidade Amazon Ads" valor={-pub} cor="text-red-500"
                    sub={dadosP?.success ? 'Fatura oficial' : 'Manual'} indent />}
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs font-black text-slate-700">Lucro Bruto</span>
                    <span className={cn('text-sm font-black font-mono', lucro_bruto >= 0 ? 'text-blue-600' : 'text-red-500')}>
                      {formatCurrency(lucro_bruto)}
                    </span>
                  </div>
                  {custoProd > 0 && <DRELinha label="(−) Custo dos Produtos (CMV)" valor={-custoProd} cor="text-slate-600" indent />}
                  <DRELinha label={`(−) DAS (${aliquota}%)`} valor={-das} cor="text-amber-600" indent />
                  <div className="flex items-center justify-between py-3">
                    <span className="text-sm font-black text-slate-900">Lucro Líquido</span>
                    <div className="text-right">
                      <span className={cn('text-xl font-black font-mono', lucro_liq >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                        {formatCurrency(lucro_liq)}
                      </span>
                      {rec > 0 && <p className="text-[10px] text-slate-400">{((lucro_liq/rec)*100).toFixed(1)}% margem</p>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Tabela por SKU — usa Relatório Geral (tem SKU real + custo do catálogo) */}
              {dadosG && dadosG.skus.length > 0 && (
                <Card className="border-0 shadow-sm overflow-hidden">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-black text-slate-500 uppercase tracking-wide flex items-center gap-2">
                      <Package className="w-4 h-4" /> Vendas por SKU
                      <span className="font-normal text-slate-400 normal-case">— custos do catálogo · comissão do Relatório de Vendas</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs" style={{ minWidth: 680 }}>
                        <thead>
                          <tr className="bg-slate-900 text-white">
                            {['SKU / Produto','Un.','Receita','Taxas FBA','Custo','Margem'].map(h => (
                              <th key={h} className="px-3 py-2.5 text-[9px] font-black uppercase text-right first:text-left">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {dadosG.skus.map((s, i) => (
                            <tr key={s.sku} className={cn('hover:bg-slate-50', i%2===1 && 'bg-slate-50/30')}>
                              <td className="px-3 py-2.5">
                                <p className="font-black font-mono text-slate-800 text-[11px]">{s.sku}</p>
                                <p className="text-[9px] text-slate-500 truncate max-w-[220px]">
                                  {s.nome_catalogo || s.titulo}
                                </p>
                                {s.sem_custo && (
                                  <Badge className="text-[8px] bg-amber-100 text-amber-700 h-3.5 px-1 mt-0.5">
                                    Sem custo — cadastre em Produtos/SKUs
                                  </Badge>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono">{s.unidades}</td>
                              <td className="px-3 py-2.5 text-right font-mono text-emerald-600">{formatCurrency(s.venda)}</td>
                              <td className="px-3 py-2.5 text-right font-mono text-amber-600">-{formatCurrency(s.taxa_fba)}</td>
                              <td className="px-3 py-2.5 text-right font-mono text-slate-500">
                                {s.sem_custo ? '—' : (
                                  <div>
                                    <p>{formatCurrency(s.custo_total)}</p>
                                    <p className="text-[9px] text-slate-400">{formatCurrency(s.custo_unit)}/un</p>
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <span className={cn('font-bold font-mono',
                                  s.margem_perc < 0    ? 'text-red-500'
                                  : s.margem_perc < 15 ? 'text-amber-600'
                                  : 'text-emerald-600')}>
                                  {s.sem_custo ? '—' : `${s.margem_perc.toFixed(1)}%`}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {dadosG.skus.some(s => s.sem_custo) && (
                      <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-100">
                        <p className="text-[10px] text-amber-700">
                          ⚠ Produtos sem custo cadastrado: a margem não pode ser calculada.
                          Acesse <strong>Produtos / SKUs</strong> e cadastre o custo unitário.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Cancelamentos e Reembolsos — fonte oficial: Relatório Geral */}
              {dadosG && dadosG.reembolsos_count > 0 && (
                <Card className="border-0 shadow-sm overflow-hidden">
                  <div className="bg-rose-900 px-5 py-3 flex items-center justify-between">
                    <p className="text-xs font-black text-white uppercase tracking-widest">
                      Cancelamentos e Reembolsos
                    </p>
                    <span className="text-[10px] text-rose-300 font-medium">
                      Fonte: Relatório Geral · tipo = Reembolso
                    </span>
                  </div>
                  <CardContent className="p-0">
                    <div className="divide-y divide-slate-100 px-5">
                      {/* Linha: quantidade */}
                      <div className="flex items-center justify-between py-2.5">
                        <span className="text-xs text-slate-600 font-medium">Quantidade de reembolsos</span>
                        <span className="text-xs font-black font-mono text-rose-700">
                          {dadosG.reembolsos_count} {dadosG.reembolsos_count === 1 ? 'transação' : 'transações'}
                        </span>
                      </div>
                      {/* Linha: valor produtos */}
                      <div className="flex items-center justify-between py-2.5 pl-4">
                        <span className="text-xs text-slate-400">Valor reembolsado (produtos)</span>
                        <span className="text-xs font-black font-mono text-red-500">
                          -{formatCurrency(dadosG.reembolsos_bruto)}
                        </span>
                      </div>
                      {/* Linha: tarifas devolvidas */}
                      <div className="flex items-center justify-between py-2.5 pl-4">
                        <span className="text-xs text-slate-400">(+) Tarifas devolvidas pela Amazon</span>
                        <span className="text-xs font-bold font-mono text-emerald-600">
                          +{formatCurrency(dadosG.reembolsos_comissao)}
                        </span>
                      </div>
                      {/* Linha: FBA devolvido */}
                      {dadosG.reembolsos_fba > 0 && (
                        <div className="flex items-center justify-between py-2.5 pl-4">
                          <span className="text-xs text-slate-400">(+) Taxas FBA devolvidas</span>
                          <span className="text-xs font-bold font-mono text-emerald-600">
                            +{formatCurrency(dadosG.reembolsos_fba)}
                          </span>
                        </div>
                      )}
                      {/* Linha: impacto líquido */}
                      <div className="flex items-center justify-between py-3">
                        <span className="text-xs font-black text-slate-700">Impacto líquido na DRE</span>
                        <div className="text-right">
                          <span className="text-sm font-black font-mono text-red-600">
                            -{formatCurrency(dadosG.reembolsos_liquido)}
                          </span>
                          {rec > 0 && (
                            <p className="text-[9px] text-slate-400">
                              {((dadosG.reembolsos_liquido / rec) * 100).toFixed(1)}% da receita bruta
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Fallback: Relatório de Vendas sem o Geral */}
              {!dadosG && dadosV.produtos.length > 0 && (
                <Card className="border-0 shadow-sm overflow-hidden">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-black text-slate-500 uppercase tracking-wide flex items-center gap-2">
                      <Package className="w-4 h-4" /> Vendas por Produto
                      <span className="font-normal text-slate-400 normal-case">— envie o Relatório Geral para ver custos por SKU</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs" style={{ minWidth: 500 }}>
                        <thead>
                          <tr className="bg-slate-900 text-white">
                            {['Produto','Un.','Receita','Comissão'].map(h => (
                              <th key={h} className="px-3 py-2.5 text-[9px] font-black uppercase text-right first:text-left">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {dadosV.produtos.map((p, i) => (
                            <tr key={i} className={cn('hover:bg-slate-50', i%2===1 && 'bg-slate-50/30')}>
                              <td className="px-3 py-2.5">
                                <p className="font-bold text-slate-800 max-w-[240px] truncate">{p.nome}</p>
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono">{p.unidades}</td>
                              <td className="px-3 py-2.5 text-right font-mono text-emerald-600">{formatCurrency(p.receita)}</td>
                              <td className="px-3 py-2.5 text-right font-mono text-red-500">-{formatCurrency(p.comissao)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Botão Salvar */}
              {!salvo && podeSalvar && (
                <Button
                  className="w-full gap-2 text-white h-12 text-sm font-black"
                  style={{ background: salvando ? '#cc7700' : '#FF9900' }}
                  onClick={handleSalvar} disabled={salvando}>
                  {salvando
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando no Faturamento...</>
                    : <>Salvar DRE Amazon — {MESES[mes-1]} {ano} <ArrowRight className="w-4 h-4" /></>}
                </Button>
              )}
              {!dre_completa && !salvando && (
                <p className="text-center text-[10px] text-slate-400">
                  {estG !== 'ok' ? '⚠ Sem Relatório Geral: FBA, armazenagem e mensalidade não incluídos.' : ''}
                  {estP !== 'ok' && pub === 0 ? ' ⚠ Sem Fatura Ads: publicidade não incluída.' : ''}
                </p>
              )}
              {erroSalvar && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{erroSalvar}</p>}
              {salvo && (
                <div className="flex items-center gap-2 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <p className="text-sm font-bold text-emerald-800">Salvo! Redirecionando para o Faturamento...</p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
