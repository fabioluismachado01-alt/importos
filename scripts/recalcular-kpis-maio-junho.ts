/**
 * Recalcula os KPIs de Maio e Junho 2026 no faturamento_mes
 * após a correção do CMV (novo fator 12.7292).
 * Replica exatamente a lógica de recalcularMes() em src/actions/finance.ts.
 */
import { PrismaClient } from '@prisma/client'
import { calcularKPIs, calcularDASVencimento, getDiasNoMes } from '../src/engines/finance'
import type { LancamentoRaw, FinanceConfig } from '../src/engines/finance'

const prisma = new PrismaClient()

function toDecimalAliq(v: number): number { return v > 1 ? v / 100 : v }

async function recalcularMes(workspaceId: string, ano: number, mes: number) {
  const fat = await prisma.faturamento_mes.findUnique({
    where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano, mes } },
  })
  if (!fat) { console.log(`  ⚠ faturamento_mes ${ano}-${mes} não encontrado`); return }

  const lancamentos = await prisma.lancamento.findMany({
    where: { faturamento_id: fat.id, status: 'CONFIRMADO' },
    select: { tipo: true, categoria: true, canal: true, valor: true, data: true, descricao: true },
  })

  const empresa = await prisma.empresa.findUnique({
    where: { workspace_id: workspaceId },
    select: { aliquota_simples: true },
  })
  const finConfig = await prisma.finance_config.findUnique({
    where: { workspace_id_ano: { workspace_id: workspaceId, ano } },
  })

  const config: FinanceConfig = {
    aliquota_simples: toDecimalAliq(fat.aliquota_simples ?? empresa?.aliquota_simples ?? 6),
    percentual_dlr_socio:      finConfig?.percentual_dlr_socio ?? 0.5,
    percentual_reinvestimento: finConfig?.percentual_reinvestimento ?? 0.5,
    formula_previdencia:       finConfig?.formula_previdencia ?? 'PRO_LABORE*0.20+LUCRO_BRUTO*0.11',
    dias_no_mes:               fat.dias_no_mes,
    meta_mes:                  fat.meta_mes,
    dlr_modo:                  (fat.dlr_modo as 'PERCENTUAL' | 'FIXO') ?? 'PERCENTUAL',
    dlr_percentual_custom:     fat.dlr_percentual_custom,
    dlr_valor_fixo:            fat.dlr_valor_fixo,
    das_valor_real:            fat.das_status === 'PAGO' ? fat.das_valor_real : null,
  }

  // Conta pedidos das descrições de receita
  const PEDIDOS_REGEX = /(\d+)\s+pedidos?/i
  let total_pedidos = 0
  lancamentos.forEach(l => {
    if (l.tipo === 'RECEITA' && l.canal) {
      const m = l.descricao.match(PEDIDOS_REGEX)
      if (m) total_pedidos += parseInt(m[1])
    }
  })
  if (total_pedidos > 0) (config as any).total_pedidos = total_pedidos

  const raw: LancamentoRaw[] = lancamentos.map(l => ({
    tipo:      l.tipo,
    categoria: l.categoria,
    canal:     l.canal,
    valor:     l.valor,
    data:      l.data,
  }))

  const kpis = calcularKPIs(raw, config, 30) // diaAtual=30 (mês fechado)
  const vencimento = calcularDASVencimento(ano, mes)

  await prisma.faturamento_mes.update({
    where: { id: fat.id },
    data: {
      receita_total:         kpis.receita_total,
      receita_ml:            kpis.receita_ml,
      receita_magalu:        kpis.receita_magalu,
      receita_casas_bahia:   kpis.receita_casas_bahia,
      receita_amazon:        kpis.receita_amazon,
      receita_shopee:        kpis.receita_shopee,
      receita_tiktok:        kpis.receita_tiktok,
      receita_presencial:    kpis.receita_presencial,
      receita_outros:        kpis.receita_outros,
      desp_armazenagem:      kpis.desp_armazenagem,
      desp_ads_ml:           kpis.desp_ads_ml,
      desp_ads_outros:       kpis.desp_ads_outros,
      desp_custo_produtos:   kpis.desp_custo_produtos,
      desp_tarifas:          kpis.desp_tarifas,
      desp_frete:            kpis.desp_frete,
      desp_fatura_ml:        kpis.desp_fatura_ml,
      desp_outras_taxas:     kpis.desp_outras_taxas,
      das_valor_calc:        kpis.das_valor_calc,
      desp_pro_labore:       kpis.desp_pro_labore,
      desp_inss:             kpis.desp_inss,
      desp_contabilidade:    kpis.desp_contabilidade,
      desp_erp:              kpis.desp_erp,
      desp_emprestimo:       kpis.desp_emprestimo,
      desp_aluguel:          kpis.desp_aluguel,
      desp_pagina_ml:        kpis.desp_pagina_ml,
      desp_previdencia_privada: kpis.desp_previdencia_privada,
      desp_fixas_outras:     kpis.desp_fixas_outras,
      ticket_medio:          kpis.ticket_medio,
      lucro_bruto:           kpis.lucro_bruto,
      lucro_liquido:         kpis.lucro_liquido,
      margem_contribuicao:   kpis.margem_contribuicao,
      break_even:            kpis.break_even,
      roas_atual:            kpis.roas_atual,
      dlr_socio:             kpis.dlr_socio,
      reinvestimento:        kpis.reinvestimento,
      dias_com_venda:        kpis.dias_com_venda,
      das_vencimento:        vencimento,
    },
  })

  return {
    receita:        kpis.receita_total,
    cmv:            kpis.desp_custo_produtos,
    lucro_bruto:    kpis.lucro_bruto,
    lucro_liquido:  kpis.lucro_liquido,
    margem:         kpis.margem_contribuicao,
    dlr_socio:      kpis.dlr_socio,
  }
}

async function main() {
  const workspace = await prisma.workspace.findFirst({ select: { id: true, nome: true } })
  if (!workspace) { console.log('Nenhum workspace'); return }
  console.log(`Workspace: ${workspace.nome}\n`)

  for (const [ano, mes] of [[2026, 5], [2026, 6]]) {
    const label = `${ano}-${String(mes).padStart(2,'0')}`
    console.log(`\n═══ ${label} ═══`)
    const r = await recalcularMes(workspace.id, ano, mes)
    if (r) {
      console.log(`  Receita:      R$ ${r.receita.toFixed(2)}`)
      console.log(`  CMV total:    R$ ${r.cmv.toFixed(2)}`)
      console.log(`  Lucro Bruto:  R$ ${r.lucro_bruto.toFixed(2)}`)
      console.log(`  Lucro Líq.:   R$ ${r.lucro_liquido.toFixed(2)}`)
      console.log(`  Margem:       ${r.margem.toFixed(1)}%`)
      console.log(`  DLR Sócio:    R$ ${r.dlr_socio.toFixed(2)}`)
    }
  }

  console.log('\n✓ KPIs de Maio e Junho atualizados no banco.')
}

main().catch(console.error).finally(() => prisma.$disconnect())
