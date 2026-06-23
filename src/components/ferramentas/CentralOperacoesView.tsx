'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  Tag, Ship, Sigma, FileText,
  DollarSign, RefreshCw, CheckCircle2, Circle,
  ExternalLink, Anchor, FileSearch, TrendingUp,
  CheckCheck,
} from 'lucide-react'

// ─── Ferramentas ──────────────────────────────────────────────────────────────

const TOOLS = [
  {
    href: '/ferramentas/precificacao',
    label: 'Precificação',
    desc: 'Compare margens e ROAS nos 5 canais simultaneamente',
    Icon: Tag,
    accent: '#10b981',
    tag: 'ML · Shopee · Amazon · TikTok · Magalu',
  },
  {
    href: '/ferramentas/landed-cost',
    label: 'Landed Cost',
    desc: 'Simule o custo de desembarque por modalidade',
    Icon: Ship,
    accent: '#3b82f6',
    tag: 'Simplificada · Aérea · Marítima',
  },
  {
    href: '/ferramentas/rateio',
    label: 'Rateio de Lote',
    desc: 'Custo real por unidade + simulação de margens',
    Icon: Sigma,
    accent: '#f59e0b',
    tag: 'Formal · Simplificada',
  },
  {
    href: '/ferramentas/documentacao',
    label: 'Documentação',
    desc: 'Gere PI, CI e Packing List prontos para print',
    Icon: FileText,
    accent: '#8b5cf6',
    tag: 'PI · CI · PL · A4 Paisagem',
  },
]

// ─── Checklist ────────────────────────────────────────────────────────────────

interface CheckItem { id: string; label: string; tool?: string }

const FASE1: CheckItem[] = [
  { id: 'f1_1', label: 'Planilhar os produtos que deseja trazer' },
  { id: 'f1_2', label: 'Validar o NCM no Apoio ao Importador' },
  { id: 'f1_3', label: 'Validação prévia de viabilidade', tool: 'Landed Cost' },
  { id: 'f1_4', label: 'Habilitação do Radar SISCOMEX' },
  { id: 'f1_5', label: 'Emissão da Proforma Invoice (PI)', tool: 'Documentação' },
  { id: 'f1_6', label: 'Pagamento do câmbio' },
  { id: 'f1_7', label: 'Emissão da Commercial Invoice (CI)', tool: 'Documentação' },
  { id: 'f1_8', label: 'Emissão do Packing List (PL)', tool: 'Documentação' },
  { id: 'f1_9', label: 'CI e PL assinados pelo fornecedor' },
  { id: 'f1_10', label: 'Enviar documentos ao despachante' },
]

const FASE2: CheckItem[] = [
  { id: 'f2_1', label: 'Solicitar numerário ao responsável' },
  { id: 'f2_2', label: 'Pagamento dos impostos e taxas' },
  { id: 'f2_3', label: 'Entrada da NF (DI ou XML)' },
  { id: 'f2_4', label: 'Enviar NF ao profissional responsável' },
  { id: 'f2_5', label: 'Agendar entrega da mercadoria' },
  { id: 'f2_6', label: 'Conferir mercadoria recebida' },
  { id: 'f2_7', label: 'Ratear custos do lote', tool: 'Rateio de Lote' },
  { id: 'f2_8', label: 'Precificar para venda nos canais', tool: 'Precificação' },
]

const ALL_ITEMS = [...FASE1, ...FASE2]
const STORAGE_KEY = 'importos_central_checklist'

// ─── Componente Principal ─────────────────────────────────────────────────────

export function CentralOperacoesView() {
  const [greeting, setGreeting]  = useState('')
  const [usdRate,  setUsdRate]   = useState<string | null>(null)
  const [usdLoading, setUsdLoading] = useState(true)
  const [usdError,   setUsdError]   = useState(false)
  const [checked,  setChecked]   = useState<Set<string>>(new Set())
  const [lastUpdate, setLastUpdate] = useState<string>('')

  // Saudação por horário
  useEffect(() => {
    const h = new Date().getHours()
    setGreeting(h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite')
  }, [])

  // Carregar checklist do localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setChecked(new Set(JSON.parse(saved)))
    } catch {}
  }, [])

  // Salvar checklist no localStorage
  function toggleCheck(id: string) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...next])) } catch {}
      return next
    })
  }

  function resetChecklist() {
    setChecked(new Set())
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }

  // Cotação do dólar
  const fetchUsd = useCallback(async () => {
    setUsdLoading(true)
    setUsdError(false)
    try {
      const res  = await fetch('https://economia.awesomeapi.com.br/last/USD-BRL')
      const data = await res.json()
      const bid  = parseFloat(data.USDBRL.bid)
      setUsdRate(bid.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
      setLastUpdate(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
    } catch {
      setUsdError(true)
    } finally {
      setUsdLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsd()
    const t = setInterval(fetchUsd, 60_000)
    return () => clearInterval(t)
  }, [fetchUsd])

  // Progresso
  const totalItems = ALL_ITEMS.length
  const doneItems  = ALL_ITEMS.filter(i => checked.has(i.id)).length
  const progress   = totalItems > 0 ? (doneItems / totalItems) * 100 : 0
  const fase1Done  = FASE1.filter(i => checked.has(i.id)).length
  const fase2Done  = FASE2.filter(i => checked.has(i.id)).length

  return (
    <div className="space-y-6 pb-10">

      {/* ── HEADER ── */}
      <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <div>
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{greeting}, Comandante</p>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">Central de Operações</h1>
        </div>

        {/* USD ao vivo */}
        <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl shadow-sm px-5 py-3">
          <DollarSign className="w-5 h-5 text-emerald-500 shrink-0" />
          <div>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Dólar Comercial</p>
            {usdLoading ? (
              <p className="text-lg font-black text-slate-300 font-mono animate-pulse">Carregando…</p>
            ) : usdError ? (
              <p className="text-sm font-bold text-red-400">Indisponível</p>
            ) : (
              <p className="text-xl font-black text-slate-900 font-mono">{usdRate}</p>
            )}
          </div>
          <button onClick={fetchUsd} title="Atualizar"
            className="ml-2 text-slate-300 hover:text-emerald-500 transition-colors">
            <RefreshCw className={cn('w-4 h-4', usdLoading && 'animate-spin')} />
          </button>
          {lastUpdate && !usdLoading && (
            <span className="text-[7px] text-slate-300 font-bold">{lastUpdate}</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── ESQUERDA: FERRAMENTAS + LINKS ── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Grid de Ferramentas */}
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Ferramentas do Importador</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {TOOLS.map(({ href, label, desc, Icon, accent, tag }) => (
                <Link key={href} href={href}
                  className="group bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col">
                  <div className="h-1" style={{ backgroundColor: accent }} />
                  <div className="p-5 flex-1">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}18` }}>
                        <Icon className="w-4 h-4" style={{ color: accent }} />
                      </div>
                      <div>
                        <p className="font-black text-slate-900 text-sm">{label}</p>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">{tag}</p>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">{desc}</p>
                  </div>
                  <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[9px] font-black text-slate-400 uppercase">Abrir ferramenta</span>
                    <ExternalLink className="w-3 h-3 text-slate-300 group-hover:text-slate-600 transition-colors" />
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Links Externos Úteis */}
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Links Úteis</p>
            <div className="flex flex-wrap gap-2">
              {[
                { href: 'https://www4.receita.fazenda.gov.br/simulador/', label: 'Apoio ao Importador (NCM)', Icon: FileSearch },
                { href: 'https://www.marinetraffic.com/en/ais/home/centerx:-12.0/centery:25.0/zoom:4', label: 'Marine Traffic (Navios)', Icon: Anchor },
                { href: 'https://portalunico.siscomex.gov.br/', label: 'Portal Único SISCOMEX', Icon: TrendingUp },
              ].map(({ href, label, Icon }) => (
                <a key={href} href={href} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-full text-[10px] font-bold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm">
                  <Icon className="w-3.5 h-3.5 text-slate-400" />
                  {label}
                  <ExternalLink className="w-2.5 h-2.5 text-slate-300" />
                </a>
              ))}
            </div>
          </div>

          {/* Progresso da Operação */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Flow da Operação</p>
                <p className="text-xs text-slate-500 mt-0.5">{doneItems} de {totalItems} etapas concluídas</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-black text-slate-900">{Math.round(progress)}%</span>
                {doneItems > 0 && (
                  <button onClick={resetChecklist}
                    className="text-[8px] font-black text-slate-300 hover:text-red-400 uppercase transition-colors">
                    Reiniciar
                  </button>
                )}
              </div>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progress}%`,
                  background: progress === 100
                    ? '#10b981'
                    : 'linear-gradient(90deg, #10b981, #3b82f6)',
                }}
              />
            </div>
            {progress === 100 && (
              <div className="mt-3 flex items-center gap-2 text-emerald-600">
                <CheckCheck className="w-4 h-4" />
                <span className="text-xs font-black uppercase">Operação completa! 🎯</span>
              </div>
            )}
          </div>
        </div>

        {/* ── DIREITA: CHECKLIST ── */}
        <div className="space-y-4">

          {/* Fase 1 */}
          <ChecklistCard
            title="FASE 1: Pré-Embarque"
            accent="text-blue-600"
            accentBorder="border-t-blue-500"
            items={FASE1}
            checked={checked}
            onToggle={toggleCheck}
            done={fase1Done}
          />

          {/* Fase 2 */}
          <ChecklistCard
            title="FASE 2: Chegada da Carga"
            accent="text-pink-600"
            accentBorder="border-t-pink-500"
            items={FASE2}
            checked={checked}
            onToggle={toggleCheck}
            done={fase2Done}
          />
        </div>
      </div>
    </div>
  )
}

// ─── ChecklistCard ────────────────────────────────────────────────────────────

function ChecklistCard({ title, accent, accentBorder, items, checked, onToggle, done }: {
  title: string; accent: string; accentBorder: string
  items: CheckItem[]; checked: Set<string>; onToggle: (id: string) => void; done: number
}) {
  return (
    <div className={cn('bg-white rounded-2xl border border-slate-200 shadow-sm border-t-4 overflow-hidden', accentBorder)}>
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <p className={cn('text-[9px] font-black uppercase tracking-wider', accent)}>{title}</p>
        <span className="text-[8px] font-black text-slate-400">{done}/{items.length}</span>
      </div>
      <div className="p-3 space-y-1.5">
        {items.map(item => {
          const isDone = checked.has(item.id)
          return (
            <label
              key={item.id}
              className={cn(
                'flex items-start gap-2.5 cursor-pointer rounded-xl px-2 py-1.5 transition-colors group',
                isDone ? 'bg-emerald-50/60' : 'hover:bg-slate-50'
              )}
            >
              <button
                onClick={() => onToggle(item.id)}
                className={cn('mt-0.5 shrink-0 transition-colors', isDone ? 'text-emerald-500' : 'text-slate-300 group-hover:text-slate-400')}
              >
                {isDone
                  ? <CheckCircle2 className="w-3.5 h-3.5" />
                  : <Circle className="w-3.5 h-3.5" />
                }
              </button>
              <div className="min-w-0" onClick={() => onToggle(item.id)}>
                <span className={cn('text-[10px] leading-snug', isDone ? 'line-through text-slate-400' : 'text-slate-600 font-medium')}>
                  {item.label}
                </span>
                {item.tool && !isDone && (
                  <span className="ml-1.5 text-[7px] font-black uppercase tracking-wide text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200">
                    {item.tool}
                  </span>
                )}
              </div>
            </label>
          )
        })}
      </div>
    </div>
  )
}
