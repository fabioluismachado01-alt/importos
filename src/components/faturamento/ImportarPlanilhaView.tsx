'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertTriangle,
  ArrowRight, X, Loader2, Download, Info,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'

interface PreviewMes {
  nomeMes: string
  mes: number
  receita: number
  lancamentos: number
  painel: {
    lucroBruto?: number
    aliquota?: number
  }
}

interface PreviewData {
  meses: PreviewMes[]
  historico: number
  anos: number[]
}

type Estado = 'idle' | 'lendo' | 'preview' | 'importando' | 'sucesso' | 'erro'

export function ImportarPlanilhaView() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [estado, setEstado] = useState<Estado>('idle')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState<{ totalMeses: number; totalLancamentos: number; totalHistorico: number } | null>(null)

  async function handleFile(file: File) {
    if (!file.name.endsWith('.xlsx')) {
      setErro('Apenas arquivos .xlsx são suportados')
      return
    }
    setArquivo(file)
    setEstado('lendo')
    setErro('')

    const form = new FormData()
    form.append('file', file)
    form.append('preview', 'true')

    try {
      const res = await fetch('/api/importar-planilha', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao ler planilha')
      setPreview(data)
      setEstado('preview')
    } catch (e) {
      setErro(String(e))
      setEstado('erro')
    }
  }

  async function handleImportar() {
    if (!arquivo) return
    setEstado('importando')

    const form = new FormData()
    form.append('file', arquivo)
    form.append('preview', 'false')

    try {
      const res = await fetch('/api/importar-planilha', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro na importação')
      setResultado(data)
      setEstado('sucesso')
    } catch (e) {
      setErro(String(e))
      setEstado('erro')
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div className="max-w-3xl space-y-6">

      {/* ── BAIXAR MODELO ── */}
      <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-5 py-3">
        <div>
          <p className="text-sm font-bold text-blue-900">Planilha modelo disponível para download</p>
          <p className="text-xs text-blue-600 mt-0.5">Use o modelo oficial para garantir a importação correta dos dados</p>
        </div>
        <a
          href="/templates/modelo-importacao.xlsx"
          download="modelo-importacao.xlsx"
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shrink-0"
        >
          <Download className="w-4 h-4" />
          Baixar Modelo
        </a>
      </div>

      {/* ── COMO BAIXAR O RELATÓRIO ── */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 space-y-4">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-slate-500 shrink-0" />
          <p className="text-sm font-bold text-slate-700">Como baixar os relatórios no Mercado Livre</p>
        </div>

        {/* Caminho */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          {['Faturamento', 'Tarifas e Pagamentos', 'Relatórios'].map((step, i, arr) => (
            <span key={step} className="flex items-center gap-1.5">
              <span className="bg-[#0A7E96] text-white px-2.5 py-1 rounded-lg">{step}</span>
              {i < arr.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-slate-400" />}
            </span>
          ))}
        </div>

        {/* Planilhas a baixar */}
        <div>
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Planilhas que devem ser baixadas e importadas:</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              'Faturamento do Mercado Livre',
              'Tarifas do Full',
              'Pagamentos de faturas',
            ].map(r => (
              <div key={r} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#0A7E96] shrink-0" />
                <span className="text-xs font-medium text-slate-700">{r}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── ZONA DE UPLOAD ── */}
      {(estado === 'idle' || estado === 'erro') && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/20 transition-all group"
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
              <FileSpreadsheet className="w-8 h-8 text-slate-400 group-hover:text-emerald-600 transition-colors" />
            </div>
            <div>
              <p className="text-base font-bold text-slate-700">Arraste a planilha ou clique para selecionar</p>
              <p className="text-sm text-slate-400 mt-1">Arquivo: <strong>Controle Geral de Faturamento, tarifas, DAS etc.xlsx</strong></p>
            </div>
            <div className="mt-2 text-xs text-slate-400 space-y-1">
              <p>✓ Importa dados de Jan–Dez 2026 (meses com dados)</p>
              <p>✓ Importa histórico 2023, 2024, 2025 da aba Faturamentos</p>
              <p>✓ Preserva lançamentos existentes se o mês já tiver dados</p>
            </div>
          </div>
          {erro && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-600 text-left">
              {erro}
            </div>
          )}
        </div>
      )}

      {/* ── LENDO ── */}
      {estado === 'lendo' && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
            <p className="text-sm font-semibold text-slate-700">Analisando planilha...</p>
            <p className="text-xs text-slate-400">{arquivo?.name}</p>
          </CardContent>
        </Card>
      )}

      {/* ── PREVIEW ── */}
      {estado === 'preview' && preview && (
        <div className="space-y-5">
          <Card className="border-0 shadow-sm border-l-4 border-l-emerald-500">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-slate-800">Planilha lida com sucesso!</p>
                  <p className="text-xs text-slate-500 mt-0.5">{arquivo?.name}</p>
                  <div className="flex gap-4 mt-2">
                    <span className="text-xs font-bold text-emerald-600">{preview.meses.length} meses com dados</span>
                    <span className="text-xs font-bold text-blue-600">{preview.historico} registros históricos ({preview.anos.join(', ')})</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabela de preview */}
          <Card className="border-0 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <p className="text-xs font-black text-slate-700 uppercase tracking-wide">Dados a importar</p>
              <button onClick={() => { setEstado('idle'); setPreview(null); setArquivo(null) }} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-5 py-2.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Mês</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-black text-slate-400 uppercase tracking-wider">Receita</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-black text-slate-400 uppercase tracking-wider">Lucro Bruto</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-black text-slate-400 uppercase tracking-wider">Alíquota</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-black text-slate-400 uppercase tracking-wider">Lançamentos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {preview.meses.map((m) => (
                  <tr key={m.mes} className="hover:bg-slate-50">
                    <td className="px-5 py-2.5 text-xs font-semibold text-slate-800">{m.nomeMes}</td>
                    <td className="px-5 py-2.5 text-right text-xs font-mono font-bold text-emerald-600">{formatCurrency(m.receita)}</td>
                    <td className="px-5 py-2.5 text-right text-xs font-mono text-blue-600">
                      {m.painel.lucroBruto ? formatCurrency(m.painel.lucroBruto) : '—'}
                    </td>
                    <td className="px-5 py-2.5 text-right text-xs font-mono text-slate-600">
                      {m.painel.aliquota ? `${(m.painel.aliquota * 100).toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-5 py-2.5 text-right text-xs text-slate-500">{m.lancamentos}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 border-t border-slate-200">
                  <td className="px-5 py-2.5 text-xs font-black text-slate-900">Total</td>
                  <td className="px-5 py-2.5 text-right text-xs font-black font-mono text-emerald-600">
                    {formatCurrency(preview.meses.reduce((s, m) => s + m.receita, 0))}
                  </td>
                  <td colSpan={2} />
                  <td className="px-5 py-2.5 text-right text-xs font-bold text-slate-600">
                    {preview.meses.reduce((s, m) => s + m.lancamentos, 0)} lançamentos
                  </td>
                </tr>
              </tbody>
            </table>
          </Card>

          {/* Aviso */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              Se os meses já existirem no sistema, os lançamentos antigos serão substituídos pelos dados da planilha.
              Os KPIs serão recalculados automaticamente.
            </p>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setEstado('idle'); setPreview(null); setArquivo(null) }}>
              Cancelar
            </Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2" onClick={handleImportar}>
              Confirmar Importação
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── IMPORTANDO ── */}
      {estado === 'importando' && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
            <p className="text-sm font-semibold text-slate-700">Importando dados...</p>
            <p className="text-xs text-slate-400">Isso pode levar alguns segundos</p>
          </CardContent>
        </Card>
      )}

      {/* ── SUCESSO ── */}
      {estado === 'sucesso' && resultado && (
        <Card className="border-0 shadow-sm border-l-4 border-l-emerald-500">
          <CardContent className="p-8 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <div>
              <p className="text-lg font-black text-slate-900">Importação concluída!</p>
              <p className="text-sm text-slate-500 mt-1">Os dados da planilha já estão disponíveis no sistema.</p>
            </div>
            <div className="flex gap-6 mt-2">
              <div className="text-center">
                <p className="text-2xl font-black text-emerald-600">{resultado.totalMeses}</p>
                <p className="text-xs text-slate-500">meses importados</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black text-blue-600">{resultado.totalLancamentos}</p>
                <p className="text-xs text-slate-500">lançamentos</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black text-slate-600">{resultado.totalHistorico}</p>
                <p className="text-xs text-slate-500">registros históricos</p>
              </div>
            </div>
            <div className="flex gap-3 mt-2">
              <Button variant="outline" onClick={() => { setEstado('idle'); setPreview(null); setArquivo(null); setResultado(null) }}>
                Importar outra planilha
              </Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => router.push('/faturamento')}>
                Ver Faturamento →
              </Button>
              <Button variant="outline" onClick={() => router.push('/faturamento/dre')}>
                Ver DRE Anual →
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
