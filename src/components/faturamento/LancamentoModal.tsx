'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getMesNome } from '@/lib/utils'
import { addLancamento } from '@/actions/finance'
import { CANAIS_RECEITA, CATEGORIAS_VARIAVEL, CATEGORIAS_FIXA } from '@/engines/finance'

interface Props {
  ano: number
  mes: number
  onClose: () => void
  onSuccess: () => void
}

type TipoLanc = 'RECEITA' | 'DESPESA_VARIAVEL' | 'DESPESA_FIXA'

export function LancamentoModal({ ano, mes, onClose, onSuccess }: Props) {
  const today = new Date()
  const defaultDate = new Date(ano, mes - 1, Math.min(today.getDate(), new Date(ano, mes, 0).getDate()))
    .toISOString().split('T')[0]

  const [tipo, setTipo] = useState<TipoLanc>('RECEITA')
  const [canal, setCanal] = useState('MERCADO_LIVRE')
  const [categoria, setCategoria] = useState('ARMAZENAGEM')
  const [categoriaFixa, setCategoriaFixa] = useState('PRO_LABORE')
  const [valor, setValor] = useState('')
  const [data, setData] = useState(defaultDate)
  const [descricao, setDescricao] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const categorias = tipo === 'DESPESA_VARIAVEL' ? CATEGORIAS_VARIAVEL : CATEGORIAS_FIXA
  const categoriaAtual = tipo === 'DESPESA_VARIAVEL' ? categoria : categoriaFixa

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const v = parseFloat(valor.replace(',', '.'))
    if (isNaN(v) || v <= 0) { setError('Informe um valor válido'); return }
    setLoading(true); setError('')
    try {
      const cat = tipo === 'RECEITA' ? canal : categoriaAtual
      const desc = descricao || (tipo === 'RECEITA'
        ? CANAIS_RECEITA.find(c => c.value === canal)?.label ?? canal
        : categorias.find(c => c.value === categoriaAtual)?.label ?? categoriaAtual)

      await addLancamento(ano, mes, {
        tipo,
        categoria: cat,
        canal: tipo === 'RECEITA' ? canal : undefined,
        descricao: desc,
        valor: v,
        data: new Date(data),
      })
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-black text-slate-900">Novo Lançamento</h2>
            <p className="text-xs text-slate-500 mt-0.5">{getMesNome(mes)} {ano}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Tipo */}
          <div>
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</Label>
            <div className="grid grid-cols-3 gap-2 mt-1.5">
              {(['RECEITA', 'DESPESA_VARIAVEL', 'DESPESA_FIXA'] as TipoLanc[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipo(t)}
                  className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all ${
                    tipo === t
                      ? t === 'RECEITA' ? 'bg-emerald-500 text-white border-emerald-500'
                        : 'bg-slate-800 text-white border-slate-800'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {t === 'RECEITA' ? '+ Receita' : t === 'DESPESA_VARIAVEL' ? '− Variável' : '− Fixa'}
                </button>
              ))}
            </div>
          </div>

          {/* Canal (só Receita) */}
          {tipo === 'RECEITA' && (
            <div>
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Canal *</Label>
              <select
                value={canal}
                onChange={(e) => setCanal(e.target.value)}
                className="mt-1.5 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-emerald-500"
              >
                {CANAIS_RECEITA.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Categoria (despesas) */}
          {tipo !== 'RECEITA' && (
            <div>
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoria *</Label>
              <select
                value={tipo === 'DESPESA_VARIAVEL' ? categoria : categoriaFixa}
                onChange={(e) => tipo === 'DESPESA_VARIAVEL' ? setCategoria(e.target.value) : setCategoriaFixa(e.target.value)}
                className="mt-1.5 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-emerald-500"
              >
                {categorias.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Valor e Data */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor (R$) *</Label>
              <Input
                type="number" step="0.01" min="0.01"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
                className="mt-1.5 font-mono"
                required
              />
            </div>
            <div>
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data *</Label>
              <Input
                type="date" value={data}
                onChange={(e) => setData(e.target.value)}
                className="mt-1.5"
                required
              />
            </div>
          </div>

          {/* Descrição opcional */}
          <div>
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Descrição (opcional)</Label>
            <Input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: NF 4421, Lote Shopee..."
              className="mt-1.5"
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
