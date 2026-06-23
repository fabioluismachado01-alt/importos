'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'
import {
  calcularKPIs, calcularDASVencimento, getDiasNoMes,
  type LancamentoRaw, type FinanceConfig,
} from '@/engines/finance'

// =============================================
// HELPERS
// =============================================

async function getConfig(workspaceId: string, ano: number): Promise<FinanceConfig> {
  const empresa = await prisma.empresa.findUnique({
    where: { workspace_id: workspaceId },
    select: { aliquota_simples: true },
  })
  const finConfig = await prisma.finance_config.findUnique({
    where: { workspace_id_ano: { workspace_id: workspaceId, ano } },
  })
  return {
    aliquota_simples: empresa?.aliquota_simples ?? 0.06,
    percentual_dlr_socio: finConfig?.percentual_dlr_socio ?? 0.5,
    percentual_reinvestimento: finConfig?.percentual_reinvestimento ?? 0.5,
    formula_previdencia: finConfig?.formula_previdencia ?? 'PRO_LABORE*0.20+LUCRO_BRUTO*0.11',
    dias_no_mes: 30,
    meta_mes: 0,
  }
}

export async function recalcularMes(faturamentoId: string, workspaceId: string, ano: number, mes: number) {
  const lancamentos = await prisma.lancamento.findMany({
    where: { faturamento_id: faturamentoId, status: 'CONFIRMADO' },
    select: { tipo: true, categoria: true, canal: true, valor: true, data: true, descricao: true },
  })

  const fat = await prisma.faturamento_mes.findUnique({
    where: { id: faturamentoId },
    select: {
      aliquota_simples: true, meta_mes: true, dias_no_mes: true, dias_com_venda: true,
      dlr_modo: true, dlr_percentual_custom: true, dlr_valor_fixo: true,
      das_valor_real: true, das_status: true,
    },
  })

  const config = await getConfig(workspaceId, ano)
  if (fat) {
    config.aliquota_simples = fat.aliquota_simples
    config.meta_mes = fat.meta_mes
    config.dias_no_mes = fat.dias_no_mes
    config.dlr_modo = (fat.dlr_modo as 'PERCENTUAL' | 'FIXO') ?? 'PERCENTUAL'
    config.dlr_percentual_custom = fat.dlr_percentual_custom
    config.dlr_valor_fixo = fat.dlr_valor_fixo
    // DAS real: só substitui a estimativa no cálculo do lucro depois de pago
    config.das_valor_real = fat.das_status === 'PAGO' ? fat.das_valor_real : null
  }

  // ── Parse total_pedidos das descrições dos lançamentos de receita ──────
  // Cada importação de marketplace salva: "X pedidos" na descrição da receita.
  // Isso garante que ticket_medio = receita_total / total_pedidos (correto).
  const PEDIDOS_REGEX = /(\d+)\s+pedidos?/i
  let total_pedidos = 0
  lancamentos.forEach(l => {
    if (l.tipo === 'RECEITA' && l.canal) {
      const m = l.descricao.match(PEDIDOS_REGEX)
      if (m) total_pedidos += parseInt(m[1])
    }
  })
  if (total_pedidos > 0) config.total_pedidos = total_pedidos

  const raw: LancamentoRaw[] = lancamentos.map((l) => ({
    tipo: l.tipo,
    categoria: l.categoria,
    canal: l.canal,
    valor: l.valor,
    data: l.data,
  }))

  const kpis = calcularKPIs(raw, config, new Date().getDate())
  const vencimento = calcularDASVencimento(ano, mes)

  await prisma.faturamento_mes.update({
    where: { id: faturamentoId },
    data: {
      receita_total: kpis.receita_total,
      receita_ml: kpis.receita_ml,
      receita_magalu: kpis.receita_magalu,
      receita_casas_bahia: kpis.receita_casas_bahia,
      receita_amazon: kpis.receita_amazon,
      receita_shopee: kpis.receita_shopee,
      receita_tiktok: kpis.receita_tiktok,
      receita_presencial: kpis.receita_presencial,
      receita_outros: kpis.receita_outros,
      desp_armazenagem: kpis.desp_armazenagem,
      desp_ads_ml: kpis.desp_ads_ml,
      desp_ads_outros: kpis.desp_ads_outros,
      desp_custo_produtos: kpis.desp_custo_produtos,
      desp_tarifas: kpis.desp_tarifas,
      desp_frete: kpis.desp_frete,
      desp_fatura_ml: kpis.desp_fatura_ml,
      desp_outras_taxas: kpis.desp_outras_taxas,
      das_valor_calc: kpis.das_valor_calc,
      das_vencimento: vencimento,
      desp_pro_labore: kpis.desp_pro_labore,
      desp_inss: kpis.desp_inss,
      desp_contabilidade: kpis.desp_contabilidade,
      desp_erp: kpis.desp_erp,
      desp_emprestimo: kpis.desp_emprestimo,
      desp_aluguel: kpis.desp_aluguel,
      desp_pagina_ml: kpis.desp_pagina_ml,
      desp_previdencia_privada: kpis.desp_previdencia_privada,
      desp_fixas_outras: kpis.desp_fixas_outras,
      ticket_medio: kpis.ticket_medio,
      lucro_bruto: kpis.lucro_bruto,
      lucro_liquido: kpis.lucro_liquido,
      margem_contribuicao: kpis.margem_contribuicao,
      break_even: kpis.break_even,
      roas_atual: kpis.roas_atual,
      dlr_socio: kpis.dlr_socio,
      reinvestimento: kpis.reinvestimento,
      // dias_com_venda: NÃO sobrescrever aqui.
      // O valor real vem da importação por marketplace (Amazon salva o count real).
      // Se reescrevêssemos aqui, ficaríamos com 1 (todos os lançamentos = data 01/mês).
      // Preservar o valor já persistido no DB.
    },
  })
}

// =============================================
// FATURAMENTO MÊS — UPSERT
// =============================================

export async function upsertFaturamentoMes(ano: number, mes: number) {
  const { workspaceId } = await getAuthContext()
  const empresa = await prisma.empresa.findUnique({
    where: { workspace_id: workspaceId },
    select: { aliquota_simples: true },
  })
  const aliquota = empresa?.aliquota_simples ?? 0.06
  const diasNoMes = getDiasNoMes(ano, mes)
  const vencimento = calcularDASVencimento(ano, mes)

  const fat = await prisma.faturamento_mes.upsert({
    where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano, mes } },
    update: {},
    create: {
      workspace_id: workspaceId,
      ano, mes,
      aliquota_simples: aliquota,
      dias_no_mes: diasNoMes,
      das_vencimento: vencimento,
    },
  })
  return fat
}

// =============================================
// CONFIGURAR MÊS (alíquota + meta + replicar fixas)
// =============================================

export async function configurarMes(
  ano: number,
  mes: number,
  data: {
    aliquota_simples: number
    meta_mes: number
    replicar_fixas: boolean
  }
) {
  const { workspaceId } = await getAuthContext()
  await upsertFaturamentoMes(ano, mes)

  const fat = await prisma.faturamento_mes.findUnique({
    where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano, mes } },
  })
  if (!fat) throw new Error('Mês não encontrado')

  await prisma.faturamento_mes.update({
    where: { id: fat.id },
    data: {
      aliquota_simples: data.aliquota_simples,
      meta_mes: data.meta_mes,
      dias_no_mes: getDiasNoMes(ano, mes),
    },
  })

  // Replicar despesas fixas
  if (data.replicar_fixas) {
    const templates = await prisma.despesa_fixa_template.findMany({
      where: { workspace_id: workspaceId, ativo: true, recorrente: true },
      orderBy: { ordem: 'asc' },
    })

    // Remove fixas automáticas existentes do mês
    await prisma.lancamento.deleteMany({
      where: { faturamento_id: fat.id, e_fixo: true },
    })

    const primeiroDia = new Date(ano, mes - 1, 1)

    for (const t of templates) {
      if (t.categoria === 'PREVIDENCIA_PRIVADA') continue // calculada pela engine
      if (t.valor_padrao <= 0) continue

      await prisma.lancamento.create({
        data: {
          faturamento_id: fat.id,
          tipo: 'DESPESA_FIXA',
          categoria: t.categoria,
          descricao: t.nome,
          valor: t.valor_padrao,
          data: primeiroDia,
          e_fixo: true,
          status: 'CONFIRMADO',
        },
      })
    }

    await recalcularMes(fat.id, workspaceId, ano, mes)
  }

  revalidatePath(`/faturamento/${ano}/${mes}`)
  revalidatePath('/faturamento')
}

// =============================================
// RETIRADA DO SÓCIO (DLR) — CONFIGURÁVEL POR MÊS
// =============================================

export async function configurarRetiradaMes(
  ano: number,
  mes: number,
  data:
    | { modo: 'GLOBAL' }                       // usa o percentual global de Configurações
    | { modo: 'PERCENTUAL'; percentual: number } // percentual customizado deste mês (0-1)
    | { modo: 'FIXO'; valor: number }            // valor fixo (R$) deste mês
) {
  const { workspaceId } = await getAuthContext()

  const fat = await prisma.faturamento_mes.findUnique({
    where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano, mes } },
  })
  if (!fat) throw new Error('Mês não encontrado')
  if (fat.fechado) throw new Error('Mês fechado — reabra para alterar a retirada do sócio')

  await prisma.faturamento_mes.update({
    where: { id: fat.id },
    data: {
      dlr_modo: data.modo === 'FIXO' ? 'FIXO' : 'PERCENTUAL',
      dlr_percentual_custom: data.modo === 'PERCENTUAL' ? data.percentual : null,
      dlr_valor_fixo: data.modo === 'FIXO' ? data.valor : null,
    },
  })

  await recalcularMes(fat.id, workspaceId, ano, mes)
  revalidatePath(`/faturamento/${ano}/${mes}`)
  revalidatePath('/faturamento')
}

// =============================================
// LANÇAMENTOS
// =============================================

export async function addLancamento(
  ano: number,
  mes: number,
  input: {
    tipo: string
    categoria: string
    canal?: string
    descricao: string
    valor: number
    data: Date
    observacoes?: string
  }
) {
  const { workspaceId } = await getAuthContext()
  await upsertFaturamentoMes(ano, mes)

  const fat = await prisma.faturamento_mes.findUnique({
    where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano, mes } },
    select: { id: true, fechado: true },
  })
  if (!fat) throw new Error('Mês não encontrado')
  if (fat.fechado) throw new Error('Mês fechado — não é possível adicionar lançamentos')

  await prisma.lancamento.create({
    data: {
      faturamento_id: fat.id,
      tipo: input.tipo,
      categoria: input.categoria,
      canal: input.canal ?? null,
      descricao: input.descricao,
      valor: Math.abs(input.valor),
      data: input.data,
      e_fixo: input.tipo === 'DESPESA_FIXA',
      status: 'CONFIRMADO',
      observacoes: input.observacoes,
    },
  })

  await recalcularMes(fat.id, workspaceId, ano, mes)
  revalidatePath(`/faturamento/${ano}/${mes}`)
  revalidatePath('/faturamento')
}

export async function removeLancamento(lancamentoId: string) {
  const { workspaceId } = await getAuthContext()

  const lanc = await prisma.lancamento.findFirst({
    where: { id: lancamentoId },
    include: { faturamento: { select: { workspace_id: true, ano: true, mes: true, id: true, fechado: true } } },
  })
  if (!lanc || lanc.faturamento.workspace_id !== workspaceId) throw new Error('Não encontrado')
  if (lanc.faturamento.fechado) throw new Error('Mês fechado')

  await prisma.lancamento.delete({ where: { id: lancamentoId } })
  await recalcularMes(lanc.faturamento.id, workspaceId, lanc.faturamento.ano, lanc.faturamento.mes)

  revalidatePath(`/faturamento/${lanc.faturamento.ano}/${lanc.faturamento.mes}`)
  revalidatePath('/faturamento')
}

export async function editarLancamento(
  lancamentoId: string,
  updates: { valor?: number; descricao?: string; data?: Date; observacoes?: string }
) {
  const { workspaceId } = await getAuthContext()

  const lanc = await prisma.lancamento.findFirst({
    where: { id: lancamentoId },
    include: { faturamento: { select: { workspace_id: true, ano: true, mes: true, id: true, fechado: true } } },
  })
  if (!lanc || lanc.faturamento.workspace_id !== workspaceId) throw new Error('Não encontrado')
  if (lanc.faturamento.fechado) throw new Error('Mês fechado')

  await prisma.lancamento.update({
    where: { id: lancamentoId },
    data: {
      ...(updates.valor !== undefined && { valor: Math.abs(updates.valor) }),
      ...(updates.descricao && { descricao: updates.descricao }),
      ...(updates.data && { data: updates.data }),
      ...(updates.observacoes !== undefined && { observacoes: updates.observacoes }),
    },
  })

  await recalcularMes(lanc.faturamento.id, workspaceId, lanc.faturamento.ano, lanc.faturamento.mes)
  revalidatePath(`/faturamento/${lanc.faturamento.ano}/${lanc.faturamento.mes}`)
}

// =============================================
// DESPESAS FIXAS TEMPLATES
// =============================================

export async function getDespesasFixasTemplates() {
  const { workspaceId } = await getAuthContext()
  return prisma.despesa_fixa_template.findMany({
    where: { workspace_id: workspaceId },
    orderBy: { ordem: 'asc' },
  })
}

export async function upsertDespesaFixaTemplate(data: {
  id?: string
  categoria: string
  nome: string
  valor_padrao: number
  formula?: string
  recorrente: boolean
  ativo: boolean
  ordem?: number
}) {
  const { workspaceId } = await getAuthContext()

  if (data.id) {
    await prisma.despesa_fixa_template.update({
      where: { id: data.id },
      data: {
        nome: data.nome,
        valor_padrao: data.valor_padrao,
        formula: data.formula ?? null,
        recorrente: data.recorrente,
        ativo: data.ativo,
      },
    })
  } else {
    const count = await prisma.despesa_fixa_template.count({ where: { workspace_id: workspaceId } })
    await prisma.despesa_fixa_template.create({
      data: {
        workspace_id: workspaceId,
        categoria: data.categoria,
        nome: data.nome,
        valor_padrao: data.valor_padrao,
        formula: data.formula ?? null,
        recorrente: data.recorrente,
        ativo: data.ativo,
        ordem: data.ordem ?? count + 1,
      },
    })
  }

  revalidatePath('/faturamento')
  revalidatePath('/config')
}

export async function deleteDespesaFixaTemplate(id: string) {
  const { workspaceId } = await getAuthContext()
  const t = await prisma.despesa_fixa_template.findFirst({ where: { id, workspace_id: workspaceId } })
  if (!t) throw new Error('Template não encontrado')
  await prisma.despesa_fixa_template.delete({ where: { id } })
  revalidatePath('/config')
}

// =============================================
// REGISTRAR PAGAMENTO DAS
// =============================================

export async function registrarPagamentoDAS(ano: number, mes: number, valorPago: number, dataPagamento: Date) {
  const { workspaceId } = await getAuthContext()

  const fat = await prisma.faturamento_mes.update({
    where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano, mes } },
    data: { das_valor_real: valorPago, das_status: 'PAGO' },
  })

  // Recalcula o mês usando o DAS real informado — Lucro Bruto/Líquido,
  // DLR do Sócio e Reinvestimento passam a refletir a diferença (pra mais ou pra menos)
  // entre o DAS estimado e o DAS efetivamente pago.
  await recalcularMes(fat.id, workspaceId, ano, mes)

  revalidatePath(`/faturamento/${ano}/${mes}`)
  revalidatePath('/faturamento')
}

/**
 * Cancela/remove o registro de pagamento do DAS feito por engano.
 * Volta o status para PENDENTE e o cálculo de Lucro/DLR/Reinvestimento
 * volta a usar a estimativa (receita × alíquota), como antes do registro.
 */
export async function cancelarPagamentoDAS(ano: number, mes: number) {
  const { workspaceId } = await getAuthContext()

  const fat = await prisma.faturamento_mes.update({
    where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano, mes } },
    data: { das_valor_real: null, das_status: 'PENDENTE' },
  })

  await recalcularMes(fat.id, workspaceId, ano, mes)

  revalidatePath(`/faturamento/${ano}/${mes}`)
  revalidatePath('/faturamento')
}

// =============================================
// FECHAR MÊS
// =============================================

export async function fecharMes(ano: number, mes: number) {
  const { workspaceId } = await getAuthContext()

  await prisma.faturamento_mes.update({
    where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano, mes } },
    data: { fechado: true },
  })

  // Salvar no histórico anual
  const fat = await prisma.faturamento_mes.findUnique({
    where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano, mes } },
    select: { receita_total: true, lucro_bruto: true, lucro_liquido: true },
  })
  if (fat) {
    await prisma.historico_faturamento_anual.upsert({
      where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano, mes } },
      update: { faturamento: fat.receita_total, lucro_bruto: fat.lucro_bruto, lucro_liquido: fat.lucro_liquido, fonte: 'SISTEMA' },
      create: { workspace_id: workspaceId, ano, mes, faturamento: fat.receita_total, lucro_bruto: fat.lucro_bruto, lucro_liquido: fat.lucro_liquido, fonte: 'SISTEMA' },
    })
  }

  revalidatePath(`/faturamento/${ano}/${mes}`)
  revalidatePath('/faturamento')
}

// =============================================
// BUSCAR DADOS
// =============================================

export async function getFaturamentoAnual(ano: number) {
  const { workspaceId } = await getAuthContext()
  return prisma.faturamento_mes.findMany({
    where: { workspace_id: workspaceId, ano },
    include: { _count: { select: { lancamentos: true } } },
    orderBy: { mes: 'asc' },
  })
}

export async function getFaturamentoMesCompleto(ano: number, mes: number) {
  const { workspaceId } = await getAuthContext()

  // Garante existência
  await upsertFaturamentoMes(ano, mes)

  const fat = await prisma.faturamento_mes.findUnique({
    where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano, mes } },
    include: {
      lancamentos: { orderBy: [{ data: 'asc' }, { created_at: 'asc' }] },
      das_registros: { orderBy: { created_at: 'desc' } },
    },
  })
  return fat
}

export async function getFinanceConfig(ano: number) {
  const { workspaceId } = await getAuthContext()
  const config = await prisma.finance_config.findUnique({
    where: { workspace_id_ano: { workspace_id: workspaceId, ano } },
  })
  const empresa = await prisma.empresa.findUnique({
    where: { workspace_id: workspaceId },
    select: { aliquota_simples: true },
  })
  return {
    meta_faturamento_anual: config?.meta_faturamento_anual ?? 0,
    percentual_dlr_socio: config?.percentual_dlr_socio ?? 0.5,
    percentual_reinvestimento: config?.percentual_reinvestimento ?? 0.5,
    formula_previdencia: config?.formula_previdencia ?? 'PRO_LABORE*0.20+LUCRO_BRUTO*0.11',
    aliquota_simples: empresa?.aliquota_simples ?? 0.06,
  }
}

export async function updateFinanceConfig(ano: number, data: {
  meta_faturamento_anual?: number
  percentual_dlr_socio?: number
  formula_previdencia?: string
}) {
  const { workspaceId } = await getAuthContext()
  await prisma.finance_config.upsert({
    where: { workspace_id_ano: { workspace_id: workspaceId, ano } },
    update: data,
    create: { workspace_id: workspaceId, ano, ...data },
  })
  revalidatePath('/faturamento')
}

export async function getHistoricoAnual(anos?: number[]) {
  const { workspaceId } = await getAuthContext()
  return prisma.historico_faturamento_anual.findMany({
    where: { workspace_id: workspaceId, ...(anos ? { ano: { in: anos } } : {}) },
    orderBy: [{ ano: 'asc' }, { mes: 'asc' }],
  })
}

export async function upsertHistoricoMensal(
  ano: number,
  dados: { mes: number; faturamento: number }[],
) {
  const { workspaceId } = await getAuthContext()
  for (const d of dados) {
    await prisma.historico_faturamento_anual.upsert({
      where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano, mes: d.mes } },
      update: { faturamento: d.faturamento, fonte: 'IMPORTADO' },
      create: { workspace_id: workspaceId, ano, mes: d.mes, faturamento: d.faturamento, fonte: 'IMPORTADO' },
    })
  }
  revalidatePath('/faturamento/crescimento')
}

// Seed com dados históricos reais 2023-2025 (idempotente — não sobrescreve se já existir com fonte SISTEMA)
export async function seedHistorico2023a2025() {
  const { workspaceId } = await getAuthContext()

  const historico: { ano: number; mes: number; faturamento: number }[] = [
    // 2023
    { ano: 2023, mes:  1, faturamento:    230.00 },
    { ano: 2023, mes:  2, faturamento:    272.88 },
    { ano: 2023, mes:  3, faturamento:  1867.00  },
    { ano: 2023, mes:  4, faturamento:  5609.76  },
    { ano: 2023, mes:  5, faturamento:  1767.06  },
    { ano: 2023, mes:  6, faturamento: 45014.31  },
    { ano: 2023, mes:  7, faturamento: 42550.79  },
    { ano: 2023, mes:  8, faturamento: 12044.38  },
    { ano: 2023, mes:  9, faturamento: 12993.68  },
    { ano: 2023, mes: 10, faturamento: 12182.90  },
    { ano: 2023, mes: 11, faturamento:  4254.88  },
    { ano: 2023, mes: 12, faturamento: 14786.57  },
    // 2024
    { ano: 2024, mes:  1, faturamento:  9974.79  },
    { ano: 2024, mes:  2, faturamento:  3272.88  },
    { ano: 2024, mes:  3, faturamento:  7867.00  },
    { ano: 2024, mes:  4, faturamento: 13609.76  },
    { ano: 2024, mes:  5, faturamento: 56767.06  },
    { ano: 2024, mes:  6, faturamento: 73014.31  },
    { ano: 2024, mes:  7, faturamento: 56550.79  },
    { ano: 2024, mes:  8, faturamento: 23044.38  },
    { ano: 2024, mes:  9, faturamento: 30993.68  },
    { ano: 2024, mes: 10, faturamento: 25182.90  },
    { ano: 2024, mes: 11, faturamento:  7254.88  },
    { ano: 2024, mes: 12, faturamento: 21786.57  },
    // 2025
    { ano: 2025, mes:  1, faturamento:  9962.05  },
    { ano: 2025, mes:  2, faturamento:  9076.29  },
    { ano: 2025, mes:  3, faturamento:  4669.56  },
    { ano: 2025, mes:  4, faturamento:  3605.81  },
    { ano: 2025, mes:  5, faturamento: 38647.60  },
    { ano: 2025, mes:  6, faturamento: 89614.13  },
    { ano: 2025, mes:  7, faturamento: 100901.94 },
    { ano: 2025, mes:  8, faturamento: 90811.67  },
    { ano: 2025, mes:  9, faturamento: 34440.71  },
    { ano: 2025, mes: 10, faturamento: 19218.70  },
    { ano: 2025, mes: 11, faturamento: 33760.60  },
    { ano: 2025, mes: 12, faturamento: 41451.28  },
  ]

  for (const d of historico) {
    await prisma.historico_faturamento_anual.upsert({
      where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano: d.ano, mes: d.mes } },
      // Só atualiza se a fonte não for SISTEMA (preserva dados fechados pelo sistema)
      update: { faturamento: d.faturamento, fonte: 'IMPORTADO' },
      create: { workspace_id: workspaceId, ano: d.ano, mes: d.mes, faturamento: d.faturamento, fonte: 'IMPORTADO' },
    })
  }

  revalidatePath('/faturamento/crescimento')
  return { ok: true, total: historico.length }
}

export async function getDREAnual(ano: number) {
  const { workspaceId } = await getAuthContext()
  return prisma.faturamento_mes.findMany({
    where: { workspace_id: workspaceId, ano },
    orderBy: { mes: 'asc' },
  })
}
