'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'
import { recalcularMes } from '@/actions/finance'

export interface DadosTiktok {
  mes: number
  ano: number
  aliquota: number
  // Do Demonstrativo (fonte: aba Relatórios)
  receita_bruta: number      // Vendas líquidas dos produtos
  taxas_plataforma: number   // Taxas TikTok (plataforma + serviços, SEM afiliados)
  com_afiliados: number      // Comissão afiliados (já inclusa nas taxas TikTok)
  frete_liquido: number      // Frete líquido ao vendedor (~0 pois TikTok/comprador cobrem)
  cmv: number                // CMV calculado do catálogo
  pedidos: number
  // Descontos informados pelo vendedor (não é custo real, é estratégia de preço)
  desconto_vendedor: number
}

export async function salvarAnaliseTiktok(dados: DadosTiktok) {
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

  // Remove lançamentos TikTok anteriores
  await prisma.lancamento.deleteMany({
    where: { faturamento_id: fat.id, descricao: { contains: '[TikTok]' } },
  })

  const add = (tipo: string, cat: string, desc: string, valor: number, canal?: string) => ({
    faturamento_id: fat.id,
    tipo, categoria: cat,
    canal: canal ?? null,
    descricao: `[TikTok] ${desc}`,
    valor, data: primeiroDia, status: 'CONFIRMADO',
  })

  const lancamentos = []

  // ─── Receita ──────────────────────────────────────────────────────
  if (dados.receita_bruta > 0)
    lancamentos.push(add('RECEITA', 'TIKTOK',
      `Receita de Vendas TikTok Shop — ${dados.pedidos} pedidos`,
      dados.receita_bruta, 'TIKTOK'))

  // ─── Taxas TikTok (plataforma + serviços, SEM afiliados) ──────────
  if (dados.taxas_plataforma > 0)
    lancamentos.push(add('DESPESA_VARIAVEL', 'TARIFAS',
      'Taxas TikTok Shop (comissão + serviço)',
      dados.taxas_plataforma))

  // ─── Comissão de Afiliados (separado para visibilidade na DRE) ────
  if (dados.com_afiliados > 0)
    lancamentos.push(add('DESPESA_VARIAVEL', 'ADS_OUTROS',
      'Comissão de Afiliados / Criadores TikTok',
      dados.com_afiliados))

  // ─── Frete (somente se houver custo líquido) ──────────────────────
  if (dados.frete_liquido > 0.01)
    lancamentos.push(add('DESPESA_VARIAVEL', 'FRETE',
      'Frete líquido TikTok Shop',
      dados.frete_liquido))

  // ─── CMV ──────────────────────────────────────────────────────────
  if (dados.cmv > 0)
    lancamentos.push(add('DESPESA_VARIAVEL', 'CUSTO_PRODUTOS',
      'Custo com Produtos (CMV)',
      dados.cmv))

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
