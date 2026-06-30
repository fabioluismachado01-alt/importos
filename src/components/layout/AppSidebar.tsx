'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, DollarSign, BarChart3,
  Settings, Wrench, Sigma,
  ChevronDown, ChevronRight,
  PanelLeftClose, PanelLeftOpen, ShoppingBag, X,
} from 'lucide-react'
import { Package } from 'lucide-react'

function ImportOSLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ios-bg" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0A7E96" />
          <stop offset="100%" stopColor="#005B70" />
        </linearGradient>
        <linearGradient id="ios-arrow" x1="12" y1="22" x2="22" y2="8" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="rgba(255,255,255,0.7)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.95)" />
        </linearGradient>
      </defs>
      {/* Background rounded square */}
      <rect width="36" height="36" rx="9" fill="url(#ios-bg)" />
      {/* I letterform — top bar */}
      <rect x="9.5" y="8" width="17" height="3.5" rx="1" fill="white" />
      {/* I letterform — bottom bar */}
      <rect x="9.5" y="24.5" width="17" height="3.5" rx="1" fill="white" />
      {/* I letterform — stem */}
      <rect x="15.5" y="11.5" width="5" height="13" rx="0.5" fill="white" />
      {/* Upward arrow overlaid — swooping curve */}
      <path
        d="M18 7 L13.5 13.5 L16 13.5 L15.8 22.5 L20.2 22.5 L20 13.5 L22.5 13.5 Z"
        fill="url(#ios-arrow)"
        opacity="0.55"
      />
      {/* Arrow tip sparkle */}
      <circle cx="18" cy="7.5" r="1.2" fill="white" opacity="0.9" />
    </svg>
  )
}
import { cn } from '@/lib/utils'
import { useState, useEffect, createContext, useContext } from 'react'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  children?: { href: string; label: string }[]
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  {
    href: '/faturamento',
    label: 'Faturamento',
    icon: DollarSign,
    children: [
      { href: '/faturamento', label: 'Visão Anual' },
      { href: '/faturamento/crescimento', label: 'Crescimento & Meta' },
      { href: '/faturamento/dre', label: 'DRE Anual' },
      { href: '/faturamento/executivo', label: 'Painel Executivo' },
      { href: '/faturamento/importar', label: 'Importar Planilha' },
      { href: '/faturamento/relatorios', label: 'Relatórios Mkt.' },
    ],
  },
  {
    href: '/marketplaces',
    label: 'Marketplaces',
    icon: ShoppingBag,
    children: [
      { href: '/marketplaces', label: 'Contas Conectadas' },
      { href: '/marketplaces/pedidos', label: 'Vendas' },
      { href: '/marketplaces/curva-abc', label: 'Curva ABC' },
    ],
  },
  { href: '/produtos', label: 'Produtos / SKUs', icon: Package },
  { href: '/vendas', label: 'Análise de Vendas', icon: BarChart3 },
  {
    href: '/ferramentas',
    label: 'Ferramentas',
    icon: Wrench,
    children: [
      { href: '/ferramentas/impostos', label: 'Simulador Tributário' },
      { href: '/ferramentas/painel-tributario', label: 'Painel Tributário' },
      { href: '/ferramentas/etiquetas', label: 'Etiquetas' },
      { href: '/ferramentas/difal', label: 'DIFAL Interestadual' },
      { href: '/ferramentas/precificacao', label: 'Calculadora de Precificação' },
      { href: '/ferramentas/landed-cost', label: 'Simulador de Custos' },
      { href: '/ferramentas/rateio', label: 'Rateio de Lote' },
      { href: '/ferramentas/fretes', label: 'Histórico de Fretes' },
      { href: '/ferramentas/recompra', label: 'Ponto de Recompra' },
      { href: '/ferramentas/documentacao', label: 'Documentação' },
    ],
  },
  { href: '/central', label: 'Central de Importação', icon: Sigma },
]

const BOTTOM_ITEMS: NavItem[] = [
  {
    href: '/config',
    label: 'Configurações',
    icon: Settings,
    children: [
      { href: '/config/tributario', label: 'Tributário' },
      { href: '/config/despesas-fixas', label: 'Despesas Fixas' },
      { href: '/config/canais', label: 'Canais de Venda' },
      { href: '/config/socios', label: 'Retirada dos Sócios' },
    ],
  },
]

const STORAGE_KEY = 'importos_sidebar_collapsed'

// Context para controlar abertura mobile
export const SidebarContext = createContext<{
  mobileOpen: boolean
  setMobileOpen: (v: boolean) => void
}>({ mobileOpen: false, setMobileOpen: () => {} })

export function useSidebar() { return useContext(SidebarContext) }

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <SidebarContext.Provider value={{ mobileOpen, setMobileOpen }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function AppSidebar() {
  const pathname = usePathname()
  const { mobileOpen, setMobileOpen } = useSidebar()
  const [collapsed, setCollapsed] = useState(false)
  const [expanded, setExpanded] = useState<string[]>([])
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'true') setCollapsed(true)
    // Expande automaticamente o grupo da rota atual
    const allItems = [...NAV_ITEMS, ...BOTTOM_ITEMS]
    const active = allItems.find(item =>
      item.children?.some(c => pathname.startsWith(c.href))
    )
    if (active) setExpanded([active.href])
  }, [pathname])

  // Fecha sidebar mobile ao mudar de rota
  useEffect(() => { setMobileOpen(false) }, [pathname, setMobileOpen])

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(STORAGE_KEY, String(next))
  }

  function toggleExpand(href: string) {
    if (collapsed) {
      setCollapsed(false)
      localStorage.setItem(STORAGE_KEY, 'false')
      setExpanded(prev => prev.includes(href) ? prev : [...prev, href])
      return
    }
    setExpanded(prev =>
      prev.includes(href) ? prev.filter(h => h !== href) : [...prev, href]
    )
  }

  function isActive(href: string) { return pathname === href }
  function isGroupActive(item: NavItem) {
    if (isActive(item.href)) return true
    return item.children?.some(c => pathname.startsWith(c.href)) ?? false
  }

  function renderItem(item: NavItem, forceFull = false) {
    const Icon = item.icon
    const active = isActive(item.href)
    const groupActive = isGroupActive(item)
    const isCol = collapsed && !forceFull
    const isExpanded = expanded.includes(item.href) && !isCol

    if (item.children) {
      return (
        <div key={item.href}>
          <button
            onClick={() => toggleExpand(item.href)}
            title={isCol ? item.label : undefined}
            className={cn(
              'w-full flex items-center gap-3 rounded-xl text-sm font-semibold transition-all',
              isCol ? 'px-2 py-2.5 justify-center' : 'px-3 py-2.5',
              groupActive
                ? 'text-white shadow-lg'
                : 'text-slate-400 hover:text-white'
            )}
            style={groupActive
              ? { background: '#0A7E96', boxShadow: '0 4px 14px rgba(10,126,150,0.35)' }
              : undefined
            }
            onMouseEnter={e => { if (!groupActive) (e.currentTarget as HTMLElement).style.background = '#162235' }}
            onMouseLeave={e => { if (!groupActive) (e.currentTarget as HTMLElement).style.background = '' }}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {!isCol && (
              <>
                <span className="flex-1 text-left">{item.label}</span>
                {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </>
            )}
          </button>
          {isExpanded && (
            <div className="ml-4 mt-1 space-y-0.5 pl-3" style={{ borderLeft: '1px solid #1E3250' }}>
              {item.children.map(child => {
                const childActive = pathname === child.href || (child.href !== item.href && pathname.startsWith(child.href))
                return (
                  <Link key={child.href} href={child.href}
                    className={cn(
                      'flex items-center px-2 py-1.5 rounded-lg text-xs font-medium transition-all',
                      childActive ? 'font-semibold' : 'text-slate-500 hover:text-slate-300'
                    )}
                    style={childActive ? { color: '#22D3EE', background: 'rgba(10,126,150,0.15)' } : undefined}
                    onMouseEnter={e => { if (!childActive) (e.currentTarget as HTMLElement).style.background = '#162235' }}
                    onMouseLeave={e => { if (!childActive) (e.currentTarget as HTMLElement).style.background = '' }}
                  >
                    {child.label}
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )
    }

    return (
      <Link key={item.href} href={item.href}
        title={isCol ? item.label : undefined}
        className={cn(
          'flex items-center gap-3 rounded-xl text-sm font-semibold transition-all',
          isCol ? 'px-2 py-2.5 justify-center' : 'px-3 py-2.5',
          active ? 'text-white shadow-lg' : 'text-slate-400 hover:text-white'
        )}
        style={active
          ? { background: '#0A7E96', boxShadow: '0 4px 14px rgba(10,126,150,0.35)' }
          : undefined
        }
        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '#162235' }}
        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '' }}
      >
        <Icon className="w-4 h-4 shrink-0" />
        {!isCol && item.label}
      </Link>
    )
  }

  const sidebarContent = (
    <aside
      className={cn(
        'text-white flex flex-col h-full transition-all duration-200',
        'md:shrink-0',
        collapsed ? 'md:w-16' : 'md:w-64',
        'w-72'
      )}
      style={{ background: '#0B1829', borderRight: '1px solid #162235' }}
    >
      {/* Logo */}
      <div className={cn(
        'flex items-center shrink-0',
        collapsed ? 'md:p-3 md:justify-center p-5' : 'p-5'
      )} style={{ borderBottom: '1px solid #162235' }}>
        {collapsed ? (
          <>
            {/* Desktop collapsed */}
            <div className="hidden md:flex shrink-0 drop-shadow-lg">
              <ImportOSLogo size={36} />
            </div>
            {/* Mobile (nunca collapsed) */}
            <div className="flex md:hidden items-center gap-3 w-full">
              <ImportOSLogo size={36} />
              <div className="min-w-0">
                <p className="font-black text-base tracking-tight text-white">ImportOS</p>
                <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#22D3EE' }}>Controle Total</p>
              </div>
              <button onClick={() => setMobileOpen(false)} className="ml-auto text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3 w-full">
            <div className="shrink-0 drop-shadow-lg">
              <ImportOSLogo size={36} />
            </div>
            <div className="min-w-0">
              <p className="font-black text-base tracking-tight text-white">ImportOS</p>
              <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#22D3EE' }}>Controle Total</p>
            </div>
            <button onClick={() => setMobileOpen(false)} className="ml-auto text-slate-400 hover:text-white md:hidden">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* Nav principal */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto overflow-x-hidden">
        {NAV_ITEMS.map(item => renderItem(item, isMobile))}
      </nav>

      {/* Bottom */}
      <div className="p-3 space-y-1" style={{ borderTop: '1px solid #162235' }}>
        {BOTTOM_ITEMS.map(item => renderItem(item, isMobile))}

        {/* Botão colapsar — só desktop */}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
          className={cn(
            'hidden md:flex w-full items-center gap-3 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-300 transition-all mt-2',
            collapsed ? 'px-2 py-2.5 justify-center' : 'px-3 py-2'
          )}
        >
          {collapsed
            ? <PanelLeftOpen className="w-4 h-4" />
            : <><PanelLeftClose className="w-4 h-4 shrink-0" /><span>Recolher</span></>
          }
        </button>
      </div>
    </aside>
  )

  return (
    <>
      {/* Desktop: sidebar normal */}
      <div className="hidden md:flex h-full">
        {sidebarContent}
      </div>

      {/* Mobile: overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer */}
          <div className="relative z-10 h-full">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  )
}
