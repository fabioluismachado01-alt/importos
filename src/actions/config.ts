'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'
import { recalcularMes } from '@/actions/finance'

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
    // Recalcula KPIs do mês para manter das_valor_calc e lucro_liquido sincronizados
    await recalcularMes(fat.id, workspaceId, ano, mes)
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

export type CanalFaixa = {
  id: string
  canal_id: string
  preco_min: number
  preco_max: number | null
  comissao_perc: number
  taxa_fixa: number
  ordem: number
}

export type CanalComFaixas = {
  id: string
  workspace_id: string | null
  nome: string
  slug: string
  comissao_perc: number
  taxa_fixa: number
  ativo: boolean
  modo: string  // AUTO | MANUAL
  faixas: CanalFaixa[]
}

const FAIXAS_INCLUDE = { faixas: { orderBy: { ordem: 'asc' as const } } }

export async function getCanais(): Promise<CanalComFaixas[]> {
  const { workspaceId } = await getAuthContext()
  const custom = await prisma.canal.findMany({ where: { workspace_id: workspaceId }, include: FAIXAS_INCLUDE })
  const sistema = await prisma.canal.findMany({ where: { workspace_id: null }, include: FAIXAS_INCLUDE })
  const slugsCustom = new Set(custom.map(c => c.slug))
  const merged = [...custom, ...sistema.filter(s => !slugsCustom.has(s.slug))]
  return merged.sort((a, b) => a.nome.localeCompare(b.nome)) as CanalComFaixas[]
}

export async function saveCanal(data: {
  id?: string
  slug?: string
  nome: string
  ativo: boolean
  modo?: string
  faixas: Array<{ preco_min: number; preco_max?: number | null; comissao_perc: number; taxa_fixa: number; ordem: number }>
}) {
  const { workspaceId } = await getAuthContext()
  const slug = data.slug ?? data.nome.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const firstFaixa = data.faixas[0]
  const comissao_perc = firstFaixa?.comissao_perc ?? 0
  const taxa_fixa = firstFaixa?.taxa_fixa ?? 0
  const modo = data.modo ?? 'AUTO'

  let canalId: string

  if (data.id) {
    const c = await prisma.canal.findFirst({ where: { id: data.id, workspace_id: workspaceId } })
    if (c) {
      await prisma.canal.update({ where: { id: data.id }, data: { nome: data.nome, comissao_perc, taxa_fixa, ativo: data.ativo, modo } })
      canalId = data.id
    } else {
      // Canal do sistema — upsert cópia workspace
      const existing = await prisma.canal.findFirst({ where: { workspace_id: workspaceId, slug } })
      if (existing) {
        await prisma.canal.update({ where: { id: existing.id }, data: { nome: data.nome, comissao_perc, taxa_fixa, ativo: data.ativo, modo } })
        canalId = existing.id
      } else {
        const novo = await prisma.canal.create({ data: { workspace_id: workspaceId, slug, nome: data.nome, comissao_perc, taxa_fixa, ativo: data.ativo, modo } })
        canalId = novo.id
      }
    }
  } else {
    const novo = await prisma.canal.create({ data: { workspace_id: workspaceId, slug, nome: data.nome, comissao_perc, taxa_fixa, ativo: data.ativo, modo } })
    canalId = novo.id
  }

  await prisma.canal_faixa.deleteMany({ where: { canal_id: canalId } })
  if (data.faixas.length > 0) {
    await prisma.canal_faixa.createMany({
      data: data.faixas.map((f, i) => ({
        canal_id: canalId,
        preco_min: f.preco_min,
        preco_max: f.preco_max ?? null,
        comissao_perc: f.comissao_perc,
        taxa_fixa: f.taxa_fixa,
        ordem: i,
      })),
    })
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

// =============================================
// RESTAURAÇÃO PONTUAL DE ALÍQUOTAS JAN–ABR/2026
// =============================================

// Restaura os valores auditados de Jan–Abr/2026 que foram sobrescritos
// incorretamente. Idempotente: só escreve se o valor estiver diferente.
// Meses fechados nunca são recalculados automaticamente — apenas o campo
// aliquota_simples / aliquota_historico é corrigido.
export async function restaurarAliquotasJanAbr2026(): Promise<void> {
  const { workspaceId } = await getAuthContext()
  const ano = 2026
  const corretos = [
    { mes: 1, aliquota: 6.74 },
    { mes: 2, aliquota: 6.97 },
    { mes: 3, aliquota: 7.50 },
    { mes: 4, aliquota: 8.00 },
  ]
  for (const { mes, aliquota } of corretos) {
    const atual = await prisma.aliquota_historico.findUnique({
      where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano, mes } },
      select: { aliquota: true },
    })
    if (atual && Math.abs(Number(atual.aliquota) - aliquota) < 0.01) continue
    await Promise.all([
      prisma.aliquota_historico.upsert({
        where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano, mes } },
        update: { aliquota },
        create: { workspace_id: workspaceId, ano, mes, aliquota },
      }),
      prisma.faturamento_mes.updateMany({
        where: { workspace_id: workspaceId, ano, mes },
        data: { aliquota_simples: aliquota },
      }),
    ])
  }
}
