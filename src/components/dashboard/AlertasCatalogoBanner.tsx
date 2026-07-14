import Link from 'next/link'
import { AlertTriangle, X } from 'lucide-react'
import type { AlertasCatalogo } from '@/actions/alertas-catalogo'

export function AlertasCatalogoBanner({ alertas }: { alertas: AlertasCatalogo }) {
  const { skusSemCustoVendidos, ncmDuplicados, skusSemNcm, skusSemCusto } = alertas

  const itens: { texto: string; detalhe?: string }[] = []

  if (skusSemCustoVendidos.length > 0) {
    const nomes = skusSemCustoVendidos.map(s => s.nome).join(', ')
    itens.push({
      texto: `${skusSemCustoVendidos.length} SKU${skusSemCustoVendidos.length > 1 ? 's' : ''} vendido${skusSemCustoVendidos.length > 1 ? 's' : ''} este mês sem custo cadastrado — margem pode estar incorreta`,
      detalhe: nomes,
    })
  }

  if (ncmDuplicados.length > 0) {
    const exemplos = ncmDuplicados.slice(0, 2).map(n => `${n.ncm} (${n.produtos.join(', ')})`).join(' · ')
    itens.push({
      texto: `${ncmDuplicados.length} NCM${ncmDuplicados.length > 1 ? 's' : ''} compartilhado${ncmDuplicados.length > 1 ? 's' : ''} entre produtos diferentes`,
      detalhe: exemplos,
    })
  }

  if (itens.length === 0) return null

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-black text-amber-700 uppercase tracking-widest mb-2">
            Higiene do Catálogo — {itens.length} alerta{itens.length > 1 ? 's' : ''}
          </p>
          <ul className="space-y-1.5">
            {itens.map((item, i) => (
              <li key={i}>
                <p className="text-xs font-bold text-amber-900">{item.texto}</p>
                {item.detalhe && (
                  <p className="text-[10px] text-amber-700 mt-0.5 truncate">{item.detalhe}</p>
                )}
              </li>
            ))}
          </ul>
          <Link
            href="/produtos"
            className="inline-flex items-center gap-1 mt-3 text-[9px] font-black text-amber-700 hover:text-amber-900 uppercase tracking-wider underline underline-offset-2 transition-colors"
          >
            Corrigir no catálogo →
          </Link>
        </div>
      </div>
    </div>
  )
}
