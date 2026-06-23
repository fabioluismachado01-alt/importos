'use client'

import { useState, useTransition } from 'react'
import { ShoppingBag, Plus, Trash2, RefreshCw, ExternalLink, CheckCircle2, AlertCircle, ImageIcon, Zap, Clock } from 'lucide-react'
import { getMLConnectUrl, desconectarML, sincronizarMLPedidos, backfillFotosPedidos, configurarAutoSync } from '@/actions/ml'

const INTERVALOS = [
  { value: 1,  label: 'A cada 1h' },
  { value: 3,  label: 'A cada 3h' },
  { value: 6,  label: 'A cada 6h' },
  { value: 12, label: 'A cada 12h' },
  { value: 24, label: 'Uma vez ao dia' },
]

interface Conexao {
  id: string
  nickname: string
  ml_user_id: string
  expires_at: Date
  created_at: Date
  auto_sync_ativo: boolean
  auto_sync_intervalo_horas: number
  last_synced_at: Date | null
  _count: { pedidos: number }
}

interface Props {
  conexoes: Conexao[]
  mensagem?: { tipo: 'sucesso' | 'erro'; texto: string } | null
}

export function MarketplacesView({ conexoes, mensagem }: Props) {
  const [isPending, startTransition] = useTransition()
  const [syncStatus, setSyncStatus] = useState<Record<string, 'idle' | 'syncing' | 'done' | 'error'>>({})
  const [syncMsg, setSyncMsg] = useState<Record<string, string>>({})
  const [backfillStatus, setBackfillStatus] = useState<'idle' | 'running' | 'done'>('idle')
  const [autoSyncState, setAutoSyncState] = useState<Record<string, { ativo: boolean; intervalo: number }>>(
    Object.fromEntries(conexoes.map(c => [c.id, { ativo: c.auto_sync_ativo, intervalo: c.auto_sync_intervalo_horas }]))
  )

  function handleConnect() {
    startTransition(async () => {
      const url = await getMLConnectUrl()
      window.location.href = url
    })
  }

  function handleSync(conexaoId: string) {
    setSyncStatus(s => ({ ...s, [conexaoId]: 'syncing' }))
    startTransition(async () => {
      try {
        const result = await sincronizarMLPedidos(conexaoId, { dias: 30 })
        setSyncStatus(s => ({ ...s, [conexaoId]: 'done' }))
        setSyncMsg(m => ({ ...m, [conexaoId]: `${result.sincronizados} pedidos sincronizados` }))
      } catch {
        setSyncStatus(s => ({ ...s, [conexaoId]: 'error' }))
        setSyncMsg(m => ({ ...m, [conexaoId]: 'Erro na sincronização' }))
      }
    })
  }

  function handleBackfillFotos() {
    setBackfillStatus('running')
    startTransition(async () => {
      try {
        const result = await backfillFotosPedidos()
        setBackfillStatus('done')
        alert(`✅ ${result.atualizados} imagens recuperadas com sucesso!`)
      } catch {
        setBackfillStatus('idle')
        alert('Erro ao recuperar imagens.')
      }
    })
  }

  function handleAutoSyncToggle(conexaoId: string, ativo: boolean) {
    const intervalo = autoSyncState[conexaoId]?.intervalo ?? 6
    setAutoSyncState(s => ({ ...s, [conexaoId]: { ...s[conexaoId], ativo } }))
    startTransition(async () => {
      await configurarAutoSync(conexaoId, ativo, intervalo)
    })
  }

  function handleAutoSyncIntervalo(conexaoId: string, intervalo: number) {
    const ativo = autoSyncState[conexaoId]?.ativo ?? false
    setAutoSyncState(s => ({ ...s, [conexaoId]: { ...s[conexaoId], intervalo } }))
    startTransition(async () => {
      await configurarAutoSync(conexaoId, ativo, intervalo)
    })
  }

  function handleDisconnect(conexaoId: string, nickname: string) {
    if (!confirm(`Desconectar a conta ${nickname}? Os pedidos já sincronizados serão mantidos.`)) return
    startTransition(async () => {
      await desconectarML(conexaoId)
    })
  }

  const tokenExpirado = (expiresAt: Date) => new Date(expiresAt) < new Date()

  function formatLastSync(date: Date | null) {
    if (!date) return 'Nunca sincronizado'
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 1) return 'Agora há pouco'
    if (mins < 60) return `Há ${mins} min`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `Há ${hrs}h`
    return `Há ${Math.floor(hrs / 24)} dias`
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-black text-slate-800 tracking-tight">Marketplaces</h1>
        <p className="text-sm text-slate-500 mt-0.5">Conecte suas contas e configure o sync automático.</p>
      </div>

      {mensagem && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${
          mensagem.tipo === 'sucesso'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {mensagem.tipo === 'sucesso' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {mensagem.texto}
        </div>
      )}

      <div className="space-y-3">
        {conexoes.map(conn => {
          const expirou = tokenExpirado(conn.expires_at)
          const status = syncStatus[conn.id] ?? 'idle'
          const asState = autoSyncState[conn.id] ?? { ativo: conn.auto_sync_ativo, intervalo: conn.auto_sync_intervalo_horas }

          return (
            <div key={conn.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              {/* Cabeçalho da conta */}
              <div className="flex items-center justify-between gap-4 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-400 flex items-center justify-center shrink-0">
                    <ShoppingBag className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800 text-sm">{conn.nickname}</span>
                      {expirou ? (
                        <span className="text-[10px] font-black uppercase tracking-widest bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Token expirado</span>
                      ) : (
                        <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full">Ativo</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                      Mercado Livre · {conn._count.pedidos} pedidos
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatLastSync(conn.last_synced_at)}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleSync(conn.id)}
                    disabled={isPending || status === 'syncing'}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw className={`w-3 h-3 ${status === 'syncing' ? 'animate-spin' : ''}`} />
                    {status === 'syncing' ? 'Sincronizando...' : 'Sincronizar'}
                  </button>
                  <button
                    onClick={handleBackfillFotos}
                    disabled={isPending || backfillStatus === 'running'}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 disabled:opacity-50 transition-colors"
                    title="Recuperar imagens dos anúncios"
                  >
                    <ImageIcon className={`w-3 h-3 ${backfillStatus === 'running' ? 'animate-pulse' : ''}`} />
                  </button>
                  <button
                    onClick={() => handleDisconnect(conn.id, conn.nickname)}
                    disabled={isPending}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Desconectar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Auto-sync panel */}
              <div className={`border-t border-slate-100 px-4 py-3 flex items-center gap-4 ${asState.ativo ? 'bg-emerald-50/60' : 'bg-slate-50/60'}`}>
                <Zap className={`w-4 h-4 shrink-0 ${asState.ativo ? 'text-emerald-500' : 'text-slate-300'}`} />
                <div className="flex-1">
                  <p className="text-xs font-bold text-slate-700">Sync automático</p>
                  <p className="text-[10px] text-slate-400">
                    {asState.ativo
                      ? `Sincronizando ${INTERVALOS.find(i => i.value === asState.intervalo)?.label.toLowerCase()}`
                      : 'Desativado — sincronize manualmente'}
                  </p>
                </div>
                {/* Seletor de intervalo */}
                {asState.ativo && (
                  <select
                    value={asState.intervalo}
                    onChange={e => handleAutoSyncIntervalo(conn.id, Number(e.target.value))}
                    disabled={isPending}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700 font-medium focus:outline-none focus:border-emerald-400"
                  >
                    {INTERVALOS.map(i => (
                      <option key={i.value} value={i.value}>{i.label}</option>
                    ))}
                  </select>
                )}
                {/* Toggle */}
                <button
                  onClick={() => handleAutoSyncToggle(conn.id, !asState.ativo)}
                  disabled={isPending || expirou}
                  title={expirou ? 'Reconecte a conta para usar o auto-sync' : ''}
                  className={`relative w-10 h-5 rounded-full transition-colors shrink-0 disabled:opacity-40 ${asState.ativo ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${asState.ativo ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {syncMsg[conn.id] && (
                <div className={`px-4 py-2 flex items-center gap-1.5 text-xs font-medium border-t border-slate-100 ${
                  status === 'done' ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'
                }`}>
                  {status === 'done' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                  {syncMsg[conn.id]}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Botão conectar nova conta */}
      <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-3">
          <ShoppingBag className="w-6 h-6 text-amber-500" />
        </div>
        <p className="text-sm font-bold text-slate-700 mb-1">Conectar Mercado Livre</p>
        <p className="text-xs text-slate-400 mb-4">
          Você será redirecionado para autorizar o acesso. Seus pedidos serão importados automaticamente.
        </p>
        <button
          onClick={handleConnect}
          disabled={isPending}
          className="inline-flex items-center gap-2 px-4 py-2 bg-amber-400 hover:bg-amber-500 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          {isPending ? 'Redirecionando...' : 'Conectar conta ML'}
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
