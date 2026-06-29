'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, ShoppingBag } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveCanal, deleteCanal } from '@/actions/config'

interface Canal {
  id: string; workspace_id: string | null; nome: string; slug: string
  comissao_perc: number; taxa_fixa: number; ativo: boolean
}
interface Props { canais: Canal[] }

const CANAL_CORES: Record<string, string> = {
  'mercado-livre': '#FFD700', 'shopee': '#EE4D2D', 'amazon': '#FF9900',
  'tiktok': '#010101', 'magalu': '#0086FF', 'casas-bahia': '#FF6B00',
  'loja-propria': '#10B981',
}

export function CanaisView({ canais: inicial }: Props) {
  const router = useRouter()
  const [editando, setEditando] = useState<Canal | null | 'novo'>(null)
  const [loading, setLoading] = useState(false)

  const ativos = inicial.filter(c => c.ativo)
  const inativos = inicial.filter(c => !c.ativo)

  function simularMargem(comissao: number, taxa: number) {
    const preco = 150
    const custo = 50
    const gastosCanal = (preco * comissao / 100) + taxa
    const margem = ((preco - custo - gastosCanal) / preco) * 100
    return margem
  }

  async function handleSave(data: Omit<Canal, 'id' | 'workspace_id'> & { id?: string }) {
    setLoading(true)
    try {
      await saveCanal(data)
      router.refresh()
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
              const margem = simularMargem(c.comissao_perc, c.taxa_fixa)
              const isSistema = !c.workspace_id
              return (
                <div key={c.id} className="flex items-center gap-4 px-5 py-3.5 group hover:bg-slate-50 transition-colors">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${cor}20` }}>
                    <ShoppingBag className="w-4 h-4" style={{ color: cor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">{c.nome}</span>
                      {isSistema && <Badge className="text-[8px] bg-slate-100 text-slate-500 h-4 px-1.5">Sistema</Badge>}
                    </div>
                    <p className="text-xs text-slate-500 font-mono">
                      Comissão {c.comissao_perc}% · Taxa fixa R${c.taxa_fixa.toFixed(2)}
                    </p>
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
        Canais do sistema têm taxas padrão — edite para usar suas condições reais (ex: conta Platinum ML).
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
  canal: Canal | null; onClose: () => void
  onSave: (data: Omit<Canal, 'id' | 'workspace_id'> & { id?: string }) => void; loading: boolean
}) {
  const [form, setForm] = useState({
    nome: canal?.nome ?? '',
    comissao_perc: canal?.comissao_perc.toFixed(1) ?? '0',
    taxa_fixa: canal?.taxa_fixa.toFixed(2) ?? '0',
    ativo: canal?.ativo ?? true,
  })

  // Simulação ao vivo
  const comissao = parseFloat(form.comissao_perc) || 0
  const taxa = parseFloat(form.taxa_fixa) || 0
  const preco = 150, custo = 50
  const gastosCanal = (preco * comissao / 100) + taxa
  const margem = ((preco - custo - gastosCanal) / preco) * 100

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-base font-black text-slate-900">{canal ? 'Editar Canal' : 'Novo Canal'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome do Canal *</Label>
            <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} className="mt-1.5" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Comissão (%)</Label>
              <Input type="number" step="0.1" value={form.comissao_perc}
                onChange={e => setForm(f => ({ ...f, comissao_perc: e.target.value }))} className="mt-1.5 font-mono" />
            </div>
            <div>
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Taxa Fixa (R$)</Label>
              <Input type="number" step="0.01" value={form.taxa_fixa}
                onChange={e => setForm(f => ({ ...f, taxa_fixa: e.target.value }))} className="mt-1.5 font-mono" />
            </div>
          </div>

          {/* Simulação */}
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-wide mb-2">Simulação (custo R$50 → venda R$150)</p>
            <div className="space-y-1 text-xs font-mono">
              <div className="flex justify-between"><span className="text-slate-500">Comissão</span><span className="text-red-500">-R${(preco * comissao / 100).toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Taxa fixa</span><span className="text-red-500">-R${taxa.toFixed(2)}</span></div>
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
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={loading}
              onClick={() => onSave({ id: canal?.id, nome: form.nome, slug: form.nome.toLowerCase().replace(/\s+/g, '-'), comissao_perc: parseFloat(form.comissao_perc) || 0, taxa_fixa: parseFloat(form.taxa_fixa) || 0, ativo: form.ativo })}>
              {loading ? 'Salvando...' : 'Salvar Canal'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
