'use client'

import React, { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { salvarAnaliseML } from '@/actions/salvar-analise-ml'
import {
  Upload, FileSpreadsheet, CheckCircle2, Loader2, AlertTriangle,
  ArrowRight, X, ShoppingCart, BarChart2, Package, DollarSign,
  Truck, Tag, TrendingDown, Info, ChevronRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn, formatCurrency } from '@/lib/utils'

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface VendasData {
  arquivo: string; pedidos: number; cancelados: number; devolucoes: number
  unidades: number; receita_bruta: number; tarifas_ml: number; frete_custo: number
  custo_produtos: number; lucro_bruto: number; margem_perc: number; ticket_medio: number
  skus: Array<{ sku: string; titulo: string; unidades: number; receita: number
    tarifas: number; frete: number; custo_total: number; lucro_bruto: number
    margem_perc: number; ticket_medio: number; lucro_unit: number; sem_custo: boolean }>
  periodo: { mes: number; ano: number }
}

interface FaturamentoData {
  arquivo: string; publicidade: number; armazenagem: number; pagina_ml: number
  afiliados: number; estornos: number; outros: number; total_bruto: number
  detalhes: Array<{ categoria: string; valor: number; ocorrencias: number }>
  periodo: { mes: number; ano: number }
}

interface FullData {
  arquivo: string; armazenagem: number; coleta: number; total: number
  periodo: { mes: number; ano: number }
}

interface PagamentosData {
  arquivo: string
  total_estornos: number    // dinheiro que o ML devolveu ao vendedor
  total_pagamentos: number  // pagamentos manuais feitos
  total_itens: number
  itens: Array<{ tipo: string; status: string; valor_total: number; valor_mes: number }>
  aviso: string
}

type AbaId = 'vendas' | 'faturamento' | 'full' | 'pagamentos'
type EstadoAba = 'idle' | 'lendo' | 'ok' | 'erro'

const ABAS: Array<{ id: AbaId; label: string; icon: React.ElementType; descricao: string; formato: string; obrigatorio: boolean }> = [
  { id: 'vendas',      label: '1. Relatório de Vendas',  icon: ShoppingCart,  descricao: 'Receita por SKU, tarifas e frete',            formato: '.xlsx', obrigatorio: true  },
  { id: 'faturamento', label: '2. Faturamento ML',        icon: DollarSign,    descricao: 'Publicidade, estornos e tarifas extras',       formato: '.xlsx', obrigatorio: true  },
  { id: 'full',        label: '3. Tarifas Full',          icon: Package,       descricao: 'Armazenagem e coleta Full (2 abas)',           formato: '.xlsx', obrigatorio: false },
  { id: 'pagamentos',  label: '4. Pagamentos de Faturas', icon: Tag,           descricao: 'Histórico de pagamentos e faturas pendentes',  formato: '.xlsx', obrigatorio: false },
]

const CORES_MARGEM = (m: number) =>
  m < 0 ? '#EF4444' : m < 10 ? '#F59E0B' : m < 20 ? '#3B82F6' : '#10B981'

// ─── Componente principal ────────────────────────────────────────────────────

const MESES_NOMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

export function AnaliseMlCompleta() {
  const router = useRouter()
  const [abaAtiva, setAbaAtiva] = useState<AbaId>('vendas')
  const [aliquota, setAliquota] = useState('8.0')

  // ── Mês de referência — MANUAL, não detectado automaticamente ──────────────
  const hoje = new Date()
  const [mesSel, setMesSel] = useState(hoje.getMonth() + 1) // 1-12
  const [anoSel, setAnoSel]  = useState(hoje.getFullYear())
  const [periodoConfirmado, setPeriodoConfirmado] = useState(false)

  // Estado por aba
  const [estadosAba, setEstadosAba] = useState<Record<AbaId, EstadoAba>>({
    vendas: 'idle', faturamento: 'idle', full: 'idle', pagamentos: 'idle',
  })
  const [dados, setDados] = useState<{
    vendas?: VendasData; faturamento?: FaturamentoData; full?: FullData; pagamentos?: PagamentosData
  }>({})
  const [erros, setErros] = useState<Record<AbaId, string>>({
    vendas: '', faturamento: '', full: '', pagamentos: '',
  })

  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)

  const inputRefs = {
    vendas:      useRef<HTMLInputElement>(null),
    faturamento: useRef<HTMLInputElement>(null),
    full:        useRef<HTMLInputElement>(null),
    pagamentos:  useRef<HTMLInputElement>(null),
  }

  async function handleUpload(aba: AbaId, file: File) {
    setEstadosAba(e => ({ ...e, [aba]: 'lendo' }))
    setErros(e => ({ ...e, [aba]: '' }))

    const endpoints: Record<AbaId, string> = {
      vendas:      '/api/analisar-ml',
      faturamento: '/api/faturamento-ml',
      full:        '/api/tarifas-full',
      pagamentos:  '/api/pagamentos-ml',
    }

    const form = new FormData()
    form.append('file', file)
    if (aba === 'vendas') form.append('preview', 'true')

    try {
      const res = await fetch(endpoints[aba], { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao processar arquivo')
      setDados(d => ({ ...d, [aba]: data }))
      setEstadosAba(e => ({ ...e, [aba]: 'ok' }))
    } catch (err) {
      setErros(e => ({ ...e, [aba]: String(err) }))
      setEstadosAba(e => ({ ...e, [aba]: 'erro' }))
    }
  }

  function resetAba(aba: AbaId) {
    setEstadosAba(e => ({ ...e, [aba]: 'idle' }))
    setDados(d => { const nd = { ...d }; delete nd[aba]; return nd })
    setErros(e => ({ ...e, [aba]: '' }))
  }

  // Cálculos consolidados
  const aliq = parseFloat(aliquota) / 100 || 0.08
  const v = dados.vendas
  const f = dados.faturamento
  const ft = dados.full

  const receitaBruta     = v?.receita_bruta ?? 0
  const tarifasVenda     = v?.tarifas_ml ?? 0
  const freteVenda       = v?.frete_custo ?? 0
  const custosProdutos   = v?.custo_produtos ?? 0
  const publicidade      = f?.publicidade ?? 0
  const armazenagem      = (ft?.armazenagem ?? 0) || (f?.armazenagem ?? 0)
  const coletaFull       = ft?.coleta ?? 0
  const estornos         = f?.estornos ?? 0         // negativo = recebeu de volta
  const paginaML         = f?.pagina_ml ?? 0
  const afiliados        = f?.afiliados ?? 0

  const totalDespesas    = tarifasVenda + freteVenda + custosProdutos +
                           publicidade + armazenagem + coletaFull + paginaML + afiliados + estornos
  const lucroBruto       = receitaBruta - totalDespesas
  const das              = receitaBruta * aliq
  const lucroLiquido     = lucroBruto - das
  const margemLiquida    = receitaBruta > 0 ? (lucroLiquido / receitaBruta) * 100 : 0

  const temVendas   = estadosAba.vendas === 'ok'
  const temFaturam  = estadosAba.faturamento === 'ok'
  const podeSalvar  = temVendas && temFaturam

  async function handleSalvar() {
    if (!dados.vendas) return
    setSalvando(true)
    try {
      // Consolida todos os dados dos 4 relatórios e salva no faturamento do mês correto
      const resultado = await salvarAnaliseML({
        mes:  mesSel,
        ano:  anoSel,
        aliquota: parseFloat(aliquota) / 100,
        // Do Relatório de Vendas
        vendas_receita:        dados.vendas.receita_bruta,
        vendas_tarifas:        dados.vendas.tarifas_ml,
        vendas_frete:          dados.vendas.frete_custo,
        vendas_custo_produtos: dados.vendas.custo_produtos,
        vendas_unidades:       dados.vendas.unidades,
        vendas_pedidos:        dados.vendas.pedidos,
        // Do Faturamento ML
        publicidade:  dados.faturamento?.publicidade  ?? 0,
        pagina_ml:    dados.faturamento?.pagina_ml    ?? 0,
        afiliados:    dados.faturamento?.afiliados    ?? 0,
        estornos:     dados.faturamento?.estornos     ?? 0,
        // Das Tarifas Full
        armazenagem_full: dados.full?.armazenagem ?? 0,
        coleta_full:      dados.full?.coleta      ?? 0,
      })
      setSalvo(true)
      // Redireciona para o faturamento do mês após 1.5s
      setTimeout(() => {
        router.push(`/faturamento/${resultado.ano}/${resultado.mes}`)
      }, 1500)
    } catch (err) {
      alert('Erro ao salvar: ' + String(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-5">

      {/* ─── PASSO 1: SELECIONAR MÊS DE REFERÊNCIA ── */}
      <div className={cn(
        'rounded-2xl border-2 p-5 transition-all',
        periodoConfirmado
          ? 'border-emerald-400 bg-emerald-50/30'
          : 'border-blue-400 bg-blue-50/30'
      )}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-black',
                periodoConfirmado ? 'bg-emerald-500' : 'bg-blue-500')}>
                {periodoConfirmado ? '✓' : '1'}
              </div>
              <p className="text-sm font-black text-slate-800">
                Mês de referência dos relatórios
              </p>
            </div>
            <p className="text-xs text-slate-500 ml-8">
              Selecione o mês/ano das vendas — <strong>não</strong> a data de emissão dos relatórios.
              {' '}Ciclo ML: dia 30 ao dia 29.
            </p>
          </div>
          {periodoConfirmado && (
            <button
              onClick={() => setPeriodoConfirmado(false)}
              className="text-xs text-slate-400 hover:text-slate-600 shrink-0 flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" /> Alterar
            </button>
          )}
        </div>

        {!periodoConfirmado ? (
          <div className="flex items-center gap-3 mt-4 ml-8">
            <select
              value={mesSel}
              onChange={e => setMesSel(Number(e.target.value))}
              className="h-10 px-3 rounded-xl border-2 border-blue-300 text-sm font-bold bg-white focus:outline-none focus:border-blue-500"
            >
              {MESES_NOMES.map((n, i) => (
                <option key={i+1} value={i+1}>{n}</option>
              ))}
            </select>
            <select
              value={anoSel}
              onChange={e => setAnoSel(Number(e.target.value))}
              className="h-10 px-3 rounded-xl border-2 border-blue-300 text-sm font-bold bg-white focus:outline-none focus:border-blue-500"
            >
              {[2024, 2025, 2026, 2027].map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <Button
              onClick={() => setPeriodoConfirmado(true)}
              className="bg-blue-500 hover:bg-blue-600 h-10"
            >
              Confirmar mês
            </Button>
          </div>
        ) : (
          <div className="ml-8 mt-2">
            <span className="text-lg font-black text-emerald-700">
              {MESES_NOMES[mesSel - 1]} {anoSel}
            </span>
            <span className="text-xs text-slate-500 ml-2">— todos os arquivos serão importados para este mês</span>
          </div>
        )}
      </div>

      {/* ─── PASSO 2: ALÍQUOTA + UPLOADS (só libera após confirmar mês) ── */}
      {!periodoConfirmado && (
        <div className="flex items-center gap-3 bg-slate-100 border border-slate-200 rounded-xl px-4 py-4">
          <Info className="w-4 h-4 text-slate-400 shrink-0" />
          <p className="text-xs text-slate-500">
            Confirme o mês de referência acima para liberar os uploads
          </p>
        </div>
      )}

      {periodoConfirmado && (
      <>
      {/* ─── CONFIGURAÇÃO ALÍQUOTA ── */}
      <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
        <Info className="w-4 h-4 text-orange-600 shrink-0" />
        <p className="text-xs font-bold text-orange-800">Alíquota Simples — {MESES_NOMES[mesSel-1]} {anoSel}:</p>
        <div className="flex items-center gap-1.5 ml-auto">
          <Input type="number" step="0.01" value={aliquota}
            onChange={e => setAliquota(e.target.value)}
            className="w-20 h-8 text-sm font-mono text-center border-orange-300" />
          <span className="text-xs text-orange-700 font-bold">%</span>
        </div>
      </div>

      {/* ─── ABAS DE UPLOAD ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {ABAS.map(aba => {
          const estado = estadosAba[aba.id]
          const Icon = aba.icon
          const isAtiva = abaAtiva === aba.id

          return (
            <button key={aba.id} onClick={() => setAbaAtiva(aba.id)}
              className={cn(
                'p-4 rounded-2xl border-2 text-left transition-all',
                isAtiva ? 'border-emerald-500 bg-emerald-50/50 shadow-sm' : 'border-slate-200 hover:border-slate-300',
                estado === 'ok' && !isAtiva && 'border-emerald-300 bg-emerald-50/20',
              )}>
              <div className="flex items-center justify-between mb-2">
                <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center',
                  estado === 'ok' ? 'bg-emerald-500' : 'bg-slate-100')}>
                  {estado === 'lendo'
                    ? <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                    : estado === 'ok'
                      ? <CheckCircle2 className="w-4 h-4 text-white" />
                      : estado === 'erro'
                        ? <AlertTriangle className="w-4 h-4 text-red-500" />
                        : <Icon className="w-4 h-4 text-slate-500" />
                  }
                </div>
                {aba.obrigatorio
                  ? <Badge className="text-[8px] bg-red-100 text-red-700 border-red-200 h-4 px-1.5">Obrigatório</Badge>
                  : <Badge className="text-[8px] bg-slate-100 text-slate-500 border-slate-200 h-4 px-1.5">Opcional</Badge>
                }
              </div>
              <p className="text-xs font-black text-slate-800 leading-tight">{aba.label}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{aba.descricao}</p>
            </button>
          )
        })}
      </div>

      {/* ─── PAINEL DA ABA ATIVA ── */}
      {ABAS.map(aba => abaAtiva !== aba.id ? null : (
        <Card key={aba.id} className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-black text-slate-700">{aba.label}</CardTitle>
              {estadosAba[aba.id] === 'ok' && (
                <button onClick={() => resetAba(aba.id)} className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1">
                  <X className="w-3.5 h-3.5" /> Remover
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {estadosAba[aba.id] === 'idle' || estadosAba[aba.id] === 'erro' ? (
              <div
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleUpload(aba.id, f) }}
                onDragOver={e => e.preventDefault()}
                onClick={() => inputRefs[aba.id].current?.click()}
                className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/10 transition-all"
              >
                <input ref={inputRefs[aba.id]} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(aba.id, f) }} />
                <FileSpreadsheet className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-600">Arraste ou clique para selecionar</p>
                <p className="text-xs text-slate-400 mt-1">{aba.formato} · {aba.descricao}</p>
                {erros[aba.id] && (
                  <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-left">
                    {erros[aba.id]}
                  </p>
                )}
              </div>
            ) : estadosAba[aba.id] === 'lendo' ? (
              <div className="py-8 flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                <p className="text-sm font-semibold text-slate-600">Processando arquivo...</p>
              </div>
            ) : (
              <PreviewAba aba={aba.id} dados={dados} aliq={aliq} />
            )}
          </CardContent>
        </Card>
      ))}

      {/* ─── RESUMO CONSOLIDADO ── */}
      {(temVendas || temFaturam) && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-black text-slate-700 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-emerald-500" />
              Resultado Consolidado {v?.periodo ? `— ${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][v.periodo.mes-1]} ${v.periodo.ano}` : ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <KPICard label="Receita Bruta"  value={formatCurrency(receitaBruta)} color="emerald" sub={`${v?.unidades ?? 0} unidades`} />
              <KPICard label="Total Despesas" value={`-${formatCurrency(totalDespesas)}`} color="red" sub="Tarifas + Frete + Custos + Ads + Arm." />
              <KPICard label="Lucro Bruto"    value={formatCurrency(lucroBruto)} color={lucroBruto >= 0 ? 'blue' : 'red'} sub={`${v?.margem_perc.toFixed(1) ?? 0}% marg. bruta`} />
              <KPICard label="Lucro Líquido"  value={formatCurrency(lucroLiquido)} color={lucroLiquido >= 0 ? 'emerald' : 'red'} sub={`${margemLiquida.toFixed(1)}% após DAS ${aliquota}%`} />
            </div>

            {/* Detalhamento das despesas */}
            <div className="bg-slate-50 rounded-xl p-4 space-y-2">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Composição das Despesas</p>
              {[
                { label: 'Tarifas de Venda ML',      valor: tarifasVenda,    origem: 'Relatório Vendas',  show: true },
                { label: 'Frete (envios)',             valor: freteVenda,      origem: 'Relatório Vendas',  show: true },
                { label: 'Custo com Produtos',         valor: custosProdutos,  origem: 'Catálogo × SKUs',   show: true },
                { label: 'Publicidade (Ads)',           valor: publicidade,     origem: 'Faturamento ML',    show: publicidade > 0 },
                { label: 'Armazenagem Full',            valor: armazenagem,     origem: 'Tarifas Full',      show: armazenagem > 0 },
                { label: 'Coleta Full (frete)',         valor: coletaFull,      origem: 'Tarifas Full',      show: coletaFull > 0 },
                { label: 'Página Oficial ML',           valor: paginaML,        origem: 'Faturamento ML',    show: paginaML > 0 },
                { label: 'Afiliados',                   valor: afiliados,       origem: 'Faturamento ML',    show: afiliados > 0 },
                { label: 'Estornos recebidos',          valor: estornos,        origem: 'Faturamento ML',    show: estornos !== 0, estorno: true },
              ].filter(d => d.show).map(d => (
                <div key={d.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-600">{d.label}</span>
                    <Badge className="text-[8px] bg-slate-100 text-slate-400 border-slate-200 h-3.5 px-1.5 font-normal">
                      {d.origem}
                    </Badge>
                  </div>
                  <span className={cn('text-xs font-mono font-bold', d.estorno ? 'text-emerald-600' : 'text-red-500')}>
                    {d.estorno && d.valor < 0 ? '+' : '-'}{formatCurrency(Math.abs(d.valor))}
                  </span>
                </div>
              ))}
              <div className="border-t border-slate-200 pt-2 mt-2 flex justify-between">
                <span className="text-xs font-black text-slate-700">DAS ({aliquota}%)</span>
                <span className="text-xs font-mono font-black text-amber-700">-{formatCurrency(das)}</span>
              </div>
              <div className="border-t border-slate-300 pt-2 flex justify-between">
                <span className="text-sm font-black text-slate-900">Lucro Líquido</span>
                <span className={cn('text-base font-black font-mono', lucroLiquido >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                  {formatCurrency(lucroLiquido)}
                </span>
              </div>
            </div>

            {!temFaturam && (
              <div className="mt-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Importe também o <strong>Faturamento ML</strong> para incluir Publicidade e Estornos no cálculo
              </div>
            )}

            {podeSalvar && !salvo && (
              <div className="flex gap-3 mt-4">
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 gap-2 flex-1"
                  onClick={handleSalvar}
                  disabled={salvando}
                >
                  {salvando
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando análise...</>
                    : <>Salvar análise completa <ArrowRight className="w-4 h-4" /></>
                  }
                </Button>
              </div>
            )}
            {salvo && (
              <div className="mt-4 flex items-center gap-2 text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                <CheckCircle2 className="w-5 h-5" /> Análise salva com sucesso!
              </div>
            )}
          </CardContent>
        </Card>
      )}
      </> /* fim do bloco condicional periodoConfirmado */
      )}
    </div>
  )
}

// ─── Preview por aba ────────────────────────────────────────────────────────

function PreviewAba({ aba, dados, aliq }: { aba: AbaId; dados: Record<string, unknown>; aliq: number }) {
  const CORES_MARGEM = (m: number) => m < 0 ? '#EF4444' : m < 10 ? '#F59E0B' : m < 20 ? '#3B82F6' : '#10B981'

  if (aba === 'vendas') {
    const v = dados.vendas as VendasData | undefined
    if (!v) return null
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KPICard label="Receita Bruta"  value={formatCurrency(v.receita_bruta)} color="emerald" sub={`${v.unidades} unidades`} />
          <KPICard label="Tarifas ML"     value={`-${formatCurrency(v.tarifas_ml)}`} color="amber" />
          <KPICard label="Frete"          value={`-${formatCurrency(v.frete_custo)}`} color="amber" />
          <KPICard label="Custo Produtos" value={`-${formatCurrency(v.custo_produtos)}`} color="slate" />
        </div>
        <p className="text-[10px] text-slate-400">
          {v.pedidos} pedidos válidos · {v.cancelados} cancelados · {v.devolucoes} devoluções · {v.skus.length} SKUs
        </p>
        {/* Mini-tabela de SKUs */}
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-left text-xs" style={{ minWidth: '700px' }}>
            <thead className="bg-slate-900 text-white">
              <tr>
                {['SKU','Un.','Receita','Tarifas','Frete','Custo','Lb.Bruto','Marg.%','Lb.Líq/un'].map(h => (
                  <th key={h} className="px-3 py-2 text-[9px] font-black uppercase text-right first:text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {v.skus.map((s, i) => {
                const ll = s.lucro_bruto - s.receita * aliq
                return (
                  <tr key={s.sku} className={cn('hover:bg-slate-50', i%2===1&&'bg-slate-50/30')}>
                    <td className="px-3 py-2">
                      <p className="font-black font-mono text-slate-800">{s.sku}</p>
                      <p className="text-[9px] text-slate-400 truncate max-w-[160px]">{s.titulo}</p>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-700">{s.unidades}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-800">{formatCurrency(s.receita)}</td>
                    <td className="px-3 py-2 text-right font-mono text-amber-700">-{formatCurrency(s.tarifas)}</td>
                    <td className="px-3 py-2 text-right font-mono text-amber-700">-{formatCurrency(s.frete)}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-500">-{formatCurrency(s.custo_total)}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={cn('font-black font-mono text-sm', s.lucro_bruto >= 0 ? 'text-blue-600' : 'text-red-500')}>
                        {formatCurrency(s.lucro_bruto)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="font-mono text-xs font-bold" style={{ color: CORES_MARGEM(s.margem_perc) }}>
                        {s.margem_perc.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={cn('font-mono font-bold', ll>=0?'text-emerald-600':'text-red-500')}>
                        {formatCurrency(ll/s.unidades)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (aba === 'faturamento') {
    const f = dados.faturamento as FaturamentoData | undefined
    if (!f) return null
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <KPICard label="Publicidade (Ads)" value={`-${formatCurrency(f.publicidade)}`} color="red" sub="Product Ads" />
          <KPICard label="Armazenagem"        value={`-${formatCurrency(f.armazenagem)}`} color="amber" sub="Full storage" />
          <KPICard label="Estornos recebidos" value={formatCurrency(Math.abs(f.estornos))} color="emerald" sub="Cancelamentos de tarifas" />
        </div>
        <div className="space-y-1.5 bg-slate-50 rounded-xl p-4">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Detalhamento por categoria</p>
          {f.detalhes.map(d => (
            <div key={d.categoria} className="flex items-center justify-between text-xs">
              <span className="text-slate-600">{d.categoria.replace(/_/g,' ')} ({d.ocorrencias}×)</span>
              <span className={cn('font-mono font-bold', d.valor < 0 ? 'text-emerald-600' : 'text-red-500')}>
                {d.valor < 0 ? '+' : '-'}{formatCurrency(Math.abs(d.valor))}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (aba === 'full') {
    const ft = dados.full as FullData | undefined
    if (!ft) return null
    return (
      <div className="grid grid-cols-3 gap-4">
        <KPICard label="Armazenagem Full" value={`-${formatCurrency(ft.armazenagem)}`} color="amber" sub="Estoque no galpão ML" />
        <KPICard label="Coleta Full"       value={`-${formatCurrency(ft.coleta)}`}       color="amber" sub="Frete de coleta ML" />
        <KPICard label="Total Full"        value={`-${formatCurrency(ft.total)}`}         color="red"   sub="Armazenagem + Coleta" />
      </div>
    )
  }

  if (aba === 'pagamentos') {
    const p = dados.pagamentos as PagamentosData | undefined
    if (!p) return null
    return (
      <div className="space-y-4">

        {/* Aviso sobre pagamentos automáticos */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex gap-2">
          <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700">
            <strong>Atenção:</strong> {p.aviso}
            {' '}O valor pago automaticamente pelas transações (descontado das vendas) não aparece aqui.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <KPICard
            label="Estornos recebidos"
            value={formatCurrency(p.total_estornos)}
            color="emerald"
            sub="Devoluções de tarifas pelo ML"
          />
          <KPICard
            label="Pagamentos manuais"
            value={formatCurrency(p.total_pagamentos)}
            color={p.total_pagamentos > 0 ? 'blue' : 'slate'}
            sub="Pagamentos feitos fora das transações"
          />
        </div>

        {p.total_itens > 0 ? (
          <div className="bg-slate-50 rounded-xl p-4 space-y-2">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              {p.total_itens} registro(s) encontrado(s)
            </p>
            {p.itens.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-slate-700">{item.tipo}</span>
                  <span className="text-slate-400 ml-2">— {item.status}</span>
                </div>
                <div className="text-right">
                  <p className="font-mono font-bold text-emerald-600">{formatCurrency(item.valor_total)}</p>
                  {item.valor_mes !== item.valor_total && (
                    <p className="text-[10px] text-slate-400">Aplicado este mês: {formatCurrency(item.valor_mes)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 text-center py-4">
            Nenhum pagamento ou estorno manual encontrado neste relatório.
          </p>
        )}
      </div>
    )
  }

  return null
}

// ─── KPI Card helper ─────────────────────────────────────────────────────────

function KPICard({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  const COLORS: Record<string, string> = {
    emerald: 'text-emerald-600', blue: 'text-blue-600', amber: 'text-amber-600',
    red: 'text-red-500', slate: 'text-slate-600',
  }
  return (
    <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={cn('text-base font-black font-mono mt-1', COLORS[color] ?? COLORS.slate)}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}
