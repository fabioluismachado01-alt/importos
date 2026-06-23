import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getFaturamentoMesCompleto, getDespesasFixasTemplates, getFinanceConfig } from '@/actions/finance'
import { getStatusImportacoes } from '@/actions/zerar-importacao'
import { getMesNome } from '@/lib/utils'
import { MesDetalheView } from '@/components/faturamento/MesDetalheView'
import { GerenciarImportacoes } from '@/components/faturamento/GerenciarImportacoes'

interface Props {
  params: Promise<{ ano: string; mes: string }>
}

export async function generateMetadata({ params }: Props) {
  const { ano, mes } = await params
  return { title: `${getMesNome(Number(mes))} ${ano} — ImportOS` }
}

export default async function FaturamentoMesPage({ params }: Props) {
  const { ano: anoStr, mes: mesStr } = await params
  const ano = Number(anoStr)
  const mes = Number(mesStr)

  if (isNaN(ano) || isNaN(mes) || mes < 1 || mes > 12) notFound()

  const [dados, templates, importacoes, financeConfig] = await Promise.all([
    getFaturamentoMesCompleto(ano, mes),
    getDespesasFixasTemplates(),
    getStatusImportacoes(ano, mes).catch(() => []),
    getFinanceConfig(ano),
  ])

  if (!dados) notFound()

  // Mês novo = sem lançamentos e alíquota ainda é o padrão da empresa
  // Sinaliza para o componente abrir o modal de configuração automaticamente
  const mesNovo = dados.lancamentos.length === 0 && !dados.fechado

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link
          href="/faturamento"
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Faturamento
        </Link>
        <span className="text-slate-300">/</span>
        <span className="text-sm font-bold text-slate-800">
          {getMesNome(mes)} {ano}
        </span>
      </div>
      <GerenciarImportacoes
        ano={ano}
        mes={mes}
        importacoes={importacoes}
        fechado={dados.fechado}
      />
      <MesDetalheView
        dados={dados}
        ano={ano}
        mes={mes}
        templates={templates}
        abrirConfigAuto={mesNovo}
        percentualDlrGlobal={financeConfig.percentual_dlr_socio}
      />
    </div>
  )
}
