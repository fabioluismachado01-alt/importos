'use client'

import { useState, useEffect, useCallback } from 'react'
import { DollarSign, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

export function DashboardUsd() {
  const [rate, setRate]       = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(false)
  const [time, setTime]       = useState('')

  const fetch_ = useCallback(async () => {
    setLoading(true); setError(false)
    try {
      const res  = await fetch('https://economia.awesomeapi.com.br/last/USD-BRL')
      const data = await res.json()
      setRate(parseFloat(data.USDBRL.bid).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
      setTime(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
    } catch { setError(true) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetch_(); const t = setInterval(fetch_, 60_000); return () => clearInterval(t) }, [fetch_])

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 flex items-center gap-3">
      <div className="w-9 h-9 bg-emerald-500/10 rounded-xl flex items-center justify-center shrink-0">
        <DollarSign className="w-4 h-4 text-emerald-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Dólar Comercial</p>
        {loading
          ? <p className="text-base font-black text-slate-300 font-mono animate-pulse">Carregando…</p>
          : error
            ? <p className="text-sm font-bold text-red-400">Indisponível</p>
            : <p className="text-lg font-black text-slate-900 font-mono">{rate}</p>
        }
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <button onClick={fetch_} className="text-slate-300 hover:text-emerald-500 transition-colors">
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
        </button>
        {time && !loading && <span className="text-[7px] text-slate-300 font-bold">{time}</span>}
      </div>
    </div>
  )
}
