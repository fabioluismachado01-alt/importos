'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { sincronizarMLEstoque } from '@/actions/ml'
import type { MLEstoqueItem } from '@/actions/ml'
import type { ml_conexao } from '@prisma/client'

const LOGISTICA_LABEL: Record<string, string> = {
  fulfillment:  'Full (ML)',
  drop_off:     'Agência',
  xd_drop_off:  'Coleta ML',
  self_service: 'Envio próprio',
  not_specified: 'Não especificado',
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  active:   { label: 'Ativo',    cls: 'bg-emerald-500/10 text-emerald-400' },
  paused:   { label: 'Pausado',  cls: 'bg-yellow-500/10 text-yellow-400' },
  closed:   { label: 'Encerrado', cls: 'bg-red-500/10 text-red-400' },
  under_review: { label: 'Em revisão', cls: 'bg-blue-500/10 text-blue-400' },
}

interface Props {
  estoques: MLEstoqueItem[]
  conexoes: ml_conexao[]
}

export function MLEstoqueView({ estoques, conexoes }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [conexaoFiltro, setConexaoFiltro] = useState('')
  const [syncConexaoId, setSyncConexaoId] = useState(conexoes[0]?.id ?? '')
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  function handleSync() {
    if (!syncConexaoId) return
    startTransition(async () => {
      try {
        const { sincronizados } = await sincronizarMLEstoque(syncConexaoId)
        setMsg(`✓ ${sincronizados} anúncios sincronizados`)
        router.refresh()
        setTimeout(() => setMsg(null), 4000)
      } catch (e: any) {
        setMsg(`Erro: ${e.message}`)
      }
    })
  }

  const filtrados = estoques.filter(e => {
    const matchSearch = !search ||
      e.titulo.toLowerCase().includes(search.toLowerCase()) ||
      (e.sku ?? '').toLowerCase().includes(search.toLowerCase()) ||
      e.ml_item_id.toLowerCase().includes(search.toLowerCase())
    const matchCon = !conexaoFiltro || e.conexao_id === conexaoFiltro
    return matchSearch && matchCon
  })

  const totalAtivos   = estoques.filter(e => e.status === 'active').length
  const totalUnidades = estoques.filter(e => e.status === 'active' && e.quantidade >= 0).reduce((s, e) => s + e.quantidade, 0)
  const semEstoque    = estoques.filter(e => e.quantidade === 0 && e.status === 'active').length

  const lastSync = estoques.length > 0
    ? new Date(Math.max(...estoques.map(e => new Date(e.synced_at).getTime())))
    : null

  return (
    <div className="p-6 space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Anúncios Ativos',  value: totalAtivos.toLocaleString('pt-BR') },
          { label: 'Unidades em Estoque', value: totalUnidades.toLocaleString('pt-BR') },
          { label: 'Sem Estoque (Ativos)', value: semEstoque.toLocaleString('pt-BR') },
          { label: 'Última Sync', value: lastSync ? lastSync.toLocaleString('pt-BR') : '—' },
        ].map(k => (
          <div key={k.label} className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <p className="text-xs text-slate-400">{k.label}</p>
            <p className="text-2xl font-bold text-white mt-1">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Barra de ações */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text" placeholder="Buscar título, SKU ou código ML..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-48 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        {conexoes.length > 1 && (
          <select
            value={conexaoFiltro} onChange={e => setConexaoFiltro(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">Todas as contas</option>
            {conexoes.map(c => <option key={c.id} value={c.id}>{c.nickname}</option>)}
          </select>
        )}

        <div className="flex items-center gap-2 ml-auto">
          {conexoes.length > 1 && (
            <select
              value={syncConexaoId} onChange={e => setSyncConexaoId(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
            >
              {conexoes.map(c => <option key={c.id} value={c.id}>{c.nickname}</option>)}
            </select>
          )}
          <button
            onClick={handleSync} disabled={isPending || !syncConexaoId}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {isPending ? 'Sincronizando...' : 'Sincronizar Estoque'}
          </button>
        </div>
      </div>

      {msg && (
        <div className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-2">
          {msg}
        </div>
      )}

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wider">
              <th className="px-3 py-3 text-left">Anúncio</th>
              <th className="px-3 py-3 text-left">SKU</th>
              <th className="px-3 py-3 text-left">Conta</th>
              <th className="px-3 py-3 text-left">Logística</th>
              <th className="px-3 py-3 text-right">Qtde</th>
              <th className="px-3 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-slate-500">
                  {estoques.length === 0 ? 'Nenhum anúncio. Clique em "Sincronizar Estoque" para importar.' : 'Nenhum resultado.'}
                </td>
              </tr>
            ) : filtrados.map(e => {
              const st = STATUS_LABEL[e.status] ?? { label: e.status, cls: 'bg-slate-700 text-slate-400' }
              return (
                <tr key={e.id} className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-3">
                      {e.foto_url ? (
                        <Image src={e.foto_url} alt="" width={36} height={36} className="rounded object-cover" />
                      ) : (
                        <div className="w-9 h-9 rounded flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                          style={{ background: 'linear-gradient(135deg, #FFE600 0%, #FF6A00 100%)' }}>
                          {e.titulo.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="text-white font-medium line-clamp-1 max-w-xs">{e.titulo}</p>
                        <p className="text-slate-500 text-xs">{e.ml_item_id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-400">{e.sku ?? '—'}</td>
                  <td className="px-3 py-2 text-slate-400">{e.nickname}</td>
                  <td className="px-3 py-2 text-slate-400 text-xs">
                    {e.logistica_tipo ? (LOGISTICA_LABEL[e.logistica_tipo] ?? e.logistica_tipo) : '—'}
                  </td>
                  <td className={`px-3 py-2 text-right font-bold ${e.quantidade === 0 ? 'text-red-400' : 'text-slate-400'}`}>
                    {e.quantidade < 0 ? '—' : e.quantidade}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${st.cls}`}>{st.label}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {filtrados.length > 0 && (
        <p className="text-xs text-slate-500">{filtrados.length} de {estoques.length} anúncios</p>
      )}
    </div>
  )
}
