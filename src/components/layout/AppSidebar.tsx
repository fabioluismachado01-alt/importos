'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, DollarSign, BarChart3,
  Settings, Wrench, Sigma,
  Package, ChevronDown, ChevronRight,
  PanelLeftClose, PanelLeftOpen, ShoppingBag, X,
} from 'lucide-react'
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
      { href: '/marketplaces/pedidos', label: 'Pedidos' },
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
      { href: '/ferramentas/recompra', label: 'Ponto de Recompra' },
      { href: '/ferramentas/documentacao', label: 'Documentação' },
    ],
  },
  { href: '/central', label: 'Central de Operações', icon: Sigma },
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
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            )}
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
            <div className="ml-4 mt-1 space-y-0.5 border-l border-slate-700 pl-3">
              {item.children.map(child => (
                <Link key={child.href} href={child.href}
                  className={cn(
                    'flex items-center px-2 py-1.5 rounded-lg text-xs font-medium transition-all',
                    pathname === child.href || (child.href !== item.href && pathname.startsWith(child.href))
                      ? 'text-emerald-400 bg-emerald-500/10'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                  )}>
                  {child.label}
                </Link>
              ))}
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
          active
            ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
        )}>
        <Icon className="w-4 h-4 shrink-0" />
        {!isCol && item.label}
      </Link>
    )
  }

  const sidebarContent = (
    <aside
      className={cn(
        'bg-slate-900 text-white flex flex-col h-full border-r border-slate-800 transition-all duration-200',
        // Desktop: respeita collapsed. Mobile: sempre largura completa
        'md:shrink-0',
        collapsed ? 'md:w-16' : 'md:w-64',
        'w-72'
      )}
    >
      {/* Logo */}
      <div className={cn(
        'border-b border-slate-800 flex items-center shrink-0',
        collapsed ? 'md:p-3 md:justify-center p-5' : 'p-5'
      )}>
        {collapsed ? (
          <>
            {/* Desktop collapsed */}
            <div className="hidden md:flex w-9 h-9 bg-emerald-500 rounded-xl items-center justify-center shadow-lg shadow-emerald-500/30">
              <Package className="w-5 h-5 text-white" />
            </div>
            {/* Mobile (nunca collapsed) */}
            <div className="flex md:hidden items-center gap-3 w-full">
              <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30 shrink-0">
                <Package className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="font-black text-base tracking-tight text-white">ImportOS</p>
                <p className="text-[9px] text-emerald-400 font-bold uppercase tracking-widest">Controle Total</p>
              </div>
              <button onClick={() => setMobileOpen(false)} className="ml-auto text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3 w-full">
            <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30 shrink-0">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-black text-base tracking-tight text-white">ImportOS</p>
              <p className="text-[9px] text-emerald-400 font-bold uppercase tracking-widest">Controle Total</p>
            </div>
            {/* Botão fechar no mobile */}
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
      <div className="p-3 border-t border-slate-800 space-y-1">
        {BOTTOM_ITEMS.map(item => renderItem(item, isMobile))}

        {/* Botão colapsar — só desktop */}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
          className={cn(
            'hidden md:flex w-full items-center gap-3 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all mt-2',
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
