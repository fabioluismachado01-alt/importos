/**
 * Importa o ML de marÃ§o/2026 a partir das 4 planilhas exportadas do ML.
 * Replica o fluxo da UI: analisar-ml + faturamento-ml + tarifas-full â†’ salvarAnaliseML
 *
 * Planilhas em: C:\Users\fabio\Downloads\mercado livre marÃ§o\
 */
import { PrismaClient } from '@prisma/client'
import * as XLSX from 'xlsx'
import * as path from 'path'
import * as fs from 'fs'
import { calcularKPIs } from '../src/engines/finance'
import { resolverColunas } from '../src/lib/ml-parcelamento'
import { classificarStatus } from '../src/lib/ml-status'

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } })
const WORKSPACE_ID = 'cmpx6dq5k000fvckk6d1aknfq'
const ANO = 2026
const MES = 9
const DIR = 'C:\\Users\\fabio\\Downloads\\Relatório de Vendas\\Mercado livre'

// â”€â”€â”€ UtilitÃ¡rios â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const MESES_PT: Record<string, number> = {
  janeiro:1,fevereiro:2,'março':3,abril:4,maio:5,junho:6,
  julho:7,agosto:8,setembro:9,outubro:10,novembro:11,dezembro:12,
}

function parseDataVenda(ds: unknown): { dia: number; mes: number; ano: number } | null {
  const match = String(ds ?? '').match(/(\d+) de (\w+) de (\d{4})/)
  if (!match) return null
  const mes = MESES_PT[match[2].toLowerCase()]
  if (!mes) return null
  return { dia: parseInt(match[1]), mes, ano: parseInt(match[3]) }
}

// resolverColunas imported from ml-parcelamento (handles "Data da venda" + "Data de venda", "Estado" + "Descrição do status")

const EXCLUIR_PATTERNS = [
  'cancelad','reembolso para o comprador','colocamos o produto',
  'estamos analisando o que aconteceu','pacote cancelado','pacote nÃ£o entregue','troca entregue',
]
const STATUS_VALIDOS = new Set([
  'entregue','no ponto de retirada','a caminho','vamos enviar',
  'processando','envio atrasado','envio reagendado','venda entregue',
])
const INCLUIR_PATTERNS = [
  'pacote de ','reclamaÃ§Ã£o','mediaÃ§Ã£o para responder','mediaÃ§Ã£o com devoluÃ§Ã£o habilitada',
  'descartamos o produto','liberamos o valor','te demos o dinheiro','dinheiro liberado',
  'venda com solicitaÃ§Ã£o de alteraÃ§Ã£o',
]

// â”€â”€â”€ Parser: RelatÃ³rio de Vendas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function parsearVendas(filePath: string, custoPorSku: Record<string, number>) {
  const buffer = fs.readFileSync(filePath)
  const wb = XLSX.read(buffer, { type: 'buffer', dense: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
  const COL = resolverColunas(rows[5] as unknown[])

  const ultimoDia = new Date(ANO, MES, 0).getDate()
  let receita = 0, tarifas = 0, frete = 0, pedidos = 0, unidades = 0
  const custoPorItem: Record<string, { qty: number; custo: number }> = {}
  let pulados = 0

  for (let i = 6; i < rows.length; i++) {
    const r = rows[i] as unknown[]
    if (!r?.[COL.N_VENDA]) continue

    const dataVenda = parseDataVenda(r[COL.DATA])
    if (dataVenda) {
      const dentro = dataVenda.ano === ANO && dataVenda.mes === MES &&
                     dataVenda.dia >= 1 && dataVenda.dia <= ultimoDia
      if (!dentro) { pulados++; continue }
    }

    const statusDescricao = String(r[COL.STATUS] ?? '')
    const statusEstado    = String(r[COL.ESTADO_COMPRADOR] ?? '')
    const grupo = classificarStatus(statusDescricao, statusEstado)
    if (grupo === 'CANCELADA') { pulados++; continue }
    if (grupo === 'DEVOLUCAO' || grupo === 'DEVOLUCAO_EM_ANALISE' || grupo === 'NAO_ENTREGUE') { pulados++; continue }

    const sku = String(r[COL.SKU] ?? '').trim() || 'SEM-SKU'
    const uni = Number(r[COL.UNIDADES]) || 0
    const tar = Math.abs(Number(r[COL.TARIFA_IMP]) || 0)
    const fre = Math.abs(Number(r[COL.TAR_ENVIO]) || 0)
    const c17Raw = r[COL.TOTAL]
    const c17 = (c17Raw !== '' && c17Raw !== undefined && c17Raw !== null) ? Number(c17Raw) : null
    const rec = c17 !== null
      ? c17 + tar + fre
      : (Number(r[COL.PRECO_UNIT]) || 0) * uni

    receita  += rec
    tarifas  += tar
    frete    += fre
    unidades += uni
    pedidos++

    const custoUnit = custoPorSku[sku] ?? 0
    if (!custoPorItem[sku]) custoPorItem[sku] = { qty: 0, custo: custoUnit }
    custoPorItem[sku].qty += uni
  }

  const custoProdutos = Object.values(custoPorItem).reduce((s, x) => s + x.qty * x.custo, 0)

  return { receita, tarifas, frete, pedidos, unidades, custoProdutos, pulados }
}

// â”€â”€â”€ Parser: RelatÃ³rio de Faturamento â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function parsearFaturamento(filePath: string) {
  const buffer = fs.readFileSync(filePath)
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const ws = wb.Sheets['REPORT'] ?? wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

  const agrupado: Record<string, number> = {}

  for (let i = 8; i < rows.length; i++) {
    const r = rows[i] as unknown[]
    if (!r?.[0] || r[0] === '') continue
    const detalhe = String(r[3] ?? '').trim().toLowerCase()
    const valor = Number(r[7]) || 0
    if (!detalhe || valor === 0) continue

    let cat = 'OUTROS'
    if (detalhe.includes('publicidade') || detalhe.includes('campanha') || detalhe.includes('product ads')) cat = 'PUBLICIDADE'
    else if (detalhe.includes('armazenamento') || detalhe.includes('armazenagem')) cat = 'ARMAZENAGEM'
    else if (detalhe.includes('minha pÃ¡gina') || detalhe.includes('minha pagina')) cat = 'PAGINA_ML'
    else if (detalhe.includes('afiliado')) cat = 'AFILIADOS'
    else if (detalhe.includes('cancelamento') || detalhe.includes('cancelada') || detalhe.includes('estorno')) cat = 'ESTORNO'

    agrupado[cat] = (agrupado[cat] ?? 0) + valor
  }

  return {
    publicidade: Math.abs(agrupado['PUBLICIDADE'] ?? 0),
    pagina_ml:   Math.abs(agrupado['PAGINA_ML'] ?? 0),
    afiliados:   Math.abs(agrupado['AFILIADOS'] ?? 0),
    estornos:    agrupado['ESTORNO'] ?? 0,  // negativo = recebeu de volta
  }
}

// â”€â”€â”€ Parser: Tarifas Full â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function parsearTarifasFull(filePath: string) {
  const buffer = fs.readFileSync(filePath)
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })

  function somarAba(ws: XLSX.WorkSheet | undefined) {
    if (!ws) return 0
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
    let total = 0
    for (let i = 6; i < rows.length; i++) {
      const r = rows[i] as unknown[]
      if (!r?.[0] || r[0] === '') continue
      total += Number(r[5]) || 0
    }
    return total
  }

  const armazenagem = somarAba(wb.Sheets['Tarifa de armazenamento'])
  const coleta = somarAba(wb.Sheets['Custo por serviÃ§o de coleta'])
  return { armazenagem, coleta }
}

// â”€â”€â”€ Recalcular mÃªs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function recalcularMesLocal(faturamentoId: string) {
  const lancamentos = await prisma.lancamento.findMany({
    where: { faturamento_id: faturamentoId, status: 'CONFIRMADO' },
    select: { tipo: true, categoria: true, canal: true, valor: true, data: true, descricao: true },
  })
  const fat = await prisma.faturamento_mes.findUnique({ where: { id: faturamentoId }, select: { aliquota_simples: true, meta_mes: true, dias_no_mes: true, dlr_modo: true, dlr_percentual_custom: true, dlr_valor_fixo: true, das_valor_real: true, das_status: true } })
  const empresa = await prisma.empresa.findUnique({ where: { workspace_id: WORKSPACE_ID }, select: { aliquota_simples: true } })
  const finConfig = await prisma.finance_config.findFirst({ where: { workspace_id: WORKSPACE_ID }, orderBy: { ano: 'desc' }, select: { percentual_dlr_socio: true, percentual_reinvestimento: true, formula_previdencia: true } })
  const toD = (v: number) => v > 1 ? v / 100 : v
  const config = {
    aliquota_simples: toD(fat?.aliquota_simples ?? empresa?.aliquota_simples ?? 8),
    percentual_dlr_socio: finConfig?.percentual_dlr_socio ?? 0.5,
    percentual_reinvestimento: finConfig?.percentual_reinvestimento ?? 0.5,
    formula_previdencia: finConfig?.formula_previdencia ?? 'PRO_LABORE*0.20+LUCRO_BRUTO*0.11',
    dias_no_mes: fat?.dias_no_mes ?? 31,
    meta_mes: fat?.meta_mes ?? 0,
    dlr_modo: (fat?.dlr_modo as 'PERCENTUAL' | 'FIXO') ?? 'PERCENTUAL',
    dlr_percentual_custom: fat?.dlr_percentual_custom ?? undefined,
    dlr_valor_fixo: fat?.dlr_valor_fixo ?? undefined,
    das_valor_real: fat?.das_status === 'PAGO' ? fat?.das_valor_real : null,
  }
  const kpis = calcularKPIs(lancamentos as any, config as any)
  await prisma.faturamento_mes.update({
    where: { id: faturamentoId },
    data: {
      receita_total: kpis.receita_total, receita_ml: kpis.receita_ml,
      receita_magalu: kpis.receita_magalu, receita_casas_bahia: kpis.receita_casas_bahia,
      receita_amazon: kpis.receita_amazon, receita_shopee: kpis.receita_shopee,
      receita_tiktok: kpis.receita_tiktok, receita_presencial: kpis.receita_presencial,
      receita_outros: kpis.receita_outros,
      desp_custo_produtos: kpis.desp_custo_produtos, desp_tarifas: kpis.desp_tarifas,
      desp_frete: kpis.desp_frete, desp_fatura_ml: kpis.desp_fatura_ml,
      desp_armazenagem: kpis.desp_armazenagem, desp_ads_ml: kpis.desp_ads_ml,
      desp_ads_outros: kpis.desp_ads_outros, desp_outras_taxas: kpis.desp_outras_taxas,
      das_valor_calc: kpis.das_valor_calc, das_vencimento: new Date(ANO, MES, 20),
      desp_pro_labore: kpis.desp_pro_labore, desp_inss: kpis.desp_inss,
      desp_contabilidade: kpis.desp_contabilidade, desp_erp: kpis.desp_erp,
      desp_emprestimo: kpis.desp_emprestimo, desp_aluguel: kpis.desp_aluguel,
      desp_pagina_ml: kpis.desp_pagina_ml, desp_previdencia_privada: kpis.desp_previdencia_privada,
      desp_fixas_outras: kpis.desp_fixas_outras,
      lucro_bruto: kpis.lucro_bruto, lucro_liquido: kpis.lucro_liquido,
      margem_contribuicao: kpis.margem_contribuicao, break_even: kpis.break_even, roas_atual: kpis.roas_atual,
    },
  })
}

// â”€â”€â”€ Main â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function main() {
  console.log('=== Importação ML — Setembro/2026 ===\n')

  // 1. Detectar arquivos
  const arquivos = fs.readdirSync(DIR)
  const fileVendas   = arquivos.find(f => f.toLowerCase().includes('vendas') || f.toLowerCase().includes('relatorio de vendas'))
  const fileFat      = arquivos.find(f => f.toLowerCase().includes('faturamento'))
  const fileTarifas  = arquivos.find(f => f.toLowerCase().includes('tarifas'))

  if (!fileVendas || !fileFat || !fileTarifas) {
    console.error('Arquivos nÃ£o encontrados:')
    console.error('  Vendas:', fileVendas ?? 'âŒ NÃƒO ENCONTRADO')
    console.error('  Faturamento:', fileFat ?? 'âŒ NÃƒO ENCONTRADO')
    console.error('  Tarifas:', fileTarifas ?? 'âŒ NÃƒO ENCONTRADO')
    return
  }

  console.log('Arquivos detectados:')
  console.log('  Vendas:     ', fileVendas)
  console.log('  Faturamento:', fileFat)
  console.log('  Tarifas:    ', fileTarifas)

  // 2. Buscar custos do catÃ¡logo
  const produtosRaw = await prisma.produto_catalogo.findMany({
    where: { workspace_id: WORKSPACE_ID },
    select: { sku_interno: true, custo_brl: true, sku_alias: true },
  })
  const custoPorSku: Record<string, number> = {}
  produtosRaw.forEach(p => {
    if (!p.custo_brl) return
    if (p.sku_interno) custoPorSku[p.sku_interno] = p.custo_brl
    if (p.sku_alias) p.sku_alias.split(',').forEach(a => { const s = a.trim(); if (s) custoPorSku[s] = p.custo_brl! })
  })
  console.log(`\nCatÃ¡logo carregado: ${Object.keys(custoPorSku).length} SKUs com custo`)

  // 3. Parsear planilhas
  console.log('\n--- Parseando planilhas ---')
  const vendas  = await parsearVendas(path.join(DIR, fileVendas), custoPorSku)
  const fat     = parsearFaturamento(path.join(DIR, fileFat))
  const tarifas = parsearTarifasFull(path.join(DIR, fileTarifas))

  console.log(`\nVendas:      receita=R$${vendas.receita.toFixed(2)} | tarifas=R$${vendas.tarifas.toFixed(2)} | frete=R$${vendas.frete.toFixed(2)} | custo_prod=R$${vendas.custoProdutos.toFixed(2)} | pedidos=${vendas.pedidos} | un=${vendas.unidades} | fora_perÃ­odo=${vendas.pulados}`)
  console.log(`Faturamento: publicidade=R$${fat.publicidade.toFixed(2)} | pagina_ml=R$${fat.pagina_ml.toFixed(2)} | afiliados=R$${fat.afiliados.toFixed(2)} | estornos=R$${fat.estornos.toFixed(2)}`)
  console.log(`Tarifas Full: armazenagem=R$${tarifas.armazenagem.toFixed(2)} | coleta=R$${tarifas.coleta.toFixed(2)}`)

  // 4. Confirmar antes de salvar
  const totalReceita = vendas.receita + (fat.estornos < 0 ? Math.abs(fat.estornos) : 0)
  const totalCustos  = vendas.tarifas + vendas.frete + vendas.custoProdutos + fat.publicidade + tarifas.armazenagem + tarifas.coleta + fat.afiliados
  console.log(`\nResumo:  receita_bruta=R$${totalReceita.toFixed(2)} | custos_total=R$${totalCustos.toFixed(2)}`)

  // 5. Buscar/criar faturamento_mes
  const primeiroDia = new Date(ANO, MES - 1, 1)
  const empresa = await prisma.empresa.findUnique({ where: { workspace_id: WORKSPACE_ID }, select: { aliquota_simples: true } })
  const aliquota = empresa?.aliquota_simples ?? 0.08

  const fatMes = await prisma.faturamento_mes.upsert({
    where: { workspace_id_ano_mes: { workspace_id: WORKSPACE_ID, ano: ANO, mes: MES } },
    update: {},
    create: {
      workspace_id: WORKSPACE_ID, ano: ANO, mes: MES,
      aliquota_simples: aliquota,
      dias_no_mes: 30,
      das_vencimento: new Date(ANO, MES, 20),
    },
  })

  // 6. Remover lanÃ§amentos ML anteriores (mesmo que a zeragem jÃ¡ tenha feito)
  const deleted = await prisma.lancamento.deleteMany({
    where: { faturamento_id: fatMes.id, descricao: { contains: 'ML Import' } },
  })
  if (deleted.count > 0) console.log(`\nâš ï¸  Removidos ${deleted.count} lanÃ§amentos ML Import anteriores`)

  // 7. Criar lanÃ§amentos
  const lancamentos: any[] = []

  if (vendas.receita > 0) lancamentos.push({
    faturamento_id: fatMes.id, tipo: 'RECEITA', categoria: 'MERCADO_LIVRE', canal: 'MERCADO_LIVRE',
    descricao: `ML Import â€” Receita de Vendas (${vendas.pedidos} pedidos, ${vendas.unidades} un.)`,
    valor: vendas.receita, data: primeiroDia, status: 'CONFIRMADO',
  })

  if (vendas.tarifas > 0) lancamentos.push({
    faturamento_id: fatMes.id, tipo: 'DESPESA_VARIAVEL', categoria: 'TARIFAS',
    descricao: 'ML Import â€” Tarifas de Venda ML',
    valor: vendas.tarifas, data: primeiroDia, status: 'CONFIRMADO',
  })

  if (vendas.frete > 0) lancamentos.push({
    faturamento_id: fatMes.id, tipo: 'DESPESA_VARIAVEL', categoria: 'FRETE',
    descricao: 'ML Import â€” Frete de Envio',
    valor: vendas.frete, data: primeiroDia, status: 'CONFIRMADO',
  })

  if (vendas.custoProdutos > 0) lancamentos.push({
    faturamento_id: fatMes.id, tipo: 'DESPESA_VARIAVEL', categoria: 'CUSTO_PRODUTOS',
    descricao: 'ML Import â€” Custo com Produtos',
    valor: vendas.custoProdutos, data: primeiroDia, status: 'CONFIRMADO',
  })

  if (fat.publicidade > 0) lancamentos.push({
    faturamento_id: fatMes.id, tipo: 'DESPESA_VARIAVEL', categoria: 'ADS_ML',
    descricao: 'ML Import â€” Publicidade (Product Ads)',
    valor: fat.publicidade, data: primeiroDia, status: 'CONFIRMADO',
  })

  if (tarifas.armazenagem > 0) lancamentos.push({
    faturamento_id: fatMes.id, tipo: 'DESPESA_VARIAVEL', categoria: 'ARMAZENAGEM',
    descricao: 'ML Import â€” Armazenagem Full',
    valor: tarifas.armazenagem, data: primeiroDia, status: 'CONFIRMADO',
  })

  if (tarifas.coleta > 0) lancamentos.push({
    faturamento_id: fatMes.id, tipo: 'DESPESA_VARIAVEL', categoria: 'FRETE',
    descricao: 'ML Import â€” Coleta Full (frete galpÃ£o)',
    valor: tarifas.coleta, data: primeiroDia, status: 'CONFIRMADO',
  })

  if (fat.afiliados > 0) lancamentos.push({
    faturamento_id: fatMes.id, tipo: 'DESPESA_VARIAVEL', categoria: 'OUTRAS_TAXAS',
    descricao: 'ML Import â€” Programa de Afiliados',
    valor: fat.afiliados, data: primeiroDia, status: 'CONFIRMADO',
  })

  if (fat.estornos < 0) lancamentos.push({
    faturamento_id: fatMes.id, tipo: 'RECEITA', categoria: 'OUTRO_CANAL',
    descricao: 'ML Import â€” Estornos e Cancelamentos de Tarifas',
    valor: Math.abs(fat.estornos), data: primeiroDia, status: 'CONFIRMADO',
  })

  const lancamentosComFlag = lancamentos.map(l => ({ ...l, e_automatico: false }))
  await prisma.lancamento.createMany({ data: lancamentosComFlag })
  console.log(`\nâœ… ${lancamentos.length} lanÃ§amentos criados:`)
  lancamentos.forEach(l => console.log(`   [${l.tipo.padEnd(16)} | ${(l.categoria).padEnd(15)}] R$${l.valor.toFixed(2).padStart(12)}  "${l.descricao}"`))

  // 8. Recalcular DRE
  await recalcularMesLocal(fatMes.id)
  const fatAtualizado = await prisma.faturamento_mes.findUnique({
    where: { id: fatMes.id },
    select: { receita_total: true, desp_custo_produtos: true, lucro_bruto: true, lucro_liquido: true },
  })
  console.log(`\n✅ DRE setembro/2026: receita=R$${fatAtualizado?.receita_total?.toFixed(2)} | lucro_liq=R$${fatAtualizado?.lucro_liquido?.toFixed(2)}`)
  console.log(`   receita=R$${fatAtualizado?.receita_total?.toFixed(2)} | custo_prod=R$${fatAtualizado?.desp_custo_produtos?.toFixed(2)} | lucro_bruto=R$${fatAtualizado?.lucro_bruto?.toFixed(2)} | lucro_liq=R$${fatAtualizado?.lucro_liquido?.toFixed(2)}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())


