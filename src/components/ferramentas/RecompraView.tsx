'use client'

import { useState, useMemo } from 'react'
import { usePersistedState } from '@/hooks/usePersistedState'
import { cn } from '@/lib/utils'
import { Plus, Trash2, PackageCheck, Plane, Ship, AlertTriangle, CheckCircle2, Clock, TrendingDown, ShoppingCart } from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Modalidade = 'simplificada' | 'maritimo' | 'aereo'

interface LeadTimeParams {
  producaoSimp: number
  transitoSimp: number
  producaoMar:  number
  transitoMar:  number
  desembaracoMar: number
  producaoAer:  number
  transitoAer:  number
  desembaracoAer: number
  bufferDias: number
}

interface Produto {
  id: number
  nome: string
  estoqueAtual: number      // unidades em estoque agora
  estoqueSeguranca: number  // estoque mínimo desejado (nunca zerar abaixo disso)
  vendasDia: number         // velocidade média de vendas (un/dia)
  modalidade: Modalidade
}

const DEFAULT_LEAD: LeadTimeParams = {
  producaoSimp:   10,
  transitoSimp:   12,
  producaoMar:    10,
  transitoMar:    35,
  desembaracoMar: 10,
  producaoAer:    10,
  transitoAer:     7,
  desembaracoAer: 10,
  bufferDias:      5,
}

const INITIAL_PRODUTOS: Produto[] = [
  { id: 1, nome: 'Cadeira Gamer Pro RGB',        estoqueAtual: 135, estoqueSeguranca: 15, vendasDia: 1.5, modalidade: 'maritimo'    },
  { id: 2, nome: 'Headset Gamer 7.1 Surround',   estoqueAtual: 275, estoqueSeguranca: 25, vendasDia: 2.5, modalidade: 'maritimo'    },
  { id: 3, nome: 'Webcam Full HD Ring Light',     estoqueAtual: 261, estoqueSeguranca: 30, vendasDia: 3.0, modalidade: 'simplificada' },
  { id: 4, nome: 'Hub USB-C 7 em 1',             estoqueAtual: 196, estoqueSeguranca: 40, vendasDia: 4.0, modalidade: 'simplificada' },
  { id: 5, nome: 'Mesa Gamer LED RGB 120×60cm',  estoqueAtual: 122, estoqueSeguranca: 10, vendasDia: 1.2, modalidade: 'maritimo'    },
]

// ─── Cálculo ──────────────────────────────────────────────────────────────────

function calcLeadTotal(mod: Modalidade, p: LeadTimeParams): number {
  if (mod === 'simplificada') return p.producaoSimp + p.transitoSimp
  if (mod === 'maritimo')     return p.producaoMar  + p.transitoMar  + p.desembaracoMar
  return                             p.producaoAer  + p.transitoAer  + p.desembaracoAer
}

interface ProdutoCalc {
  id: number
  nome: string
  estoqueAtual: number
  estoqueSeguranca: number
  vendasDia: number
  modalidade: Modalidade
  leadTotal: number
  leadComBuffer: number
  diasAteZerar: number     // quantos dias até o estoque chegar ao mínimo
  diasParaRecompra: number // em quantos dias precisa fazer o pedido (pode ser negativo = atrasado)
  dataRecompra: Date
  estoqueNaEntrega: Date
  statusEstoque: number    // dias restantes de estoque acima do mínimo
  urgencia: 'ok' | 'atencao' | 'urgente' | 'atrasado'
  qtdSugerida: number      // unidades sugeridas para o próximo pedido (cobertura de 90 dias)
}

function calcProduto(prod: Produto, lead: LeadTimeParams): ProdutoCalc {
  const leadTotal     = calcLeadTotal(prod.modalidade, lead)
  const leadComBuffer = leadTotal + lead.bufferDias

  // Dias até o estoque cair ao nível de segurança
  const estoqueDisponivel = Math.max(prod.estoqueAtual - prod.estoqueSeguranca, 0)
  const diasAteZerar      = prod.vendasDia > 0 ? estoqueDisponivel / prod.vendasDia : 9999

  // Deve pedir leadComBuffer dias antes de zerar
  const diasParaRecompra = diasAteZerar - leadComBuffer

  const hoje            = new Date()
  const dataRecompra    = new Date(hoje.getTime() + diasParaRecompra * 86400000)
  const estoqueNaEntrega = new Date(hoje.getTime() + diasAteZerar * 86400000)

  let urgencia: ProdutoCalc['urgencia'] = 'ok'
  if (diasParaRecompra < 0)  urgencia = 'atrasado'
  else if (diasParaRecompra <= 7)  urgencia = 'urgente'
  else if (diasParaRecompra <= 20) urgencia = 'atencao'

  // Sugestão: cobrir 90 dias de vendas + estoque de segurança
  const qtdSugerida = Math.ceil(prod.vendasDia * 90 + prod.estoqueSeguranca)

  return {
    ...prod,
    leadTotal,
    leadComBuffer,
    diasAteZerar,
    diasParaRecompra,
    dataRecompra,
    estoqueNaEntrega,
    statusEstoque: diasAteZerar,
    urgencia,
    qtdSugerida,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtData(d: Date) {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtDias(n: number) {
  if (n >= 9999) return '∞'
  if (n < 0) return `${Math.abs(Math.round(n))}d atrasado`
  return `${Math.round(n)}d`
}

const MODAL_LABEL: Record<Modalidade, string> = {
  simplificada: 'Simplificada',
  maritimo:     'Marítimo',
  aereo:        'Aéreo',
}

const MODAL_ICON: Record<Modalidade, React.ElementType> = {
  simplificada: PackageCheck,
  maritimo:     Ship,
  aereo:        Plane,
}

const URGENCIA_STYLE = {
  ok:       { bar: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700', label: 'OK',      dot: 'bg-emerald-500' },
  atencao:  { bar: 'bg-amber-400',   badge: 'bg-amber-100 text-amber-700',     label: 'Atenção', dot: 'bg-amber-400'   },
  urgente:  { bar: 'bg-red-500',     badge: 'bg-red-100 text-red-700',         label: 'Urgente', dot: 'bg-red-500'     },
  atrasado: { bar: 'bg-red-700',     badge: 'bg-red-200 text-red-900',         label: 'Atrasado!', dot: 'bg-red-700'  },
}

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{children}</p>
}

function NInput({ value, onChange, step = '1', min = '0', className = '' }: {
  value: number; onChange: (v: number) => void; step?: string; min?: string; className?: string
}) {
  return (
    <input
      type="number" step={step} min={min} value={value}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      className={cn('w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 bg-white', className)}
    />
  )
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export function RecompraView({ workspaceId = 'default' }: { workspaceId?: string }) {
  const [lead, setLead]       = usePersistedState<LeadTimeParams>(`${workspaceId}_rec_lead`, DEFAULT_LEAD)
  const [produtos, setProdutos] = usePersistedState<Produto[]>(`${workspaceId}_rec_produtos`, INITIAL_PRODUTOS)
  const [expandLead, setExpandLead] = useState(false)

  function setL<K extends keyof LeadTimeParams>(k: K, v: number) {
    setLead(p => ({ ...p, [k]: v }))
  }

  function addProduto() {
    setProdutos(prev => [...prev, {
      id: Date.now(), nome: 'Novo Produto',
      estoqueAtual: 100, estoqueSeguranca: 10, vendasDia: 5, modalidade: 'maritimo',
    }])
  }

  function removeProduto(id: number) {
    if (produtos.length > 1) setProdutos(prev => prev.filter(p => p.id !== id))
  }

  function setProduto<K extends keyof Produto>(id: number, field: K, value: Produto[K]) {
    setProdutos(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p))
  }

  const calcs = useMemo(() => produtos.map(p => calcProduto(p, lead)), [produtos, lead])

  const urgentes  = calcs.filter(c => c.urgencia === 'urgente' || c.urgencia === 'atrasado')
  const atencao   = calcs.filter(c => c.urgencia === 'atencao')

  return (
    <div className="space-y-6 pb-10">

      {/* ── TÍTULO ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Ponto de Recompra</h1>
          <p className="text-sm text-slate-500 mt-0.5">Quando fazer o próximo pedido para nunca entrar em ruptura</p>
        </div>
        <button onClick={addProduto}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider shadow transition-all">
          <Plus className="w-3.5 h-3.5" /> Adicionar Produto
        </button>
      </div>

      {/* ── ALERTAS ── */}
      {(urgentes.length > 0 || atencao.length > 0) && (
        <div className="space-y-2">
          {urgentes.map(c => (
            <div key={c.id} className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold border',
              c.urgencia === 'atrasado'
                ? 'bg-red-50 border-red-300 text-red-800'
                : 'bg-red-50 border-red-200 text-red-700'
            )}>
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {c.urgencia === 'atrasado'
                ? `🚨 ${c.nome} — pedido ATRASADO há ${Math.abs(Math.round(c.diasParaRecompra))} dias! Ruptura em ${Math.round(c.diasAteZerar)} dias.`
                : `⚠️ ${c.nome} — fazer pedido nos próximos ${Math.round(c.diasParaRecompra)} dias (até ${fmtData(c.dataRecompra)})`
              }
            </div>
          ))}
          {atencao.map(c => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold bg-amber-50 border border-amber-200 text-amber-700">
              <Clock className="w-4 h-4 shrink-0" />
              {c.nome} — atenção: pedido necessário em {Math.round(c.diasParaRecompra)} dias (até {fmtData(c.dataRecompra)})
            </div>
          ))}
        </div>
      )}

      {/* ── LEAD TIMES (colapsável) ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => setExpandLead(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors">
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-black text-slate-700 uppercase tracking-wider">Configurar Lead Times</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400 font-mono">
            <span>Simp: {lead.producaoSimp + lead.transitoSimp}d</span>
            <span>Mar: {lead.producaoMar + lead.transitoMar + lead.desembaracoMar}d</span>
            <span>Aér: {lead.producaoAer + lead.transitoAer + lead.desembaracoAer}d</span>
            <span className={cn('transition-transform', expandLead && 'rotate-180')}>▼</span>
          </div>
        </button>

        {expandLead && (
          <div className="px-5 pb-5 border-t border-slate-100">
            <div className="grid grid-cols-3 gap-6 mt-4">

              {/* Simplificada */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <PackageCheck className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-black text-slate-600 uppercase tracking-wider">Simplificada (Courier)</span>
                </div>
                <div className="space-y-2">
                  <div><Label>Produção (dias)</Label><NInput value={lead.producaoSimp} onChange={v => setL('producaoSimp', v)} /></div>
                  <div><Label>Trânsito door-to-door (dias)</Label><NInput value={lead.transitoSimp} onChange={v => setL('transitoSimp', v)} /></div>
                  <div className="bg-emerald-50 rounded-lg px-3 py-2 text-xs font-black text-emerald-700">
                    Total: {lead.producaoSimp + lead.transitoSimp} dias
                  </div>
                </div>
              </div>

              {/* Marítimo */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Ship className="w-4 h-4 text-blue-500" />
                  <span className="text-xs font-black text-slate-600 uppercase tracking-wider">Marítimo Formal</span>
                </div>
                <div className="space-y-2">
                  <div><Label>Produção (dias)</Label><NInput value={lead.producaoMar} onChange={v => setL('producaoMar', v)} /></div>
                  <div><Label>Trânsito marítimo (dias)</Label><NInput value={lead.transitoMar} onChange={v => setL('transitoMar', v)} /></div>
                  <div><Label>Desembaraço + entrega (dias)</Label><NInput value={lead.desembaracoMar} onChange={v => setL('desembaracoMar', v)} /></div>
                  <div className="bg-blue-50 rounded-lg px-3 py-2 text-xs font-black text-blue-700">
                    Total: {lead.producaoMar + lead.transitoMar + lead.desembaracoMar} dias
                  </div>
                </div>
              </div>

              {/* Aéreo */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Plane className="w-4 h-4 text-violet-500" />
                  <span className="text-xs font-black text-slate-600 uppercase tracking-wider">Aéreo Formal</span>
                </div>
                <div className="space-y-2">
                  <div><Label>Produção (dias)</Label><NInput value={lead.producaoAer} onChange={v => setL('producaoAer', v)} /></div>
                  <div><Label>Trânsito aéreo (dias)</Label><NInput value={lead.transitoAer} onChange={v => setL('transitoAer', v)} /></div>
                  <div><Label>Desembaraço + entrega (dias)</Label><NInput value={lead.desembaracoAer} onChange={v => setL('desembaracoAer', v)} /></div>
                  <div className="bg-violet-50 rounded-lg px-3 py-2 text-xs font-black text-violet-700">
                    Total: {lead.producaoAer + lead.transitoAer + lead.desembaracoAer} dias
                  </div>
                </div>
              </div>
            </div>

            {/* Buffer */}
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-4">
              <div className="w-48">
                <Label>Buffer de segurança (dias extras)</Label>
                <NInput value={lead.bufferDias} onChange={v => setL('bufferDias', v)} />
              </div>
              <p className="text-xs text-slate-400 mt-4">Dias adicionais somados ao lead time como margem de segurança para atrasos imprevistos.</p>
            </div>
          </div>
        )}
      </div>

      {/* ── PRODUTOS ── */}
      <div className="space-y-4">
        {calcs.map((calc) => {
          const prod = produtos.find(p => p.id === calc.id)!
          const urg  = URGENCIA_STYLE[calc.urgencia]
          const MIcon = MODAL_ICON[calc.modalidade]

          // Barra de progresso: dias restantes até precisar pedir vs lead time total
          const totalWindow = calc.diasAteZerar + calc.leadComBuffer
          const pctBar      = totalWindow > 0 ? Math.max(0, Math.min(100, (calc.diasParaRecompra / totalWindow) * 100)) : 0

          return (
            <div key={calc.id} className={cn(
              'bg-white rounded-2xl border shadow-sm overflow-hidden',
              calc.urgencia === 'atrasado' ? 'border-red-300' :
              calc.urgencia === 'urgente'  ? 'border-red-200' :
              calc.urgencia === 'atencao'  ? 'border-amber-200' : 'border-slate-200'
            )}>
              {/* Barra de status */}
              <div className="h-1.5 w-full bg-slate-100">
                <div className={cn('h-full transition-all', urg.bar)} style={{ width: `${pctBar}%` }} />
              </div>

              <div className="p-5">
                <div className="grid grid-cols-12 gap-4 items-start">

                  {/* Col 1: inputs do produto */}
                  <div className="col-span-12 lg:col-span-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className={cn('w-2 h-2 rounded-full shrink-0', urg.dot)} />
                      <input
                        value={prod.nome}
                        onChange={e => setProduto(prod.id, 'nome', e.target.value)}
                        className="text-base font-black text-slate-900 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-emerald-400 focus:outline-none w-full"
                      />
                      <button onClick={() => removeProduto(prod.id)} title="Remover produto" className="text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg p-1 transition-colors shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label>Estoque atual (un)</Label>
                        <NInput value={prod.estoqueAtual} onChange={v => setProduto(prod.id, 'estoqueAtual', v)} />
                      </div>
                      <div>
                        <Label>Est. segurança (un)</Label>
                        <NInput value={prod.estoqueSeguranca} onChange={v => setProduto(prod.id, 'estoqueSeguranca', v)} />
                      </div>
                      <div>
                        <Label>Vendas/dia (un)</Label>
                        <NInput value={prod.vendasDia} step="0.1" onChange={v => setProduto(prod.id, 'vendasDia', v)} />
                      </div>
                    </div>

                    {/* Seletor modalidade */}
                    <div>
                      <Label>Modalidade de importação</Label>
                      <div className="flex gap-1.5 mt-1">
                        {(['simplificada', 'maritimo', 'aereo'] as Modalidade[]).map(m => {
                          const Icon = MODAL_ICON[m]
                          return (
                            <button
                              key={m}
                              onClick={() => setProduto(prod.id, 'modalidade', m)}
                              className={cn(
                                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all',
                                prod.modalidade === m
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                              )}>
                              <Icon className="w-3 h-3" /> {MODAL_LABEL[m]}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Col 2: KPIs calculados */}
                  <div className="col-span-12 lg:col-span-4">
                    <div className="grid grid-cols-2 gap-3">

                      <div className="bg-slate-50 rounded-xl p-3">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Lead Time Total</p>
                        <p className="text-xl font-black text-slate-900 font-mono mt-1">{calc.leadComBuffer}d</p>
                        <p className="text-[9px] text-slate-400 mt-0.5">{calc.leadTotal}d + {lead.bufferDias}d buffer</p>
                      </div>

                      <div className="bg-slate-50 rounded-xl p-3">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Estoque Dura</p>
                        <p className={cn('text-xl font-black font-mono mt-1',
                          calc.diasAteZerar < calc.leadComBuffer ? 'text-red-600' : 'text-slate-900'
                        )}>{fmtDias(calc.diasAteZerar)}</p>
                        <p className="text-[9px] text-slate-400 mt-0.5">acima do mínimo</p>
                      </div>

                      <div className={cn('rounded-xl p-3', calc.urgencia === 'atrasado' ? 'bg-red-100' : calc.urgencia === 'urgente' ? 'bg-red-50' : 'bg-emerald-50')}>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Pedir em</p>
                        <p className={cn('text-xl font-black font-mono mt-1',
                          calc.diasParaRecompra < 0 ? 'text-red-700' :
                          calc.diasParaRecompra <= 7 ? 'text-red-600' :
                          calc.diasParaRecompra <= 20 ? 'text-amber-600' : 'text-emerald-700'
                        )}>
                          {calc.diasParaRecompra < 0 ? 'AGORA' : `${Math.round(calc.diasParaRecompra)}d`}
                        </p>
                        <p className="text-[9px] text-slate-400 mt-0.5">
                          {calc.diasParaRecompra < 0 ? 'pedido atrasado' : `até ${fmtData(calc.dataRecompra)}`}
                        </p>
                      </div>

                      <div className="bg-slate-50 rounded-xl p-3">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Qtd Sugerida</p>
                        <p className="text-xl font-black text-slate-900 font-mono mt-1">{calc.qtdSugerida.toLocaleString('pt-BR')}</p>
                        <p className="text-[9px] text-slate-400 mt-0.5">cobertura 90 dias</p>
                      </div>
                    </div>
                  </div>

                  {/* Col 3: timeline */}
                  <div className="col-span-12 lg:col-span-3">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-3">Timeline</p>
                    <div className="space-y-2.5">
                      {[
                        { icon: ShoppingCart, label: 'Fazer pedido',   date: calc.dataRecompra,    color: calc.diasParaRecompra < 0 ? 'text-red-600' : 'text-slate-700', bold: true },
                        { icon: MIcon,        label: `Chegada (${MODAL_LABEL[calc.modalidade]})`, date: calc.estoqueNaEntrega, color: 'text-slate-500', bold: false },
                      ].map(({ icon: Icon, label, date, color, bold }) => (
                        <div key={label} className="flex items-start gap-2.5">
                          <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                            <Icon className="w-3 h-3 text-slate-500" />
                          </div>
                          <div>
                            <p className={cn('text-xs', bold ? 'font-black' : 'font-medium', color)}>{label}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{fmtData(date)}</p>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center gap-2 pt-1">
                        <span className={cn('text-[9px] font-black px-2 py-0.5 rounded-full', urg.badge)}>
                          {urg.label}
                        </span>
                        <span className="text-[9px] text-slate-400">Lead {calc.leadComBuffer}d · {calc.vendasDia} un/dia</span>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── RESUMO GERAL ── */}
      <div className="bg-slate-900 rounded-2xl p-5 text-white">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">Resumo do Portfólio</p>
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Produtos',       value: calcs.length,                                                 color: 'text-white',         sub: 'monitorados' },
            { label: 'Pedir Agora',    value: calcs.filter(c => c.urgencia === 'atrasado' || c.urgencia === 'urgente').length, color: 'text-red-400',   sub: 'urgente ou atrasado' },
            { label: 'Atenção',        value: calcs.filter(c => c.urgencia === 'atencao').length,           color: 'text-amber-400',     sub: 'próximas 3 semanas' },
            { label: 'Estoque OK',     value: calcs.filter(c => c.urgencia === 'ok').length,                color: 'text-emerald-400',   sub: 'sem ação necessária' },
          ].map(({ label, value, color, sub }) => (
            <div key={label}>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
              <p className={cn('text-3xl font-black mt-1', color)}>{value}</p>
              <p className="text-[9px] text-slate-500 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
