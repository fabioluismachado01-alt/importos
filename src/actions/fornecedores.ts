'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'

const LIMITE = 5

export async function getFornecedores() {
  const { workspaceId } = await getAuthContext()
  return prisma.fornecedor.findMany({
    where: { workspace_id: workspaceId, ativo: true },
    orderBy: { nome_empresa: 'asc' },
  })
}

export async function saveFornecedor(data: {
  id?: string
  nome_empresa: string
  contato?: string
  email?: string
  endereco?: string
  pais?: string
}) {
  const { workspaceId } = await getAuthContext()

  if (!data.id) {
    const count = await prisma.fornecedor.count({
      where: { workspace_id: workspaceId, ativo: true },
    })
    if (count >= LIMITE) {
      throw new Error(`Limite de ${LIMITE} fornecedores atingido. Remova um para adicionar outro.`)
    }
  }

  const result = data.id
    ? await prisma.fornecedor.update({
        where: { id: data.id },
        data: { nome_empresa: data.nome_empresa, contato: data.contato, email: data.email, endereco: data.endereco, pais: data.pais },
      })
    : await prisma.fornecedor.create({
        data: { workspace_id: workspaceId, nome_empresa: data.nome_empresa, contato: data.contato, email: data.email, endereco: data.endereco, pais: data.pais },
      })

  revalidatePath('/ferramentas/documentacao')
  return result
}

export async function deleteFornecedor(id: string) {
  const { workspaceId } = await getAuthContext()
  await prisma.fornecedor.updateMany({
    where: { id, workspace_id: workspaceId },
    data: { ativo: false },
  })
  revalidatePath('/ferramentas/documentacao')
}

export async function getProdutoPorSku(sku: string) {
  const { workspaceId } = await getAuthContext()
  return prisma.produto_catalogo.findFirst({
    where: { workspace_id: workspaceId, sku_interno: sku, ativo: true },
    select: { nome: true, descricao: true, ncm: true, custo_brl: true },
  })
}
