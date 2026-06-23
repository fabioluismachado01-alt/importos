'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, GripVertical, Calculator } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/utils'
import { saveDespesaFixa, deleteDespesaFixa } from '@/actions/config'
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

export function DespesasFixasView({ despesas: inicial }: Props) {
  const [despesas, setDespesas] = useState(inicial)
  const [editando, setEditando] = useState<Template | null | 'novo'>(null)
  const [loading, setLoading] = useState(false)

  const totalMensal = despesas.filter(d => d.ativo && !d.formula).reduce((s, d) => s + d.valor_padrao, 0)
  const temPrevidencia = despesas.find(d => d.categoria === 'PREVIDENCIA_PRIVADA' && d.ativo)

  async function handleSave(data: Partial<Template>) {
    setLoading(true)
    try {
      await saveDespesaFixa({
        id: typeof editando === 'object' && editando !== null ? editando.id : undefined,
        categoria: data.categoria ?? 'OUTRA_FIXA',
        nome: data.nome ?? '',
        valor_padrao: data.valor_padrao ?? 0,
        formula: data.formula ?? undefined,
        recorrente: data.recorrente ?? true,
        ativo: data.ativo ?? true,
        amortizacao_mensal: data.amortizacao_mensal ?? undefined,
        observacoes: data.observacoes ?? undefined,
      })
      window.location.reload()
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
          {/* Totais */}
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
                    {d.amortizacao_mensal && d.amortizacao_mensal > 0 && (
                      <Badge className="text-[8px] bg-blue-100 text-blue-700 h-4 px-1.5">
                        -R${d.amortizacao_mensal}/mês
                      </Badge>
                    )}
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

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-800">
        <strong>Como funciona:</strong> Ao configurar um novo mês (Faturamento → Configurar mês), você pode ativar a opção
        "Replicar despesas fixas" e todas as despesas ativas aqui serão adicionadas automaticamente no dia 1 do mês.
        Você pode ajustar valores individualmente em cada mês se necessário.
      </div>

      {/* Modal de edição */}
      {editando !== null && (
        <DespesaFixaModal
          despesa={editando === 'novo' ? null : editando}
          onClose={() => setEditando(null)}
          onSave={handleSave}
          loading={loading}
        />
      )}
    </div>
  )
}

function DespesaFixaModal({ despesa, onClose, onSave, loading }: {
  despesa: Template | null
  onClose: () => void
  onSave: (data: Partial<Template>) => void
  loading: boolean
}) {
  const [form, setForm] = useState({
    categoria: despesa?.categoria ?? 'PRO_LABORE',
    nome: despesa?.nome ?? '',
    valor_padrao: despesa?.valor_padrao?.toFixed(2) ?? '0',
    formula: despesa?.formula ?? '',
    recorrente: despesa?.recorrente ?? true,
    ativo: despesa?.ativo ?? true,
    amortizacao_mensal: despesa?.amortizacao_mensal?.toFixed(2) ?? '',
    observacoes: despesa?.observacoes ?? '',
    tipoValor: despesa?.formula ? 'formula' : 'fixo',
  })

  const isPrevidencia = form.categoria === 'PREVIDENCIA_PRIVADA'

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-base font-black text-slate-900">{despesa ? 'Editar Despesa Fixa' : 'Nova Despesa Fixa'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          {!despesa && (
            <div>
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoria</Label>
              <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value, nome: CATEGORIA_LABEL[e.target.value] ?? '' }))}
                className="mt-1.5 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white">
                {CATEGORIAS_FIXA.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          )}
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

          {form.categoria === 'EMPRESTIMO' && (
            <div>
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Amortização Mensal (R$)</Label>
              <Input type="number" step="0.01" value={form.amortizacao_mensal}
                onChange={e => setForm(f => ({ ...f, amortizacao_mensal: e.target.value }))}
                placeholder="Ex: 15,00 — reduz o valor todo mês" className="mt-1.5 font-mono" />
            </div>
          )}

          <div>
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Observação</Label>
            <Input value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
              placeholder="Ex: Banco X, contrato 2024..." className="mt-1.5" />
          </div>

          <div className="flex items-center justify-between">
            <div onClick={() => setForm(f => ({ ...f, ativo: !f.ativo }))}
              className="flex items-center gap-2 cursor-pointer">
              <div className={`w-9 h-5 rounded-full transition-colors ${form.ativo ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                <div className={`w-4 h-4 bg-white rounded-full m-0.5 transition-transform ${form.ativo ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
              <span className="text-xs font-semibold text-slate-600">{form.ativo ? 'Ativo' : 'Inativo'}</span>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={loading}>Cancelar</Button>
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={loading}
              onClick={() => onSave({
                categoria: form.categoria,
                nome: form.nome,
                valor_padrao: parseFloat(form.valor_padrao) || 0,
                formula: isPrevidencia && form.formula ? form.formula : undefined,
                recorrente: form.recorrente,
                ativo: form.ativo,
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
