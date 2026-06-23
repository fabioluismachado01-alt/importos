'use server'

import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'

export interface ImpostosPageData {
  // Dados reais do sistema
  faturamentoMesAtual: number    // receita_total do mês atual (ou mês anterior se ainda sem dados)
  cmvMesAtual: number            // desp_custo_produtos
  despesasMesAtual: number       // soma de todas as despesas operacionais (exceto DAS e CMV)
  rbt12: number                  // soma dos últimos 12 meses de historico_faturamento_anual
  rbt12Meses: { ano: number; mes: number; faturamento: number }[]

  // Config da empresa
  regime_tributario: string | null
  aliquota_simples: number
  estado_uf: string | null

  // Mês/ano de referência
  anoRef: number
  mesRef: number

  // Valor aduaneiro CIF dos rateios salvos do mês de referência
  valorAduaneiroRateios: number
  totalRateiosSalvos: number
}

export async function getImpostosData(): Promise<ImpostosPageData> {
  const { workspaceId } = await getAuthContext()

  const CAMPOS_FAT = {
    receita_total: true,
    desp_custo_produtos: true,
    desp_armazenagem: true,
    desp_ads_ml: true,
    desp_ads_outros: true,
    desp_tarifas: true,
    desp_frete: true,
    desp_fatura_ml: true,
    desp_outras_taxas: true,
    desp_pro_labore: true,
    desp_inss: true,
    desp_contabilidade: true,
    desp_erp: true,
    desp_emprestimo: true,
    desp_aluguel: true,
    desp_pagina_ml: true,
    desp_previdencia_privada: true,
    desp_fixas_outras: true,
    ano: true,
    mes: true,
  } as const

  const hoje = new Date()
  const anoAtual = hoje.getFullYear()
  const mesAtual = hoje.getMonth() + 1

  // Tenta mês atual primeiro; se não tiver dados, pega o mês mais recente com receita
  const fatAtual = await prisma.faturamento_mes.findUnique({
    where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano: anoAtual, mes: mesAtual } },
    select: CAMPOS_FAT,
  })

  const fatRef = (fatAtual && fatAtual.receita_total > 0)
    ? fatAtual
    : await prisma.faturamento_mes.findFirst({
        where: { workspace_id: workspaceId, receita_total: { gt: 0 } },
        orderBy: [{ ano: 'desc' }, { mes: 'desc' }],
        select: CAMPOS_FAT,
      })

  const anoRef = fatRef?.ano ?? anoAtual
  const mesRef = fatRef?.mes ?? mesAtual

  const faturamentoMesAtual = fatRef?.receita_total ?? 0
  const cmvMesAtual = fatRef?.desp_custo_produtos ?? 0

  // Despesas operacionais = tudo exceto CMV e DAS
  const despesasMesAtual = fatRef
    ? (fatRef.desp_armazenagem ?? 0)
      + (fatRef.desp_ads_ml ?? 0)
      + (fatRef.desp_ads_outros ?? 0)
      + (fatRef.desp_tarifas ?? 0)
      + (fatRef.desp_frete ?? 0)
      + (fatRef.desp_fatura_ml ?? 0)
      + (fatRef.desp_outras_taxas ?? 0)
      + (fatRef.desp_pro_labore ?? 0)
      + (fatRef.desp_inss ?? 0)
      + (fatRef.desp_contabilidade ?? 0)
      + (fatRef.desp_erp ?? 0)
      + (fatRef.desp_emprestimo ?? 0)
      + (fatRef.desp_aluguel ?? 0)
      + (fatRef.desp_pagina_ml ?? 0)
      + (fatRef.desp_previdencia_privada ?? 0)
      + (fatRef.desp_fixas_outras ?? 0)
    : 0

  // RBT12: soma dos últimos 12 meses do histórico
  const dataLimite = new Date(anoRef, mesRef - 1, 1)
  dataLimite.setMonth(dataLimite.getMonth() - 11)
  const anoLimite = dataLimite.getFullYear()
  const mesLimite = dataLimite.getMonth() + 1

  const historico = await prisma.historico_faturamento_anual.findMany({
    where: {
      workspace_id: workspaceId,
      OR: [
        { ano: { gt: anoLimite } },
        { ano: anoLimite, mes: { gte: mesLimite } },
      ],
    },
    orderBy: [{ ano: 'asc' }, { mes: 'asc' }],
    take: 12,
  })

  // Filtra apenas os 12 meses antes do mês de referência (não inclui o mês ref)
  const rbt12Meses = historico.filter(h => {
    if (h.ano < anoRef) return true
    if (h.ano === anoRef && h.mes < mesRef) return true
    return false
  }).slice(-12)

  const rbt12 = rbt12Meses.reduce((acc, h) => acc + h.faturamento, 0)

  const [empresa, todosItensImportados] = await Promise.all([
    prisma.empresa.findUnique({
      where: { workspace_id: workspaceId },
      select: { regime_tributario: true, aliquota_simples: true, estado_uf: true },
    }),
    // Busca todos os itens de rateio com SKU vinculado, ordenados do mais recente ao mais antigo
    prisma.rateio_item.findMany({
      where: {
        produto_id: { not: null },
        rateio: { workspace_id: workspaceId, status: 'SALVO' },
      },
      select: {
        produto_id: true,
        qty: true,
        valor_aduaneiro_unit_brl: true,
        rateio: { select: { created_at: true } },
      },
      orderBy: { rateio: { created_at: 'desc' } },
    }),
  ])

  // Para cada SKU, usa apenas o último rateio em que apareceu
  const ultimoPorSku = new Map<string, { qty: number; valorUnitBrl: number }>()
  for (const item of todosItensImportados) {
    if (!item.produto_id) continue
    if (!ultimoPorSku.has(item.produto_id)) {
      ultimoPorSku.set(item.produto_id, {
        qty: item.qty,
        valorUnitBrl: item.valor_aduaneiro_unit_brl ?? 0,
      })
    }
  }

  // Valor aduaneiro total = soma de (qty × CIF_unit) do último rateio de cada SKU
  const valorAduaneiroRateios = [...ultimoPorSku.values()]
    .reduce((acc, v) => acc + v.qty * v.valorUnitBrl, 0)

  return {
    faturamentoMesAtual,
    cmvMesAtual,
    despesasMesAtual,
    rbt12,
    rbt12Meses,
    regime_tributario: empresa?.regime_tributario ?? null,
    aliquota_simples: empresa?.aliquota_simples ?? 0.06,
    estado_uf: empresa?.estado_uf ?? null,
    anoRef,
    mesRef,
    valorAduaneiroRateios,
    totalRateiosSalvos: ultimoPorSku.size,
  }
}
