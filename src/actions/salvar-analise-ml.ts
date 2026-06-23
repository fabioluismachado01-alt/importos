'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'
import { recalcularMes } from '@/actions/finance'

export interface DadosConsolidadosML {
  mes: number
  ano: number
  aliquota: number
  // Do Relatório de Vendas (já processado pela API analisar-ml)
  vendas_receita: number
  vendas_tarifas: number
  vendas_frete: number
  vendas_custo_produtos: number
  vendas_unidades: number
  vendas_pedidos: number
  // Do Faturamento ML
  publicidade: number
  pagina_ml: number
  afiliados: number
  estornos: number        // negativo = recebeu de volta
  // Das Tarifas Full
  armazenagem_full: number
  coleta_full: number
}

export async function salvarAnaliseML(dados: DadosConsolidadosML) {
  const { workspaceId } = await getAuthContext()

  const { mes, ano, aliquota } = dados

  // 1. Garante que o mês existe
  const empresa = await prisma.empresa.findUnique({
    where: { workspace_id: workspaceId },
    select: { aliquota_simples: true },
  })
  const aliquotaReal = aliquota || empresa?.aliquota_simples || 0.08

  const diasNoMes = new Date(ano, mes, 0).getDate()
  const mesVenc = mes === 12 ? 1 : mes + 1
  const anoVenc = mes === 12 ? ano + 1 : ano
  const vencimentoDas = new Date(anoVenc, mesVenc - 1, 20)
  const primeiroDia = new Date(ano, mes - 1, 1)

  const fat = await prisma.faturamento_mes.upsert({
    where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano, mes } },
    update: { aliquota_simples: aliquotaReal },
    create: {
      workspace_id: workspaceId, ano, mes,
      aliquota_simples: aliquotaReal,
      dias_no_mes: diasNoMes,
      das_vencimento: vencimentoDas,
    },
  })

  if (fat.fechado) {
    throw new Error(`${mes}/${ano} está fechado. Reabra o mês antes de importar.`)
  }

  // 2. Remove lançamentos ML anteriores do mesmo mês (evita duplicação)
  await prisma.lancamento.deleteMany({
    where: {
      faturamento_id: fat.id,
      descricao: { contains: 'ML Import' },
    },
  })

  // 3. Cria todos os lançamentos do mês
  const lancamentos = []

  // ── Receita de Vendas ──────────────────────────────────────────────
  if (dados.vendas_receita > 0) {
    lancamentos.push({
      faturamento_id: fat.id,
      tipo: 'RECEITA',
      categoria: 'MERCADO_LIVRE',
      canal: 'MERCADO_LIVRE',
      descricao: `ML Import — Receita de Vendas (${dados.vendas_pedidos} pedidos, ${dados.vendas_unidades} un.)`,
      valor: dados.vendas_receita,
      data: primeiroDia,
      status: 'CONFIRMADO',
    })
  }

  // ── Tarifas de venda ──────────────────────────────────────────────
  if (dados.vendas_tarifas > 0) {
    lancamentos.push({
      faturamento_id: fat.id,
      tipo: 'DESPESA_VARIAVEL',
      categoria: 'TARIFAS',
      descricao: 'ML Import — Tarifas de Venda ML',
      valor: dados.vendas_tarifas,
      data: primeiroDia,
      status: 'CONFIRMADO',
    })
  }

  // ── Frete de envio ────────────────────────────────────────────────
  if (dados.vendas_frete > 0) {
    lancamentos.push({
      faturamento_id: fat.id,
      tipo: 'DESPESA_VARIAVEL',
      categoria: 'FRETE',
      descricao: 'ML Import — Frete de Envio',
      valor: dados.vendas_frete,
      data: primeiroDia,
      status: 'CONFIRMADO',
    })
  }

  // ── Custo com produtos ────────────────────────────────────────────
  if (dados.vendas_custo_produtos > 0) {
    lancamentos.push({
      faturamento_id: fat.id,
      tipo: 'DESPESA_VARIAVEL',
      categoria: 'CUSTO_PRODUTOS',
      descricao: 'ML Import — Custo com Produtos',
      valor: dados.vendas_custo_produtos,
      data: primeiroDia,
      status: 'CONFIRMADO',
    })
  }

  // ── Publicidade ───────────────────────────────────────────────────
  if (dados.publicidade > 0) {
    lancamentos.push({
      faturamento_id: fat.id,
      tipo: 'DESPESA_VARIAVEL',
      categoria: 'ADS_ML',
      descricao: 'ML Import — Publicidade (Product Ads)',
      valor: dados.publicidade,
      data: primeiroDia,
      status: 'CONFIRMADO',
    })
  }

  // ── Armazenagem Full ──────────────────────────────────────────────
  if (dados.armazenagem_full > 0) {
    lancamentos.push({
      faturamento_id: fat.id,
      tipo: 'DESPESA_VARIAVEL',
      categoria: 'ARMAZENAGEM',
      descricao: 'ML Import — Armazenagem Full',
      valor: dados.armazenagem_full,
      data: primeiroDia,
      status: 'CONFIRMADO',
    })
  }

  // ── Coleta Full ───────────────────────────────────────────────────
  if (dados.coleta_full > 0) {
    lancamentos.push({
      faturamento_id: fat.id,
      tipo: 'DESPESA_VARIAVEL',
      categoria: 'FRETE',
      descricao: 'ML Import — Coleta Full (frete galpão)',
      valor: dados.coleta_full,
      data: primeiroDia,
      status: 'CONFIRMADO',
    })
  }

  // ── Página ML ─────────────────────────────────────────────────────
  if (dados.pagina_ml > 0) {
    lancamentos.push({
      faturamento_id: fat.id,
      tipo: 'DESPESA_VARIAVEL',
      categoria: 'FATURA_ML',
      descricao: 'ML Import — Página Oficial ML',
      valor: dados.pagina_ml,
      data: primeiroDia,
      status: 'CONFIRMADO',
    })
  }

  // ── Afiliados ─────────────────────────────────────────────────────
  if (dados.afiliados > 0) {
    lancamentos.push({
      faturamento_id: fat.id,
      tipo: 'DESPESA_VARIAVEL',
      categoria: 'OUTRAS_TAXAS',
      descricao: 'ML Import — Programa de Afiliados',
      valor: dados.afiliados,
      data: primeiroDia,
      status: 'CONFIRMADO',
    })
  }

  // ── Estornos (lançado separado como crédito) ─────────────────────
  // estornos já vem negativo (cancelamento de tarifa = dinheiro que voltou)
  if (dados.estornos < 0) {
    lancamentos.push({
      faturamento_id: fat.id,
      tipo: 'RECEITA',            // entra como receita pois é dinheiro que voltou
      categoria: 'OUTRO_CANAL',
      descricao: 'ML Import — Estornos e Cancelamentos de Tarifas',
      valor: Math.abs(dados.estornos),
      data: primeiroDia,
      status: 'CONFIRMADO',
    })
  }

  // 4. Persiste todos os lançamentos
  await prisma.lancamento.createMany({ data: lancamentos })

  // 5. Garante alíquota correta no mês antes de recalcular
  await prisma.faturamento_mes.update({
    where: { id: fat.id },
    data: { aliquota_simples: aliquotaReal, das_vencimento: vencimentoDas },
  })

  // 6. Recalcula TODOS os KPIs usando a engine completa do Finance
  // Isso calcula: receita_total, desp_*, lucro_bruto, lucro_liquido,
  // previdencia, margem, break_even, roas, dlr_socio, reinvestimento, etc.
  await recalcularMes(fat.id, workspaceId, ano, mes)

  revalidatePath(`/faturamento/${ano}/${mes}`)
  revalidatePath('/faturamento')
  revalidatePath('/dashboard')

  return { ok: true, mes, ano, lancamentos: lancamentos.length }
}
