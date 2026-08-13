'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'
import { recalcularMes } from '@/actions/finance'

interface AvulsasPayload {
  periodo: { ano: number; mes: number }
  receita_total: number
  taxas_total: number
  liquido_total: number
  cmv_total: number
  pedidos: number
  unidades_total: number
  canais: { canal: string; receita: number; taxas: number; pedidos: number }[]
}

export async function salvarAnaliseAvulsas(dados: AvulsasPayload): Promise<{ ok: boolean; error?: string }> {
  try {
    const { workspaceId } = await getAuthContext()
    const { ano, mes } = dados.periodo

    const diasNoMes = new Date(ano, mes, 0).getDate()
    const mesVenc = mes === 12 ? 1 : mes + 1
    const anoVenc = mes === 12 ? ano + 1 : ano
    const vencDas = new Date(anoVenc, mesVenc - 1, 20)
    const primeiroDia = new Date(Date.UTC(ano, mes - 1, 1, 12, 0, 0))

    const empresa = await prisma.empresa.findUnique({
      where: { workspace_id: workspaceId }, select: { aliquota_simples: true },
    })
    const aliquota = empresa?.aliquota_simples ?? 0.08

    const fat = await prisma.faturamento_mes.upsert({
      where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano, mes } },
      update: {},
      create: { workspace_id: workspaceId, ano, mes, aliquota_simples: aliquota, dias_no_mes: diasNoMes, das_vencimento: vencDas },
    })

    if (fat.fechado) return { ok: false, error: `${mes}/${ano} está fechado. Reabra antes de importar.` }

    await prisma.lancamento.deleteMany({
      where: { faturamento_id: fat.id, descricao: { contains: '[Avulsas]' } },
    })

    const add = (tipo: string, cat: string, desc: string, valor: number, canal?: string) => ({
      faturamento_id: fat.id, tipo, categoria: cat,
      canal: canal ?? null,
      descricao: `[Avulsas] ${desc}`,
      valor, data: primeiroDia, status: 'CONFIRMADO',
    })

    const lancamentos = []

    // Receita por canal
    for (const c of dados.canais) {
      if (c.receita > 0)
        lancamentos.push(add('RECEITA', 'OUTROS', `Receita ${c.canal} — ${c.pedidos} venda(s)`, c.receita, c.canal.toUpperCase()))
      if (c.taxas > 0)
        lancamentos.push(add('DESPESA_VARIAVEL', 'TARIFAS', `Taxas ${c.canal}`, c.taxas, c.canal.toUpperCase()))
    }

    if (dados.cmv_total > 0)
      lancamentos.push(add('DESPESA_VARIAVEL', 'CMV',
        `CMV Vendas Avulsas — ${dados.unidades_total} unid.`, dados.cmv_total))

    if (lancamentos.length > 0)
      await prisma.lancamento.createMany({ data: lancamentos })

    await recalcularMes(fat.id, workspaceId, ano, mes)
    revalidatePath('/vendas/avulsas')
    revalidatePath('/financeiro')

    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
