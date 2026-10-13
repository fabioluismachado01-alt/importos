/**
 * API: Análise de Relatório de Vendas do Mercado Livre
 * Lê o xlsx do ML, cruza com custos do catálogo de produtos e retorna análise completa.
 * Período: mês-calendário (01 ao último dia do mês). Exportar o relatório com esse filtro.
 * Header real do relatório: linha 6 (índice 5).
 */
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'
import { calcularDIFAL, TABELA_UF, type UF } from '@/engines/difal'
import { classificarStatus } from '@/lib/ml-status'
import { resolverColunas, assertColunasObrigatorias, calcularParcelamento, reconciliarTotal } from '@/lib/ml-parcelamento'
import { classificarRetornoCMV } from '@/lib/ml-cmv-devolucao'

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

function limparTitulo(t: string): string {
  return t.replace(/\bnamave\b/gi, '').replace(/\s{2,}/g, ' ').trim().slice(0, 60)
}

// Chaves sem acentos — permite lookup após normalizar o nome do mês do arquivo
const MESES_PT: Record<string, number> = {
  janeiro:1, fevereiro:2, marco:3, abril:4, maio:5, junho:6,
  julho:7, agosto:8, setembro:9, outubro:10, novembro:11, dezembro:12,
}

function normalizarNomeMes(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Faz parse da data da venda. Formato: "29 de março de 2026 23:33 hs." */
function parseDataVenda(ds: unknown): { dia: number; mes: number; ano: number } | null {
  // [^\s]+ em vez de \w+ para capturar meses com cedilha/acento (ex: "março")
  const match = String(ds ?? '').match(/(\d+) de ([^\s]+) de (\d{4})/)
  if (!match) return null
  const mes = MESES_PT[normalizarNomeMes(match[2])]
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
function detectarPeriodo(rows: unknown[][], COL: ReturnType<typeof resolverColunas>): { inicio: Date; fim: Date; ano: number; mes: number; dominantePerc: number; contagemEntries: [string, number][]; totalLinhasPeriodo: number } {
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

  if (datas.length === 0) {
    throw new Error('Não foi possível interpretar nenhuma data do relatório. Verifique se o arquivo está correto.')
  }

  const inicio = datas[0]
  const fim = datas[datas.length - 1]

  // Mês de competência = mês civil com mais vendas
  const totalLinhas = datas.length
  const sorted = Object.entries(contagem).sort((a, b) => b[1] - a[1])
  const [[chaveTop, countTop]] = sorted
  const [anoTop, mesTop] = chaveTop.split('-').map(Number)
  const dominantePerc = countTop / totalLinhas
  const contagemEntries = sorted.map(([k, v]): [string, number] => [k, v])
  return { inicio, fim, ano: anoTop, mes: mesTop, dominantePerc, contagemEntries, totalLinhasPeriodo: totalLinhas }
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

    // Header real do ML está na linha 5 (índice 5); dados a partir da linha 6
    const COL = resolverColunas(rows[5] as unknown[])
    try {
      assertColunasObrigatorias(COL, rows[5] as unknown[])
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 422 })
    }

    // Busca custos do catálogo de produtos, histórico de vigência e UF da empresa
    const competenciaData = new Date(Date.UTC(
      anoExplicito ?? new Date().getUTCFullYear(),
      (mesExplicito ?? new Date().getUTCMonth() + 1) - 1,
      1
    ))

    const [produtosRaw, empresa, historicoRaw] = await Promise.all([
      prisma.produto_catalogo.findMany({
        where: { workspace_id: workspaceId },
        select: { sku_interno: true, nome: true, custo_brl: true, sku_alias: true },
      }),
      prisma.empresa.findUnique({
        where: { workspace_id: workspaceId },
        select: { estado_uf: true },
      }),
      // Custo vigente por produto_id na competência: maior data_inicio <= 1º do mês
      prisma.$queryRaw<{ sku_interno: string; custo_brl: number }[]>`
        SELECT DISTINCT ON (p.sku_interno)
          p.sku_interno,
          h.custo_brl
        FROM produto_custo_historico h
        JOIN produto_catalogo p ON p.id = h.produto_id
        WHERE h.workspace_id = ${workspaceId}
          AND p.sku_interno IS NOT NULL
          AND h.data_inicio <= ${competenciaData}::date
        ORDER BY p.sku_interno, h.data_inicio DESC
      `.catch(() => [] as { sku_interno: string; custo_brl: number }[]),
    ])

    const produtos = produtosRaw
    const ufOrigem = (empresa?.estado_uf ?? 'SP') as UF

    // Custo por SKU via produto_custo_historico (custo vigente na competência)
    const custoVigente = new Map(historicoRaw.map(h => [h.sku_interno, h.custo_brl]))

    // Construção do custoPorSku em duas passagens:
    // 1ª passagem: entradas próprias (sku_interno) — nunca sobrescritas por alias
    // 2ª passagem: aliases — só preenchem SKUs ainda não definidos
    const custoPorSku: Record<string, number> = {}
    for (const p of produtos) {
      if (!p.sku_interno) continue
      // Usa histórico vigente se existir, senão custo_brl do catálogo
      const custo = custoVigente.get(p.sku_interno) ?? p.custo_brl
      if (!custo) continue
      custoPorSku[p.sku_interno] = custo
    }
    for (const p of produtos) {
      if (!p.sku_alias) continue
      const custo = custoVigente.get(p.sku_interno ?? '') ?? p.custo_brl
      if (!custo) continue
      p.sku_alias.split(',').forEach(a => {
        const s = a.trim()
        if (s && !(s in custoPorSku)) {
          // SKU de alias nunca tem histórico próprio — usa custo do produto pai
          custoPorSku[s] = custo
        } else if (s && s in custoPorSku && custoPorSku[s] !== custo) {
          console.warn(`[analisar-ml] colisão de alias: SKU "${s}" já definido por entrada própria; alias de "${p.sku_interno}" ignorado`)
        }
      })
    }

    // ─── PERÍODO DE COMPETÊNCIA (mês civil: dia 01 ao último dia) ──────────
    // O Relatório de Vendas do ML deve ser exportado pelo mês civil (não pelo
    // ciclo de faturamento 30→29 usado pelos outros relatórios — Faturamento,
    // Tarifas Full, Pagamentos —, que continuam no ciclo padrão).
    const periodoDetectado0 = detectarPeriodo(rows, COL)

    // Valida período com a regra correta:
    // dominante == competência → aceita; dominante != competência → rejeita com contexto
    const mesesNomesPT = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
    if (mesExplicito && anoExplicito) {
      if (periodoDetectado0.ano === anoExplicito && periodoDetectado0.mes === mesExplicito) {
        // Arquivo correto — aceita independente do %
      } else if (periodoDetectado0.dominantePerc >= 0.6) {
        return NextResponse.json({
          error: `Este relatório é de ${mesesNomesPT[periodoDetectado0.mes-1]}/${periodoDetectado0.ano}, mas a competência selecionada é ${mesesNomesPT[mesExplicito-1]}/${anoExplicito}. Baixe o relatório do período correto.`
        }, { status: 422 })
      } else {
        const totalL = periodoDetectado0.totalLinhasPeriodo
        const dist = periodoDetectado0.contagemEntries
          .map(([k, v]) => `${k} (${Math.round(v / totalL * 100)}%)`).join(', ')
        return NextResponse.json({
          error: `Não foi possível identificar o período deste relatório. Linhas encontradas: ${dist}. Baixe o relatório de um único mês de competência.`
        }, { status: 422 })
      }
    } else if (periodoDetectado0.dominantePerc < 0.6) {
      const totalL = periodoDetectado0.totalLinhasPeriodo
      const dist = periodoDetectado0.contagemEntries
        .map(([k, v]) => `${k} (${Math.round(v / totalL * 100)}%)`).join(', ')
      return NextResponse.json({
        error: `Não foi possível identificar o período deste relatório. Linhas encontradas: ${dist}. Baixe o relatório de um único mês de competência.`
      }, { status: 422 })
    }

    const competenciaAno = anoExplicito ?? periodoDetectado0.ano
    const competenciaMes = mesExplicito ?? periodoDetectado0.mes
    const ultimoDia = diasNoMes(competenciaAno, competenciaMes)

    // Processar vendas
    const skus: Record<string, {
      sku: string; titulo: string; unidades: number; receita: number
      tarifas: number; frete: number; custo_unit: number; pedidos: number
      cmv_ausente: boolean  // true se SKU não tem custo cadastrado
      // Breakdown de preços — detecta quando o mesmo SKU é vendido em múltiplos preços
      precos: Record<number, { unidades: number; receita: number; tarifas: number; frete: number }>
    }> = {}
    let totais = { receita: 0, tarifas: 0, frete: 0, pedidos: 0, cancelados: 0, devolucoes: 0, unidades: 0, fora_do_periodo: 0, acrescimo_parcelamento: 0, taxa_parcelamento: 0, desconhecidos_incluidos: 0, desconhecidos_excluidos: 0 }

    // ─── Auditoria de CMV por PEDIDO (bug ML-3) ──────────────────────────
    // Antes era gravada uma única linha agregada por SKU com numero_venda
    // 'AGREGADO' e status_original 'VENDA_EFETIVA'. Agora cada linha do
    // relatório vira uma linha de auditoria com o número de venda e o status
    // realmente lidos do arquivo — é isso que torna a trilha auditável.
    type CmvAuditRow = {
      numero_venda: string; sku: string; quantidade: number
      custo_unitario: number; cmv_total: number
      status_original: string; grupo_status: string
      incluido_cmv: boolean; motivo_exclusao: string | null; cmv_ausente: boolean
    }
    const cmvAudit: CmvAuditRow[] = []

    // Reconciliação do Total (BRL) — resíduo ≠ 0 vira alerta, nunca lançamento
    let residuo_total = 0
    const linhas_residuo: Array<{ numero_venda: string; residuo: number }> = []

    // CMV de devoluções: retido (sem estorno) vs. estornado (retorno confirmado)
    let cmv_devolucao_retido = 0
    let cmv_devolucao_estornado = 0
    const devolucoes_retorno_incerto: Array<{ numero_venda: string; sku: string; status: string; cmv: number }> = []
    // CMV de mediações em aberto (DEVOLUCAO_EM_ANALISE): produto pode não ter sido
    // enviado — rastreado separadamente, NÃO somado ao custo_produtos.
    let cmv_mediacao_incerto = 0
    const pendencias_mediacao: Array<{ numero_venda: string; sku: string; status: string; cmv: number }> = []
    let total_mediacao_em_analise = 0
    // Operações pendentes: VENDA_EM_ANDAMENTO e NAO_ENTREGUE — rastreadas separadamente.
    const pendencias_operacionais: Array<{ numero_venda: string; sku: string; status: string; estado: string; grupo: string; cmv: number }> = []
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

      const statusRaw = String(r[COL.STATUS] ?? '').trim()
      const estadoRaw = String(r[COL.ESTADO_COMPRADOR] ?? '').trim()
      const grupo = classificarStatus(statusRaw, estadoRaw)

      // Dados da linha usados tanto pela auditoria quanto pelo cálculo de receita
      const numeroVenda = String(r[COL.N_VENDA] ?? '').trim()
      const skuLinha = String(r[COL.SKU] ?? '').trim() || 'SEM-SKU'
      const uniLinha = Number(r[COL.UNIDADES]) || 0
      const custoUnitLinha = custoPorSku[skuLinha] ?? 0
      const cmvAusenteLinha = !(skuLinha in custoPorSku) || custoPorSku[skuLinha] === 0

      if (grupo === 'CANCELADA') {
        totais.cancelados++
        // Cancelamento: sem evidência de que o produto saiu do estoque.
        // CMV = 0 — não reconhecido. Se houver evidência futura de saída,
        // reclassificar manualmente.
        cmvAudit.push({
          numero_venda: numeroVenda, sku: skuLinha, quantidade: uniLinha,
          custo_unitario: custoUnitLinha, cmv_total: 0,
          status_original: statusRaw, grupo_status: 'CANCELADA',
          incluido_cmv: false, motivo_exclusao: 'VENDA_CANCELADA_SEM_EVIDENCIA_SAIDA',
          cmv_ausente: cmvAusenteLinha,
        })
        continue
      }

      if (grupo === 'DEVOLUCAO_EM_ANALISE') {
        // Mediação/reclamação ativa: produto pode ou não ter sido enviado.
        // Receita NÃO elegível; CMV incerto — rastreado separadamente.
        total_mediacao_em_analise++
        const cmvLinha = custoUnitLinha * uniLinha
        cmv_mediacao_incerto += cmvLinha
        pendencias_mediacao.push({
          numero_venda: numeroVenda, sku: skuLinha, status: statusRaw, cmv: cmvLinha,
        })
        cmvAudit.push({
          numero_venda: numeroVenda, sku: skuLinha, quantidade: uniLinha,
          custo_unitario: custoUnitLinha, cmv_total: 0,
          status_original: statusRaw, grupo_status: 'DEVOLUCAO_EM_ANALISE',
          incluido_cmv: false, motivo_exclusao: 'MEDIACAO_EM_ABERTO_CMV_INCERTO',
          cmv_ausente: cmvAusenteLinha,
        })
        continue
      }

      if (grupo === 'VENDA_EM_ANDAMENTO') {
        // Envio em curso, comprador ainda pode cancelar. Receita NÃO reconhecida.
        // CMV incerto — produto pode ter saído do estoque mas não houve confirmação.
        const cmvLinha = custoUnitLinha * uniLinha
        pendencias_operacionais.push({
          numero_venda: numeroVenda, sku: skuLinha, status: statusRaw,
          estado: estadoRaw, grupo: 'VENDA_EM_ANDAMENTO', cmv: cmvLinha,
        })
        cmvAudit.push({
          numero_venda: numeroVenda, sku: skuLinha, quantidade: uniLinha,
          custo_unitario: custoUnitLinha, cmv_total: 0,
          status_original: statusRaw, grupo_status: 'VENDA_EM_ANDAMENTO',
          incluido_cmv: false, motivo_exclusao: 'VENDA_EM_ANDAMENTO_CMV_PENDENTE',
          cmv_ausente: cmvAusenteLinha,
        })
        continue
      }

      if (grupo === 'NAO_ENTREGUE') {
        // Falha logística: produto não entregue ao comprador. Receita NÃO reconhecida.
        // CMV retido/pendente até confirmação de retorno físico ao vendedor.
        const cmvLinha = custoUnitLinha * uniLinha
        pendencias_operacionais.push({
          numero_venda: numeroVenda, sku: skuLinha, status: statusRaw,
          estado: estadoRaw, grupo: 'NAO_ENTREGUE', cmv: cmvLinha,
        })
        cmvAudit.push({
          numero_venda: numeroVenda, sku: skuLinha, quantidade: uniLinha,
          custo_unitario: custoUnitLinha, cmv_total: 0,
          status_original: statusRaw, grupo_status: 'NAO_ENTREGUE',
          incluido_cmv: false, motivo_exclusao: 'NAO_ENTREGUE_RETORNO_FISICO_PENDENTE',
          cmv_ausente: cmvAusenteLinha,
        })
        continue
      }

      if (grupo === 'DEVOLUCAO') {
        totais.devolucoes++
        // Produto já saiu do estoque (ML processou devolução/reembolso ao comprador).
        // CMV retido por padrão (B2: saída econômica confirmada); estornado APENAS
        // quando o texto confirma retorno físico ao vendedor.
        const decisao = classificarRetornoCMV(statusRaw, estadoRaw)
        const cmvLinha = custoUnitLinha * uniLinha
        if (decisao.cmv_retorno) {
          // Produto voltou ao vendedor → custo estornado (produto voltou ao estoque)
          cmv_devolucao_estornado += cmvLinha
        } else {
          // Produto não voltou ou incerto → custo retido no CMV (B2)
          cmv_devolucao_retido += cmvLinha
          devolucoes_retorno_incerto.push({
            numero_venda: numeroVenda, sku: skuLinha, status: statusRaw, cmv: cmvLinha,
          })
        }
        cmvAudit.push({
          numero_venda: numeroVenda, sku: skuLinha, quantidade: uniLinha,
          custo_unitario: custoUnitLinha,
          cmv_total: decisao.cmv_retorno ? 0 : cmvLinha,
          status_original: statusRaw, grupo_status: 'DEVOLUCAO',
          incluido_cmv: !decisao.cmv_retorno,
          motivo_exclusao: decisao.cmv_retorno
            ? 'DEVOLUCAO_RETORNO_CONFIRMADO_CMV_ESTORNADO'
            : null,
          cmv_ausente: cmvAusenteLinha,
        })
        continue
      }

      if (grupo === 'DESCONHECIDO') {
        // Fallback financeiro: Total > 0 → pagamento confirmado → incluir com alerta
        const totalFallback = Number(r[COL.TOTAL]) || 0
        if (totalFallback > 0) {
          totais.desconhecidos_incluidos++
          // Continua o processamento como venda (não dá continue)
        } else {
          totais.desconhecidos_excluidos++
          totais.cancelados++
          cmvAudit.push({
            numero_venda: numeroVenda, sku: skuLinha, quantidade: uniLinha,
            custo_unitario: custoUnitLinha, cmv_total: 0,
            status_original: statusRaw, grupo_status: 'DESCONHECIDO',
            incluido_cmv: false, motivo_exclusao: 'STATUS_DESCONHECIDO_SEM_PAGAMENTO',
            cmv_ausente: cmvAusenteLinha,
          })
          continue
        }
      }

      const sku = skuLinha
      const uni = uniLinha
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
      // Fallback para preço × unidades quando Total estiver vazio (alguns pedidos entregues sem Total preenchido)
      const totalRaw = r[COL.TOTAL]
      const c17 = (totalRaw !== '' && totalRaw != null) ? Number(totalRaw) : null
      const rec = c17 !== null ? c17 + tar + fre : (Number(r[COL.PRECO_UNIT]) || 0) * uni

      const titulo = limparTitulo(String(r[COL.TITULO] ?? ''))
      // Preço unitário do anúncio (col 27) — para breakdown por faixa de preço
      const precoUnit = Number(r[COL.PRECO_UNIT]) || (uni > 0 ? Number(r[COL.REC_PRODUTO]) / uni : 0)
      const precoRound = Math.round(precoUnit * 100) / 100

      if (!skus[sku]) skus[sku] = { sku, titulo, unidades: 0, receita: 0, tarifas: 0, frete: 0, custo_unit: custoPorSku[sku] ?? 0, pedidos: 0, precos: {}, cmv_ausente: !(sku in custoPorSku) || custoPorSku[sku] === 0 }
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

      // Acréscimo de parcelamento: receita pass-through (comprador paga, ML repassa ao vendedor)
      const acr = COL.ACRESCIMO_PARCELAMENTO >= 0 ? (Number(r[COL.ACRESCIMO_PARCELAMENTO]) || 0) : 0
      totais.acrescimo_parcelamento += acr
      // Taxa de parcelamento: custo cobrado do vendedor (novo formato — coluna presente no Rel.Vendas)
      const taxaParc = COL.TAXA_PARCELAMENTO >= 0 ? (Number(r[COL.TAXA_PARCELAMENTO]) || 0) : 0
      totais.taxa_parcelamento += Math.abs(taxaParc)

      totais.receita   += rec
      totais.tarifas   += tar
      totais.frete     += fre
      totais.unidades  += uni
      totais.pedidos++

      // ─── Auditoria de CMV desta venda (por pedido real, bug ML-3) ───────
      cmvAudit.push({
        numero_venda: numeroVenda, sku, quantidade: uni,
        custo_unitario: custoUnitLinha, cmv_total: custoUnitLinha * uni,
        status_original: statusRaw || '(vazio)',
        grupo_status: grupo === 'DESCONHECIDO' ? 'DESCONHECIDO' : 'VENDA',
        incluido_cmv: true,
        motivo_exclusao: null,
        cmv_ausente: cmvAusenteLinha,
      })

      // ─── Reconciliação do Total (BRL) ───────────────────────────────────
      // Total (BRL) é campo de conferência: não gera lançamento próprio.
      // Só conciliamos quando todas as colunas componentes existem no arquivo.
      if (c17 !== null && COL.REC_ENVIO >= 0 && COL.DESCONTOS >= 0 && COL.CANCELAMENTOS >= 0) {
        const rec0 = reconciliarTotal({
          receita_produto:   Number(r[COL.REC_PRODUTO]) || 0,
          acrescimo:         acr,
          taxa_parcelamento: taxaParc,
          tarifa_venda:      Number(r[COL.TARIFA_IMP]) || 0,
          receita_envio:     Number(r[COL.REC_ENVIO]) || 0,
          tarifa_envio:      Number(r[COL.TAR_ENVIO]) || 0,
          descontos:         Number(r[COL.DESCONTOS]) || 0,
          cancelamentos:     Number(r[COL.CANCELAMENTOS]) || 0,
        }, c17)
        if (!rec0.reconciliado) {
          residuo_total += rec0.residuo
          if (linhas_residuo.length < 50) {
            linhas_residuo.push({ numero_venda: numeroVenda, residuo: rec0.residuo })
          }
        }
      }

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

    // Assert: arquivo com dados mas zero linhas aceitas = erro de parsing, não mês vazio
    const totalLinhasAceitas = totais.pedidos + totais.cancelados + totais.devolucoes +
      total_mediacao_em_analise + pendencias_operacionais.length
    const linhasComNVenda = rows.slice(6).filter(r => (r as unknown[])[COL.N_VENDA]).length
    if (linhasComNVenda > 0 && totalLinhasAceitas === 0) {
      const presentes = (rows[5] as unknown[]).map(h => String(h ?? '').trim()).filter(Boolean).join(', ')
      return NextResponse.json({
        error: `O arquivo tem ${linhasComNVenda} linhas de dados mas nenhuma pôde ser lida.\n` +
          `Colunas presentes: ${presentes}`
      }, { status: 422 })
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
        sem_custo: s.cmv_ausente,
        multiplos_precos,
        tem_preco_prejuizo,
        precos_breakdown,
      }
    }).sort((a, b) => b.lucro_bruto - a.lucro_bruto)

    // custo_total: CMV das vendas confirmadas + CMV retido de devoluções sem retorno
    // físico (B2: produto saiu do estoque, custo não desaparece até retorno confirmado).
    // NÃO inclui cmv_mediacao_incerto (produto pode não ter saído).
    const cmv_vendas = skusArray.reduce((s, x) => s + x.custo_total, 0)
    const custo_total = cmv_vendas + cmv_devolucao_retido
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

    // ─── Parcelamento: acréscimo e taxa são auditados sempre ────────────
    // Quando o par se anula (líquido = 0), NADA entra na DRE — lançar os dois
    // lados infla receita e despesa sem mudar o resultado. Quando sobra
    // resíduo, o valor é exposto como alerta para conferência manual.
    const parcelamento = calcularParcelamento({
      acrescimo: totais.acrescimo_parcelamento,
      taxa: totais.taxa_parcelamento,
    })

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
      acrescimo_parcelamento: totais.acrescimo_parcelamento,
      taxa_parcelamento: totais.taxa_parcelamento,
      // Parcelamento — o que a DRE deve consumir
      parcelamento: {
        acrescimo: parcelamento.acrescimo,
        taxa: parcelamento.taxa,
        parcelamento_liquido: parcelamento.parcelamento_liquido,
        neutro: parcelamento.neutro,
        // Valores a lançar na DRE: zerados quando o par se anula
        acrescimo_dre: parcelamento.neutro ? 0 : parcelamento.acrescimo,
        taxa_dre:      parcelamento.neutro ? 0 : parcelamento.taxa,
      },
      // Reconciliação do Total (BRL) — campo de conferência, não vira lançamento
      reconciliacao_total: {
        residuo: Math.round(residuo_total * 100) / 100,
        reconciliado: Math.abs(residuo_total) <= 0.005,
        linhas_com_residuo: linhas_residuo.length,
        exemplos: linhas_residuo.slice(0, 10),
      },
      // CMV de devoluções (B2): retido = somado a custo_produtos; estornado = excluído
      cmv_devolucao: {
        estornado: cmv_devolucao_estornado,
        retido: cmv_devolucao_retido,
        retorno_incerto_count: devolucoes_retorno_incerto.length,
      },
      // CMV de mediações em aberto — incerto, rastreado separadamente
      cmv_mediacao_em_analise: {
        total: cmv_mediacao_incerto,
        pedidos_count: total_mediacao_em_analise,
      },
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
      // cmv_incompleto: true se qualquer SKU com vendas não tem custo cadastrado
      cmv_incompleto: skusArray.some(s => s.sem_custo && s.unidades > 0),
      alertas: {
        // SKUs sem custo: a análise de CMV é INCOMPLETA enquanto existirem entradas aqui
        sem_custo: skusArray.filter(s => s.sem_custo).map(s => ({
          sku: s.sku, pedidos: s.pedidos, unidades: s.unidades, receita: s.receita
        })),
        margem_negativa: skusArray.filter(s => s.margem_perc < 0).map(s => ({ sku: s.sku, margem: s.margem_perc.toFixed(1) })),
        margem_critica: skusArray.filter(s => s.margem_perc >= 0 && s.margem_perc < 10).map(s => ({ sku: s.sku, margem: s.margem_perc.toFixed(1) })),
        // Status desconhecidos incluídos via fallback financeiro (Total > 0)
        status_desconhecido_incluido: totais.desconhecidos_incluidos,
        status_desconhecido_excluido: totais.desconhecidos_excluidos,
        // Par de parcelamento descasado: exige conferência antes de lançar
        parcelamento_descasado: parcelamento.alerta
          ? { liquido: parcelamento.parcelamento_liquido, acrescimo: parcelamento.acrescimo, taxa: parcelamento.taxa }
          : null,
        // Total (BRL) não bateu com a soma dos componentes em alguma linha
        total_nao_reconciliado: Math.abs(residuo_total) > 0.005
          ? { residuo: residuo_total, linhas: linhas_residuo.length }
          : null,
        // Devoluções sem confirmação de retorno físico — CMV retido (B2)
        devolucao_retorno_incerto: devolucoes_retorno_incerto.slice(0, 50),
        // Mediações em aberto — receita e CMV incertos, aguardam resolução
        mediacao_em_analise: pendencias_mediacao.slice(0, 50),
        // Operações pendentes: envio em andamento ou falha de entrega
        // Receita e CMV não reconhecidos — revisar quando status for resolvido
        operacionais_pendentes: pendencias_operacionais.slice(0, 50),
      }
    }

    if (modoPreview) return NextResponse.json({ preview: true, ...resumo })

    const competenciaStr = `${periodo.ano}-${String(periodo.mes).padStart(2, '0')}`

    // Substituição atômica: delete (se existir) + create dentro da mesma transação.
    // Se qualquer etapa falhar, o Prisma faz rollback integral — a análise anterior
    // permanece intacta e nenhuma competência fica parcialmente importada.
    const analise = await prisma.$transaction(async (tx) => {
      // 1. Remove análise anterior do período (FK CASCADE limpa skus e cmv_auditoria)
      await tx.ml_analise_relatorio.deleteMany({
        where: { workspace_id: workspaceId, ano: periodo.ano, mes: periodo.mes },
      })

      // 2. Cria nova análise com SKUs aninhados
      const novaAnalise = await tx.ml_analise_relatorio.create({
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
          acrescimo_parcelamento: totais.acrescimo_parcelamento,
          taxa_parcelamento: totais.taxa_parcelamento,
          tarifas_ml: totais.tarifas,
          frete_custo: totais.frete,
          custo_produtos: custo_total,
          lucro_bruto,
          margem_perc: resumo.margem_perc,
          ticket_medio: resumo.ticket_medio,
          cmv_incompleto: resumo.cmv_incompleto,
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

      // 3. Cria trilha de auditoria de CMV — UMA LINHA POR PEDIDO (bug ML-3).
      // numero_venda e status_original vêm do arquivo; não há mais 'AGREGADO'.
      const cmvAuditRows = cmvAudit.map((row, i) => ({
        id: `${novaAnalise.id}-${i}`,
        workspace_id: workspaceId,
        relatorio_id: novaAnalise.id,
        competencia: competenciaStr,
        numero_venda: row.numero_venda || 'SEM-NUMERO',
        sku: row.sku,
        quantidade: row.quantidade,
        custo_unitario: row.custo_unitario,
        cmv_total: row.cmv_total,
        status_original: row.status_original,
        grupo_status: row.grupo_status,
        incluido_cmv: row.incluido_cmv,
        motivo_exclusao: row.motivo_exclusao,
        cmv_ausente: row.cmv_ausente,
      }))
      if (cmvAuditRows.length > 0) {
        await tx.ml_cmv_auditoria.createMany({ data: cmvAuditRows })
      }

      return novaAnalise
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
