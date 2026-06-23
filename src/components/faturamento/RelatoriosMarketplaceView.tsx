'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Upload, CheckCircle2, AlertTriangle, Loader2,
  ArrowRight, X, Brain, FileSpreadsheet, BookOpen,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import { MarketplaceLogo } from '@/components/marketplace/MarketplaceLogo'

// ─── Tipos ──────────────────────────────────────────
interface PreviewData {
  marketplace: string
  totalPedidos: number
  receitaBruta: number
  totalTarifas: number
  receitaLiquida: number
  periodo: string
  ano: number
  mes: number
  dataInicio: string
  dataFim: string
  analiseIA: string
}
type Estado = 'idle' | 'lendo' | 'preview' | 'importando' | 'sucesso' | 'erro'

// ─── Configuração dos marketplaces ───────────────────
const MARKETPLACES = [
  {
    id: 'MERCADO_LIVRE',
    nome: 'Mercado Livre',
    cor: '#FFD700',
    bg: '#FFF9E6',
    formatos: '.xlsx, .xls',
    redirecionarPara: '/vendas/ml', // ← ML tem análise por SKU dedicada
    instrucoes: [
      'Acesse o Painel do Vendedor',
      'Vá em Relatórios → Relatório de Vendas',
      'Selecione o mês completo',
      'Exporte em formato Excel (.xlsx)',
    ],
  },
  {
    id: 'SHOPEE',
    nome: 'Shopee',
    cor: '#EE4D2D',
    bg: '#FFF0EE',
    formatos: '.xlsx, .csv',
    instrucoes: [
      'Acesse o Seller Centre',
      'Vá em Meus Pedidos → Todos os Pedidos',
      'Clique em Exportar',
      'Selecione o período e baixe o arquivo',
    ],
  },
  {
    id: 'AMAZON',
    nome: 'Amazon',
    cor: '#FF9900',
    bg: '#FFF6E8',
    formatos: '.csv, .txt',
    instrucoes: [
      'Acesse o Seller Central',
      'Vá em Relatórios → Business Reports',
      'Selecione "By ASIN" ou "Order"',
      'Baixe o arquivo CSV do período',
    ],
  },
  {
    id: 'MAGALU',
    nome: 'Magalu',
    cor: '#0086FF',
    bg: '#EEF6FF',
    formatos: '.csv',
    redirecionarPara: '/vendas/magalu', // ← Magalu tem análise dedicada por SKU
    instrucoes: [
      'Acesse o Portal do Parceiro Magalu',
      'Vá em Relatórios → Vendas',
      'Selecione o mês completo',
      'Exporte em formato CSV',
    ],
  },
  {
    id: 'TIKTOK',
    nome: 'TikTok Shop',
    cor: '#010101',
    bg: '#F5F5F5',
    formatos: '.xlsx, .csv',
    redirecionarPara: '/vendas/tiktok', // ← TikTok tem análise dedicada (Demonstrativo + Afiliados)
    instrucoes: [
      'Acesse o TikTok Shop Seller Center',
      'Vá em Finanças → Demonstrativos',
      'Baixe o Demonstrativo do mês',
      'Baixe também o Relatório de Afiliados (opcional)',
    ],
  },
  {
    id: 'OUTRO',
    nome: 'Outro / Genérico',
    cor: '#64748B',
    bg: '#F8FAFC',
    formatos: '.xlsx, .csv',
    instrucoes: [
      'Baixe o template CSV do ImportOS',
      'Preencha: data | valor | tarifa',
      'Salve e faça o upload',
    ],
    template: true,
  },
]

const MKT_LABELS: Record<string, string> = {
  MERCADO_LIVRE: 'Mercado Livre',
  SHOPEE: 'Shopee',
  AMAZON: 'Amazon',
  MAGALU: 'Magalu',
  CASAS_BAHIA: 'Casas Bahia',
  OUTRO: 'Outro',
}

export function RelatoriosMarketplaceView() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [mktSelecionado, setMktSelecionado] = useState<string | null>(null)
  const [estado, setEstado] = useState<Estado>('idle')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState<PreviewData | null>(null)
  const [tutorialAberto, setTutorialAberto] = useState<string | null>(null)

  const mktConfig = MARKETPLACES.find(m => m.id === mktSelecionado)

  async function handleFile(file: File) {
    if (!mktSelecionado) return
    setArquivo(file)
    setEstado('lendo')
    setErro('')

    const form = new FormData()
    form.append('file', file)
    form.append('marketplace', mktSelecionado)
    form.append('preview', 'true')

    try {
      const res = await fetch('/api/importar-relatorio', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao ler arquivo')
      setPreview(data)
      setEstado('preview')
    } catch (e) {
      setErro(String(e))
      setEstado('erro')
    }
  }

  async function handleImportar() {
    if (!arquivo || !mktSelecionado) return
    setEstado('importando')

    const form = new FormData()
    form.append('file', arquivo)
    form.append('marketplace', mktSelecionado)
    form.append('preview', 'false')

    try {
      const res = await fetch('/api/importar-relatorio', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro na importação')
      setResultado(data)
      setEstado('sucesso')
    } catch (e) {
      setErro(String(e))
      setEstado('erro')
    }
  }

  function resetar() {
    setEstado('idle')
    setPreview(null)
    setArquivo(null)
    setResultado(null)
    setErro('')
  }

  // ─── RENDER ──────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Seleção de Marketplace */}
      {(estado === 'idle' || estado === 'erro') && !mktSelecionado && (
        <>
          <p className="text-sm text-slate-600">Selecione o marketplace para começar:</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {MARKETPLACES.map(mkt => (
              <button key={mkt.id}
                onClick={() => {
                  // ML tem módulo dedicado com análise por SKU — redireciona
                  if ((mkt as { redirecionarPara?: string }).redirecionarPara) {
                    router.push((mkt as { redirecionarPara: string }).redirecionarPara)
                    return
                  }
                  setMktSelecionado(mkt.id)
                }}
                className="p-5 rounded-2xl border-2 border-slate-200 hover:border-slate-300 text-left transition-all hover:shadow-md hover:-translate-y-0.5 group"
                style={{ background: mkt.bg }}>
                <MarketplaceLogo id={mkt.id} size={44} className="mb-3 shadow-sm" />
                <p className="text-sm font-black text-slate-800">{mkt.nome}</p>
                <p className="text-[10px] text-slate-400 mt-1">{mkt.formatos}</p>
                {(mkt as { redirecionarPara?: string }).redirecionarPara && (
                  <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-bold mt-2 inline-block">
                    → Análise por SKU
                  </span>
                )}
                {mkt.template && (
                  <span className="text-[9px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full font-bold mt-2 inline-block">
                    + Template CSV
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Últimas importações */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-black text-slate-500 uppercase tracking-wide">
                Como funciona
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600">
                <div className="flex gap-3 items-start">
                  <div className="w-7 h-7 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-xs font-black shrink-0">1</div>
                  <div>
                    <p className="font-bold">Exporte do marketplace</p>
                    <p className="text-slate-400 mt-0.5">Baixe o relatório de vendas no painel do vendedor</p>
                  </div>
                </div>
                <div className="flex gap-3 items-start">
                  <div className="w-7 h-7 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-xs font-black shrink-0">2</div>
                  <div>
                    <p className="font-bold">Faça o upload aqui</p>
                    <p className="text-slate-400 mt-0.5">O sistema detecta automaticamente o período e os valores</p>
                  </div>
                </div>
                <div className="flex gap-3 items-start">
                  <div className="w-7 h-7 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-xs font-black shrink-0">3</div>
                  <div>
                    <p className="font-bold">Confirme e pronto</p>
                    <p className="text-slate-400 mt-0.5">As receitas são lançadas automaticamente no mês correto</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Upload para marketplace selecionado */}
      {mktSelecionado && mktConfig && (estado === 'idle' || estado === 'erro') && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => { setMktSelecionado(null); setErro('') }}
              className="text-slate-400 hover:text-slate-700 transition-colors">
              ← Voltar
            </button>
            <MarketplaceLogo id={mktConfig.id} size={32} />
            <h2 className="text-base font-black text-slate-800">{mktConfig.nome}</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Zona de upload */}
            <div className="lg:col-span-2">
              <div
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                onDragOver={e => e.preventDefault()}
                onClick={() => inputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/20 transition-all group"
              >
                <input ref={inputRef} type="file"
                  accept=".xlsx,.xls,.csv,.txt" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                    <FileSpreadsheet className="w-7 h-7 text-slate-400 group-hover:text-emerald-600 transition-colors" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-700">Arraste o relatório ou clique para selecionar</p>
                    <p className="text-xs text-slate-400 mt-1">Formatos aceitos: {mktConfig.formatos}</p>
                  </div>
                </div>
                {erro && (
                  <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-600 text-left flex gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {erro}
                  </div>
                )}
              </div>
            </div>

            {/* Tutorial */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-black text-slate-500 uppercase tracking-wide flex items-center gap-2">
                  <BookOpen className="w-3.5 h-3.5" />
                  Como exportar
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2.5">
                  {mktConfig.instrucoes.map((instrucao, i) => (
                    <li key={i} className="flex gap-2.5 text-xs text-slate-600">
                      <span className="w-5 h-5 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center text-[10px] font-black shrink-0">
                        {i + 1}
                      </span>
                      {instrucao}
                    </li>
                  ))}
                </ol>
                {mktConfig.template && (
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <button className="text-xs text-emerald-600 font-bold hover:underline flex items-center gap-1">
                      <Upload className="w-3 h-3" /> Baixar template CSV
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Lendo */}
      {estado === 'lendo' && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
            <p className="text-sm font-semibold text-slate-700">Analisando arquivo...</p>
            <p className="text-xs text-slate-400">{arquivo?.name}</p>
          </CardContent>
        </Card>
      )}

      {/* Preview */}
      {estado === 'preview' && preview && (
        <div className="space-y-4">
          {/* Resultado da leitura */}
          <Card className="border-0 shadow-sm border-l-4 border-l-emerald-500">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    Relatório lido com sucesso — {MKT_LABELS[preview.marketplace] ?? preview.marketplace}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Período: {preview.dataInicio} a {preview.dataFim} • {preview.totalPedidos} pedidos detectados
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* KPIs do relatório */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Receita Bruta</p>
                <p className="text-xl font-black font-mono text-emerald-600 mt-1">{formatCurrency(preview.receitaBruta)}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tarifas Descontadas</p>
                <p className="text-xl font-black font-mono text-red-500 mt-1">-{formatCurrency(preview.totalTarifas)}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {preview.receitaBruta > 0 ? ((preview.totalTarifas / preview.receitaBruta) * 100).toFixed(1) : 0}% da receita
                </p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Receita Líquida</p>
                <p className="text-xl font-black font-mono text-blue-600 mt-1">{formatCurrency(preview.receitaLiquida)}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Lançada no Faturamento</p>
              </CardContent>
            </Card>
          </div>

          {/* Análise de IA */}
          {preview.analiseIA && (
            <Card className="border-0 shadow-sm border-l-4 border-l-purple-400">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="w-4 h-4 text-purple-500" />
                  <p className="text-xs font-black text-slate-700 uppercase tracking-wide">Análise de IA</p>
                  <Badge className="text-[8px] bg-purple-100 text-purple-700 border-purple-200 h-4 px-1.5">Groq · Llama 3.3</Badge>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">{preview.analiseIA}</p>
              </CardContent>
            </Card>
          )}

          {/* Info de onde vai ser lançado */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              Os dados serão lançados no mês <strong>{preview.periodo}</strong> do Faturamento.
              Se já houver lançamentos de <strong>{MKT_LABELS[preview.marketplace]}</strong> neste mês, eles serão substituídos.
            </p>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={resetar}>
              <X className="w-4 h-4 mr-1.5" /> Cancelar
            </Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2" onClick={handleImportar}>
              Confirmar — Lançar no Faturamento
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Importando */}
      {estado === 'importando' && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
            <p className="text-sm font-semibold text-slate-700">Lançando no Faturamento...</p>
          </CardContent>
        </Card>
      )}

      {/* Sucesso */}
      {estado === 'sucesso' && resultado && (
        <Card className="border-0 shadow-sm border-l-4 border-l-emerald-500">
          <CardContent className="p-8 flex flex-col items-center gap-5 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <div>
              <p className="text-lg font-black text-slate-900">Relatório importado com sucesso!</p>
              <p className="text-sm text-slate-500 mt-1">
                {resultado.totalPedidos} pedidos de {MKT_LABELS[resultado.marketplace]} lançados em {resultado.periodo}
              </p>
            </div>
            <div className="flex gap-6">
              <div>
                <p className="text-2xl font-black font-mono text-emerald-600">{formatCurrency(resultado.receitaLiquida)}</p>
                <p className="text-xs text-slate-500">Receita líquida lançada</p>
              </div>
              <div>
                <p className="text-2xl font-black font-mono text-red-500">-{formatCurrency(resultado.totalTarifas)}</p>
                <p className="text-xs text-slate-500">Tarifas registradas</p>
              </div>
            </div>

            {resultado.analiseIA && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-left w-full">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="w-3.5 h-3.5 text-purple-500" />
                  <p className="text-[10px] font-black text-purple-700 uppercase tracking-wide">Insight de IA</p>
                </div>
                <p className="text-xs text-slate-600">{resultado.analiseIA}</p>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={resetar}>Importar outro relatório</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => router.push(`/faturamento/${resultado.ano}/${resultado.mes}`)}>
                Ver Faturamento {resultado.periodo} →
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
