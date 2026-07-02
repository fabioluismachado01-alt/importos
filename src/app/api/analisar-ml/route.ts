/**
 * API: Análise de Relatório de Vendas do Mercado Livre
 * Lê o xlsx do ML, cruza com custos do catálogo de produtos e retorna análise completa.
 *
 * Ciclo ML: vendas do dia 30 ao dia 29 do mês seguinte.
 * Header real do relatório: linha 6 (índice 5).
 */
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'
import { calcularDIFAL, TABELA_UF, type UF } from '@/engines/difal'

// Mapeamento nome completo do estado → sigla UF
const ESTADO_PARA_UF: Record<string, UF> = {
  'acre': 'AC', 'alagoas': 'AL', 'amazonas': 'AM', 'amapá': 'AP',
  'bahia': 'BA', 'ceará': 'CE', 'distrito federal': 'DF', 'espírito santo': 'ES',
  'goiás': 'GO', 'maranhão': 'MA', 'minas gerais': 'MG', 'mato grosso do sul': 'MS',
  'mato grosso': 'MT', 'pará': 'PA', 'paraíba': 'PB', 'pernambuco': 'PE',
  'piauí': 'PI', 'paraná': 'PR', 'rio de janeiro': 'RJ', 'rio grande do norte': 'RN',
  'rondônia': 'RO', 'roraima': 'RR', 'rio grande do sul': 'RS', 'santa catarina': 'SC',
  'sergipe': 'SE', 'são paulo': 'SP', 'tocantins': 'TO',
}

function nomeParaUF(nome: string): UF | null {
  return ESTADO_PARA_UF[String(nome ?? '').toLowerCase().trim()] ?? null
}

// Índices das colunas do relatório ML (versão BR)
const COL = {
  N_VENDA:       0,  DATA:          1,  STATUS:         2,
  UNIDADES:      6,  REC_PRODUTO:   7,
  ESTADO_COMPRADOR: 40,
  REC_ACRESCIMO:  8,  // Receita por acréscimo pago pelo comprador (parcelamento etc.)
  TARIFA_IMP:    10,
  REC_ENVIO:     11,  // Receita por envio — comprador pagou frete separado (POSITIVO para o vendedor)
  TAR_ENVIO:     12,  // Custo de envio cobrado do vendedor (NEGATIVO)
  DESCONTOS:    15,  // Descontos e bônus — ML paga de volta ao vendedor em promoções compartilhadas (POSITIVO)
  CANCELAMENTOS:16,  // Cancelamentos e reembolsos — ML desconta do vendedor (NEGATIVO)
  TOTAL:        17,  // Total BRL — valor líquido depositado (validação)
  SKU:          21,  TITULO:       25,  VARIACAO:      26,  PRECO_UNIT: 27,
}

const STATUS_VALIDOS = new Set([
  'entregue','no ponto de retirada','a caminho','vamos enviar',
  'processando','envio atrasado','envio reagendado','venda entregue',
])

// Prefixos/substrings que indicam venda válida mesmo com status composto
const STATUS_VALIDOS_PARTIAL = [
  'pacote de ',           // "pacote de 2 produtos" — entrega multi-produto válida
  'reclamação',           // "reclamação esperando resposta" — venda ativa com disputa aberta
  'mediação para responder', // mediação ainda em aberto (vendedor não perdeu)
  'mediação com devolução habilitada', // comprador pode devolver mas ainda não devolveu
]

function limparTitulo(t: string): string {
  return t.replace(/\bnamave\b/gi, '').replace(/\s{2,}/g, ' ').trim().slice(0, 60)
}

const MESES_PT: Record<string, number> = {
  janeiro:1,fevereiro:2,março:3,abril:4,maio:5,junho:6,
  julho:7,agosto:8,setembro:9,outubro:10,novembro:11,dezembro:12,
}

/** Faz parse da data da venda. Formato: "29 de maio de 2026 23:17 hs." */
function parseDataVenda(ds: unknown): { dia: number; mes: number; ano: number } | null {
  const match = String(ds ?? '').match(/(\d+) de (\w+) de (\d{4})/)
  if (!match) return null
  const mes = MESES_PT[match[2].toLowerCase()]
  if (!mes) return null
  return { dia: parseInt(match[1]), mes, ano: parseInt(match[3]) }
}

/** Quantidade de dias do mês (28-31). */
function diasNoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate()
}

/**
 * Detecta o mês de competência (mês civil, dia 01 ao último dia) a partir
 * da maioria das datas de venda do relatório.
 */
function detectarPeriodo(rows: unknown[][]): { inicio: Date; fim: Date; ano: number; mes: number } {
  const datas: Date[] = []
  const contagem: Record<string, number> = {}
  for (let i = 6; i < rows.length; i++) {
    const r = rows[i] as unknown[]
    if (!r?.[COL.DATA]) continue
    const d = parseDataVenda(r[COL.DATA])
    if (!d) continue
    datas.push(new Date(d.ano, d.mes - 1, d.dia))
    const chave = `${d.ano}-${d.mes}`
    contagem[chave] = (contagem[chave] || 0) + 1
  }
  datas.sort((a, b) => a.getTime() - b.getTime())
  const inicio = datas[0] ?? new Date()
  const fim = datas[datas.length - 1] ?? new Date()

  // Mês de competência = mês civil com mais vendas no relatório
  const [chaveTop] = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0] ?? [`${fim.getFullYear()}-${fim.getMonth() + 1}`]
  const [anoTop, mesTop] = chaveTop.split('-').map(Number)
  return { inicio, fim, ano: anoTop, mes: mesTop }
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await getAuthContext()
    const formData = await req.formData()
    const file = formData.get('file') as File
    const modoPreview = formData.get('preview') === 'true'
    // Mês/ano explícito — definido pelo usuário, não auto-detectado
    const mesExplicito  = formData.get('mes')  ? parseInt(String(formData.get('mes')))  : null
    const anoExplicito  = formData.get('ano')  ? parseInt(String(formData.get('ano')))  : null

    if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buffer, { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

    if (rows.length < 8) {
      return NextResponse.json({ error: 'Arquivo inválido ou sem dados' }, { status: 400 })
    }

    // Busca custos do catálogo de produtos e UF da empresa
    const [produtosRaw, empresa] = await Promise.all([
      prisma.produto_catalogo.findMany({
        where: { workspace_id: workspaceId },
        select: { sku_interno: true, nome: true, custo_brl: true },
      }),
      prisma.empresa.findUnique({
        where: { workspace_id: workspaceId },
        select: { estado_uf: true },
      }),
    ])
    const produtos = produtosRaw
    const ufOrigem = (empresa?.estado_uf ?? 'SP') as UF
    const custoPorSku: Record<string, number> = {}
    produtos.forEach(p => { if (p.sku_interno && p.custo_brl) custoPorSku[p.sku_interno] = p.custo_brl })

    // ─── PERÍODO DE COMPETÊNCIA (mês civil: dia 01 ao último dia) ──────────
    // O Relatório de Vendas do ML deve ser exportado pelo mês civil (não pelo
    // ciclo de faturamento 30→29 usado pelos outros relatórios — Faturamento,
    // Tarifas Full, Pagamentos —, que continuam no ciclo padrão).
    const periodoDetectado0 = detectarPeriodo(rows)
    const competenciaAno = anoExplicito ?? periodoDetectado0.ano
    const competenciaMes = mesExplicito ?? periodoDetectado0.mes
    const ultimoDia = diasNoMes(competenciaAno, competenciaMes)

    // Processar vendas
    const skus: Record<string, {
      sku: string; titulo: string; unidades: number; receita: number
      tarifas: number; frete: number; custo_unit: number; pedidos: number
      // Breakdown de preços — detecta quando o mesmo SKU é vendido em múltiplos preços
      precos: Record<number, { unidades: number; receita: number; tarifas: number; frete: number }>
    }> = {}
    let totais = { receita: 0, tarifas: 0, frete: 0, pedidos: 0, cancelados: 0, devolucoes: 0, unidades: 0, fora_do_periodo: 0 }
    // Acumuladores DIFAL — agrupado por UF destino
    const difalPorEstado: Record<string, { pedidos: number; receita: number; difal: number; fcp: number }> = {}
    let totalDifal = 0
    let receitaInterestadual = 0
    let pedidosInterestaduais = 0

    for (let i = 6; i < rows.length; i++) {
      const r = rows[i] as unknown[]
      if (!r?.[COL.N_VENDA]) continue

      // ─── FILTRO DE PERÍODO: só considera vendas do mês civil 01 ao último dia ──
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

      // ─── FILTROS DE STATUS ────────────────────────────────────────────────
      // Cancelamentos: excluídos completamente
      if (status.includes('cancelad')) { totais.cancelados++; continue }

      // Devoluções e reembolsos completos: excluídos
      // Inclui: "Devolução...", "Mediação finalizada com reembolso", "Reembolso..."
      // Inclui: "Mediação finalizada. Te demos o dinheiro." (ML pagou o comprador)
      // "mediação com devolução habilitada" = comprador PODE devolver mas ainda não devolveu → venda ativa
      const ehDevolucaoAtiva = status.includes('devolu') && !status.includes('habilitada')
      if (
        ehDevolucaoAtiva ||
        status.includes('reembolso') ||
        status.includes('te demos o dinheiro') ||
        status.includes('dinheiro liberado')
      ) { totais.devolucoes++; continue }

      // Mediações sem reembolso explícito: INCLUIR mas o Col 16 (cancelamento) deduzirá automaticamente
      // Ex: "Mediação finalizada." sem "reembolso" — vendedor pode ter ganho a mediação

      const isValido = STATUS_VALIDOS.has(status)
        || status.includes('vamos enviar')
        || status.includes('processando')
        || STATUS_VALIDOS_PARTIAL.some(p => status.includes(p))
      if (!isValido) continue

      const sku = String(r[COL.SKU] ?? '').trim() || 'SEM-SKU'
      const uni = Number(r[COL.UNIDADES]) || 0
      // ─── RECEITA REAL: todos os valores que ENTRAM para o vendedor ────────
      // Col 7: Receita do produto (preço pago pelo comprador pelo produto)
      // Col 8: Receita por acréscimo (ex: juros de parcelamento repassados)
      // Col 11: Receita por envio — FUNDAMENTAL: quando o comprador paga frete separado
      //         Sem incluir isso, pedidos com frete pago pelo comprador parecem ter custo
      //         alto de frete quando na verdade é neutro (receita envio ≈ custo envio)
      // Col 15: Descontos e bônus — ML paga ao vendedor em promoções compartilhadas
      // Col 16: NÃO somamos — ordens com reembolso já filtradas pelo status 'reembolso'
      // ─── FÓRMULA DEFINITIVA: C17 + abs(C10) + abs(C12) ──────────────────
      // C17 = Total (BRL) = valor líquido que o ML deposita — sempre correto e verificado pelo ML
      // Prova: C17 = Receita_Bruta - Tarifa - Frete → Receita_Bruta = C17 + Tarifa + Frete
      //
      // Esta fórmula é robusta para TODOS os casos:
      // ✅ Pedido normal
      // ✅ Parcelamento com acréscimo (C8 + C9 se anulam, já refletidos no C17)
      // ✅ Frete pago pelo comprador (C11 já embutido no C17)
      // ✅ Promoção compartilhada ML (C15 bônus já no C17)
      // ✅ Cancelamentos parciais (C16 já no C17)
      // ✅ Pedidos em pacote / bundle (C17 é o valor certo independente de C7)
      // ✅ Diferença de peso/medidas (C13+C14 já dentro de C12)
      // Custos (declarados antes de rec porque rec depende deles)
      const tar = Math.abs(Number(r[COL.TARIFA_IMP]) || 0)
      const fre = Math.abs(Number(r[COL.TAR_ENVIO]) || 0)

      // Receita bruta = C17 (líquido ML) + tarifa + frete (reconstrói o bruto)
      const c17Total = Number(r[COL.TOTAL]) || 0
      const rec = c17Total + tar + fre

      const titulo = limparTitulo(String(r[COL.TITULO] ?? ''))
      // Preço unitário do anúncio (col 27) — para breakdown por faixa de preço
      const precoUnit = Number(r[COL.PRECO_UNIT]) || (uni > 0 ? Number(r[COL.REC_PRODUTO]) / uni : 0)
      const precoRound = Math.round(precoUnit * 100) / 100

      if (!skus[sku]) skus[sku] = { sku, titulo, unidades: 0, receita: 0, tarifas: 0, frete: 0, custo_unit: custoPorSku[sku] ?? 0, pedidos: 0, precos: {} }
      skus[sku].unidades += uni
      skus[sku].receita  += rec
      skus[sku].tarifas  += tar

      // Registra o breakdown por preço de venda
      if (!skus[sku].precos[precoRound]) skus[sku].precos[precoRound] = { unidades: 0, receita: 0, tarifas: 0, frete: 0 }
      skus[sku].precos[precoRound].unidades += uni
      skus[sku].precos[precoRound].receita  += rec
      skus[sku].precos[precoRound].tarifas  += tar
      skus[sku].precos[precoRound].frete    += fre
      skus[sku].frete    += fre
      skus[sku].pedidos++

      totais.receita   += rec
      totais.tarifas   += tar
      totais.frete     += fre
      totais.unidades  += uni
      totais.pedidos++

      // DIFAL — somente se venda interestadual (estado comprador ≠ UF origem)
      const estadoNome = String(r[COL.ESTADO_COMPRADOR] ?? '').trim()
      const ufDestino = nomeParaUF(estadoNome)
      if (ufDestino && ufDestino !== ufOrigem) {
        const valorVenda = Number(r[COL.REC_PRODUTO]) || rec
        const res = calcularDIFAL({ valorVenda, ufOrigem, ufDestino, importado: false })
        if (res) {
          receitaInterestadual += valorVenda
          totalDifal += res.total
          pedidosInterestaduais++
          if (!difalPorEstado[ufDestino]) difalPorEstado[ufDestino] = { pedidos: 0, receita: 0, difal: 0, fcp: 0 }
          difalPorEstado[ufDestino].pedidos++
          difalPorEstado[ufDestino].receita += valorVenda
          difalPorEstado[ufDestino].difal   += res.difal
          difalPorEstado[ufDestino].fcp     += res.fcpValor
        }
      }
    }

    // Calcular lucros por SKU + breakdown de preços
    const skusArray = Object.values(skus).map(s => {
      const custo_total = s.custo_unit * s.unidades
      const lucro_bruto = s.receita - s.tarifas - s.frete - custo_total

      // Breakdown por faixa de preço (detecta variações de preço no mesmo SKU)
      const precos_breakdown = Object.entries(s.precos)
        .map(([preco, d]) => {
          const precoNum = parseFloat(preco)
          const ct = s.custo_unit * d.unidades
          const lb = d.receita - d.tarifas - d.frete - ct
          return {
            preco_unit: precoNum,
            unidades: d.unidades,
            receita: d.receita,
            tarifas: d.tarifas,
            frete: d.frete,
            custo_total: ct,
            lucro_bruto: lb,
            lucro_unit: d.unidades > 0 ? lb / d.unidades : 0,
            margem_perc: d.receita > 0 ? (lb / d.receita) * 100 : 0,
          }
        })
        .sort((a, b) => b.preco_unit - a.preco_unit)

      const multiplos_precos = precos_breakdown.length > 1
      const tem_preco_prejuizo = precos_breakdown.some(p => p.lucro_unit < 0)

      return {
        ...s,
        custo_total,
        lucro_bruto,
        margem_perc: s.receita > 0 ? (lucro_bruto / s.receita) * 100 : 0,
        ticket_medio: s.unidades > 0 ? s.receita / s.unidades : 0,
        lucro_unit: s.unidades > 0 ? lucro_bruto / s.unidades : 0,
        sem_custo: s.custo_unit === 0,
        multiplos_precos,
        tem_preco_prejuizo,
        precos_breakdown,
      }
    }).sort((a, b) => b.lucro_bruto - a.lucro_bruto)

    const custo_total = skusArray.reduce((s, x) => s + x.custo_total, 0)
    const lucro_bruto = totais.receita - totais.tarifas - totais.frete - custo_total

    // Período: mês civil de competência (já usado para filtrar as vendas acima)
    const periodo = {
      inicio: new Date(competenciaAno, competenciaMes - 1, 1),
      fim:    new Date(competenciaAno, competenciaMes - 1, ultimoDia),
      ano:    competenciaAno,
      mes:    competenciaMes,
    }

    // Top 5 estados por DIFAL para exibição no resumo
    const topEstados = Object.entries(difalPorEstado)
      .map(([uf, d]) => ({ uf, nome: TABELA_UF[uf as UF]?.nome ?? uf, ...d }))
      .sort((a, b) => b.difal - a.difal)
      .slice(0, 5)

    const resumo = {
      arquivo: file.name,
      marketplace: 'MERCADO_LIVRE',
      periodo,
      pedidos: totais.pedidos,
      cancelados: totais.cancelados,
      devolucoes: totais.devolucoes,
      fora_do_periodo: totais.fora_do_periodo,
      unidades: totais.unidades,
      receita_bruta: totais.receita,
      tarifas_ml: totais.tarifas,
      frete_custo: totais.frete,
      custo_produtos: custo_total,
      lucro_bruto,
      margem_perc: totais.receita > 0 ? (lucro_bruto / totais.receita) * 100 : 0,
      ticket_medio: totais.unidades > 0 ? totais.receita / totais.unidades : 0,
      // DIFAL
      difal: {
        estimado: totalDifal,
        receita_interestadual: receitaInterestadual,
        pedidos_interestaduais: pedidosInterestaduais,
        perc_interestadual: totais.receita > 0 ? (receitaInterestadual / totais.receita) * 100 : 0,
        uf_origem: ufOrigem,
        top_estados: topEstados,
      },
      skus: skusArray,
      alertas: {
        sem_custo: skusArray.filter(s => s.sem_custo).map(s => s.sku),
        margem_negativa: skusArray.filter(s => s.margem_perc < 0).map(s => ({ sku: s.sku, margem: s.margem_perc.toFixed(1) })),
        margem_critica: skusArray.filter(s => s.margem_perc >= 0 && s.margem_perc < 10).map(s => ({ sku: s.sku, margem: s.margem_perc.toFixed(1) })),
      }
    }

    if (modoPreview) return NextResponse.json({ preview: true, ...resumo })

    // Salvar no banco
    const analise = await prisma.ml_analise_relatorio.create({
      data: {
        workspace_id: workspaceId,
        marketplace: 'MERCADO_LIVRE',
        arquivo_nome: file.name,
        periodo_inicio: periodo.inicio,
        periodo_fim: periodo.fim,
        ano: periodo.ano,
        mes: periodo.mes,
        total_pedidos: totais.pedidos,
        total_cancelados: totais.cancelados,
        total_devolucoes: totais.devolucoes,
        total_unidades: totais.unidades,
        receita_bruta: totais.receita,
        tarifas_ml: totais.tarifas,
        frete_custo: totais.frete,
        custo_produtos: custo_total,
        lucro_bruto,
        margem_perc: resumo.margem_perc,
        ticket_medio: resumo.ticket_medio,
        receita_interestadual: receitaInterestadual,
        difal_estimado: totalDifal,
        pedidos_interestaduais: pedidosInterestaduais,
        difal_por_estado: JSON.stringify(difalPorEstado),
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

    return NextResponse.json({ success: true, analise_id: analise.id, ...resumo })
  } catch (err) {
    console.error('[analisar-ml]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { workspaceId } = await getAuthContext()
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (id) {
    const analise = await prisma.ml_analise_relatorio.findFirst({
      where: { id, workspace_id: workspaceId },
      include: { skus: { orderBy: { lucro_bruto: 'desc' } } },
    })
    return NextResponse.json(analise)
  }

  const lista = await prisma.ml_analise_relatorio.findMany({
    where: { workspace_id: workspaceId },
    orderBy: { created_at: 'desc' },
    take: 20,
  })
  return NextResponse.json(lista)
}
