'use client'

import { Bell, Menu } from 'lucide-react'
import { logoutAction } from '@/actions/auth'
import { useSidebar } from './AppSidebar'

interface AppTopbarProps {
  user: {
    id: string
    email: string
    nome: string
    role: string
  }
}

export function AppTopbar({ user }: AppTopbarProps) {
  const { setMobileOpen } = useSidebar()

  const initials = user.nome
    ? user.nome.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : user.email.slice(0, 2).toUpperCase()

  return (
    <header
      className="h-14 md:h-16 flex items-center justify-between px-4 md:px-6 shrink-0"
      style={{ background: '#FFFFFF', borderBottom: '1px solid #E2E8F0' }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Hamburguer — só mobile */}
        <button
          aria-label="Abrir menu"
          className="md:hidden w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors shrink-0"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Breadcrumb — preenchido por PageTitle via portal */}
        <div id="topbar-breadcrumb" className="min-w-0" />
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        {/* Notificações */}
        <button
          className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors text-slate-400 hover:bg-slate-100"
        >
          <Bell className="w-[18px] h-[18px]" />
        </button>

        <div className="w-px h-5 bg-slate-200" />

        {/* Avatar + Dropdown */}
        <div className="relative group">
          <button className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-100 transition-colors">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-black bg-emerald-500">
              {initials}
            </div>
            <span className="hidden sm:block text-xs font-semibold text-slate-700">
              {user.nome || user.email}
            </span>
          </button>

          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-1 w-48 rounded-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 bg-white border border-slate-200 shadow-lg p-1">
            <div className="px-3 py-2 border-b border-slate-100 mb-1">
              <p className="text-[11px] font-bold text-slate-800 truncate">{user.nome}</p>
              <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="w-full text-left px-3 py-2 text-[12px] font-semibold rounded-lg text-red-500 hover:bg-red-50 transition-colors"
              >
                Sair da conta
              </button>
            </form>
          </div>
        </div>
      </div>
    </header>
  )
}
