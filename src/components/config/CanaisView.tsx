'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, ShoppingBag, Lock, Pen } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveCanal, deleteCanal } from '@/actions/config'
import type { CanalComFaixas, CanalFaixa } from '@/actions/config'

interface Props { canais: CanalComFaixas[] }

const CANAL_CORES: Record<string, string> = {
  'mercado-livre': '#FFD700', 'shopee': '#EE4D2D', 'amazon': '#FF9900',
  'tiktok': '#010101', 'tiktok-shop': '#010101', 'magalu': '#0086FF',
  'casas-bahia': '#FF6B00', 'loja-propria': '#10B981', 'presencial': '#10B981',
  'presencial-proprio': '#10B981',
}

// Canais que suportam toggle AUTO/MANUAL
const SLUGS_COM_MODO = new Set(['mercado-livre', 'amazon', 'shopee', 'magalu', 'tiktok-shop'])

type FaixaForm = { preco_min: string; preco_max: string; comissao_perc: string; taxa_fixa: string }

function getFeeForPrice(faixas: CanalFaixa[], preco: number): { comissao: number; taxa: number } {
  const faixa = faixas.find(f => preco >= f.preco_min && (f.preco_max === null || preco <= f.preco_max))
  return faixa ? { comissao: faixa.comissao_perc, taxa: faixa.taxa_fixa } : { comissao: 0, taxa: 0 }
}

function simularMargem(faixas: CanalFaixa[], preco = 150, custo = 50) {
  const { comissao, taxa } = getFeeForPrice(faixas, preco)
  return ((preco - custo - (preco * comissao / 100) - taxa) / preco) * 100
}

function validarFaixas(faixas: FaixaForm[]): string | null {
  if (faixas.length === 0) return 'Adicione pelo menos uma faixa.'
  const parsed = faixas.map((f, i) => ({
    min: parseFloat(f.preco_min),
    max: f.preco_max.trim() ? parseFloat(f.preco_max) : null,
    idx: i,
  }))
  for (let i = 0; i < parsed.length - 1; i++) {
    const atual = parsed[i]
    const prox = parsed[i + 1]
    if (atual.max === null) return `Faixa ${i + 1}: Preço Máx não pode ficar vazio quando há faixas seguintes.`
    const gap = Math.abs((atual.max + 0.01) - prox.min)
    if (gap > 0.011) return `Lacuna entre faixa ${i + 1} (até R$${atual.max.toFixed(2)}) e faixa ${i + 2} (a partir de R$${prox.min.toFixed(2)}). Devem ser contíguas.`
    if (atual.max >= prox.min) return `Sobreposição entre faixa ${i + 1} e faixa ${i + 2}. Revise os limites.`
  }
  return null
}

export function CanaisView({ canais: inicial }: Props) {
  const router = useRouter()
  const [editando, setEditando] = useState<CanalComFaixas | null | 'novo'>(null)
  const [loading, setLoading] = useState(false)

  const ativos = inicial.filter(c => c.ativo)
  const inativos = inicial.filter(c => !c.ativo)

  async function handleSave(data: {
    id?: string; nome: string; slug?: string; ativo: boolean; modo?: string
    faixas: Array<{ preco_min: number; preco_max?: number | null; comissao_perc: number; taxa_fixa: number; ordem: number }>
  }) {
    setLoading(true)
    try {
      await saveCanal(data)
      router.refresh()
      setEditando(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-wide">Canais de Venda</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">Configure as taxas dos marketplaces que você utiliza</p>
            </div>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setEditando('novo')}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Novo Canal
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-50">
            {ativos.map(c => {
              const cor = CANAL_CORES[c.slug] ?? '#64748B'
              const margem = simularMargem(c.faixas)
              const isSistema = !c.workspace_id
              const temFaixas = c.faixas.length > 1
              const temModo = SLUGS_COM_MODO.has(c.slug)
              const isAuto = c.modo === 'AUTO'
              return (
                <div key={c.id} className="flex items-center gap-4 px-5 py-3.5 group hover:bg-slate-50 transition-colors">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${cor}20` }}>
                    <ShoppingBag className="w-4 h-4" style={{ color: cor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-800">{c.nome}</span>
                      {isSistema && <Badge className="text-[8px] bg-slate-100 text-slate-500 h-4 px-1.5">Sistema</Badge>}
                      {temFaixas && <Badge className="text-[8px] bg-blue-100 text-blue-600 h-4 px-1.5">{c.faixas.length} faixas</Badge>}
                      {temModo && (
                        <Badge className={`text-[8px] h-4 px-1.5 ${isAuto ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-700'}`}>
                          {isAuto ? '🔒 AUTO' : '✏️ MANUAL'}
                        </Badge>
                      )}
                    </div>
                    {temFaixas ? (
                      <p className="text-xs text-slate-500 font-mono truncate">
                        {c.faixas.map(f => {
                          const max = f.preco_max != null ? `R$${f.preco_max.toFixed(2)}` : '∞'
                          return `R$${f.preco_min.toFixed(2)}–${max}: ${f.comissao_perc}%+R$${f.taxa_fixa.toFixed(2)}`
                        }).join(' · ')}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-500 font-mono">
                        Comissão {c.faixas[0]?.comissao_perc ?? 0}% · Taxa fixa R${(c.faixas[0]?.taxa_fixa ?? 0).toFixed(2)}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] text-slate-400">Margem est.</p>
                    <p className={`text-xs font-black font-mono ${margem >= 30 ? 'text-emerald-600' : margem >= 15 ? 'text-amber-600' : 'text-red-500'}`}>
                      {margem.toFixed(1)}%
                    </p>
                    <p className="text-[9px] text-slate-400">a R$150/custo R$50</p>
                  </div>
                  <button onClick={() => setEditando(c)}
                    className="p-1.5 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
          {inativos.length > 0 && (
            <div className="px-5 py-2 border-t border-slate-100">
              <p className="text-[10px] text-slate-400">{inativos.length} canal(is) inativo(s) — edite para reativar</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-800">
        <strong>Margem estimada</strong> calculada para produto com custo R$50 e preço de venda R$150.
        Canais com modo <strong>AUTO</strong> têm taxas gerenciadas — alterne para <strong>MANUAL</strong> para editar livremente.
      </div>

      {editando !== null && (
        <CanalModal
          canal={editando === 'novo' ? null : editando}
          onClose={() => setEditando(null)}
          onSave={handleSave}
          loading={loading}
        />
      )}
    </div>
  )
}

function CanalModal({ canal, onClose, onSave, loading }: {
  canal: CanalComFaixas | null
  onClose: () => void
  onSave: (data: {
    id?: string; nome: string; slug?: string; ativo: boolean; modo?: string
    faixas: Array<{ preco_min: number; preco_max?: number | null; comissao_perc: number; taxa_fixa: number; ordem: number }>
  }) => void
  loading: boolean
}) {
  const [nome, setNome] = useState(canal?.nome ?? '')
  const [ativo, setAtivo] = useState(canal?.ativo ?? true)
  const [modo, setModo] = useState(canal?.modo ?? 'AUTO')
  const [erro, setErro] = useState<string | null>(null)

  const temModo = canal ? SLUGS_COM_MODO.has(canal.slug) : false
  const isAuto = modo === 'AUTO'
  const faixasReadonly = temModo && isAuto

  const initialFaixas: FaixaForm[] = canal?.faixas.length
    ? canal.faixas.map(f => ({
        preco_min: f.preco_min.toFixed(2),
        preco_max: f.preco_max != null ? f.preco_max.toFixed(2) : '',
        comissao_perc: f.comissao_perc.toFixed(1),
        taxa_fixa: f.taxa_fixa.toFixed(2),
      }))
    : [{ preco_min: '0.01', preco_max: '', comissao_perc: '0.0', taxa_fixa: '0.00' }]

  const [faixas, setFaixas] = useState<FaixaForm[]>(initialFaixas)

  function addFaixa() {
    setFaixas(f => [...f, { preco_min: '0.01', preco_max: '', comissao_perc: '0.0', taxa_fixa: '0.00' }])
  }

  function removeFaixa(i: number) {
    setFaixas(f => f.filter((_, idx) => idx !== i))
  }

  function updateFaixa(i: number, field: keyof FaixaForm, val: string) {
    setFaixas(f => f.map((fx, idx) => idx === i ? { ...fx, [field]: val } : fx))
    setErro(null)
  }

  const parsedFaixas: CanalFaixa[] = faixas.map((f, i) => ({
    id: `tmp-${i}`, canal_id: '', ordem: i,
    preco_min: parseFloat(f.preco_min) || 0,
    preco_max: f.preco_max.trim() ? parseFloat(f.preco_max) : null,
    comissao_perc: parseFloat(f.comissao_perc) || 0,
    taxa_fixa: parseFloat(f.taxa_fixa) || 0,
  }))

  const demoPreco = 150
  const demoCusto = 50
  const { comissao: demoComissao, taxa: demoTaxa } = getFeeForPrice(parsedFaixas, demoPreco)
  const margem = ((demoPreco - demoCusto - (demoPreco * demoComissao / 100) - demoTaxa) / demoPreco) * 100

  function handleSave() {
    if (!nome.trim()) return
    if (!faixasReadonly) {
      const err = validarFaixas(faixas)
      if (err) { setErro(err); return }
    }
    onSave({
      id: canal?.id,
      nome: nome.trim(),
      slug: canal?.slug,
      ativo,
      modo: temModo ? modo : undefined,
      faixas: parsedFaixas.map((f, i) => ({ preco_min: f.preco_min, preco_max: f.preco_max, comissao_perc: f.comissao_perc, taxa_fixa: f.taxa_fixa, ordem: i })),
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl my-4">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-base font-black text-slate-900">{canal ? 'Editar Canal' : 'Novo Canal'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-5">
          {/* Nome */}
          <div>
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome do Canal *</Label>
            <Input value={nome} onChange={e => setNome(e.target.value)} className="mt-1.5" />
          </div>

          {/* Toggle AUTO/MANUAL */}
          {temModo && (
            <div>
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Modo de Taxas</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setModo('AUTO')}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black border transition-all ${modo === 'AUTO' ? 'bg-violet-100 border-violet-300 text-violet-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'}`}
                >
                  <Lock className="w-3 h-3" /> AUTO
                </button>
                <button
                  type="button"
                  onClick={() => setModo('MANUAL')}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black border transition-all ${modo === 'MANUAL' ? 'bg-amber-100 border-amber-300 text-amber-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'}`}
                >
                  <Pen className="w-3 h-3" /> MANUAL
                </button>
              </div>
              {isAuto ? (
                <p className="text-[10px] text-violet-600 mt-1.5">Taxas gerenciadas automaticamente — faixas em modo leitura.</p>
              ) : (
                <p className="text-[10px] text-amber-600 mt-1.5">Modo manual: você edita as faixas livremente.</p>
              )}
            </div>
          )}

          {/* Faixas de preço */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Faixas de Preço</Label>
              {!faixasReadonly && (
                <button onClick={addFaixa} className="text-[10px] text-emerald-600 font-black hover:text-emerald-700 flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Adicionar faixa
                </button>
              )}
            </div>

            {faixasReadonly && (
              <div className="bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 mb-2 text-[10px] text-violet-700">
                Faixas em modo leitura (AUTO). Alterne para MANUAL para editar.
              </div>
            )}

            <div className="space-y-2">
              {faixas.map((f, i) => (
                <div key={i} className={`grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-end rounded-xl p-3 ${faixasReadonly ? 'bg-violet-50/50' : 'bg-slate-50'}`}>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Preço Mín (R$)</p>
                    <Input type="number" step="0.01" value={f.preco_min}
                      readOnly={faixasReadonly}
                      onChange={e => updateFaixa(i, 'preco_min', e.target.value)}
                      className={`h-8 text-xs font-mono ${faixasReadonly ? 'opacity-60 cursor-not-allowed' : ''}`} />
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Preço Máx (R$)</p>
                    <Input type="number" step="0.01" value={f.preco_max}
                      placeholder="sem limite"
                      readOnly={faixasReadonly}
                      onChange={e => updateFaixa(i, 'preco_max', e.target.value)}
                      className={`h-8 text-xs font-mono placeholder:text-slate-300 ${faixasReadonly ? 'opacity-60 cursor-not-allowed' : ''}`} />
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Comissão (%)</p>
                    <Input type="number" step="0.1" value={f.comissao_perc}
                      readOnly={faixasReadonly}
                      onChange={e => updateFaixa(i, 'comissao_perc', e.target.value)}
                      className={`h-8 text-xs font-mono ${faixasReadonly ? 'opacity-60 cursor-not-allowed' : ''}`} />
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Taxa Fixa (R$)</p>
                    <Input type="number" step="0.01" value={f.taxa_fixa}
                      readOnly={faixasReadonly}
                      onChange={e => updateFaixa(i, 'taxa_fixa', e.target.value)}
                      className={`h-8 text-xs font-mono ${faixasReadonly ? 'opacity-60 cursor-not-allowed' : ''}`} />
                  </div>
                  <button onClick={() => removeFaixa(i)}
                    disabled={faixasReadonly || faixas.length === 1}
                    className="mb-0.5 p-1.5 text-red-400 hover:text-red-600 disabled:opacity-20 disabled:cursor-not-allowed rounded">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {!faixasReadonly && (
              <p className="text-[10px] text-slate-400 mt-2">
                Deixe "Preço Máx" vazio na última faixa para indicar sem limite superior. As faixas devem ser contíguas (sem lacunas ou sobreposições).
              </p>
            )}

            {erro && (
              <div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[10px] text-red-700 font-semibold">
                {erro}
              </div>
            )}
          </div>

          {/* Simulação ao vivo */}
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-wide mb-2">Simulação (custo R$50 → venda R$150)</p>
            <p className="text-[9px] text-slate-400 mb-2">Faixa aplicada: {demoComissao}% + R${demoTaxa.toFixed(2)}</p>
            <div className="space-y-1 text-xs font-mono">
              <div className="flex justify-between"><span className="text-slate-500">Comissão</span><span className="text-red-500">-R${(demoPreco * demoComissao / 100).toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Taxa fixa</span><span className="text-red-500">-R${demoTaxa.toFixed(2)}</span></div>
              <div className="flex justify-between border-t border-slate-200 pt-1 mt-1">
                <span className="font-black text-slate-700">Margem</span>
                <span className={`font-black ${margem >= 30 ? 'text-emerald-600' : margem >= 15 ? 'text-amber-600' : 'text-red-500'}`}>
                  {margem.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={loading}>Cancelar</Button>
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={loading || !nome.trim()}
              onClick={handleSave}>
              {loading ? 'Salvando...' : 'Salvar Canal'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
