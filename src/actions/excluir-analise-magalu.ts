'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'
import { recalcularMes } from '@/actions/finance'

export async function excluirAnaliseMagalu(ano: number, mes: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const { workspaceId } = await getAuthContext()

    const fat = await prisma.faturamento_mes.findUnique({
      where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano, mes } },
    })

    if (!fat) return { ok: true }
    if (fat.fechado) return { ok: false, error: `${mes}/${ano} está fechado.` }

    await prisma.lancamento.deleteMany({
      where: { faturamento_id: fat.id, descricao: { contains: '[Magalu]' } },
    })

    await recalcularMes(fat.id, workspaceId, ano, mes)
    revalidatePath('/vendas/magalu')
    revalidatePath('/financeiro')

    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
