'use client'

import { useState } from 'react'
import { Plus, Package, Pencil, Trash2, Search } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/utils'
import { saveProduto, deleteProduto } from '@/actions/produtos'

interface Produto {
  id: string
  nome: string
  sku_interno: string | null
  custo_brl: number | null
  descricao: string | null
  ativo: boolean
  fornecedor: { nome_empresa: string } | null
}

interface Props { produtos: Produto[] }

export function ProdutosView({ produtos: inicial }: Props) {
  const [produtos, setProdutos] = useState(inicial)
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<Produto | null | 'novo'>(null)
  const [loading, setLoading] = useState(false)

  // Pesquisa por nome OU por SKU
  const filtrados = produtos.filter(p => {
    const q = busca.toLowerCase()
    return (
      p.nome.toLowerCase().includes(q) ||
      (p.sku_interno?.toLowerCase().includes(q) ?? false)
    )
  })

  async function handleSave(data: { id?: string; nome: string; sku_interno: string; custo_brl: number; descricao?: string; ncm?: string }) {
    setLoading(true)
    try {
      await saveProduto({
        id: data.id,
        nome: data.nome,
        sku_interno: data.sku_interno,
        custo_brl: data.custo_brl,
        descricao: data.descricao,
        ncm: data.ncm,
      })
      window.location.reload()
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Desativar este produto?')) return
    await deleteProduto(id)
    setProdutos(p => p.filter(x => x.id !== id))
  }

  return (
    <div className="space-y-5">

      {/* Barra de busca e botão */}
      <div className="flex gap-3 items-center">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar por nome ou SKU..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex-1" />
        <Button className="bg-emerald-600 hover:bg-emerald-700 shrink-0" onClick={() => setEditando('novo')}>
          <Plus className="w-4 h-4 mr-1.5" /> Novo Produto
        </Button>
      </div>

      {/* Lista */}
      {filtrados.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-500">
              {busca ? `Nenhum resultado para "${busca}"` : 'Nenhum produto cadastrado'}
            </p>
            {!busca && (
              <>
                <p className="text-xs text-slate-400 mt-1">Cadastre seus produtos com SKU e custo para usar na análise de vendas</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setEditando('novo')}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> Cadastrar primeiro produto
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtrados.map(p => (
            <Card key={p.id} className="border-0 shadow-sm hover:shadow-md transition-all group cursor-default">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
                    <Package className="w-5 h-5 text-slate-500" />
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditando(p)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* SKU em destaque */}
                {p.sku_interno && (
                  <Badge className="text-[10px] bg-slate-100 text-slate-600 border-slate-200 font-mono mb-2">
                    {p.sku_interno}
                  </Badge>
                )}

                <h3 className="text-sm font-bold text-slate-900 leading-tight">{p.nome}</h3>

                {p.descricao && (
                  <p className="text-[11px] text-slate-400 mt-1 leading-snug">{p.descricao}</p>
                )}

                <div className="mt-3 pt-3 border-t border-slate-100">
                  <div className="flex justify-between items-baseline">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Custo unitário</span>
                    <span className="text-sm font-black font-mono text-slate-800">
                      {p.custo_brl != null ? formatCurrency(p.custo_brl) : '—'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      {editando !== null && (
        <ProdutoModal
          produto={editando === 'novo' ? null : editando}
          onClose={() => setEditando(null)}
          onSave={handleSave}
          loading={loading}
        />
      )}
    </div>
  )
}

// ─── Modal simplificado ──────────────────────────────────────────

function ProdutoModal({ produto, onClose, onSave, loading }: {
  produto: Produto | null
  onClose: () => void
  onSave: (data: { id?: string; nome: string; sku_interno: string; custo_brl: number; descricao?: string; ncm?: string }) => void
  loading: boolean
}) {
  const [nome, setNome] = useState(produto?.nome ?? '')
  const [sku, setSku] = useState(produto?.sku_interno ?? '')
  const [custo, setCusto] = useState(produto?.custo_brl?.toFixed(2) ?? '')
  const [obs, setObs] = useState(produto?.descricao ?? '')
  const [ncm, setNcm] = useState((produto as { ncm?: string | null })?.ncm ?? '')
  const [erro, setErro] = useState('')

  function handleSave() {
    if (!nome.trim()) { setErro('Informe o nome do produto'); return }
    if (!sku.trim()) { setErro('Informe o SKU'); return }
    const custoNum = parseFloat(custo.replace(',', '.'))
    if (isNaN(custoNum) || custoNum < 0) { setErro('Informe um custo válido'); return }
    setErro('')
    onSave({
      id: produto?.id,
      nome: nome.trim(),
      sku_interno: sku.trim().toUpperCase(),
      custo_brl: custoNum,
      descricao: obs.trim() || undefined,
      ncm: ncm.trim() || undefined,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-base font-black text-slate-900">
            {produto ? 'Editar Produto' : 'Novo Produto'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">

          {/* Nome */}
          <div>
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Nome do Produto *
            </Label>
            <Input
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Ex: Descascador de Pinhão"
              className="mt-1.5"
              autoFocus
            />
          </div>

          {/* SKU */}
          <div>
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              SKU *
            </Label>
            <Input
              value={sku}
              onChange={e => setSku(e.target.value)}
              placeholder="Ex: INV02"
              className="mt-1.5 font-mono"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Mesmo código usado no relatório do Mercado Livre
            </p>
          </div>

          {/* Custo */}
          <div>
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Custo Unitário (R$) *
            </Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={custo}
              onChange={e => setCusto(e.target.value)}
              placeholder="0,00"
              className="mt-1.5 font-mono"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Custo já nacionalizado em reais (com frete, impostos de importação, etc.)
            </p>
          </div>

          {/* NCM */}
          <div>
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              NCM (opcional)
            </Label>
            <Input
              value={ncm}
              onChange={e => setNcm(e.target.value)}
              placeholder="Ex: 9102.12.00"
              className="mt-1.5 font-mono"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Código NCM — usado automaticamente na geração de documentos (PI/CI)
            </p>
          </div>

          {/* Descrição */}
          <div>
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Descrição do Produto (opcional)
            </Label>
            <Input
              value={obs}
              onChange={e => setObs(e.target.value)}
              placeholder="Ex: DIGITAL SMART WATCH BRACELET"
              className="mt-1.5"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Descrição em inglês para uso na Proforma/Commercial Invoice
            </p>
          </div>

          {erro && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              {erro}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={loading} onClick={handleSave}>
              {loading ? 'Salvando...' : 'Salvar Produto'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
