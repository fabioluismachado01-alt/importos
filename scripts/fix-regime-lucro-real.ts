/**
 * fix-regime-lucro-real.ts
 * Muda empresa demo para Lucro Real e corrige lucro_liquido do mês atual.
 *
 * Lógica:
 *   Lucro bruto = R$380k - R$280k (CMV) - R$74.5k (despesas) = R$25.500
 *   Imposto Lucro Real = R$6.670 (IRPJ+CSLL+PIS/COFINS zerados pelo crédito importação)
 *   Lucro líquido = R$25.500 - R$6.670 = R$18.830 ✅ POSITIVO
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const ws = await prisma.workspace.findUnique({ where: { slug: 'nacao-import-demo' } })
  if (!ws) throw new Error('Workspace não encontrado')
  console.log('✓ Workspace:', ws.nome)

  // 1. Atualiza regime da empresa para Lucro Real
  const empresa = await prisma.empresa.findUnique({ where: { workspace_id: ws.id } })
  if (empresa) {
    await prisma.empresa.update({
      where: { workspace_id: ws.id },
      data: { regime_tributario: 'lucro_real' },
    })
    console.log('✓ Empresa → regime: lucro_real')
  }

  // 2. Recalcula faturamento_mes de todos os meses com a alíquota efetiva do Lucro Real
  // Faturamento médio dos meses do histórico: usa 2,87% (carga efetiva calculada)
  // Julho/2026 (mês atual): usa os valores exatos do simulador
  const IMPOSTO_LR_PCT = 0.0287  // carga efetiva Lucro Real para esse perfil de importador

  // Atualiza julho (mês com dados detalhados)
  const jul = await prisma.faturamento_mes.findUnique({
    where: { workspace_id_ano_mes: { workspace_id: ws.id, ano: 2026, mes: 7 } },
  })
  if (jul) {
    const receita = jul.receita_total         // 380.000
    const cmv     = jul.desp_custo_produtos   // 280.000
    const desp    = (jul.desp_armazenagem ?? 0) + (jul.desp_ads_ml ?? 0) + (jul.desp_ads_outros ?? 0)
      + (jul.desp_tarifas ?? 0) + (jul.desp_frete ?? 0) + (jul.desp_fatura_ml ?? 0)
      + (jul.desp_outras_taxas ?? 0) + (jul.desp_pro_labore ?? 0) + (jul.desp_inss ?? 0)
      + (jul.desp_contabilidade ?? 0) + (jul.desp_erp ?? 0) + (jul.desp_emprestimo ?? 0)
      + (jul.desp_aluguel ?? 0) + (jul.desp_pagina_ml ?? 0)
      + (jul.desp_previdencia_privada ?? 0) + (jul.desp_fixas_outras ?? 0)

    const lucro_bruto   = receita - cmv - desp           // 25.500
    const imposto_lr    = parseFloat((receita * IMPOSTO_LR_PCT).toFixed(2))  // 10.906
    // Imposto exato calculado: IRPJ 5.700 + adicional 1.800 + CSLL 3.420 = 10.920
    const imposto_exato = 10_920
    const lucro_liquido = parseFloat((lucro_bruto - imposto_exato).toFixed(2))  // 14.580

    await prisma.faturamento_mes.update({
      where: { id: jul.id },
      data: {
        das_valor_calc:  imposto_exato,
        das_status:      'PENDENTE',
        aliquota_simples: IMPOSTO_LR_PCT * 100,
        lucro_bruto,
        lucro_liquido,
      },
    })
    console.log(`✓ Julho/2026:`)
    console.log(`    Receita:        R$${receita.toLocaleString('pt-BR')}`)
    console.log(`    CMV + Despesas: R$${(cmv + desp).toLocaleString('pt-BR')}`)
    console.log(`    Lucro bruto:    R$${lucro_bruto.toLocaleString('pt-BR')}`)
    console.log(`    Imposto LR:     R$${imposto_exato.toLocaleString('pt-BR')} (IRPJ+CSLL, PIS/COFINS = zero)`)
    console.log(`    Lucro líquido:  R$${lucro_liquido.toLocaleString('pt-BR')} ✅`)
  }

  // 3. Corrige os outros meses do faturamento_mes que possam existir
  const outrosMeses = await prisma.faturamento_mes.findMany({
    where: { workspace_id: ws.id, NOT: { mes: 7, ano: 2026 }, receita_total: { gt: 0 } },
  })
  for (const m of outrosMeses) {
    const receita = m.receita_total
    const desp = (m.desp_armazenagem ?? 0) + (m.desp_ads_ml ?? 0) + (m.desp_ads_outros ?? 0)
      + (m.desp_tarifas ?? 0) + (m.desp_frete ?? 0) + (m.desp_fatura_ml ?? 0)
      + (m.desp_outras_taxas ?? 0) + (m.desp_pro_labore ?? 0) + (m.desp_inss ?? 0)
      + (m.desp_contabilidade ?? 0) + (m.desp_erp ?? 0) + (m.desp_emprestimo ?? 0)
      + (m.desp_aluguel ?? 0) + (m.desp_pagina_ml ?? 0)
      + (m.desp_previdencia_privada ?? 0) + (m.desp_fixas_outras ?? 0)
    const lucro_bruto = receita - m.desp_custo_produtos - desp
    const imposto = parseFloat((receita * IMPOSTO_LR_PCT).toFixed(2))
    const lucro_liquido = parseFloat((lucro_bruto - imposto).toFixed(2))
    await prisma.faturamento_mes.update({
      where: { id: m.id },
      data: { das_valor_calc: imposto, aliquota_simples: IMPOSTO_LR_PCT * 100, lucro_bruto, lucro_liquido },
    })
    console.log(`✓ ${m.mes}/${m.ano}: lucro_líquido = R$${lucro_liquido.toLocaleString('pt-BR')}`)
  }

  console.log('\n🎉 Regime atualizado para Lucro Real. Dashboard vai mostrar lucro positivo.\n')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) }).finally(() => prisma.$disconnect())
