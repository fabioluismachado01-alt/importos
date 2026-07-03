'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, GripVertical, Calculator, RefreshCw, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/utils'
import { saveDespesaFixa, deleteDespesaFixa } from '@/actions/config'
import { reajustarDespesaFixa } from '@/actions/finance'
import { CATEGORIAS_FIXA } from '@/engines/finance'

interface Template {
  id: string; categoria: string; nome: string; valor_padrao: number
  formula: string | null; recorrente: boolean; ativo: boolean
  amortizacao_mensal: number | null; observacoes: string | null; ordem: number
}
interface Props { despesas: Template[] }

const CATEGORIA_LABEL: Record<string, string> = {
  PRO_LABORE: 'Pró Labore', INSS: 'INSS', CONTABILIDADE: 'Contabilidade',
  ERP: 'ERP Mensal', EMPRESTIMO: 'Empréstimo', ALUGUEL: 'Aluguel',
  PAGINA_ML: 'Página Oficial ML', PREVIDENCIA_PRIVADA: 'Previdência Privada', OUTRA_FIXA: 'Outra',
}

const MESES_NOMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                     'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

export function DespesasFixasView({ despesas: inicial }: Props) {
  const router = useRouter()
  const [despesas, setDespesas] = useState(inicial)
  const [editando, setEditando] = useState<Template | null | 'novo'>(null)
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const totalMensal = despesas.filter(d => d.ativo && !d.formula).reduce((s, d) => s + d.valor_padrao, 0)

  async function handleSaveNovo(data: Partial<Template>) {
    setLoading(true)
    try {
      await saveDespesaFixa({
        categoria: data.categoria ?? 'OUTRA_FIXA',
        nome: data.nome ?? '',
        valor_padrao: data.valor_padrao ?? 0,
        formula: data.formula ?? undefined,
        recorrente: data.recorrente ?? true,
        ativo: data.ativo ?? true,
        amortizacao_mensal: data.amortizacao_mensal ?? undefined,
        observacoes: data.observacoes ?? undefined,
      })
      setEditando(null)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function handleReajuste(params: {
    id: string; nome: string; novoValor: number; ativo: boolean
    observacoes?: string; recorrente: boolean
    propagarMeses: boolean; anoInicio?: number; mesInicio?: number
  }) {
    setLoading(true)
    try {
      const result = await reajustarDespesaFixa(params)
      setEditando(null)
      if (result.mesesAtualizados > 0) {
        setFeedback(`Reajuste aplicado. ${result.mesesAtualizados} mês(es) atualizado(s).`)
        setTimeout(() => setFeedback(null), 4000)
      }
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover esta despesa fixa?')) return
    await deleteDespesaFixa(id)
    setDespesas(d => d.filter(x => x.id !== id))
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {feedback && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-xs font-bold text-emerald-800">{feedback}</p>
        </div>
      )}

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-wide">Despesas Fixas Mensais</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">Lançadas automaticamente ao iniciar cada mês</p>
            </div>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setEditando('novo')}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Nova Despesa Fixa
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">Total mensal estimado (sem previdência):</span>
            <span className="text-sm font-black font-mono text-slate-900">{formatCurrency(totalMensal)}</span>
          </div>

          <div className="divide-y divide-slate-50">
            {despesas.map(d => (
              <div key={d.id} className={`flex items-start gap-3 px-5 py-3.5 group hover:bg-slate-50 transition-colors ${!d.ativo ? 'opacity-50' : ''}`}>
                <GripVertical className="w-4 h-4 text-slate-300 mt-1 shrink-0 cursor-grab" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-slate-800">{d.nome}</span>
                    <Badge className="text-[8px] bg-slate-100 text-slate-500 border-slate-200 h-4 px-1.5">
                      {CATEGORIA_LABEL[d.categoria] ?? d.categoria}
                    </Badge>
                    {!d.ativo && <Badge className="text-[8px] bg-slate-100 text-slate-500 h-4 px-1.5">Inativo</Badge>}
                  </div>
                  {d.formula ? (
                    <p className="text-[10px] text-purple-600 font-mono flex items-center gap-1">
                      <Calculator className="w-3 h-3" /> {d.formula}
                    </p>
                  ) : (
                    <p className="text-xs font-mono font-bold text-slate-600">{formatCurrency(d.valor_padrao)}/mês</p>
                  )}
                  {d.observacoes && <p className="text-[10px] text-slate-400 mt-0.5">{d.observacoes}</p>}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => setEditando(d)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(d.id)} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {despesas.length === 0 && (
              <div className="py-12 text-center text-slate-400">
                <p className="text-sm">Nenhuma despesa fixa cadastrada</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-800">
        <strong>Como funciona:</strong> Ao configurar um novo mês (Faturamento → Configurar mês), você pode ativar
        "Replicar despesas fixas" e todas as despesas ativas serão adicionadas automaticamente.
        Use o <strong>Reajuste</strong> para atualizar o valor e propagar para meses futuros ainda abertos.
      </div>

      {editando !== null && (
        editando === 'novo'
          ? <DespesaFixaNovoModal onClose={() => setEditando(null)} onSave={handleSaveNovo} loading={loading} />
          : <DespesaFixaReajusteModal
              despesa={editando}
              onClose={() => setEditando(null)}
              onSave={handleReajuste}
              loading={loading}
            />
      )}
    </div>
  )
}

// ─── Modal para NOVA despesa fixa ────────────────────────────────────────────

function DespesaFixaNovoModal({ onClose, onSave, loading }: {
  onClose: () => void
  onSave: (data: Partial<Template>) => void
  loading: boolean
}) {
  const [form, setForm] = useState({
    categoria: 'PRO_LABORE', nome: '', valor_padrao: '0',
    formula: '', recorrente: true, ativo: true,
    amortizacao_mensal: '', observacoes: '',
  })
  const isPrevidencia = form.categoria === 'PREVIDENCIA_PRIVADA'

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-base font-black text-slate-900">Nova Despesa Fixa</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoria</Label>
            <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value, nome: CATEGORIA_LABEL[e.target.value] ?? '' }))}
              className="mt-1.5 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white">
              {CATEGORIAS_FIXA.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome / Descrição</Label>
            <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} className="mt-1.5" />
          </div>
          {isPrevidencia ? (
            <div>
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fórmula de Cálculo</Label>
              <Input value={form.formula} onChange={e => setForm(f => ({ ...f, formula: e.target.value }))}
                placeholder="PRO_LABORE*0.20+LUCRO_BRUTO*0.11" className="mt-1.5 font-mono text-xs" />
              <p className="text-[10px] text-slate-400 mt-1">Variáveis: PRO_LABORE · LUCRO_BRUTO · LUCRO_LIQUIDO · RECEITA</p>
            </div>
          ) : (
            <div>
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor Mensal (R$)</Label>
              <Input type="number" step="0.01" value={form.valor_padrao}
                onChange={e => setForm(f => ({ ...f, valor_padrao: e.target.value }))} className="mt-1.5 font-mono" />
            </div>
          )}
          <div>
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Observação</Label>
            <Input value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
              placeholder="Ex: Banco X, contrato 2024..." className="mt-1.5" />
          </div>
          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={loading}>Cancelar</Button>
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={loading}
              onClick={() => onSave({
                categoria: form.categoria, nome: form.nome,
                valor_padrao: parseFloat(form.valor_padrao) || 0,
                formula: isPrevidencia && form.formula ? form.formula : undefined,
                recorrente: form.recorrente, ativo: form.ativo,
                amortizacao_mensal: form.amortizacao_mensal ? parseFloat(form.amortizacao_mensal) : undefined,
                observacoes: form.observacoes || undefined,
              })}>
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Modal para EDITAR / REAJUSTE ────────────────────────────────────────────

function DespesaFixaReajusteModal({ despesa, onClose, onSave, loading }: {
  despesa: Template
  onClose: () => void
  onSave: (p: {
    id: string; nome: string; novoValor: number; ativo: boolean
    observacoes?: string; recorrente: boolean
    propagarMeses: boolean; anoInicio?: number; mesInicio?: number
  }) => void
  loading: boolean
}) {
  const hoje = new Date()
  const [nome, setNome] = useState(despesa.nome)
  const [valor, setValor] = useState(despesa.valor_padrao.toFixed(2))
  const [observacoes, setObservacoes] = useState(despesa.observacoes ?? '')
  const [ativo, setAtivo] = useState(despesa.ativo)
  const [propagar, setPropagar] = useState(false)
  const [mesInicio, setMesInicio] = useState(hoje.getMonth() + 1)
  const [anoInicio, setAnoInicio] = useState(hoje.getFullYear())

  const isPrevidencia = despesa.categoria === 'PREVIDENCIA_PRIVADA'
  const valorAlterado = parseFloat(valor) !== despesa.valor_padrao || nome !== despesa.nome

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-black text-slate-900">Editar Despesa Fixa</h2>
            <p className="text-xs text-slate-400 mt-0.5">{CATEGORIA_LABEL[despesa.categoria] ?? despesa.categoria}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome / Descrição</Label>
            <Input value={nome} onChange={e => setNome(e.target.value)} className="mt-1.5" />
          </div>

          {!isPrevidencia && (
            <div>
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor Mensal (R$)</Label>
              <div className="flex items-center gap-2 mt-1.5">
                <Input type="number" step="0.01" value={valor}
                  onChange={e => setValor(e.target.value)}
                  className="font-mono" />
                {valorAlterado && (
                  <span className="text-[10px] text-amber-600 font-bold shrink-0 whitespace-nowrap">
                    era {formatCurrency(despesa.valor_padrao)}
                  </span>
                )}
              </div>
            </div>
          )}

          <div>
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Observação</Label>
            <Input value={observacoes} onChange={e => setObservacoes(e.target.value)}
              placeholder="Ex: Banco X, contrato 2024..." className="mt-1.5" />
          </div>

          <div onClick={() => setAtivo(v => !v)} className="flex items-center gap-2 cursor-pointer">
            <div className={`w-9 h-5 rounded-full transition-colors ${ativo ? 'bg-emerald-500' : 'bg-slate-300'}`}>
              <div className={`w-4 h-4 bg-white rounded-full m-0.5 transition-transform ${ativo ? 'translate-x-4' : 'translate-x-0'}`} />
            </div>
            <span className="text-xs font-semibold text-slate-600">{ativo ? 'Ativo' : 'Inativo'}</span>
          </div>

          {/* ─── Seção de Reajuste ─────────────────────────────────────── */}
          {!isPrevidencia && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div
                onClick={() => setPropagar(v => !v)}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${propagar ? 'bg-amber-50 border-b border-amber-200' : 'bg-slate-50'}`}
              >
                <div className={`w-9 h-5 rounded-full transition-colors shrink-0 ${propagar ? 'bg-amber-500' : 'bg-slate-300'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full m-0.5 transition-transform ${propagar ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 text-amber-600" />
                    Propagar reajuste para meses abertos
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Atualiza lançamentos já criados nos meses ainda não fechados
                  </p>
                </div>
              </div>

              {propagar && (
                <div className="px-4 py-3 bg-amber-50/50 space-y-2">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-wide">
                    Aplicar a partir de:
                  </p>
                  <div className="flex items-center gap-2">
                    <select value={mesInicio} onChange={e => setMesInicio(Number(e.target.value))}
                      className="h-9 px-2 rounded-lg border border-amber-300 text-sm font-bold bg-white flex-1">
                      {MESES_NOMES.map((n, i) => <option key={i+1} value={i+1}>{n}</option>)}
                    </select>
                    <select value={anoInicio} onChange={e => setAnoInicio(Number(e.target.value))}
                      className="h-9 px-2 rounded-lg border border-amber-300 text-sm font-bold bg-white w-24">
                      {[2024,2025,2026,2027].map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <p className="text-[10px] text-amber-700 bg-amber-100 rounded-lg px-3 py-2 font-medium">
                    Meses <strong>fechados</strong> nunca são alterados. Apenas meses abertos a partir de{' '}
                    <strong>{MESES_NOMES[mesInicio-1]}/{anoInicio}</strong> serão atualizados.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={loading}>Cancelar</Button>
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={loading}
              onClick={() => onSave({
                id: despesa.id,
                nome,
                novoValor: parseFloat(valor) || despesa.valor_padrao,
                ativo,
                observacoes: observacoes || undefined,
                recorrente: despesa.recorrente,
                propagarMeses: propagar,
                anoInicio: propagar ? anoInicio : undefined,
                mesInicio: propagar ? mesInicio : undefined,
              })}>
              {loading ? 'Salvando...' : propagar ? 'Salvar e Reajustar' : 'Salvar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
