import Link from 'next/link'
import { headers } from 'next/headers'

const TABS = [
  { href: '/config/tributario',    label: 'Tributário' },
  { href: '/config/despesas-fixas',label: 'Despesas Fixas' },
  { href: '/config/canais',        label: 'Canais de Venda' },
  { href: '/config/socios',        label: 'Retirada dos Sócios' },
]

export default async function ConfigLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') ?? ''

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Configurações</h1>
        <p className="text-sm text-slate-500 mt-0.5">Dados fiscais, despesas fixas, canais e distribuição do lucro</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-slate-200">
        {TABS.map(tab => (
          <Link
            key={tab.href}
            href={tab.href}
            className="px-5 py-3 text-sm font-semibold border-b-2 transition-all -mb-px"
            style={{
              borderBottomColor: pathname.includes(tab.href.split('/').pop()!) ? '#10B981' : 'transparent',
              color: pathname.includes(tab.href.split('/').pop()!) ? '#059669' : '#64748B',
            }}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {children}
    </div>
  )
}
