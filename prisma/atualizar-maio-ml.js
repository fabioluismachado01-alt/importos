/**
 * Atualiza os lançamentos "ML Import" e a análise de Maio/2026 com os
 * números corrigidos do Relatório de Vendas completo (mês civil 01-31),
 * usando exatamente o mesmo algoritmo da rota /api/analisar-ml.
 *
 * Preserva os demais valores (publicidade, armazenagem full, coleta full,
 * página ML, afiliados, estornos) já existentes para o mês.
 *
 * Rodar a partir da pasta prisma/ para que o Prisma resolva
 * DATABASE_URL=file:./dev.db -> prisma/prisma/dev.db (mesmo banco usado pelo app)
 */
const path = require('path')
const { PrismaClient } = require('@prisma/client')
const XLSX = require('xlsx')

const prisma = new PrismaClient()

const ARQUIVO = 'C:\\Users\\fabio\\Downloads\\mercado livre\\Relatorio de vendas mercado livre.xlsx'
const ANO = 2026
const MES = 5

// Índices das colunas do relatório ML (mesmo da rota analisar-ml)
const COL = {
  N_VENDA: 0, DATA: 1, STATUS: 2,
  UNIDADES: 6, REC_PRODUTO: 7, REC_ACRESCIMO: 8,
  TARIFA_IMP: 10, REC_ENVIO: 11, TAR_ENVIO: 12,
  DESCONTOS: 15, CANCELAMENTOS: 16, TOTAL: 17,
  SKU: 21, TITULO: 25, VARIACAO: 26, PRECO_UNIT: 27,
}

const STATUS_VALIDOS = new Set([
  'entregue','no ponto de retirada','a caminho','vamos enviar',
  'processando','envio atrasado','envio reagendado','venda entregue',
])

const MESES_PT = {
  janeiro:1,fevereiro:2,'março':3,abril:4,maio:5,junho:6,
  julho:7,agosto:8,setembro:9,outubro:10,novembro:11,dezembro:12,
}

function limparTitulo(t) {
  return String(t).replace(/\bnamave\b/gi, '').replace(/\s{2,}/g, ' ').trim().slice(0, 60)
}

function parseDataVenda(ds) {
  const match = String(ds ?? '').match(/(\d+) de (\w+) de (\d{4})/)
  if (!match) return null
  const mes = MESES_PT[match[2].toLowerCase()]
  if (!mes) return null
  return { dia: parseInt(match[1]), mes, ano: parseInt(match[3]) }
}

function diasNoMes(ano, mes) {
  return new Date(ano, mes, 0).getDate()
}

// ===========================================================================
// calcularKPIs — réplica de src/engines/finance.ts (usada também em recalc-engine-maio.js)
// ===========================================================================
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

  const lbParaPrevidencia = Math.max(0, kpis.lucro_bruto)
  kpis.desp_previdencia_privada = Math.max(0, kpis.desp_pro_labore * 0.20 + lbParaPrevidencia * 0.11)
  kpis.lucro_liquido = kpis.lucro_bruto - kpis.desp_previdencia_privada

  const margemDecimal = kpis.receita_total > 0 ? kpis.lucro_bruto / kpis.receita_total : 0
  kpis.margem_contribuicao = margemDecimal * 100
  kpis.break_even = (margemDecimal > 0 && totalFixa > 0) ? totalFixa / margemDecimal : 0

  const totalAds = kpis.desp_ads_ml + kpis.desp_ads_outros
  kpis.roas_atual = totalAds > 0 ? kpis.receita_total / totalAds : 0

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
  const fat = await prisma.faturamento_mes.findFirst({ where: { ano: ANO, mes: MES } })
  if (!fat) throw new Error('Faturamento de Maio/2026 não encontrado')
  const workspaceId = fat.workspace_id
  console.log('Faturamento:', fat.id, 'workspace:', workspaceId)

  // ── 1. Ler XLSX e processar com o MESMO algoritmo da rota analisar-ml ──
  const buffer = require('fs').readFileSync(ARQUIVO)
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  const produtos = await prisma.produto_catalogo.findMany({
    where: { workspace_id: workspaceId },
    select: { sku_interno: true, nome: true, custo_brl: true },
  })
  const custoPorSku = {}
  produtos.forEach(p => { if (p.sku_interno && p.custo_brl) custoPorSku[p.sku_interno] = p.custo_brl })

  const competenciaAno = ANO
  const competenciaMes = MES
  const ultimoDia = diasNoMes(competenciaAno, competenciaMes)

  const skus = {}
  let totais = { receita: 0, tarifas: 0, frete: 0, pedidos: 0, cancelados: 0, devolucoes: 0, unidades: 0, fora_do_periodo: 0 }

  for (let i = 6; i < rows.length; i++) {
    const r = rows[i]
    if (!r?.[COL.N_VENDA]) continue

    const dataVenda = parseDataVenda(r[COL.DATA])
    if (dataVenda) {
      const dentroDoPeriodo =
        dataVenda.ano === competenciaAno &&
        dataVenda.mes === competenciaMes &&
        dataVenda.dia >= 1 &&
        dataVenda.dia <= ultimoDia
      if (!dentroDoPeriodo) { totais.fora_do_periodo++; continue }
    }

    const status = String(r[COL.STATUS] ?? '').toLowerCase()

    if (status.includes('cancelad')) { totais.cancelados++; continue }
    if (
      status.includes('devolu') ||
      status.includes('reembolso') ||
      status.includes('te demos o dinheiro') ||
      status.includes('dinheiro liberado')
    ) { totais.devolucoes++; continue }

    const isValido = STATUS_VALIDOS.has(status) || status.includes('vamos enviar') || status.includes('processando')
    if (!isValido) continue

    const sku = String(r[COL.SKU] ?? '').trim() || 'SEM-SKU'
    const uni = Number(r[COL.UNIDADES]) || 0
    const tar = Math.abs(Number(r[COL.TARIFA_IMP]) || 0)
    const fre = Math.abs(Number(r[COL.TAR_ENVIO]) || 0)
    const c17Total = Number(r[COL.TOTAL]) || 0
    const rec = c17Total + tar + fre

    const titulo = limparTitulo(String(r[COL.TITULO] ?? ''))
    const precoUnit = Number(r[COL.PRECO_UNIT]) || (uni > 0 ? Number(r[COL.REC_PRODUTO]) / uni : 0)
    const precoRound = Math.round(precoUnit * 100) / 100

    if (!skus[sku]) skus[sku] = { sku, titulo, unidades: 0, receita: 0, tarifas: 0, frete: 0, custo_unit: custoPorSku[sku] ?? 0, pedidos: 0 }
    skus[sku].unidades += uni
    skus[sku].receita += rec
    skus[sku].tarifas += tar
    skus[sku].frete += fre
    skus[sku].pedidos++

    totais.receita += rec
    totais.tarifas += tar
    totais.frete += fre
    totais.unidades += uni
    totais.pedidos++
  }

  const skusArray = Object.values(skus).map(s => {
    const custo_total = s.custo_unit * s.unidades
    const lucro_bruto = s.receita - s.tarifas - s.frete - custo_total
    return {
      ...s,
      custo_total,
      lucro_bruto,
      margem_perc: s.receita > 0 ? (lucro_bruto / s.receita) * 100 : 0,
      ticket_medio: s.unidades > 0 ? s.receita / s.unidades : 0,
      lucro_unit: s.unidades > 0 ? lucro_bruto / s.unidades : 0,
    }
  }).sort((a, b) => b.lucro_bruto - a.lucro_bruto)

  const custo_total = skusArray.reduce((s, x) => s + x.custo_total, 0)
  const lucro_bruto = totais.receita - totais.tarifas - totais.frete - custo_total
  const margem_perc = totais.receita > 0 ? (lucro_bruto / totais.receita) * 100 : 0
  const ticket_medio = totais.unidades > 0 ? totais.receita / totais.unidades : 0

  console.log('=== NOVOS TOTAIS (Relatório de Vendas — mês civil 01-31) ===')
  console.log({ ...totais, custo_total, lucro_bruto, margem_perc: margem_perc.toFixed(2), ticket_medio: ticket_medio.toFixed(2) })

  // ── 2. Atualiza ml_analise_relatorio existente (com novos SKUs) ──
  const analiseExistente = await prisma.ml_analise_relatorio.findFirst({ where: { workspace_id: workspaceId, ano: ANO, mes: MES } })
  if (analiseExistente) {
    await prisma.ml_analise_sku.deleteMany({ where: { relatorio_id: analiseExistente.id } })
    await prisma.ml_analise_relatorio.update({
      where: { id: analiseExistente.id },
      data: {
        arquivo_nome: 'Relatorio de vendas mercado livre.xlsx',
        periodo_inicio: new Date(competenciaAno, competenciaMes - 1, 1),
        periodo_fim: new Date(competenciaAno, competenciaMes - 1, ultimoDia),
        total_pedidos: totais.pedidos,
        total_cancelados: totais.cancelados,
        total_devolucoes: totais.devolucoes,
        total_unidades: totais.unidades,
        receita_bruta: totais.receita,
        tarifas_ml: totais.tarifas,
        frete_custo: totais.frete,
        custo_produtos: custo_total,
        lucro_bruto,
        margem_perc,
        ticket_medio,
        skus: {
          create: skusArray.map(s => ({
            sku: s.sku, titulo: s.titulo, unidades: s.unidades, pedidos: s.pedidos,
            receita_bruta: s.receita, tarifas_ml: s.tarifas, frete_custo: s.frete,
            custo_unitario: s.custo_unit, custo_total: s.custo_total,
            lucro_bruto: s.lucro_bruto, margem_perc: s.margem_perc,
            ticket_medio: s.ticket_medio, lucro_unit: s.lucro_unit,
          }))
        }
      }
    })
    console.log('ml_analise_relatorio atualizado:', analiseExistente.id)
  }

  // ── 3. Lê valores ML Import existentes (pra preservar publicidade, full, etc.) ──
  const lancsAntigos = await prisma.lancamento.findMany({
    where: { faturamento_id: fat.id, descricao: { contains: 'ML Import' } },
  })
  const pegar = (desc) => lancsAntigos.find(l => l.descricao.includes(desc))?.valor ?? 0

  const publicidade     = pegar('Publicidade')
  const armazenagem_full = pegar('Armazenagem Full')
  const coleta_full     = pegar('Coleta Full')
  const pagina_ml       = pegar('Página Oficial')
  const afiliados       = pegar('Programa de Afiliados')
  const estornoLanc     = lancsAntigos.find(l => l.descricao.includes('Estornos'))
  const estornos        = estornoLanc ? -Math.abs(estornoLanc.valor) : 0

  console.log('=== VALORES PRESERVADOS (outros relatórios ML) ===')
  console.log({ publicidade, armazenagem_full, coleta_full, pagina_ml, afiliados, estornos })

  // ── 4. Apaga lançamentos "ML Import" antigos e recria com os novos valores ──
  await prisma.lancamento.deleteMany({ where: { faturamento_id: fat.id, descricao: { contains: 'ML Import' } } })

  const primeiroDia = new Date(ANO, MES - 1, 1)
  const novosLancamentos = []

  if (totais.receita > 0) {
    novosLancamentos.push({
      faturamento_id: fat.id, tipo: 'RECEITA', categoria: 'MERCADO_LIVRE', canal: 'MERCADO_LIVRE',
      descricao: `ML Import — Receita de Vendas (${totais.pedidos} pedidos, ${totais.unidades} un.)`,
      valor: totais.receita, data: primeiroDia, status: 'CONFIRMADO',
    })
  }
  if (totais.tarifas > 0) {
    novosLancamentos.push({ faturamento_id: fat.id, tipo: 'DESPESA_VARIAVEL', categoria: 'TARIFAS', descricao: 'ML Import — Tarifas de Venda ML', valor: totais.tarifas, data: primeiroDia, status: 'CONFIRMADO' })
  }
  if (totais.frete > 0) {
    novosLancamentos.push({ faturamento_id: fat.id, tipo: 'DESPESA_VARIAVEL', categoria: 'FRETE', descricao: 'ML Import — Frete de Envio', valor: totais.frete, data: primeiroDia, status: 'CONFIRMADO' })
  }
  if (custo_total > 0) {
    novosLancamentos.push({ faturamento_id: fat.id, tipo: 'DESPESA_VARIAVEL', categoria: 'CUSTO_PRODUTOS', descricao: 'ML Import — Custo com Produtos', valor: custo_total, data: primeiroDia, status: 'CONFIRMADO' })
  }
  if (publicidade > 0) {
    novosLancamentos.push({ faturamento_id: fat.id, tipo: 'DESPESA_VARIAVEL', categoria: 'ADS_ML', descricao: 'ML Import — Publicidade (Product Ads)', valor: publicidade, data: primeiroDia, status: 'CONFIRMADO' })
  }
  if (armazenagem_full > 0) {
    novosLancamentos.push({ faturamento_id: fat.id, tipo: 'DESPESA_VARIAVEL', categoria: 'ARMAZENAGEM', descricao: 'ML Import — Armazenagem Full', valor: armazenagem_full, data: primeiroDia, status: 'CONFIRMADO' })
  }
  if (coleta_full > 0) {
    novosLancamentos.push({ faturamento_id: fat.id, tipo: 'DESPESA_VARIAVEL', categoria: 'FRETE', descricao: 'ML Import — Coleta Full (frete galpão)', valor: coleta_full, data: primeiroDia, status: 'CONFIRMADO' })
  }
  if (pagina_ml > 0) {
    novosLancamentos.push({ faturamento_id: fat.id, tipo: 'DESPESA_VARIAVEL', categoria: 'FATURA_ML', descricao: 'ML Import — Página Oficial ML', valor: pagina_ml, data: primeiroDia, status: 'CONFIRMADO' })
  }
  if (afiliados > 0) {
    novosLancamentos.push({ faturamento_id: fat.id, tipo: 'DESPESA_VARIAVEL', categoria: 'OUTRAS_TAXAS', descricao: 'ML Import — Programa de Afiliados', valor: afiliados, data: primeiroDia, status: 'CONFIRMADO' })
  }
  if (estornos < 0) {
    novosLancamentos.push({ faturamento_id: fat.id, tipo: 'RECEITA', categoria: 'OUTRO_CANAL', descricao: 'ML Import — Estornos e Cancelamentos de Tarifas', valor: Math.abs(estornos), data: primeiroDia, status: 'CONFIRMADO' })
  }

  await prisma.lancamento.createMany({ data: novosLancamentos })
  console.log(`\n${novosLancamentos.length} lançamentos ML Import recriados.`)

  // ── 5. Recalcula faturamento_mes (mesma lógica de recalcularMes) ──
  const lancamentos = await prisma.lancamento.findMany({
    where: { faturamento_id: fat.id, status: 'CONFIRMADO' },
    select: { tipo: true, categoria: true, canal: true, valor: true, data: true, descricao: true },
  })

  const finConfig = await prisma.finance_config.findFirst({ where: { workspace_id: workspaceId } })
  const config = {
    aliquota_simples: fat.aliquota_simples,
    percentual_dlr_socio: finConfig?.percentual_dlr_socio ?? 0.5,
  }

  const kpis = calcularKPIs(lancamentos, config)

  await prisma.faturamento_mes.update({
    where: { id: fat.id },
    data: {
      receita_total: kpis.receita_total,
      receita_ml: kpis.receita_ml,
      receita_magalu: kpis.receita_magalu,
      receita_casas_bahia: kpis.receita_casas_bahia,
      receita_amazon: kpis.receita_amazon,
      receita_shopee: kpis.receita_shopee,
      receita_tiktok: kpis.receita_tiktok,
      receita_presencial: kpis.receita_presencial,
      receita_outros: kpis.receita_outros,
      desp_armazenagem: kpis.desp_armazenagem,
      desp_ads_ml: kpis.desp_ads_ml,
      desp_ads_outros: kpis.desp_ads_outros,
      desp_custo_produtos: kpis.desp_custo_produtos,
      desp_tarifas: kpis.desp_tarifas,
      desp_frete: kpis.desp_frete,
      desp_fatura_ml: kpis.desp_fatura_ml,
      desp_outras_taxas: kpis.desp_outras_taxas,
      das_valor_calc: kpis.das_valor_calc,
      desp_pro_labore: kpis.desp_pro_labore,
      desp_inss: kpis.desp_inss,
      desp_contabilidade: kpis.desp_contabilidade,
      desp_erp: kpis.desp_erp,
      desp_emprestimo: kpis.desp_emprestimo,
      desp_aluguel: kpis.desp_aluguel,
      desp_pagina_ml: kpis.desp_pagina_ml,
      desp_previdencia_privada: kpis.desp_previdencia_privada,
      desp_fixas_outras: kpis.desp_fixas_outras,
      ticket_medio: kpis.ticket_medio,
      lucro_bruto: kpis.lucro_bruto,
      lucro_liquido: kpis.lucro_liquido,
      margem_contribuicao: kpis.margem_contribuicao,
      break_even: kpis.break_even,
      roas_atual: kpis.roas_atual,
      dlr_socio: kpis.dlr_socio,
      reinvestimento: kpis.reinvestimento,
    }
  })

  console.log('\n=== FATURAMENTO MAIO/2026 ATUALIZADO ===')
  console.log('Receita Total:  R$', kpis.receita_total.toFixed(2))
  console.log('Receita ML:     R$', kpis.receita_ml.toFixed(2))
  console.log('DAS calc:       R$', kpis.das_valor_calc.toFixed(2))
  console.log('Lucro Bruto:    R$', kpis.lucro_bruto.toFixed(2))
  console.log('Lucro Líquido:  R$', kpis.lucro_liquido.toFixed(2))
}

main().catch(console.error).finally(() => prisma.$disconnect())
