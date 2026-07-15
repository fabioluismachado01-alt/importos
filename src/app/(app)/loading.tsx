export default function Loading() {
  return (
    <div className="flex items-center justify-center h-full min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-7 h-7 border-[3px] border-slate-200 border-t-emerald-500 rounded-full animate-spin" />
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Carregando…</p>
      </div>
    </div>
  )
}
