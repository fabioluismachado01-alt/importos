import Link from 'next/link'
import { CheckCircle2, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { MarketplaceLogo } from '@/components/marketplace/MarketplaceLogo'

export const metadata = { title: 'Análise de Vendas — ImportOS' }

const MARKETPLACES = [
  {
    id: 'ml',
    nome: 'Mercado Livre',
    cor: '#FFD700',
    bg: '#FFFBEA',
    status: 'ativo' as const,
    href: '/vendas/ml',
    descricao: 'Relatório de Vendas (.xlsx)',
    recursos: ['Receita por SKU', 'Tarifas e frete real', 'DAS por produto', 'Promoções compartilhadas', 'Múltiplos preços'],
  },
  {
    id: 'amazon',
    nome: 'Amazon',
    cor: '#FF9900',
    bg: '#FFF8EE',
    status: 'ativo' as const,
    href: '/vendas/amazon',
    descricao: 'Monthly Unified Transaction (.csv)',
    recursos: ['Relatório unificado (vendas + taxas)', 'Taxas FBA separadas', 'Reembolsos e ajustes', 'SKU sem sufixo _FBA'],
  },
  {
    id: 'shopee',
    nome: 'Shopee',
    cor: '#EE4D2D',
    bg: '#FFF3F1',
    status: 'ativo' as const,
    href: '/vendas/shopee',
    descricao: 'Relatório de Vendas + Relatório de Ads (.xlsx / .csv)',
    recursos: ['Receita por SKU', 'Comissão e Taxa de Serviço', 'Cancelamentos e Devoluções', 'Ads Shopee separado', 'CMV do catálogo'],
  },
  {
    id: 'tiktok',
    nome: 'TikTok Shop',
    cor: '#010101',
    bg: '#F5F5F5',
    status: 'ativo' as const,
    href: '/vendas/tiktok',
    descricao: 'Demonstrativo + Pedidos de Afiliados (.xlsx / .csv)',
    recursos: ['Receita e taxas oficiais', 'Afiliados e criadores', 'CMV do catálogo', 'TikTok Ads (em breve)'],
  },
  {
    id: 'magalu',
    nome: 'Magalu',
    cor: '#0086FF',
    bg: '#EEF6FF',
    status: 'ativo' as const,
    href: '/vendas/magalu',
    descricao: 'Relatório de Vendas (.csv) + Ads manual',
    recursos: ['Tecnologia, Intermediação e MDR', 'SKU -M normalizado automático', 'CMV do catálogo', 'Campo Magalu Ads manual'],
  },
]

export default function VendasPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Análise de Vendas</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Importe relatórios de vendas dos marketplaces e veja o resultado real por produto — lucro, margem, DAS e muito mais
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {MARKETPLACES.map(mkt => (
          <div key={mkt.id}>
            {mkt.status === 'ativo' ? (
              <Link href={mkt.href!}>
                <Card className="border-0 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer h-full"
                  style={{ background: mkt.bg, borderTop: `3px solid ${mkt.cor}` }}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <MarketplaceLogo id={mkt.id} size={40} className="shadow-sm" />
                      <span className="flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3" /> Disponível
                      </span>
                    </div>
                    <h3 className="text-base font-black text-slate-900">{mkt.nome}</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5 mb-3">{mkt.descricao}</p>
                    <div className="space-y-1">
                      {mkt.recursos.map(r => (
                        <p key={r} className="text-[11px] text-slate-600 flex items-center gap-1.5">
                          <span className="text-emerald-500">✓</span> {r}
                        </p>
                      ))}
                    </div>
                    <div className="mt-4 text-xs font-black text-emerald-600">
                      Importar relatório →
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ) : (
              <Card className="border-0 shadow-sm h-full opacity-70"
                style={{ borderTop: `3px solid ${mkt.cor}40` }}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <MarketplaceLogo id={mkt.id} size={40} className="opacity-60" />
                    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                      <Clock className="w-3 h-3" /> Em breve
                    </span>
                  </div>
                  <h3 className="text-base font-black text-slate-700">{mkt.nome}</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5 mb-3">{mkt.descricao}</p>
                  <div className="space-y-1">
                    {mkt.recursos.map(r => (
                      <p key={r} className="text-[11px] text-slate-400 flex items-center gap-1.5">
                        <span className="text-slate-300">○</span> {r}
                      </p>
                    ))}
                  </div>
                  <div className="mt-4 text-[11px] text-slate-400 bg-slate-50 rounded-lg p-2.5 border border-slate-200">
                    Para habilitar, envie um relatório de exemplo do <strong>{mkt.nome}</strong> para mapeamento das colunas
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ))}
      </div>

      {/* Como funciona */}
      <Card className="border-0 shadow-sm bg-slate-50">
        <CardContent className="p-5">
          <p className="text-xs font-black text-slate-600 uppercase tracking-wide mb-3">Como funciona</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs text-slate-600">
            {[
              { n: '1', t: 'Exporte do marketplace', d: 'Baixe o relatório de vendas no painel do vendedor (geralmente em Relatórios → Vendas)' },
              { n: '2', t: 'Faça o upload', d: 'Arraste o arquivo aqui. O sistema detecta automaticamente o período e os valores' },
              { n: '3', t: 'Revisão automática', d: 'O sistema cruza com os custos cadastrados e calcula lucro, DAS e margem por produto' },
              { n: '4', t: 'Confirme', d: 'Visualize o preview completo antes de salvar. As análises ficam disponíveis no histórico' },
            ].map(s => (
              <div key={s.n} className="flex gap-2.5">
                <div className="w-6 h-6 bg-emerald-500 text-white rounded-full flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5">
                  {s.n}
                </div>
                <div>
                  <p className="font-bold text-slate-700">{s.t}</p>
                  <p className="text-slate-400 mt-0.5">{s.d}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
