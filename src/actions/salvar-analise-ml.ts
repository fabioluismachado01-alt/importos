'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'
import { recalcularMes } from '@/actions/finance'
import { calcularParcelamento } from '@/lib/ml-parcelamento'

/** Canal usado para identificar os lançamentos automáticos desta importação. */
const CANAL_ML = 'MERCADO_LIVRE'

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
  taxa_parcelamento: number        // taxa de parcelamento líquida (net de cancels)
  acrescimo_parcelamento: number   // receita pass-through: juros pagos pelo comprador, repassados ao vendedor
  estornos: number                 // mantido para compatibilidade; deve ser 0 nas novas análises
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
  const primeiroDia = new Date(Date.UTC(ano, mes - 1, 1, 12, 0, 0))

  const fat = await prisma.faturamento_mes.upsert({
    where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano, mes } },
    update: { aliquota_simples: aliquotaReal, aliquota_origem: 'usuario' },
    create: {
      workspace_id: workspaceId, ano, mes,
      aliquota_simples: aliquotaReal,
      aliquota_origem: 'usuario',
      dias_no_mes: diasNoMes,
      das_vencimento: vencimentoDas,
    },
  })

  if (fat.fechado) {
    throw new Error(`${mes}/${ano} está fechado. Reabra o mês antes de importar.`)
  }

  // 3. Monta todos os lançamentos do mês (persistidos na transação do passo 4)
  // Todo lançamento gerado aqui carrega canal + e_automatico = true: é o que
  // permite apagá-los na reimportação sem tocar em lançamento manual algum.
  const lancamentos: Array<{
    faturamento_id: string; tipo: string; categoria: string; canal?: string
    descricao: string; valor: number; data: Date; status: string; e_automatico?: boolean
  }> = []

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

  // ── Parcelamento: acréscimo (receita) + taxa (despesa) ───────────
  // Quando os dois lados se anulam (líquido = 0) nenhum entra na DRE: lançar
  // ambos infla receita e despesa sem alterar o resultado — e distorce a base
  // de cálculo de qualquer indicador percentual. Só entram se houver resíduo.
  const parcelamento = calcularParcelamento({
    acrescimo: dados.acrescimo_parcelamento ?? 0,
    taxa: dados.taxa_parcelamento ?? 0,
  })

  if (!parcelamento.neutro) {
    if (parcelamento.acrescimo > 0) {
      lancamentos.push({
        faturamento_id: fat.id,
        tipo: 'RECEITA',
        categoria: 'MERCADO_LIVRE',
        canal: 'MERCADO_LIVRE',
        descricao: 'ML Import — Acréscimo de Parcelamento (pass-through)',
        valor: parcelamento.acrescimo,
        data: primeiroDia,
        status: 'CONFIRMADO',
      })
    }
    if (parcelamento.taxa > 0) {
      lancamentos.push({
        faturamento_id: fat.id,
        tipo: 'DESPESA_VARIAVEL',
        categoria: 'TARIFAS',
        descricao: 'ML Import — Taxa de Parcelamento',
        valor: parcelamento.taxa,
        data: primeiroDia,
        status: 'CONFIRMADO',
      })
    }
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

  // ── Estornos (crédito dentro do bloco de despesas) ───────────────
  // estornos vem negativo (cancelamento de tarifa = dinheiro que voltou)
  // RECUPERACAO_DESPESA: valor positivo no banco, engine subtrai de desp_tarifas
  if (dados.estornos < 0) {
    lancamentos.push({
      faturamento_id: fat.id,
      tipo: 'RECUPERACAO_DESPESA',
      categoria: 'TARIFAS',
      descricao: 'ML Import — Estornos e Cancelamentos de Tarifas',
      valor: Math.abs(dados.estornos),
      data: primeiroDia,
      status: 'CONFIRMADO',
    })
  }

  // 4. Substituição atômica dos lançamentos automáticos do ML.
  // Tudo numa única $transaction: delete + create + update de alíquota.
  // Se qualquer etapa falhar, o Prisma reverte — o mês nunca fica com os
  // lançamentos antigos apagados e os novos ausentes.
  const totalCriados = await prisma.$transaction(async (tx) => {
    // 4a. Remove SOMENTE os lançamentos automáticos deste canal neste mês.
    // Identificação estruturada (canal + e_automatico + faturamento_id) no
    // lugar do frágil `descricao contains 'ML Import'`: um lançamento manual
    // que por acaso cite "ML Import" na descrição deixa de ser apagado, e
    // renomear as descrições deixa de quebrar a reimportação.
    await tx.lancamento.deleteMany({
      where: {
        faturamento_id: fat.id,
        canal: CANAL_ML,
        e_automatico: true,
      },
    })

    // 4b. Página ML: só lança se o mês não tiver a despesa cadastrada à mão.
    // A checagem roda DEPOIS do delete para não considerar a importação anterior.
    if (dados.pagina_ml > 0) {
      const jaTemPaginaML = await tx.lancamento.findFirst({
        where: { faturamento_id: fat.id, categoria: 'PAGINA_ML' },
        select: { id: true },
      })
      if (!jaTemPaginaML) {
        lancamentos.push({
          faturamento_id: fat.id,
          tipo: 'DESPESA_FIXA',
          categoria: 'PAGINA_ML',
          descricao: 'ML Import — Página Oficial ML',
          valor: dados.pagina_ml,
          data: primeiroDia,
          status: 'CONFIRMADO',
        })
      }
    }

    // 4c. Persiste marcando canal e origem automática em TODOS os lançamentos.
    const dadosFinais = lancamentos.map(l => ({
      ...l,
      canal: l.canal ?? CANAL_ML,
      e_automatico: true,
    }))
    if (dadosFinais.length > 0) {
      await tx.lancamento.createMany({ data: dadosFinais })
    }

    // 4d. Garante alíquota correta no mês antes de recalcular
    await tx.faturamento_mes.update({
      where: { id: fat.id },
      data: { aliquota_simples: aliquotaReal, das_vencimento: vencimentoDas },
    })

    return dadosFinais.length
  })

  // 6. Recalcula TODOS os KPIs usando a engine completa do Finance
  // Isso calcula: receita_total, desp_*, lucro_bruto, lucro_liquido,
  // previdencia, margem, break_even, roas, dlr_socio, reinvestimento, etc.
  await recalcularMes(fat.id, workspaceId, ano, mes)

  revalidatePath(`/faturamento/${ano}/${mes}`)
  revalidatePath('/faturamento')
  revalidatePath('/dashboard')

  return { ok: true, mes, ano, lancamentos: totalCriados, parcelamento_neutro: parcelamento.neutro }
}
