'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'

// =============================================
// EMPRESA / CONFIGURAÇÃO TRIBUTÁRIA
// =============================================

export async function getEmpresa() {
  const { workspaceId } = await getAuthContext()
  return prisma.empresa.findUnique({ where: { workspace_id: workspaceId } })
}

export async function updateEmpresa(data: {
  razao_social?: string
  cnpj?: string
  estado_uf?: string
  aliquota_simples?: number
  icms_padrao?: number
  regime_tributario?: string
}) {
  const { workspaceId } = await getAuthContext()
  await prisma.empresa.update({
    where: { workspace_id: workspaceId },
    data,
  })
  revalidatePath('/config')
  revalidatePath('/faturamento')
}

export async function getAliquotasHistorico(ano: number) {
  const { workspaceId } = await getAuthContext()
  return prisma.aliquota_historico.findMany({
    where: { workspace_id: workspaceId, ano },
    orderBy: { mes: 'asc' },
  })
}

export async function upsertAliquota(ano: number, mes: number, aliquota: number) {
  const { workspaceId } = await getAuthContext()
  await prisma.aliquota_historico.upsert({
    where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano, mes } },
    update: { aliquota },
    create: { workspace_id: workspaceId, ano, mes, aliquota },
  })
  // Atualizar também o faturamento_mes se existir
  const fat = await prisma.faturamento_mes.findUnique({
    where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano, mes } },
  })
  if (fat) {
    await prisma.faturamento_mes.update({
      where: { id: fat.id },
      data: { aliquota_simples: aliquota },
    })
  }
  revalidatePath('/config')
  revalidatePath('/faturamento')
}

// =============================================
// DESPESAS FIXAS
// =============================================

export async function getDespesasFixas() {
  const { workspaceId } = await getAuthContext()
  return prisma.despesa_fixa_template.findMany({
    where: { workspace_id: workspaceId },
    orderBy: { ordem: 'asc' },
  })
}

export async function saveDespesaFixa(data: {
  id?: string
  categoria: string
  nome: string
  valor_padrao: number
  formula?: string
  recorrente: boolean
  ativo: boolean
  amortizacao_mensal?: number
  observacoes?: string
  ordem?: number
  is_pronampe?: boolean
  pronampe_saldo_devedor?: number
  pronampe_meses_restantes?: number
  pronampe_taxa_fixa?: number
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
        amortizacao_mensal: data.amortizacao_mensal ?? null,
        observacoes: data.observacoes ?? null,
        is_pronampe: data.is_pronampe ?? false,
        pronampe_saldo_devedor: data.pronampe_saldo_devedor ?? null,
        pronampe_meses_restantes: data.pronampe_meses_restantes ?? null,
        pronampe_taxa_fixa: data.pronampe_taxa_fixa ?? null,
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
        is_pronampe: data.is_pronampe ?? false,
        pronampe_saldo_devedor: data.pronampe_saldo_devedor ?? null,
        pronampe_meses_restantes: data.pronampe_meses_restantes ?? null,
        pronampe_taxa_fixa: data.pronampe_taxa_fixa ?? null,
        amortizacao_mensal: data.amortizacao_mensal ?? null,
        observacoes: data.observacoes ?? null,
        ordem: data.ordem ?? count + 1,
      },
    })
  }
  revalidatePath('/config')
}

export async function deleteDespesaFixa(id: string) {
  const { workspaceId } = await getAuthContext()
  const t = await prisma.despesa_fixa_template.findFirst({ where: { id, workspace_id: workspaceId } })
  if (!t) throw new Error('Não encontrado')
  await prisma.despesa_fixa_template.delete({ where: { id } })
  revalidatePath('/config')
}

export async function reordenarDespesasFixas(ids: string[]) {
  const { workspaceId } = await getAuthContext()
  for (let i = 0; i < ids.length; i++) {
    const t = await prisma.despesa_fixa_template.findFirst({ where: { id: ids[i], workspace_id: workspaceId } })
    if (t) await prisma.despesa_fixa_template.update({ where: { id: ids[i] }, data: { ordem: i } })
  }
  revalidatePath('/config')
}

// =============================================
// CANAIS
// =============================================

export async function getCanais() {
  const { workspaceId } = await getAuthContext()
  const custom = await prisma.canal.findMany({ where: { workspace_id: workspaceId } })
  const sistema = await prisma.canal.findMany({ where: { workspace_id: null } })
  // Canais customizados sobrescrevem o sistema pelo slug
  const slugsCustom = new Set(custom.map(c => c.slug))
  const merged = [...custom, ...sistema.filter(s => !slugsCustom.has(s.slug))]
  return merged.sort((a, b) => a.nome.localeCompare(b.nome))
}

export async function saveCanal(data: {
  id?: string
  slug?: string
  nome: string
  comissao_perc: number
  taxa_fixa: number
  ativo: boolean
}) {
  const { workspaceId } = await getAuthContext()
  const slug = data.slug ?? data.nome.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

  if (data.id) {
    // Verifica se é do workspace
    const c = await prisma.canal.findFirst({ where: { id: data.id, workspace_id: workspaceId } })
    if (c) {
      await prisma.canal.update({ where: { id: data.id }, data: { nome: data.nome, comissao_perc: data.comissao_perc, taxa_fixa: data.taxa_fixa, ativo: data.ativo } })
    } else {
      // É canal do sistema — cria cópia personalizada
      await prisma.canal.create({ data: { workspace_id: workspaceId, slug, nome: data.nome, comissao_perc: data.comissao_perc, taxa_fixa: data.taxa_fixa, ativo: data.ativo } })
    }
  } else {
    await prisma.canal.create({ data: { workspace_id: workspaceId, slug, nome: data.nome, comissao_perc: data.comissao_perc, taxa_fixa: data.taxa_fixa, ativo: data.ativo } })
  }
  revalidatePath('/config')
}

export async function deleteCanal(id: string) {
  const { workspaceId } = await getAuthContext()
  const c = await prisma.canal.findFirst({ where: { id, workspace_id: workspaceId } })
  if (!c) throw new Error('Não é possível excluir canal do sistema')
  await prisma.canal.delete({ where: { id } })
  revalidatePath('/config')
}

// =============================================
// SÓCIOS / DLR
// =============================================

export async function getSocios() {
  const { workspaceId } = await getAuthContext()
  const socios = await prisma.socio_config.findMany({
    where: { workspace_id: workspaceId, ativo: true },
    orderBy: { ordem: 'asc' },
  })
  const config = await prisma.finance_config.findFirst({
    where: { workspace_id: workspaceId },
    orderBy: { ano: 'desc' },
  })
  return { socios, config }
}

export async function saveSocio(data: { id?: string; nome: string; email?: string; percentual_participacao: number }) {
  const { workspaceId } = await getAuthContext()
  if (data.id) {
    await prisma.socio_config.update({ where: { id: data.id }, data })
  } else {
    const count = await prisma.socio_config.count({ where: { workspace_id: workspaceId } })
    await prisma.socio_config.create({ data: { workspace_id: workspaceId, ...data, ordem: count } })
  }
  revalidatePath('/config')
}

export async function deleteSocio(id: string) {
  const { workspaceId } = await getAuthContext()
  await prisma.socio_config.updateMany({ where: { id, workspace_id: workspaceId }, data: { ativo: false } })
  revalidatePath('/config')
}

export async function updateDLRConfig(ano: number, percentual_dlr_socio: number, formula_previdencia: string) {
  const { workspaceId } = await getAuthContext()
  await prisma.finance_config.upsert({
    where: { workspace_id_ano: { workspace_id: workspaceId, ano } },
    update: { percentual_dlr_socio, percentual_reinvestimento: 1 - percentual_dlr_socio, formula_previdencia },
    create: { workspace_id: workspaceId, ano, percentual_dlr_socio, percentual_reinvestimento: 1 - percentual_dlr_socio, formula_previdencia },
  })
  revalidatePath('/config')
  revalidatePath('/faturamento')
}
