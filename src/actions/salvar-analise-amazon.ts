'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'
import { recalcularMes } from '@/actions/finance'

export interface DadosAmazon {
  mes: number; ano: number; aliquota: number
  // === do Relatório de Vendas ===
  receita_bruta: number
  comissao_amazon: number
  descontos: number
  pedidos: number
  unidades: number
  dias_com_venda: number
  // === do Relatório Geral ===
  fba_fulfillment: number
  fba_armazenagem: number
  mensalidade: number
  reembolsos_bruto: number
  reembolsos_comissao: number
  reembolsos_fba: number
  ajustes: number
  outras_taxas_servico: number
  // === da Fatura Ads PDF ===
  publicidade: number
  // === do catálogo ===
  custo_produtos: number
}

export async function salvarAnaliseAmazon(dados: DadosAmazon) {
  const { workspaceId } = await getAuthContext()
  const { mes, ano, aliquota } = dados

  const empresa = await prisma.empresa.findUnique({
    where: { workspace_id: workspaceId }, select: { aliquota_simples: true }
  })
  const aliquotaReal = aliquota || empresa?.aliquota_simples || 0.08

  const diasNoMes   = new Date(ano, mes, 0).getDate()
  const mesVenc     = mes === 12 ? 1 : mes + 1
  const anoVenc     = mes === 12 ? ano + 1 : ano
  const vencDas     = new Date(anoVenc, mesVenc - 1, 20)
  const primeiroDia = new Date(ano, mes - 1, 1)

  const fat = await prisma.faturamento_mes.upsert({
    where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano, mes } },
    update:  { aliquota_simples: aliquotaReal },
    create:  { workspace_id: workspaceId, ano, mes, aliquota_simples: aliquotaReal, dias_no_mes: diasNoMes, das_vencimento: vencDas },
  })

  if (fat.fechado) throw new Error(`${mes}/${ano} está fechado. Reabra antes de importar.`)

  // Remove lançamentos Amazon anteriores deste mês
  await prisma.lancamento.deleteMany({
    where: { faturamento_id: fat.id, descricao: { contains: '[Amazon]' } }
  })

  // canal: 'AMAZON' obrigatório na receita → finance engine mapeia para receita_amazon
  const add = (tipo: string, cat: string, desc: string, valor: number, canal?: string | null) => ({
    faturamento_id: fat.id, tipo, categoria: cat,
    canal: canal ?? null,
    descricao: `[Amazon] ${desc}`,
    valor, data: primeiroDia, status: 'CONFIRMADO',
  })

  const lancamentos = []

  // ─── Receitas ───────────────────────────────────────────
  // canal: 'AMAZON' → engine acumula em receita_amazon (não em receita_outros)
  if (dados.receita_bruta > 0)
    lancamentos.push(add('RECEITA', 'AMAZON',
      `Receita de Vendas — ${dados.pedidos} pedidos, ${dados.unidades} un.`,
      dados.receita_bruta, 'AMAZON'))

  // Ajustes FBA (reembolso de estoque perdido) → receita operacional, NÃO é venda
  // canal: null → engine acumula em receita_outros (não infla receita_amazon)
  if (dados.ajustes > 0)
    lancamentos.push(add('RECEITA', 'OUTRO_CANAL',
      'Ajustes FBA — reembolso de estoque (NÃO é venda)', dados.ajustes, null))

  // ─── Custos Operacionais Amazon ──────────────────────────
  if (dados.comissao_amazon > 0)
    lancamentos.push(add('DESPESA_VARIAVEL', 'TARIFAS',
      'Comissão Amazon (tarifas de venda)', dados.comissao_amazon))

  if (dados.fba_fulfillment > 0)
    lancamentos.push(add('DESPESA_VARIAVEL', 'ARMAZENAGEM',
      'Taxas FBA Fulfillment', dados.fba_fulfillment))

  if (dados.fba_armazenagem > 0)
    lancamentos.push(add('DESPESA_VARIAVEL', 'ARMAZENAGEM',
      'Armazenagem FBA (taxa de estoque)', dados.fba_armazenagem))

  if (dados.mensalidade > 0)
    lancamentos.push(add('DESPESA_FIXA', 'PLATAFORMA',
      'Mensalidade Amazon', dados.mensalidade))

  if (dados.outras_taxas_servico > 0)
    lancamentos.push(add('DESPESA_VARIAVEL', 'OUTRAS_TAXAS',
      'Outras Taxas de Serviço Amazon', dados.outras_taxas_servico))

  // ─── Reembolsos ──────────────────────────────────────────
  const reembolsoLiq = dados.reembolsos_bruto - dados.reembolsos_comissao - dados.reembolsos_fba
  if (reembolsoLiq > 0)
    lancamentos.push(add('DESPESA_VARIAVEL', 'OUTRAS_TAXAS',
      `Reembolsos líquidos (bruto R$${dados.reembolsos_bruto.toFixed(2)})`, reembolsoLiq))

  // ─── Publicidade ─────────────────────────────────────────
  if (dados.publicidade > 0)
    lancamentos.push(add('DESPESA_VARIAVEL', 'ADS_OUTROS',
      'Publicidade Amazon Ads (Fatura oficial)', dados.publicidade))

  // ─── Custo com Produtos ───────────────────────────────────
  if (dados.custo_produtos > 0)
    lancamentos.push(add('DESPESA_VARIAVEL', 'CUSTO_PRODUTOS',
      'Custo com Produtos (CMV)', dados.custo_produtos))

  await prisma.lancamento.createMany({ data: lancamentos })

  await prisma.faturamento_mes.update({
    where: { id: fat.id },
    data: {
      aliquota_simples:  aliquotaReal,
      das_vencimento:    vencDas,
      dias_com_venda:    dados.dias_com_venda,
    },
  })

  await recalcularMes(fat.id, workspaceId, ano, mes)

  revalidatePath(`/faturamento/${ano}/${mes}`)
  revalidatePath('/faturamento')
  revalidatePath('/dashboard')

  return { ok: true, mes, ano, lancamentos: lancamentos.length }
}
