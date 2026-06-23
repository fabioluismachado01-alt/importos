'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'
import { recalcularMes } from '@/actions/finance'

export interface DadosMagalu {
  mes: number; ano: number; aliquota: number
  receita_total: number
  servicos_total: number     // tarifa + tech + intermed + MDR + adm
  ads_magalu: number         // valor manual de Magalu Ads
  cmv_total: number
  pedidos: number; unidades: number
}

export async function salvarAnaliseMagalu(dados: DadosMagalu) {
  const { workspaceId } = await getAuthContext()
  const { mes, ano, aliquota } = dados

  const empresa = await prisma.empresa.findUnique({
    where: { workspace_id: workspaceId }, select: { aliquota_simples: true },
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

  await prisma.lancamento.deleteMany({
    where: { faturamento_id: fat.id, descricao: { contains: '[Magalu]' } },
  })

  const add = (tipo: string, cat: string, desc: string, valor: number, canal?: string) => ({
    faturamento_id: fat.id, tipo, categoria: cat,
    canal: canal ?? null,
    descricao: `[Magalu] ${desc}`,
    valor, data: primeiroDia, status: 'CONFIRMADO',
  })

  const lancamentos = []

  if (dados.receita_total > 0)
    lancamentos.push(add('RECEITA', 'MAGALU',
      `Receita de Vendas — ${dados.pedidos} pedidos, ${dados.unidades} un.`,
      dados.receita_total, 'MAGALU'))

  if (dados.servicos_total > 0)
    lancamentos.push(add('DESPESA_VARIAVEL', 'TARIFAS',
      'Serviços Marketplace Magalu (tarifa + tech + intermediação + MDR)',
      dados.servicos_total))

  if (dados.ads_magalu > 0)
    lancamentos.push(add('DESPESA_VARIAVEL', 'ADS_OUTROS',
      'Magalu Ads (manual)', dados.ads_magalu))

  if (dados.cmv_total > 0)
    lancamentos.push(add('DESPESA_VARIAVEL', 'CUSTO_PRODUTOS',
      'Custo com Produtos (CMV)', dados.cmv_total))

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
