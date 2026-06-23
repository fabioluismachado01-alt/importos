/**
 * Recalcula os KPIs de Maio 2026 manualmente
 * para corrigir o problema de Lucro Bruto = R$0
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const fat = await prisma.faturamento_mes.findFirst({
    where: { ano: 2026, mes: 5 },
    include: { lancamentos: { where: { status: 'CONFIRMADO' } } }
  })
  if (!fat) { console.log('Maio não encontrado'); return }

  console.log('Lançamentos de Maio:', fat.lancamentos.length)
  fat.lancamentos.forEach(l => console.log(
    ' ', l.tipo.padEnd(18), l.categoria.padEnd(18),
    'R$'+l.valor.toFixed(2).padStart(10), l.descricao.slice(0,40)
  ))

  // Calcula totais por categoria
  const receitas = fat.lancamentos.filter(l => l.tipo === 'RECEITA')
  const despVariaveis = fat.lancamentos.filter(l => l.tipo === 'DESPESA_VARIAVEL')
  const despFixas = fat.lancamentos.filter(l => l.tipo === 'DESPESA_FIXA')

  const receitaTotal = receitas.reduce((s, l) => s + l.valor, 0)
  const totalVar = despVariaveis.reduce((s, l) => s + l.valor, 0)
  const totalFixa = despFixas.reduce((s, l) => s + l.valor, 0)
  const das = receitaTotal * fat.aliquota_simples

  // Soma por subcategoria de receita
  const receitaML = receitas.filter(l => l.canal === 'MERCADO_LIVRE').reduce((s, l) => s + l.valor, 0)

  // Despesas variáveis por categoria
  const desp = (cat) => despVariaveis.filter(l => l.categoria === cat).reduce((s, l) => s + l.valor, 0)
  const despFixa = (cat) => despFixas.filter(l => l.categoria === cat).reduce((s, l) => s + l.valor, 0)

  const despTarifas = desp('TARIFAS')
  const despFrete   = desp('FRETE')
  const despCusto   = desp('CUSTO_PRODUTOS')
  const despAds     = desp('ADS_ML')
  const despArm     = desp('ARMAZENAGEM')
  const despFatML   = desp('FATURA_ML')
  const despOutros  = desp('OUTRAS_TAXAS')

  // Lucro Bruto = Receita - Variáveis (incluindo DAS) - Fixas
  const lucroBruto = receitaTotal - totalVar - das - totalFixa

  // Previdência (fórmula padrão)
  const proLabore = despFixa('PRO_LABORE')
  const previdencia = Math.max(0, proLabore * 0.20 + lucroBruto * 0.11)

  const lucroLiquido = lucroBruto - previdencia

  const margem = receitaTotal > 0 ? (lucroBruto / receitaTotal) * 100 : 0

  console.log('\n=== RECÁLCULO ===')
  console.log('Receita Total:  R$', receitaTotal.toFixed(2))
  console.log('Desp. Variáveis R$', totalVar.toFixed(2))
  console.log('DAS:            R$', das.toFixed(2))
  console.log('Desp. Fixas:    R$', totalFixa.toFixed(2))
  console.log('Lucro Bruto:    R$', lucroBruto.toFixed(2))
  console.log('Previdência:    R$', previdencia.toFixed(2))
  console.log('Lucro Líquido:  R$', lucroLiquido.toFixed(2))
  console.log('Margem:         ', margem.toFixed(1)+'%')

  // Atualiza
  await prisma.faturamento_mes.update({
    where: { id: fat.id },
    data: {
      receita_total:       receitaTotal,
      receita_ml:          receitaML,
      das_valor_calc:      das,
      desp_tarifas:        despTarifas,
      desp_frete:          despFrete,
      desp_custo_produtos: despCusto,
      desp_ads_ml:         despAds,
      desp_armazenagem:    despArm,
      desp_fatura_ml:      despFatML,
      desp_outras_taxas:   despOutros,
      desp_previdencia_privada: previdencia,
      lucro_bruto:         lucroBruto,
      lucro_liquido:       lucroLiquido,
      margem_contribuicao: margem,
      dlr_socio:           lucroLiquido * 0.5,
      reinvestimento:      lucroLiquido * 0.5,
    }
  })
  console.log('\n✅ Maio 2026 recalculado!')
}

main().catch(console.error).finally(() => prisma.$disconnect())
