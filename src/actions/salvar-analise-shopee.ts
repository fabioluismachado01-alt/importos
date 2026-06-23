'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'
import { recalcularMes } from '@/actions/finance'

export interface DadosShopee {
  mes: number
  ano: number
  aliquota: number
  // Do Relatório de Vendas
  receita_total: number       // Valor Total (col 39) — fonte oficial de receita
  comissao_liquida: number    // Taxa de comissão líquida
  servico_liquido: number     // Taxa de serviço líquida
  frete_estimado: number      // Valor estimado do frete
  custo_produtos: number      // CMV (custos do catálogo × unidades)
  pedidos: number
  unidades: number
  // Do Relatório de Ads
  ads_deducoes: number        // Gastos reais de anúncios (só deduções)
}

export async function salvarAnaliseShopee(dados: DadosShopee) {
  const { workspaceId } = await getAuthContext()
  const { mes, ano, aliquota } = dados

  const empresa = await prisma.empresa.findUnique({
    where: { workspace_id: workspaceId },
    select: { aliquota_simples: true },
  })
  const aliquotaReal = aliquota || empresa?.aliquota_simples || 0.08

  const diasNoMes = new Date(ano, mes, 0).getDate()
  const mesVenc = mes === 12 ? 1 : mes + 1
  const anoVenc = mes === 12 ? ano + 1 : ano
  const vencDas = new Date(anoVenc, mesVenc - 1, 20)
  const primeiroDia = new Date(ano, mes - 1, 1)

  const fat = await prisma.faturamento_mes.upsert({
    where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano, mes } },
    update: { aliquota_simples: aliquotaReal },
    create: { workspace_id: workspaceId, ano, mes, aliquota_simples: aliquotaReal, dias_no_mes: diasNoMes, das_vencimento: vencDas },
  })

  if (fat.fechado) throw new Error(`${mes}/${ano} está fechado. Reabra antes de importar.`)

  // Remove lançamentos Shopee anteriores deste mês
  await prisma.lancamento.deleteMany({
    where: { faturamento_id: fat.id, descricao: { contains: '[Shopee]' } },
  })

  const add = (tipo: string, cat: string, desc: string, valor: number) => ({
    faturamento_id: fat.id,
    tipo, categoria: cat,
    canal: tipo === 'RECEITA' ? 'SHOPEE' : null,
    descricao: `[Shopee] ${desc}`,
    valor, data: primeiroDia, status: 'CONFIRMADO',
  })

  const lancamentos = []

  // ─── Receita ──────────────────────────────────────────────────────
  if (dados.receita_total > 0)
    lancamentos.push(add('RECEITA', 'SHOPEE',
      `Receita de Vendas — ${dados.pedidos} pedidos, ${dados.unidades} un.`,
      dados.receita_total))

  // ─── Comissão Shopee ──────────────────────────────────────────────
  if (dados.comissao_liquida > 0)
    lancamentos.push(add('DESPESA_VARIAVEL', 'TARIFAS',
      'Comissão Shopee (taxa de comissão líquida)',
      dados.comissao_liquida))

  // ─── Taxa de Serviço ──────────────────────────────────────────────
  if (dados.servico_liquido > 0)
    lancamentos.push(add('DESPESA_VARIAVEL', 'TARIFAS',
      'Taxa de Serviço Shopee (líquida)',
      dados.servico_liquido))

  // ─── Frete estimado ───────────────────────────────────────────────
  if (dados.frete_estimado > 0)
    lancamentos.push(add('DESPESA_VARIAVEL', 'FRETE',
      'Frete Estimado Shopee',
      dados.frete_estimado))

  // ─── Ads Shopee ───────────────────────────────────────────────────
  if (dados.ads_deducoes > 0)
    lancamentos.push(add('DESPESA_VARIAVEL', 'ADS_OUTROS',
      'Publicidade Shopee Ads (deduções oficiais)',
      dados.ads_deducoes))

  // ─── CMV ──────────────────────────────────────────────────────────
  if (dados.custo_produtos > 0)
    lancamentos.push(add('DESPESA_VARIAVEL', 'CUSTO_PRODUTOS',
      'Custo com Produtos (CMV)',
      dados.custo_produtos))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await prisma.lancamento.createMany({ data: lancamentos as any })

  await prisma.faturamento_mes.update({
    where: { id: fat.id },
    data: { aliquota_simples: aliquotaReal, das_vencimento: vencDas },
  })

  await recalcularMes(fat.id, workspaceId, ano, mes)

  revalidatePath(`/faturamento/${ano}/${mes}`)
  revalidatePath('/faturamento')
  revalidatePath('/dashboard')

  return { ok: true, mes, ano, lancamentos: lancamentos.length }
}
