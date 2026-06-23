/**
 * Importação histórica: Janeiro–Abril 2026
 * Lê diretamente da planilha e popula o banco com dados reais
 *
 * DAS: mantém previsto (calculado) E real (da planilha)
 * ML: período 30→29, mas lançamos no mês de competência da planilha
 */
const { PrismaClient } = require('@prisma/client')
const XLSX = require('xlsx')
const path = require('path')

const prisma = new PrismaClient()
const PLANILHA = path.join(__dirname, '../../i que tenho hoje/Controle Geral de Faturamento, tarifas, DAS etc - Namave.xlsx')

// Meses disponíveis na planilha com dados reais
const MESES_CONFIG = [
  { nomeMes: 'Janeiro.2026',  mes: 1, ano: 2026, aliquota: 0.0674 },
  { nomeMes: 'Fevereiro 2026',mes: 2, ano: 2026, aliquota: 0.0697 },
  { nomeMes: 'Março 2026',    mes: 3, ano: 2026, aliquota: 0.0750 },
  { nomeMes: 'Abril 2026',    mes: 4, ano: 2026, aliquota: 0.0800 },
]

// Colunas dos lançamentos diários (índices)
const COL = {
  DIA: 0, ARMAZENAGEM: 1, ML: 2, MAGALU: 3, CASAS_BAHIA: 4,
  AMAZON: 5, SHOPEE: 6, TIKTOK: 7, PRESENCIAL: 8,
  TICKET_MEDIO: 9, ADS: 10, CUSTO: 11, TARIFA: 12, FRETE: 13,
  SALARIO: 14, EMPRESTIMO: 15, CONTABILIDADE: 16, ERP: 17,
  INSS: 18, OUTRAS_TAXAS: 19, LUCRO_DIA: 20
}

// Índices do painel lateral (coluna W = índice 22 = label, X = 23 = previsto, Y = 24 = real)
function extrairPainel(rows) {
  const p = {}
  for (const row of rows) {
    const label = String(row[22] ?? '').trim().toLowerCase()
    const prev  = Number(row[23]) || 0
    const real  = Number(row[24]) || 0
    if (!label) continue
    if (label.includes('faturamento'))                             p.faturamento = { prev, real }
    if (label.includes('aliquota') || label.includes('alíquota')) p.aliquota = { prev, real }
    if (label.includes('armazenagem'))                            p.armazenagem = { prev: Math.abs(prev), real: Math.abs(real) }
    if (label.includes('ads mercado'))                             p.ads_ml = { prev: Math.abs(prev), real: Math.abs(real) }
    if (label.includes('ads outra'))                               p.ads_outros = { prev: Math.abs(prev), real: Math.abs(real) }
    if (label.includes('custo com'))                               p.custo = { prev: Math.abs(prev), real: Math.abs(real) }
    if (label.includes('tarifas'))                                 p.tarifas = { prev: Math.abs(prev), real: Math.abs(real) }
    if (label.includes('frete'))                                   p.frete = { prev: Math.abs(prev), real: Math.abs(real) }
    if (label.includes('imposto') && label.includes('das'))        p.das = { prev: Math.abs(prev), real: Math.abs(real) }
    if (label.includes('pró labore') || label.includes('pro labore')) p.pro_labore = { prev: Math.abs(prev), real: Math.abs(real) }
    if (label === 'inss')                                          p.inss = { prev: Math.abs(prev), real: Math.abs(real) }
    if (label.includes('contabilidade'))                           p.contabilidade = { prev: Math.abs(prev), real: Math.abs(real) }
    if (label.includes('erp'))                                     p.erp = { prev: Math.abs(prev), real: Math.abs(real) }
    if (label.includes('empréstimo') || label.includes('emprestimo')) p.emprestimo = { prev: Math.abs(prev), real: Math.abs(real) }
    if (label.includes('previdência') || label.includes('previdencia')) p.previdencia = { prev: Math.abs(prev), real: Math.abs(real) }
    if (label.includes('página') || label.includes('pagina'))     p.pagina_ml = { prev: Math.abs(prev), real: Math.abs(real) }
    if (label.includes('lucro bruto'))                             p.lucro_bruto = { prev, real }
    if (label.includes('lucro liquido') || label.includes('lucro líquido')) p.lucro_liquido = { prev, real }
    if (label.includes('fatura mercado'))                          p.fatura_ml = { prev: Math.abs(prev), real: Math.abs(real) }
  }
  return p
}

async function importarMes(workspaceId, config, rows) {
  const { mes, ano, aliquota, nomeMes } = config
  const painel = extrairPainel(rows)

  console.log(`\n  📅 ${nomeMes}`)
  console.log(`     Faturamento: R$ ${painel.faturamento?.real?.toFixed(2) ?? '?'}`)
  console.log(`     Lucro Bruto: R$ ${painel.lucro_bruto?.real?.toFixed(2) ?? '?'}`)
  console.log(`     DAS previsto: R$ ${painel.das?.prev?.toFixed(2)} | real: R$ ${painel.das?.real?.toFixed(2)}`)

  const diasNoMes = new Date(ano, mes, 0).getDate()
  const primeiroDia = new Date(ano, mes - 1, 1)

  // Vencimento DAS: dia 20 do mês seguinte
  const mesVenc = mes === 12 ? 1 : mes + 1
  const anoVenc = mes === 12 ? ano + 1 : ano
  const vencimentoDas = new Date(anoVenc, mesVenc - 1, 20)

  // Criar/upsert o faturamento_mes
  const fat = await prisma.faturamento_mes.upsert({
    where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano, mes } },
    update: {},
    create: {
      workspace_id: workspaceId,
      ano, mes,
      aliquota_simples: aliquota,
      dias_no_mes: diasNoMes,
      das_vencimento: vencimentoDas,
    },
  })

  const lancamentos = []

  // ── RECEITAS por canal ──
  const receitas = [
    { canal: 'MERCADO_LIVRE', colIdx: COL.ML },
    { canal: 'MAGALU',        colIdx: COL.MAGALU },
    { canal: 'CASAS_BAHIA',   colIdx: COL.CASAS_BAHIA },
    { canal: 'AMAZON',        colIdx: COL.AMAZON },
    { canal: 'SHOPEE',        colIdx: COL.SHOPEE },
    { canal: 'TIKTOK',        colIdx: COL.TIKTOK },
    { canal: 'PRESENCIAL',    colIdx: COL.PRESENCIAL },
  ]

  // Acumula receitas por canal (totais do mês, linha Total)
  const totalRow = rows.find(r => String(r[0]).toLowerCase().trim() === 'total')
  if (totalRow) {
    for (const { canal, colIdx } of receitas) {
      const valor = Math.abs(Number(totalRow[colIdx]) || 0)
      if (valor > 0) {
        // Para ML: ciclo 30→29. Anotamos no lançamento mas competência é do mês
        const nota = canal === 'MERCADO_LIVRE'
          ? ` (ciclo: dia 30 ao dia 29/${String(mes).padStart(2,'0')}/${ano})`
          : ''
        lancamentos.push({
          faturamento_id: fat.id,
          tipo: 'RECEITA',
          categoria: canal,
          canal,
          descricao: `${canal.replace(/_/g,' ')}${nota}`,
          valor,
          data: primeiroDia,
          e_fixo: false,
          status: 'CONFIRMADO',
        })
      }
    }
  }

  // ── DESPESAS VARIÁVEIS (do painel, valores reais) ──
  const despVariaveis = [
    { cat: 'ARMAZENAGEM',    key: 'armazenagem' },
    { cat: 'ADS_ML',         key: 'ads_ml' },
    { cat: 'ADS_OUTROS',     key: 'ads_outros' },
    { cat: 'CUSTO_PRODUTOS', key: 'custo' },
    { cat: 'TARIFAS',        key: 'tarifas' },
    { cat: 'FRETE',          key: 'frete' },
    { cat: 'FATURA_ML',      key: 'fatura_ml' },
  ]
  for (const { cat, key } of despVariaveis) {
    const valor = painel[key]?.real ?? 0
    if (valor > 0) {
      lancamentos.push({
        faturamento_id: fat.id,
        tipo: 'DESPESA_VARIAVEL',
        categoria: cat,
        canal: null,
        descricao: cat.replace(/_/g,' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
        valor,
        data: primeiroDia,
        e_fixo: false,
        status: 'CONFIRMADO',
      })
    }
  }

  // ── DESPESAS FIXAS (valores reais da planilha) ──
  // Previdência: NÃO lançamos — calculada automaticamente pela engine
  const despFixas = [
    { cat: 'PRO_LABORE',    key: 'pro_labore',   nome: 'Pró Labore' },
    { cat: 'INSS',          key: 'inss',          nome: 'INSS' },
    { cat: 'CONTABILIDADE', key: 'contabilidade', nome: 'Contabilidade' },
    { cat: 'ERP',           key: 'erp',           nome: 'ERP Mensal' },
    { cat: 'EMPRESTIMO',    key: 'emprestimo',    nome: 'Empréstimo PRONAMPE' },
    { cat: 'PAGINA_ML',     key: 'pagina_ml',     nome: 'Página Oficial ML' },
  ]
  for (const { cat, key, nome } of despFixas) {
    const valor = painel[key]?.real ?? 0
    if (valor > 0) {
      lancamentos.push({
        faturamento_id: fat.id,
        tipo: 'DESPESA_FIXA',
        categoria: cat,
        canal: null,
        descricao: nome,
        valor,
        data: primeiroDia,
        e_fixo: true,
        status: 'CONFIRMADO',
      })
    }
  }

  // Salva todos os lançamentos
  if (lancamentos.length > 0) {
    await prisma.lancamento.createMany({ data: lancamentos })
    console.log(`     Lançamentos criados: ${lancamentos.length}`)
  }

  // ── DAS — previsto (calculado) E real (da planilha) ──
  const dasReal = painel.das?.real ?? 0
  const dasPrev = (painel.faturamento?.real ?? 0) * aliquota

  await prisma.das.create({
    data: {
      faturamento_id: fat.id,
      periodo: `${ano}-${String(mes).padStart(2,'0')}`,
      competencia: primeiroDia,
      valor: dasPrev,           // previsto
      vencimento: vencimentoDas,
      status: 'PAGO',           // Jan-Abr já pagos
    },
  })

  // ── KPIs da planilha (valores reais como referência) ──
  const receitaTotal = painel.faturamento?.real ?? 0
  const lucroBruto   = painel.lucro_bruto?.real ?? 0
  const lucroLiq     = painel.lucro_liquido?.real ?? 0
  const prevCalc     = painel.previdencia?.real ?? 0

  // Atualiza os campos calculados com os valores reais da planilha
  await prisma.faturamento_mes.update({
    where: { id: fat.id },
    data: {
      aliquota_simples: aliquota,
      receita_total: receitaTotal,
      receita_ml:          Math.abs(Number(totalRow?.[COL.ML]) || 0),
      receita_magalu:      Math.abs(Number(totalRow?.[COL.MAGALU]) || 0),
      receita_casas_bahia: Math.abs(Number(totalRow?.[COL.CASAS_BAHIA]) || 0),
      receita_amazon:      Math.abs(Number(totalRow?.[COL.AMAZON]) || 0),
      receita_shopee:      Math.abs(Number(totalRow?.[COL.SHOPEE]) || 0),
      receita_tiktok:      Math.abs(Number(totalRow?.[COL.TIKTOK]) || 0),
      receita_presencial:  Math.abs(Number(totalRow?.[COL.PRESENCIAL]) || 0),
      desp_armazenagem:    painel.armazenagem?.real ?? 0,
      desp_ads_ml:         painel.ads_ml?.real ?? 0,
      desp_ads_outros:     painel.ads_outros?.real ?? 0,
      desp_custo_produtos: painel.custo?.real ?? 0,
      desp_tarifas:        painel.tarifas?.real ?? 0,
      desp_frete:          painel.frete?.real ?? 0,
      desp_fatura_ml:      painel.fatura_ml?.real ?? 0,
      desp_pro_labore:     painel.pro_labore?.real ?? 0,
      desp_inss:           painel.inss?.real ?? 0,
      desp_contabilidade:  painel.contabilidade?.real ?? 0,
      desp_erp:            painel.erp?.real ?? 0,
      desp_emprestimo:     painel.emprestimo?.real ?? 0,
      desp_pagina_ml:      painel.pagina_ml?.real ?? 0,
      desp_previdencia_privada: prevCalc,  // real da planilha
      das_valor_calc:      dasPrev,
      das_valor_real:      dasReal > 0 ? dasReal : null,
      das_status:          'PAGO',
      das_vencimento:      vencimentoDas,
      lucro_bruto:         lucroBruto,
      lucro_liquido:       lucroLiq,
      margem_contribuicao: receitaTotal > 0 ? (lucroBruto / receitaTotal) * 100 : 0,
      dlr_socio:           lucroLiq * 0.5,
      reinvestimento:      lucroLiq * 0.5,
      fechado:             true,
    }
  })

  // Histórico multi-ano (para comparativo YoY)
  await prisma.historico_faturamento_anual.upsert({
    where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano, mes } },
    update: { faturamento: receitaTotal, lucro_bruto: lucroBruto, lucro_liquido: lucroLiq, fonte: 'IMPORTADO' },
    create: { workspace_id: workspaceId, ano, mes, faturamento: receitaTotal, lucro_bruto: lucroBruto, lucro_liquido: lucroLiq, fonte: 'IMPORTADO' },
  })

  return { mes, receita: receitaTotal, lucroBruto, lucroLiq, dasReal, dasPrev }
}

async function main() {
  console.log('\n📊 ImportOS — Importação Histórica Jan–Abr 2026\n')
  console.log('   Planilha:', PLANILHA)

  const wb = XLSX.readFile(PLANILHA, { cellDates: true })
  console.log('   Abas encontradas:', wb.SheetNames.filter(n =>
    ['Janeiro','Fevereiro','Março','Abril'].some(m => n.includes(m))
  ).join(', '))

  // Busca o workspace
  const membro = await prisma.workspace_membro.findFirst({
    orderBy: { created_at: 'asc' },
    select: { workspace_id: true },
  })
  if (!membro) { console.error('❌ Nenhum workspace encontrado. Execute o seed primeiro.'); process.exit(1) }
  const workspaceId = membro.workspace_id
  console.log('   Workspace ID:', workspaceId)

  const resultados = []

  for (const config of MESES_CONFIG) {
    const ws = wb.Sheets[config.nomeMes]
    if (!ws) { console.log(`  ⚠ Aba "${config.nomeMes}" não encontrada`); continue }
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    const resultado = await importarMes(workspaceId, config, rows)
    resultados.push(resultado)
  }

  // Resumo
  console.log('\n═══════════════════════════════════════════════════')
  console.log('RESUMO DA IMPORTAÇÃO')
  console.log('═══════════════════════════════════════════════════')
  const meses = ['Jan','Fev','Mar','Abr']
  let totalFat = 0, totalLB = 0, totalLL = 0
  resultados.forEach((r, i) => {
    console.log(`${meses[i]}: Receita R$${r.receita.toFixed(2).padStart(10)} | LB R$${r.lucroBruto.toFixed(2).padStart(10)} | LL R$${r.lucroLiq.toFixed(2).padStart(10)} | DAS prev R$${r.dasPrev.toFixed(2)} real R$${r.dasReal.toFixed(2)}`)
    totalFat += r.receita; totalLB += r.lucroBruto; totalLL += r.lucroLiq
  })
  console.log('───────────────────────────────────────────────────')
  console.log(`Total: R$${totalFat.toFixed(2).padStart(10)} | LB R$${totalLB.toFixed(2).padStart(10)} | LL R$${totalLL.toFixed(2).padStart(10)}`)
  console.log('\n✅ Importação concluída! Todos os meses fechados automaticamente.\n')
}

main()
  .catch(e => { console.error('❌ Erro:', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
