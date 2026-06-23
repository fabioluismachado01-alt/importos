/**
 * Recalcula Maio 2026 usando a engine completa do Finance
 * Corrige: ROAS, Ticket Médio, Break-Even, Margem, Dias c/ Venda
 *
 * Também corrige o Ticket Médio para usar pedidos reais do ML
 * (o sistema registrou como 1 lançamento agregado, não por dia)
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// Reproduz o calcularKPIs do finance.ts
function calcularKPIs(lancamentos, config) {
  const kpis = {
    receita_total: 0, receita_ml: 0, receita_magalu: 0, receita_casas_bahia: 0,
    receita_amazon: 0, receita_shopee: 0, receita_tiktok: 0, receita_presencial: 0, receita_outros: 0,
    desp_armazenagem: 0, desp_ads_ml: 0, desp_ads_outros: 0, desp_custo_produtos: 0,
    desp_tarifas: 0, desp_frete: 0, desp_fatura_ml: 0, desp_outras_taxas: 0,
    das_valor_calc: 0,
    desp_pro_labore: 0, desp_inss: 0, desp_contabilidade: 0, desp_erp: 0,
    desp_emprestimo: 0, desp_aluguel: 0, desp_pagina_ml: 0, desp_previdencia_privada: 0, desp_fixas_outras: 0,
    ticket_medio: 0, lucro_bruto: 0, lucro_liquido: 0, margem_contribuicao: 0,
    break_even: 0, roas_atual: 0, dlr_socio: 0, reinvestimento: 0, dias_com_venda: 0,
  }

  const CANAL_MAP = { MERCADO_LIVRE:'receita_ml', MAGALU:'receita_magalu', CASAS_BAHIA:'receita_casas_bahia', AMAZON:'receita_amazon', SHOPEE:'receita_shopee', TIKTOK:'receita_tiktok', PRESENCIAL:'receita_presencial' }
  const VAR_MAP = { ARMAZENAGEM:'desp_armazenagem', ADS_ML:'desp_ads_ml', ADS_OUTROS:'desp_ads_outros', CUSTO_PRODUTOS:'desp_custo_produtos', TARIFAS:'desp_tarifas', FRETE:'desp_frete', FATURA_ML:'desp_fatura_ml', OUTRAS_TAXAS:'desp_outras_taxas' }
  const FIX_MAP = { PRO_LABORE:'desp_pro_labore', INSS:'desp_inss', CONTABILIDADE:'desp_contabilidade', ERP:'desp_erp', EMPRESTIMO:'desp_emprestimo', ALUGUEL:'desp_aluguel', PAGINA_ML:'desp_pagina_ml', PREVIDENCIA_PRIVADA:'desp_previdencia_privada', OUTRA_FIXA:'desp_fixas_outras' }

  const diasComVenda = new Set()

  for (const l of lancamentos) {
    if (l.tipo === 'RECEITA') {
      diasComVenda.add(new Date(l.data).toISOString().split('T')[0])
      kpis.receita_total += l.valor
      const campo = l.canal ? CANAL_MAP[l.canal] : null
      if (campo) kpis[campo] += l.valor
      else kpis.receita_outros += l.valor
    } else if (l.tipo === 'DESPESA_VARIAVEL') {
      const campo = VAR_MAP[l.categoria]
      if (campo) kpis[campo] += l.valor
    } else if (l.tipo === 'DESPESA_FIXA') {
      if (l.categoria !== 'PREVIDENCIA_PRIVADA') {
        const campo = FIX_MAP[l.categoria]
        if (campo) kpis[campo] += l.valor
      }
    }
  }

  kpis.dias_com_venda = diasComVenda.size
  kpis.das_valor_calc = kpis.receita_total * config.aliquota_simples

  const totalVar = kpis.desp_armazenagem + kpis.desp_ads_ml + kpis.desp_ads_outros +
    kpis.desp_custo_produtos + kpis.desp_tarifas + kpis.desp_frete +
    kpis.desp_fatura_ml + kpis.desp_outras_taxas + kpis.das_valor_calc

  const totalFixa = kpis.desp_pro_labore + kpis.desp_inss + kpis.desp_contabilidade +
    kpis.desp_erp + kpis.desp_emprestimo + kpis.desp_aluguel + kpis.desp_pagina_ml + kpis.desp_fixas_outras

  kpis.lucro_bruto = kpis.receita_total - totalVar - totalFixa

  // Previdência: PRO_LABORE×20% + LUCRO_BRUTO×11%
  const lbParaPrevidencia = Math.max(0, kpis.lucro_bruto)
  kpis.desp_previdencia_privada = Math.max(0, kpis.desp_pro_labore * 0.20 + lbParaPrevidencia * 0.11)
  kpis.lucro_liquido = kpis.lucro_bruto - kpis.desp_previdencia_privada

  const margemDecimal = kpis.receita_total > 0 ? kpis.lucro_bruto / kpis.receita_total : 0
  kpis.margem_contribuicao = margemDecimal * 100
  kpis.break_even = (margemDecimal > 0 && totalFixa > 0) ? totalFixa / margemDecimal : 0

  const totalAds = kpis.desp_ads_ml + kpis.desp_ads_outros
  kpis.roas_atual = totalAds > 0 ? kpis.receita_total / totalAds : 0

  // Ticket Médio: para lançamentos ML agregados, usa pedidos registrados na descrição
  // Extrai o número de pedidos da descrição do lançamento de receita
  const lancReceitaML = lancamentos.find(l => l.tipo === 'RECEITA' && l.canal === 'MERCADO_LIVRE')
  let pedidos = kpis.dias_com_venda
  if (lancReceitaML) {
    const match = lancReceitaML.descricao.match(/(\d+)\s*pedidos?/i)
    if (match) pedidos = parseInt(match[1])
  }
  kpis.ticket_medio = pedidos > 0 ? kpis.receita_total / pedidos : 0

  kpis.dlr_socio = kpis.lucro_liquido * config.percentual_dlr_socio
  kpis.reinvestimento = kpis.lucro_liquido * (1 - config.percentual_dlr_socio)

  return kpis
}

async function main() {
  const fat = await prisma.faturamento_mes.findFirst({
    where: { ano: 2026, mes: 5 },
    include: { lancamentos: { where: { status: 'CONFIRMADO' } } }
  })
  if (!fat) { console.log('Maio não encontrado'); return }

  // Busca config financeira
  const membro = await prisma.workspace_membro.findFirst({ orderBy: { created_at: 'asc' }, select: { workspace_id: true } })
  const finConfig = await prisma.finance_config.findFirst({ where: { workspace_id: membro.workspace_id } })
  const empresa = await prisma.empresa.findUnique({ where: { workspace_id: membro.workspace_id } })

  const config = {
    aliquota_simples: fat.aliquota_simples,
    percentual_dlr_socio: finConfig?.percentual_dlr_socio ?? 0.5,
    percentual_reinvestimento: 0.5,
  }

  const kpis = calcularKPIs(fat.lancamentos, config)

  console.log('=== RECÁLCULO COMPLETO MAIO 2026 ===')
  console.log('Receita Total:        R$', kpis.receita_total.toFixed(2))
  console.log('DAS (8%):            -R$', kpis.das_valor_calc.toFixed(2))
  console.log('Lucro Bruto:          R$', kpis.lucro_bruto.toFixed(2))
  console.log('Previdência Privada: -R$', kpis.desp_previdencia_privada.toFixed(2))
  console.log('Lucro Líquido:        R$', kpis.lucro_liquido.toFixed(2))
  console.log('Margem %:             ', kpis.margem_contribuicao.toFixed(1)+'%')
  console.log('ROAS:                 ', kpis.roas_atual.toFixed(2)+'x')
  console.log('Ticket Médio:         R$', kpis.ticket_medio.toFixed(2))
  console.log('Ads Total (ML):       R$', kpis.desp_ads_ml.toFixed(2))
  console.log('DLR Sócio (50%):      R$', kpis.dlr_socio.toFixed(2))
  console.log('Break-Even:           R$', kpis.break_even.toFixed(2))

  await prisma.faturamento_mes.update({
    where: { id: fat.id },
    data: {
      receita_total:            kpis.receita_total,
      receita_ml:               kpis.receita_ml,
      receita_magalu:           kpis.receita_magalu,
      receita_casas_bahia:      kpis.receita_casas_bahia,
      receita_amazon:           kpis.receita_amazon,
      receita_shopee:           kpis.receita_shopee,
      receita_tiktok:           kpis.receita_tiktok,
      receita_presencial:       kpis.receita_presencial,
      receita_outros:           kpis.receita_outros,
      desp_armazenagem:         kpis.desp_armazenagem,
      desp_ads_ml:              kpis.desp_ads_ml,
      desp_ads_outros:          kpis.desp_ads_outros,
      desp_custo_produtos:      kpis.desp_custo_produtos,
      desp_tarifas:             kpis.desp_tarifas,
      desp_frete:               kpis.desp_frete,
      desp_fatura_ml:           kpis.desp_fatura_ml,
      desp_outras_taxas:        kpis.desp_outras_taxas,
      das_valor_calc:           kpis.das_valor_calc,
      desp_pro_labore:          kpis.desp_pro_labore,
      desp_inss:                kpis.desp_inss,
      desp_contabilidade:       kpis.desp_contabilidade,
      desp_erp:                 kpis.desp_erp,
      desp_emprestimo:          kpis.desp_emprestimo,
      desp_aluguel:             kpis.desp_aluguel,
      desp_pagina_ml:           kpis.desp_pagina_ml,
      desp_previdencia_privada: kpis.desp_previdencia_privada,
      desp_fixas_outras:        kpis.desp_fixas_outras,
      ticket_medio:             kpis.ticket_medio,
      lucro_bruto:              kpis.lucro_bruto,
      lucro_liquido:            kpis.lucro_liquido,
      margem_contribuicao:      kpis.margem_contribuicao,
      break_even:               kpis.break_even,
      roas_atual:               kpis.roas_atual,
      dlr_socio:                kpis.dlr_socio,
      reinvestimento:           kpis.reinvestimento,
      dias_com_venda:           kpis.dias_com_venda,
    }
  })

  console.log('\n✅ Todos os indicadores atualizados!')
}
main().catch(console.error).finally(() => prisma.$disconnect())
