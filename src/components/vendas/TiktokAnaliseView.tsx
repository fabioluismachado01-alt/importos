'use client'

import React, { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2, Loader2, AlertTriangle, ArrowRight,
  X, Package, Info, Users, Clock, Trash2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn, formatCurrency } from '@/lib/utils'
import { salvarAnaliseTiktok } from '@/actions/salvar-analise-tiktok'
import { excluirAnaliseTikTok } from '@/actions/excluir-analise-tiktok'

interface MesSalvo { ano: number; mes: number; label: string; receita: number }

// ─── Types ────────────────────────────────────────────────────────────────────

interface SkuTiktok {
  sku: string; nome_catalogo: string; nome_variacao: string
  unidades: number; receita: number; taxas: number
  custo_unit: number; custo_total: number; sem_custo: boolean
  lucro_bruto: number; margem_perc: number; ticket_medio: number
  fonte: 'detalhes' | 'heuristica'
}

interface DemonstrativoData {
  arquivo: string; periodo: { ano: number; mes: number }
  receita_bruta: number; liquidado: number
  frete_bruto: number; frete_coberto_tts: number; frete_comprador: number; frete_liquido: number
  taxas_total: number; taxas_plataforma_servico: number
  com_plataforma: number; taxas_servico: number; taxa_por_item: number
  com_afiliados: number; com_criadores: number; com_shop_ads: number; gmv_max: number
  desconto_vendedor: number; reembolsos: number
  unidades_total: number
  pedidos_count: number; pedidos_pagos: number; pedidos_pendentes: number
  skus: SkuTiktok[]; cmv_estimado: number
  detalhes_incompleto: boolean; detalhes_cobertos: number
}

interface AfiliiadosData {
  arquivo: string; total_pedidos: number
  pedidos_liquidados: number; pedidos_pendentes: number; pedidos_inelegiveis: number
  com_real_total: number; com_est_total: number; com_total_apurada: number
  shop_ads_real: number; bonus_real: number
  criadores: Array<{ nome: string; pedidos: number; com_real: number; com_est: number }>
  produtos: string[]
}

interface SkuPedido {
  sku: string; nome_produto: string; nome_catalogo: string; variacao: string
  unidades: number; receita: number; custo_unit: number; custo_total: number
  sem_custo: boolean; lucro_bruto: number; margem_perc: number; ticket_medio: number
}

interface PedidosData {
  arquivo: string
  pedidos_validos: number; pedidos_cancelados: number; pedidos_devolvidos: number
  receita_bruta: number  // soma de (SUBTOTAL + PLATFORM_DISC) — base competência
  skus: SkuPedido[]
  descartados?: { linha: number; order_id: string; sku: string; status: string; cancel_type: string; qtd_return: number; motivo: string }[]
  aviso_zero_pedidos?: string
}

type UploadEstado = 'idle' | 'carregando' | 'ok' | 'erro'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// ─── Upload Box ───────────────────────────────────────────────────────────────

function UploadBox({
  numero, titulo, subtitulo, aceita, estado, cor = 'slate', obrigatorio = true,
  disabled = false, caminho, link, onFile, onRemover, criancas,
}: {
  numero: number | string; titulo: string; subtitulo: string
  aceita: string; estado: UploadEstado; cor?: string; obrigatorio?: boolean
  disabled?: boolean; caminho?: string[]; link?: string
  onFile: (f: File) => void; onRemover: () => void; criancas?: React.ReactNode
}) {
  const ref = useRef<HTMLInputElement>(null)
  const cores: Record<string, string> = {
    slate:  'border-slate-400  hover:border-slate-500  hover:bg-slate-50/20',
    pink:   'border-pink-400   hover:border-pink-500   hover:bg-pink-50/20',
    purple: 'border-purple-400 hover:border-purple-500 hover:bg-purple-50/20',
  }

  if (disabled) return (
    <Card className="border-2 border-dashed border-slate-200 opacity-50">
      <CardContent className="p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-xl bg-slate-200 flex items-center justify-center text-slate-400 text-xs font-black shrink-0">
            <Clock className="w-3.5 h-3.5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-black text-slate-600">{titulo}</p>
            <p className="text-[10px] text-slate-400">{subtitulo}</p>
          </div>
          <Badge className="text-[8px] h-4 px-1.5 bg-slate-100 text-slate-400 border-slate-200 shrink-0">Em breve</Badge>
        </div>
        <div className="border-2 border-dashed border-slate-200 rounded-xl p-5 text-center">
          <p className="text-xs text-slate-400">TikTok Ads — em desenvolvimento</p>
          <p className="text-[10px] text-slate-300 mt-1">Faturas e extratos de campanhas pagas</p>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <Card className={cn('border-2 transition-all',
      estado === 'ok'  ? 'border-emerald-400 bg-emerald-50/5'
      : estado === 'erro' ? 'border-red-300'
      : 'border-slate-200')}>
      <CardContent className="p-5">
        <div className="flex items-center gap-2.5 mb-2">
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
            {obrigatorio ? 'Obrigatório' : 'Opcional'}
          </Badge>
        </div>

        {/* Caminho de navegação */}
        {caminho && caminho.length > 0 && (
          <div className="mb-3">
            <div className="flex flex-wrap items-center gap-1 mb-1">
              {caminho.map((passo, i) => (
                <span key={i} className="flex items-center gap-1">
                  <span className="text-[9px] font-semibold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">{passo}</span>
                  {i < caminho.length - 1 && <ArrowRight className="w-2.5 h-2.5 text-slate-300" />}
                </span>
              ))}
            </div>
            {link && (
              <a href={link} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[9px] font-semibold text-pink-600 hover:text-pink-800 hover:underline">
                <ArrowRight className="w-2.5 h-2.5" />
                Abrir no TikTok Seller
              </a>
            )}
          </div>
        )}

        {estado === 'idle' || estado === 'carregando' ? (
          <div
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
            onDragOver={e => e.preventDefault()}
            onClick={() => ref.current?.click()}
            className={cn('border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all',
              cores[cor] || cores.slate)}>
            <input ref={ref} type="file" accept={aceita} className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
            {estado === 'carregando'
              ? <><Loader2 className="w-5 h-5 animate-spin text-slate-500 mx-auto mb-1.5" /><p className="text-xs font-semibold text-slate-500">Analisando...</p></>
              : <><p className="text-xs font-semibold text-slate-600">Arraste ou clique para enviar</p><p className="text-[10px] text-slate-400 mt-0.5">{aceita.replace(/\./g, '').toUpperCase()}</p></>
            }
          </div>
        ) : estado === 'erro' ? (
          <div className="space-y-2">
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">{criancas}</div>
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

// ─── DRE Linha ────────────────────────────────────────────────────────────────

function DRELinha({ label, valor, cor, sub, indent = false, destaque = false }: {
  label: string; valor: number | null; cor?: string; sub?: string; indent?: boolean; destaque?: boolean
}) {
  return (
    <div className={cn('flex items-center justify-between py-1.5', indent && 'pl-4', destaque && 'bg-slate-50 rounded-lg px-2 my-0.5')}>
      <span className={cn('text-xs', indent ? 'text-slate-400' : 'text-slate-600 font-medium', destaque && 'font-black text-slate-700')}>{label}</span>
      <div className="text-right">
        {valor !== null
          ? <span className={cn('text-xs font-black font-mono', cor ?? 'text-slate-800', destaque && 'text-sm')}>{formatCurrency(valor)}</span>
          : <span className="text-xs text-slate-300">—</span>}
        {sub && <p className="text-[9px] text-slate-400">{sub}</p>}
      </div>
    </div>
  )
}

// ─── View Principal ───────────────────────────────────────────────────────────

export function TiktokAnaliseView({ salvas = [] }: { salvas?: MesSalvo[] }) {
  const router = useRouter()
  const hoje = new Date()

  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [ano, setAno] = useState(hoje.getFullYear())
  const [periodoOk, setPeriodoOk] = useState(false)
  const [aliquota, setAliquota] = useState('8.0')

  const [estD, setEstD] = useState<UploadEstado>('idle')
  const [dadosD, setDadosD] = useState<DemonstrativoData | null>(null)
  const [erroD, setErroD] = useState('')

  const [estP, setEstP] = useState<UploadEstado>('idle')
  const [dadosP, setDadosP] = useState<PedidosData | null>(null)
  const [erroP, setErroP] = useState('')

  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [erroSalvar, setErroSalvar] = useState('')
  const [excluindo, setExcluindo] = useState<string | null>(null)

  async function handleExcluir(ano: number, mes: number, label: string) {
    if (!confirm(`Excluir análise TikTok de ${label}?`)) return
    const key = `${ano}-${mes}`
    setExcluindo(key)
    try {
      const result = await excluirAnaliseTikTok(ano, mes)
      if (result.ok) router.refresh()
      else alert(result.error)
    } finally { setExcluindo(null) }
  }

  async function handleDemonstrativo(file: File) {
    setEstD('carregando'); setErroD('')
    const form = new FormData()
    form.append('file', file)
    form.append('mes', String(mes))
    form.append('ano', String(ano))
    try {
      const res = await fetch('/api/analisar-demonstrativo-tiktok', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDadosD(data); setEstD('ok')
    } catch (e) { setErroD(String(e)); setEstD('erro') }
  }

  async function handlePedidos(file: File) {
    setEstP('carregando'); setErroP('')
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch('/api/pedidos-tiktok', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDadosP(data); setEstP('ok')
    } catch (e) { setErroP(String(e)); setEstP('erro') }
  }

  async function handleSalvar() {
    if (!dadosD) return
    const aliq = parseFloat(aliquota.replace(',', '.')) / 100 || 0.08
    setSalvando(true); setErroSalvar('')
    try {
      const recSalvar = usandoCompetencia ? dadosP!.receita_bruta : dadosD.receita_bruta
      const taxasSalvar = usandoCompetencia
        ? (dadosD.receita_bruta > 0 ? dadosD.taxas_plataforma_servico / dadosD.receita_bruta * recSalvar : dadosD.taxas_plataforma_servico)
        : dadosD.taxas_plataforma_servico
      const cmvSalvar = dadosP
        ? dadosP.skus.reduce((s, x) => s + x.custo_total, 0)
        : dadosD.cmv_estimado
      const pedidosSalvar = dadosP ? dadosP.pedidos_validos : dadosD.pedidos_count
      await salvarAnaliseTiktok({
        mes, ano, aliquota: aliq,
        receita_bruta: recSalvar,
        taxas_plataforma: taxasSalvar,
        com_afiliados: dadosD.com_afiliados,
        frete_liquido: Math.max(0, dadosD.frete_liquido),
        cmv: cmvSalvar,
        pedidos: pedidosSalvar,
        desconto_vendedor: dadosD.desconto_vendedor,
      })
      setSalvo(true)
      setTimeout(() => router.push(`/faturamento/${ano}/${mes}`), 1500)
    } catch (e) { setErroSalvar(String(e)) }
    finally { setSalvando(false) }
  }

  // Cálculos DRE
  const aliq = parseFloat(aliquota.replace(',', '.')) / 100 || 0.08

  // Receita: usa Relatório de Pedidos (competência) quando disponível;
  // evita misturar liquidações de um mês com pedidos de outro.
  const usandoCompetencia = !!(dadosP && dadosP.receita_bruta > 0)
  const rec = usandoCompetencia
    ? dadosP!.receita_bruta
    : (dadosD?.receita_bruta ?? 0)

  // Taxas: quando em competência, aplica alíquota efetiva do Demonstrativo
  const taxaEfetiva = dadosD && dadosD.receita_bruta > 0
    ? dadosD.taxas_plataforma_servico / dadosD.receita_bruta
    : 0
  const taxas = usandoCompetencia
    ? taxaEfetiva * rec
    : (dadosD?.taxas_plataforma_servico ?? 0)

  const afiliados = dadosD?.com_afiliados ?? 0
  // CMV: usa pedidos (exato) quando disponível, senão heurística do demonstrativo
  const cmv = dadosP
    ? dadosP.skus.reduce((s, x) => s + x.custo_total, 0)
    : (dadosD?.cmv_estimado ?? 0)
  const unidadesCmv = dadosP
    ? dadosP.skus.reduce((s, x) => s + x.unidades, 0)
    : (dadosD?.unidades_total ?? 0)
  const das = rec * aliq

  const lucro_bruto = rec - taxas - afiliados
  const lucro_liq   = lucro_bruto - cmv - das

  return (
    <div className="space-y-5">

      {/* Mês */}
      <div className={cn('rounded-2xl border-2 p-5 transition-all',
        periodoOk ? 'border-emerald-400 bg-emerald-50/20' : 'border-slate-400 bg-slate-50/30')}>
        <div className="flex items-center gap-2 mb-1">
          <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-black',
            periodoOk ? 'bg-emerald-500' : 'bg-slate-700')}>
            {periodoOk ? '✓' : '1'}
          </div>
          <p className="text-sm font-black text-slate-800">Mês de referência</p>
          <span className="text-xs text-slate-400">TikTok Shop: período 01 ao 31</span>
          {periodoOk && (
            <button onClick={() => setPeriodoOk(false)} className="ml-auto text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {!periodoOk ? (
          <div className="flex items-center gap-3 mt-3 ml-8">
            <select value={mes} onChange={e => setMes(Number(e.target.value))}
              className="h-10 px-3 rounded-xl border-2 border-slate-300 text-sm font-bold bg-white">
              {MESES.map((n, i) => <option key={i+1} value={i+1}>{n}</option>)}
            </select>
            <select value={ano} onChange={e => setAno(Number(e.target.value))}
              className="h-10 px-3 rounded-xl border-2 border-slate-300 text-sm font-bold bg-white">
              {[2024,2025,2026,2027].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <Button onClick={() => setPeriodoOk(true)} className="bg-slate-800 hover:bg-slate-900 h-10">
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

      {periodoOk && (
        <>
          {/* Alíquota */}
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            <Info className="w-4 h-4 text-slate-500 shrink-0" />
            <p className="text-xs font-bold text-slate-700">Alíquota Simples — {MESES[mes-1]}:</p>
            <div className="flex items-center gap-1.5 ml-auto">
              <Input type="number" step="0.01" value={aliquota}
                onChange={e => setAliquota(e.target.value)}
                className="w-20 h-8 text-sm font-mono text-center border-slate-300" />
              <span className="text-xs text-slate-600 font-bold">%</span>
            </div>
          </div>

          {/* 2 Uploads */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Upload 1 — Demonstrativo */}
            <UploadBox
              numero={1} titulo="Demonstrativo TikTok" subtitulo="Relatório financeiro completo (.xls ou .xlsx)"
              aceita=".xls,.xlsx" estado={estD} cor="slate"
              caminho={['Menu', 'Finanças', 'Visão Geral', 'Demonstrativo', 'Exportar', 'Selecionar Período', 'Baixar']}
              link="https://seller-br.tiktok.com/finance/bills?subTab=bills&tab=statements"
              onFile={handleDemonstrativo}
              onRemover={() => { setEstD('idle'); setDadosD(null); setErroD('') }}
              criancas={estD === 'ok' && dadosD ? (
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-slate-400">Arquivo</span><span className="font-semibold truncate max-w-[130px]">{dadosD.arquivo}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Liquidações</span><span className="font-bold">{dadosD.pedidos_count}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Receita (Vendas líquidas)</span><span className="font-black text-emerald-600 font-mono">{formatCurrency(dadosD.receita_bruta)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Taxas TikTok</span><span className="font-bold text-red-500 font-mono">-{formatCurrency(dadosD.taxas_total)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Frete bruto / coberto</span><span className="font-bold text-slate-500 font-mono">{formatCurrency(dadosD.frete_bruto)} / {formatCurrency(dadosD.frete_coberto_tts)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">A liquidar</span><span className="font-black text-blue-600 font-mono">{formatCurrency(dadosD.liquidado)}</span></div>
                </div>
              ) : erroD ? <p className="text-xs text-red-600">{erroD}</p> : null}
            />

            {/* Upload 2 — Relatório de Pedidos */}
            <UploadBox
              numero={2} titulo="Relatório de Pedidos" subtitulo="Todos os pedidos do período (.csv ou .xlsx)"
              aceita=".csv,.xlsx" estado={estP} cor="purple" obrigatorio={false}
              caminho={['Pedidos', 'Gerenciar Pedidos', 'Filtro (período)', 'Exportar CSV']}
              link="https://seller-br.tiktok.com/order?selected_sort=6&tab=all"
              onFile={handlePedidos}
              onRemover={() => { setEstP('idle'); setDadosP(null); setErroP('') }}
              criancas={estP === 'ok' && dadosP ? (
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-slate-400">Arquivo</span><span className="font-semibold truncate max-w-[130px]">{dadosP.arquivo}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Pedidos válidos</span><span className="font-bold text-emerald-600">{dadosP.pedidos_validos}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Cancelados</span><span className="font-bold text-slate-400">{dadosP.pedidos_cancelados}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Receita (competência)</span><span className="font-black text-purple-600 font-mono">{formatCurrency(dadosP.receita_bruta)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">SKUs identificados</span><span className="font-bold text-purple-600">{dadosP.skus.length} SKUs — CMV exato</span></div>
                  {dadosP.aviso_zero_pedidos && (
                    <div className="mt-1 p-2 bg-red-50 border border-red-200 rounded text-[10px] text-red-700 leading-snug">
                      ⚠ {dadosP.aviso_zero_pedidos}
                    </div>
                  )}
                  {(dadosP.descartados ?? []).filter(x => x.motivo !== 'cancelado').length > 0 && (
                    <details className="mt-1">
                      <summary className="text-amber-600 font-bold cursor-pointer text-xs">⚠ {(dadosP.descartados ?? []).filter(x => x.motivo !== 'cancelado').length} linha(s) descartada(s)</summary>
                      <div className="mt-1 space-y-0.5 max-h-40 overflow-y-auto">
                        {(dadosP.descartados ?? []).filter(x => x.motivo !== 'cancelado').map((x, i) => (
                          <div key={i} className="text-[10px] text-slate-500 font-mono bg-slate-50 px-1 rounded">
                            L{x.linha} · {x.order_id} · {x.sku} · <span className="text-amber-700">{x.motivo}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              ) : erroP ? <p className="text-xs text-red-600">{erroP}</p> : null}
            />
          </div>

          {/* DRE */}
          {dadosD && (
            <>
              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-900 px-5 py-3 flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-xs font-black text-white uppercase tracking-widest">DRE — {MESES[mes-1]} {ano}</p>
                  {usandoCompetencia
                    ? <span className="text-[9px] bg-purple-700 text-purple-100 rounded px-2 py-0.5 font-bold">
                        Competência (Pedidos) · taxas estimadas pelo Demonstrativo
                      </span>
                    : <span className="text-[9px] text-slate-400">fonte: Demonstrativo TikTok · aba Relatórios</span>}
                </div>
                <div className="divide-y divide-slate-100 px-5">
                  <DRELinha label="Receita Bruta (Vendas líquidas)" valor={rec} cor="text-emerald-600"
                    sub={usandoCompetencia
                      ? `${dadosP!.pedidos_validos} pedidos · base competência`
                      : `${dadosD.pedidos_count} liquidações`} />

                  {/* Taxas detalhadas */}
                  <DRELinha label={`(−) Taxas Plataforma + Serviço`} valor={-taxas} cor="text-red-500" indent
                    sub={usandoCompetencia
                      ? `≈ ${(taxaEfetiva * 100).toFixed(1)}% da receita — rateio proporcional do Demonstrativo`
                      : `comissão ${formatCurrency(dadosD.com_plataforma)} + serviço ${formatCurrency(dadosD.taxas_servico)}`} />
                  <DRELinha label="(−) Comissão Afiliados / Criadores" valor={-afiliados} cor="text-red-500" indent
                    sub="fonte: Demonstrativo" />

                  {/* Frete — informativo */}
                  {dadosD.frete_bruto > 0 && (
                    <div className="py-1.5 pl-4 space-y-0.5">
                      <div className="flex justify-between">
                        <span className="text-xs text-slate-400">(−) Frete bruto</span>
                        <span className="text-xs font-mono text-slate-500">-{formatCurrency(dadosD.frete_bruto)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[10px] text-slate-300 pl-2">+ coberto TikTok Shop</span>
                        <span className="text-[10px] font-mono text-slate-300">+{formatCurrency(dadosD.frete_coberto_tts)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[10px] text-slate-300 pl-2">+ pago pelo comprador</span>
                        <span className="text-[10px] font-mono text-slate-300">+{formatCurrency(dadosD.frete_comprador)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[10px] text-slate-400 pl-2 font-bold">Frete líquido</span>
                        <span className="text-[10px] font-mono font-bold text-slate-500">
                          {Math.abs(dadosD.frete_liquido) < 0.01 ? 'R$ 0,00 (coberto)' : formatCurrency(dadosD.frete_liquido)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Lucro bruto */}
                  <DRELinha label="Lucro Bruto (antes de CMV e DAS)"
                    valor={lucro_bruto} destaque
                    cor={lucro_bruto >= 0 ? 'text-blue-600' : 'text-red-500'} />

                  {/* Verificação liquidado: só faz sentido no modo caixa (Demonstrativo) */}
                  {!usandoCompetencia && (
                    <div className="flex items-center gap-2 py-1 pl-4">
                      <span className="text-[10px] text-slate-300">≈ Valor a liquidar TikTok:</span>
                      <span className="text-[10px] font-mono text-slate-300">{formatCurrency(dadosD.liquidado)}</span>
                      {Math.abs(lucro_bruto - dadosD.liquidado) < 1 &&
                        <span className="text-[9px] text-emerald-500 font-bold">✓ confere</span>}
                    </div>
                  )}

                  {cmv > 0 && (
                    <DRELinha label={`(−) CMV (${unidadesCmv} unidades)`}
                      valor={-cmv} cor="text-slate-600" indent
                      sub={dadosD.detalhes_incompleto ? '⚠ parcial — Detalhes do pedido incompleto' : undefined} />
                  )}
                  <DRELinha label={`(−) DAS (${aliquota}%)`} valor={-das} cor="text-amber-600" indent />

                  <DRELinha label="Lucro Líquido" valor={lucro_liq} destaque
                    cor={lucro_liq >= 0 ? 'text-emerald-600' : 'text-red-500'}
                    sub={rec > 0 ? `${((lucro_liq / rec) * 100).toFixed(1)}% margem` : undefined} />
                </div>
              </div>

              {/* SKUs — usa Relatório de Pedidos (exato) ou Demonstrativo (heurística) */}
              {(dadosP ? dadosP.skus.length > 0 : dadosD.skus.length > 0) && (
                <Card className="border-0 shadow-sm overflow-hidden">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-black text-slate-500 uppercase tracking-wide flex items-center gap-2">
                      <Package className="w-4 h-4" /> Vendas por SKU
                      {dadosP ? (
                        <Badge className="text-[8px] bg-purple-100 text-purple-700 ml-1">
                          SKUs confirmados — Relatório de Pedidos
                        </Badge>
                      ) : dadosD.detalhes_incompleto && (
                        <Badge className="text-[8px] bg-amber-100 text-amber-700 ml-1">
                          {dadosD.detalhes_cobertos} confirmados + {dadosD.pedidos_count - dadosD.detalhes_cobertos} por heurística
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs" style={{ minWidth: 620 }}>
                        <thead>
                          <tr className="bg-slate-900 text-white">
                            {['SKU / Produto','Un.','Receita','CMV','Margem'].map(h => (
                              <th key={h} className="px-3 py-2.5 text-[9px] font-black uppercase text-right first:text-left">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {(dadosP ? dadosP.skus : dadosD.skus).map((s, i) => (
                            <tr key={s.sku} className={cn('hover:bg-slate-50', i%2===1 && 'bg-slate-50/30')}>
                              <td className="px-3 py-2.5">
                                <p className="font-black font-mono text-slate-800 text-[11px]">{s.sku}</p>
                                <p className="text-[9px] text-slate-500 truncate max-w-[180px]">{s.nome_catalogo || ('nome_produto' in s ? (s as SkuPedido).nome_produto : '')}</p>
                                {'fonte' in s && s.fonte === 'heuristica' && (
                                  <Badge className="text-[8px] bg-slate-100 text-slate-500 h-3.5 px-1 mt-0.5">heurística de preço</Badge>
                                )}
                                {s.sem_custo && <Badge className="text-[8px] bg-amber-100 text-amber-700 h-3.5 px-1">Sem custo</Badge>}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono">{s.unidades}</td>
                              <td className="px-3 py-2.5 text-right font-mono text-emerald-600">{formatCurrency(s.receita)}</td>
                              <td className="px-3 py-2.5 text-right font-mono text-slate-500">
                                {s.sem_custo ? '—' : formatCurrency(s.custo_total)}
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <span className={cn('font-bold font-mono',
                                  s.margem_perc < 0 ? 'text-red-500' : s.margem_perc < 15 ? 'text-amber-600' : 'text-emerald-600')}>
                                  {s.sem_custo ? '—' : `${s.margem_perc.toFixed(1)}%`}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!dadosP && dadosD.detalhes_incompleto && (
                      <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-100">
                        <p className="text-[10px] text-amber-700">
                          ℹ {dadosD.detalhes_cobertos} liquidações com SKU confirmado · {dadosD.pedidos_count - dadosD.detalhes_cobertos} por heurística — suba o Relatório de Pedidos (Box 3) para dados exatos
                        </p>
                      </div>
                    )}
                    {dadosP && (
                      <div className="px-4 py-2.5 bg-purple-50 border-t border-purple-100">
                        <p className="text-[10px] text-purple-700">
                          ✓ {dadosP.pedidos_validos} pedidos · {dadosP.pedidos_cancelados} cancelados — SKUs e CMV confirmados pelo Relatório de Pedidos
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Botão Salvar */}
              {!salvo && (
                <Button
                  className="w-full gap-2 text-white h-12 text-sm font-black bg-slate-800 hover:bg-slate-900"
                  onClick={handleSalvar} disabled={salvando}>
                  {salvando
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando no Faturamento...</>
                    : <>Salvar DRE TikTok — {MESES[mes-1]} {ano} <ArrowRight className="w-4 h-4" /></>}
                </Button>
              )}
              {erroSalvar && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{erroSalvar}</p>}
              {salvo && (
                <div className="flex items-center gap-2 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <p className="text-sm font-bold text-emerald-800">Salvo! Redirecionando...</p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
