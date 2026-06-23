'use client'

import { Bell } from 'lucide-react'
import { logoutAction } from '@/actions/auth'

interface AppTopbarProps {
  user: {
    id: string
    email: string
    nome: string
    role: string
  }
}

export function AppTopbar({ user }: AppTopbarProps) {
  const initials = user.nome
    ? user.nome.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : user.email.slice(0, 2).toUpperCase()

  return (
    <header
      className="h-16 flex items-center justify-between px-6 shrink-0"
      style={{
        background: '#FFFFFF',
        borderBottom: '1px solid #E2E8F0',
      }}
    >
      {/* Espaço para breadcrumb (implementado nas pages) */}
      <div id="topbar-breadcrumb" />

      <div className="flex items-center gap-3">
        {/* Notificações */}
        <button
          className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
          style={{ color: '#94A3B8' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#F1F5F9' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <Bell className="w-[18px] h-[18px]" />
        </button>

        {/* Divider */}
        <div className="w-px h-5" style={{ background: '#E2E8F0' }} />

        {/* Avatar + Dropdown */}
        <div className="relative group">
          <button
            className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors"
            onMouseEnter={(e) => { e.currentTarget.style.background = '#F1F5F9' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-black"
              style={{ background: '#10B981' }}
            >
              {initials}
            </div>
            <span className="text-xs font-semibold" style={{ color: '#334155' }}>
              {user.nome || user.email}
            </span>
          </button>

          {/* Dropdown */}
          <div
            className="absolute right-0 top-full mt-1 w-48 rounded-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50"
            style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
              padding: '4px',
            }}
          >
            <div className="px-3 py-2 border-b border-slate-100 mb-1">
              <p className="text-[11px] font-bold text-slate-800 truncate">{user.nome}</p>
              <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="w-full text-left px-3 py-2 text-[12px] font-semibold rounded-lg transition-colors"
                style={{ color: '#EF4444' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#FEF2F2' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
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
