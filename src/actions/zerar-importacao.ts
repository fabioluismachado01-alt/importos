'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'
import { recalcularMes } from '@/actions/finance'

// Mapeamento: marketplace → padrões de descrição reconhecidos
const PADROES: Record<string, string[]> = {
  AMAZON:  ['[Amazon]', 'Amazon Import'],
  ML:      ['[ML]',     'ML Import'],
  SHOPEE:  ['[Shopee]', 'Shopee Import'],
  TIKTOK:  ['[TikTok]', 'TikTok Import'],
  MAGALU:  ['[Magalu]', 'Magalu Import'],
}

export type MarketplaceKey = keyof typeof PADROES

export interface StatusImportacao {
  marketplace: MarketplaceKey
  label: string
  count: number
  receita: number
  temDados: boolean
}

// Retorna quais marketplaces têm dados importados no mês
export async function getStatusImportacoes(ano: number, mes: number): Promise<StatusImportacao[]> {
  const { workspaceId } = await getAuthContext()

  const fat = await prisma.faturamento_mes.findUnique({
    where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano, mes } },
    select: { id: true, lancamentos: { select: { id: true, descricao: true, tipo: true, valor: true } } }
  })

  if (!fat) return []

  const LABELS: Record<MarketplaceKey, string> = {
    AMAZON: 'Amazon', ML: 'Mercado Livre', SHOPEE: 'Shopee',
    TIKTOK: 'TikTok Shop', MAGALU: 'Magalu',
  }

  return (Object.keys(PADROES) as MarketplaceKey[]).map(mkt => {
    const padroes = PADROES[mkt]
    const lancs = fat.lancamentos.filter(l =>
      padroes.some(p => l.descricao.includes(p))
    )
    const receita = lancs
      .filter(l => l.tipo === 'RECEITA')
      .reduce((s, l) => s + l.valor, 0)

    return {
      marketplace: mkt,
      label: LABELS[mkt],
      count: lancs.length,
      receita,
      temDados: lancs.length > 0,
    }
  }).filter(s => s.temDados) // só retorna os que têm dados
}

// Deleta todos os lançamentos de um marketplace no mês
export async function zerarImportacaoMarketplace(
  ano: number,
  mes: number,
  marketplace: MarketplaceKey
) {
  const { workspaceId } = await getAuthContext()

  const fat = await prisma.faturamento_mes.findUnique({
    where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano, mes } },
    select: { id: true, fechado: true }
  })

  if (!fat) throw new Error('Mês não encontrado')
  if (fat.fechado) throw new Error(`${mes}/${ano} está fechado. Reabra antes de apagar importações.`)

  const padroes = PADROES[marketplace]
  if (!padroes) throw new Error('Marketplace inválido')

  // Conta antes de deletar para retornar feedback
  const antes = await prisma.lancamento.count({
    where: {
      faturamento_id: fat.id,
      OR: padroes.map(p => ({ descricao: { contains: p } }))
    }
  })

  if (antes === 0) throw new Error('Nenhum lançamento encontrado para este marketplace.')

  // Deleta
  await prisma.lancamento.deleteMany({
    where: {
      faturamento_id: fat.id,
      OR: padroes.map(p => ({ descricao: { contains: p } }))
    }
  })

  // Recalcula KPIs do mês
  await recalcularMes(fat.id, workspaceId, ano, mes)

  revalidatePath(`/faturamento/${ano}/${mes}`)
  revalidatePath('/faturamento')
  revalidatePath('/dashboard')

  return { ok: true, deletados: antes, marketplace, mes, ano }
}
