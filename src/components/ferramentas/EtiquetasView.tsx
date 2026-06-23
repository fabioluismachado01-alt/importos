'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  Printer, Download, Search, Plus, Minus, RefreshCw,
  CheckSquare, Square, Settings, Tag, Package, AlertCircle, Save,
} from 'lucide-react'
import type { ProdutoEtiqueta } from '@/actions/etiquetas'
import { salvarEAN, salvarPrecoVenda, gerarEANParaProduto } from '@/actions/etiquetas'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ItemEtiqueta {
  produto: ProdutoEtiqueta
  qtd: number
  ean: string
  preco: string
}

type TamanhoEtiqueta = '58x40' | '100x50' | 'A4_2col' | 'A4_3col'
type CamposVisiveis = {
  nome: boolean; sku: boolean; ean: boolean; ncm: boolean; preco: boolean
}

const TAMANHOS: Record<TamanhoEtiqueta, { label: string; w: number; h: number; desc: string }> = {
  '58x40':   { label: '58×40 mm', w: 219, h: 151, desc: 'Impressora térmica padrão' },
  '100x50':  { label: '100×50 mm', w: 378, h: 189, desc: 'Etiqueta grande' },
  'A4_2col': { label: 'A4 — 2 colunas', w: 380, h: 180, desc: '~10 por folha' },
  'A4_3col': { label: 'A4 — 3 colunas', w: 248, h: 150, desc: '~15 por folha' },
}

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// ─── Componente de Barcode SVG usando JsBarcode ───────────────────────────────

function Barcode({ value, height = 50, small = false }: { value: string; height?: number; small?: boolean }) {
  const ref = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!ref.current || !value) return
    import('jsbarcode').then(({ default: JsBarcode }) => {
      try {
        JsBarcode(ref.current, value, {
          format: /^\d{13}$/.test(value) ? 'EAN13' : 'CODE128',
          width: small ? 1.2 : 1.5,
          height,
          displayValue: true,
          fontSize: small ? 9 : 11,
          margin: 2,
          background: 'transparent',
        })
      } catch { /* EAN inválido */ }
    })
  }, [value, height, small])

  if (!value) return (
    <div className="flex items-center justify-center h-12 text-slate-300 text-xs border border-dashed border-slate-200 rounded">
      sem código
    </div>
  )

  return <svg ref={ref} className="w-full" />
}

// ─── Preview de uma única etiqueta ───────────────────────────────────────────

function EtiquetaPreview({
  item, tamanho, campos, empresaNome,
}: {
  item: ItemEtiqueta; tamanho: TamanhoEtiqueta; campos: CamposVisiveis; empresaNome: string
}) {
  const t = TAMANHOS[tamanho]
  const isSmall = tamanho === '58x40' || tamanho === 'A4_3col'

  return (
    <div
      className="bg-white border border-slate-300 rounded shadow-sm overflow-hidden flex flex-col"
      style={{ width: t.w, minHeight: t.h, maxHeight: t.h * 1.1 }}
    >
      {/* Header empresa */}
      <div className="bg-slate-800 px-2 py-0.5 shrink-0">
        <p className={cn('text-white font-bold truncate text-center', isSmall ? 'text-[8px]' : 'text-[10px]')}>
          {empresaNome}
        </p>
      </div>

      <div className={cn('flex flex-col flex-1 px-2', isSmall ? 'py-1 gap-0.5' : 'py-2 gap-1')}>
        {/* Nome */}
        {campos.nome && (
          <p className={cn('font-semibold text-slate-800 leading-tight', isSmall ? 'text-[9px] line-clamp-2' : 'text-[11px] line-clamp-2')}>
            {item.produto.nome}
          </p>
        )}

        {/* SKU + NCM */}
        <div className="flex gap-2 flex-wrap">
          {campos.sku && item.produto.sku_interno && (
            <span className={cn('text-slate-500 font-mono', isSmall ? 'text-[7px]' : 'text-[9px]')}>
              SKU: {item.produto.sku_interno}
            </span>
          )}
          {campos.ncm && item.produto.ncm && (
            <span className={cn('text-slate-500 font-mono', isSmall ? 'text-[7px]' : 'text-[9px]')}>
              NCM: {item.produto.ncm}
            </span>
          )}
        </div>

        {/* Preço */}
        {campos.preco && item.preco && (
          <p className={cn('font-black text-emerald-700', isSmall ? 'text-[11px]' : 'text-[14px]')}>
            {item.preco.startsWith('R$') ? item.preco : `R$ ${item.preco}`}
          </p>
        )}

        {/* Barcode */}
        {campos.ean && item.ean && (
          <div className="flex-1 flex items-end">
            <Barcode value={item.ean} height={isSmall ? 32 : 42} small={isSmall} />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── View principal ───────────────────────────────────────────────────────────

export function EtiquetasView({
  produtos, empresaNome,
}: {
  produtos: ProdutoEtiqueta[]
  empresaNome: string
}) {
  const [busca, setBusca] = useState('')
  const [selecionados, setSelecionados] = useState<Map<string, ItemEtiqueta>>(new Map())
  const [tamanho, setTamanho] = useState<TamanhoEtiqueta>('58x40')
  const [campos, setCampos] = useState<CamposVisiveis>({
    nome: true, sku: true, ean: true, ncm: false, preco: true,
  })
  const [aba, setAba] = useState<'selecao' | 'preview' | 'config'>('selecao')
  const [salvando, setSalvando] = useState<string | null>(null)
  const printRef = useRef<HTMLDivElement>(null)

  const produtosFiltrados = produtos.filter(p =>
    p.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (p.sku_interno ?? '').toLowerCase().includes(busca.toLowerCase())
  )

  function toggleProduto(p: ProdutoEtiqueta) {
    setSelecionados(prev => {
      const next = new Map(prev)
      if (next.has(p.id)) {
        next.delete(p.id)
      } else {
        next.set(p.id, {
          produto: p,
          qtd: 1,
          ean: p.ean ?? '',
          preco: p.preco_venda ? BRL(p.preco_venda) : p.custo_brl ? BRL(p.custo_brl) : '',
        })
      }
      return next
    })
  }

  function setQtd(id: string, delta: number) {
    setSelecionados(prev => {
      const next = new Map(prev)
      const item = next.get(id)
      if (item) next.set(id, { ...item, qtd: Math.max(1, item.qtd + delta) })
      return next
    })
  }

  function setEan(id: string, ean: string) {
    setSelecionados(prev => {
      const next = new Map(prev)
      const item = next.get(id)
      if (item) next.set(id, { ...item, ean })
      return next
    })
  }

  function setPreco(id: string, preco: string) {
    setSelecionados(prev => {
      const next = new Map(prev)
      const item = next.get(id)
      if (item) next.set(id, { ...item, preco })
      return next
    })
  }

  async function handleGerarEAN(produtoId: string) {
    setSalvando(produtoId)
    const ean = await gerarEANParaProduto(produtoId)
    setEan(produtoId, ean)
    setSalvando(null)
  }

  async function handleSalvarEAN(produtoId: string, ean: string) {
    setSalvando(produtoId + '_save')
    await salvarEAN(produtoId, ean)
    setSalvando(null)
  }

  function handleImprimir() {
    window.print()
  }

  async function handlePDF() {
    if (!printRef.current) return
    const { default: html2canvas } = await import('html2canvas')
    const { jsPDF } = await import('jspdf')

    const itensList = [...selecionados.values()].flatMap(i => Array(i.qtd).fill(i))
    if (itensList.length === 0) return

    // Cria PDF com tamanho da etiqueta
    const t = TAMANHOS[tamanho]
    const mmW = t.w * 0.2646  // px to mm (96dpi)
    const mmH = t.h * 0.2646

    const isA4 = tamanho.startsWith('A4')
    const pdf = new jsPDF({
      orientation: isA4 ? 'portrait' : 'portrait',
      unit: 'mm',
      format: isA4 ? 'a4' : [mmW, mmH],
    })

    const cols = tamanho === 'A4_3col' ? 3 : tamanho === 'A4_2col' ? 2 : 1
    const rows = Math.ceil(itensList.length / cols)

    const canvas = await html2canvas(printRef.current, { scale: 3, useCORS: true, backgroundColor: null })
    const imgData = canvas.toDataURL('image/png')

    if (isA4) {
      pdf.addImage(imgData, 'PNG', 0, 0, 210, Math.min(297, rows * mmH * cols))
    } else {
      itensList.forEach((_, i) => {
        if (i > 0) pdf.addPage([mmW, mmH])
        pdf.addImage(imgData, 'PNG', 0, 0, mmW, mmH)
      })
    }

    pdf.save(`etiquetas-${new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')}.pdf`)
  }

  const itensSelecionados = [...selecionados.values()]
  const totalEtiquetas = itensSelecionados.reduce((acc, i) => acc + i.qtd, 0)
  const colunas = tamanho === 'A4_3col' ? 3 : tamanho === 'A4_2col' ? 2 : 1

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Etiquetas</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {totalEtiquetas > 0
              ? `${itensSelecionados.length} produto(s) · ${totalEtiquetas} etiqueta(s) a imprimir`
              : 'Selecione produtos do catálogo para gerar etiquetas'}
          </p>
        </div>
        {totalEtiquetas > 0 && (
          <div className="flex gap-2">
            <button
              onClick={handleImprimir}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 transition-colors"
            >
              <Printer className="w-4 h-4" /> Imprimir
            </button>
            <button
              onClick={handlePDF}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors"
            >
              <Download className="w-4 h-4" /> Salvar PDF
            </button>
          </div>
        )}
      </div>

      {/* Abas */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {[
          { key: 'selecao', label: 'Produtos', icon: Package },
          { key: 'config',  label: 'Configurar', icon: Settings },
          { key: 'preview', label: `Preview (${totalEtiquetas})`, icon: Tag },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setAba(key as typeof aba)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
              aba === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            )}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* ─── Aba Seleção ─── */}
      {aba === 'selecao' && (
        <div className="space-y-4">
          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar produto ou SKU..."
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {produtos.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum produto no catálogo ainda.</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {produtosFiltrados.map(p => {
              const sel = selecionados.get(p.id)
              const isSel = !!sel
              return (
                <div
                  key={p.id}
                  className={cn(
                    'border rounded-xl p-4 cursor-pointer transition-all',
                    isSel
                      ? 'border-emerald-400 bg-emerald-50 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  )}
                  onClick={() => toggleProduto(p)}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {isSel
                        ? <CheckSquare className="w-5 h-5 text-emerald-600" />
                        : <Square className="w-5 h-5 text-slate-300" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 leading-tight line-clamp-2">{p.nome}</p>
                      <div className="flex gap-3 mt-1 text-xs text-slate-500">
                        {p.sku_interno && <span>SKU: {p.sku_interno}</span>}
                        {p.ncm && <span>NCM: {p.ncm}</span>}
                      </div>
                      {p.ean
                        ? <span className="text-[10px] text-emerald-600 font-mono mt-1 block">EAN: {p.ean}</span>
                        : <span className="text-[10px] text-amber-500 mt-1 block flex items-center gap-1"><AlertCircle className="w-3 h-3" /> sem EAN</span>
                      }
                    </div>
                  </div>

                  {isSel && (
                    <div className="mt-3 space-y-2 pt-3 border-t border-emerald-200" onClick={e => e.stopPropagation()}>
                      {/* Quantidade */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 w-16 shrink-0">Quantidade</span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setQtd(p.id, -1)} className="w-6 h-6 rounded-lg bg-slate-200 hover:bg-slate-300 flex items-center justify-center">
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-8 text-center text-sm font-bold">{sel.qtd}</span>
                          <button onClick={() => setQtd(p.id, +1)} className="w-6 h-6 rounded-lg bg-slate-200 hover:bg-slate-300 flex items-center justify-center">
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* EAN */}
                      {campos.ean && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-500 w-16 shrink-0">EAN</span>
                          <input
                            value={sel.ean}
                            onChange={e => setEan(p.id, e.target.value)}
                            placeholder="0000000000000"
                            className="flex-1 px-2 py-1 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                          <button
                            onClick={() => handleGerarEAN(p.id)}
                            disabled={salvando === p.id}
                            title="Gerar EAN aleatório"
                            className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center shrink-0"
                          >
                            <RefreshCw className={cn('w-3 h-3', salvando === p.id && 'animate-spin')} />
                          </button>
                          {sel.ean && sel.ean !== p.ean && (
                            <button
                              onClick={() => handleSalvarEAN(p.id, sel.ean)}
                              disabled={salvando === p.id + '_save'}
                              title="Salvar EAN no catálogo"
                              className="w-6 h-6 rounded-lg bg-emerald-100 hover:bg-emerald-200 flex items-center justify-center shrink-0"
                            >
                              <Save className="w-3 h-3 text-emerald-600" />
                            </button>
                          )}
                        </div>
                      )}

                      {/* Preço */}
                      {campos.preco && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-500 w-16 shrink-0">Preço</span>
                          <input
                            value={sel.preco}
                            onChange={e => setPreco(p.id, e.target.value)}
                            placeholder="R$ 0,00"
                            className="flex-1 px-2 py-1 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ─── Aba Config ─── */}
      {aba === 'config' && (
        <div className="space-y-6 max-w-lg">
          {/* Tamanho */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-700">Tamanho da etiqueta</h3>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(TAMANHOS) as [TamanhoEtiqueta, typeof TAMANHOS[TamanhoEtiqueta]][]).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => setTamanho(key)}
                  className={cn(
                    'p-3 border-2 rounded-xl text-left transition-all',
                    tamanho === key
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-slate-200 hover:border-slate-300'
                  )}
                >
                  <p className="text-sm font-bold text-slate-800">{val.label}</p>
                  <p className="text-xs text-slate-500">{val.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Campos visíveis */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-700">Campos na etiqueta</h3>
            <div className="space-y-2">
              {(Object.entries(campos) as [keyof CamposVisiveis, boolean][]).map(([campo, ativo]) => {
                const labels: Record<string, string> = {
                  nome: 'Nome do produto', sku: 'SKU interno',
                  ean: 'Código de barras (EAN)', ncm: 'NCM', preco: 'Preço de venda',
                }
                return (
                  <label key={campo} className="flex items-center gap-3 cursor-pointer">
                    <div
                      onClick={() => setCampos(prev => ({ ...prev, [campo]: !prev[campo] }))}
                      className={cn(
                        'w-10 h-5 rounded-full relative transition-all',
                        ativo ? 'bg-emerald-500' : 'bg-slate-200'
                      )}
                    >
                      <div className={cn(
                        'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all',
                        ativo ? 'left-5' : 'left-0.5'
                      )} />
                    </div>
                    <span className="text-sm text-slate-700">{labels[campo]}</span>
                  </label>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── Aba Preview ─── */}
      {aba === 'preview' && (
        <div className="space-y-4">
          {itensSelecionados.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Tag className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Selecione produtos na aba "Produtos" para ver o preview.</p>
            </div>
          ) : (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-xs text-amber-700">
                Preview em tela — o PDF gerado terá as dimensões exatas da etiqueta selecionada ({TAMANHOS[tamanho].label}).
              </div>

              {/* Área de impressão */}
              <div
                ref={printRef}
                id="area-impressao"
                className={cn(
                  'flex flex-wrap gap-3 p-4 bg-slate-100 rounded-xl',
                  colunas === 3 ? 'justify-start' : colunas === 2 ? 'justify-start' : 'justify-start'
                )}
              >
                {itensSelecionados.flatMap(item =>
                  Array.from({ length: item.qtd }).map((_, qi) => (
                    <EtiquetaPreview
                      key={`${item.produto.id}-${qi}`}
                      item={item}
                      tamanho={tamanho}
                      campos={campos}
                      empresaNome={empresaNome}
                    />
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Estilos de impressão */}
      <style>{`
        @media print {
          body > *:not(#area-impressao) { display: none !important; }
          #area-impressao {
            display: flex !important;
            flex-wrap: wrap;
            gap: 4mm;
            padding: 5mm;
            background: white !important;
          }
        }
      `}</style>
    </div>
  )
}
