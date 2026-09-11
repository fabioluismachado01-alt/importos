/**
 * API: Parser do Relatório de Faturamento do Mercado Livre
 * Extrai: Tarifas de venda, frete, parcelamento, publicidade, armazenagem, página, afiliados.
 *
 * Estrutura do arquivo:
 * - Aba: REPORT
 * - Header linha 8 (índice 7)
 * - Col 1: Data da tarifa
 * - Col 3: Detalhe (tipo da tarifa)
 * - Col 7: Valor da tarifa (positivo = custo, negativo = cancelamento)
 * - Col 11: Número da venda
 * - Col 13: Data de venda
 *
 * Cancelamentos são roteados para a mesma categoria que cancelam, como valores negativos.
 * O net por categoria é o custo real líquido.
 */
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { getAuthContext } from '@/lib/auth'

export interface FaturamentoMLResult {
  // Tarifas de venda líquidas da fatura (custo por vender + cobrar + recebimento, net de cancels)
  tarifas_venda_fatura: number
  // Frete líquido da fatura (envio + devolução frete, net de cancels — sem coleta Full)
  frete_fatura: number
  // Taxa de parcelamento líquida (net de cancels)
  taxa_parcelamento: number
  // Coleta Full da fatura (fallback quando Relatório de Tarifas Full não for enviado)
  coleta_full_fatura: number
  // Outros campos (fonte inalterada)
  publicidade: number
  armazenagem: number
  pagina_ml: number
  afiliados: number
  outros: number
  total_bruto: number
  detalhes: Array<{ categoria: string; valor: number; ocorrencias: number }>
  periodo: { mes: number; ano: number }
  // Categorias do arquivo que não foram classificadas (valor > 0 = dinheiro não contabilizado)
  nao_classificadas: Array<{ detalhe: string; valor: number }>
}

/**
 * Classifica cada linha do faturamento.
 * Cancelamentos são roteados à mesma categoria que cancelam (valor negativo no arquivo).
 * Assim, somar por categoria dá o net automaticamente.
 */
function classificarTarifa(detalhe: string): string {
  // Normalizar NFD para remover acentos — evita mismatch entre encodings do arquivo e dos literais
  const d = detalhe.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

  // Cancelamentos: identificar primeiro e rotear para a categoria correta
  if (d.startsWith('cancelamento')) {
    if (d.includes('envio') || d.includes('devolucao')) return 'FRETE'
    if (d.includes('vender') || d.includes('cobrar') || d.includes('recebimento') || d.includes('venda') || d.includes('gestao')) return 'TARIFA_VENDA'
    if (d.includes('parcelamento')) return 'PARCELAMENTO'
    if (d.includes('armazenamento') || d.includes('armazenagem') || d.includes('estoque') || d.includes('manutencao')) return 'ARMAZENAGEM'
    if (d.includes('pagina') || d.includes('page')) return 'PAGINA_ML'
    return 'OUTROS'
  }

  if (d.includes('publicidade') || d.includes('campanha') || d.includes('product ads')) return 'PUBLICIDADE'
  if (d.includes('armazenamento') || d.includes('armazenagem') || d.includes('estoque antigo')) return 'ARMAZENAGEM'
  if (d.includes('coleta')) return 'COLETA_FULL'
  // "Minha página" + "Tarifa de manutenção da Minha página"
  if (d.includes('minha pagina') || d.includes('manutencao da minha') || d.includes('manutencao da pagina')) return 'PAGINA_ML'
  if (d.includes('afiliado')) return 'AFILIADOS'
  if (d.includes('parcelamento')) return 'PARCELAMENTO'
  if (d.includes('vender') || d.includes('cobrar') || d.includes('recebimento')) return 'TARIFA_VENDA'
  // "Tarifa de venda" e "Custo de gestão da venda" → comissão
  if (d.includes('tarifa de venda') || d.includes('custo de gestao')) return 'TARIFA_VENDA'
  // Frete: envio + devolução por envio (coleta fica em COLETA_FULL acima)
  if (d.includes('envio') || d.includes('devolucao')) return 'FRETE'

  return 'OUTROS'
}

const MESES_NOMES_PT = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']

export async function POST(req: NextRequest) {
  try {
    await getAuthContext()
    const formData = await req.formData()
    const file = formData.get('file') as File
    const mesExplicito = formData.get('mes') ? parseInt(String(formData.get('mes'))) : null
    const anoExplicito = formData.get('ano') ? parseInt(String(formData.get('ano'))) : null
    if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })

    const ws = wb.Sheets['REPORT'] ?? wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

    // Detecta o período a partir das datas das tarifas
    const datas: Date[] = []
    const agrupado: Record<string, { valor: number; ocorrencias: number }> = {}
    // Rastreia detalhes brutos que caíram em OUTROS para o assert de fechamento
    const naoClassificadosMap: Record<string, number> = {}

    // Header na linha 8 (índice 7), dados a partir da linha 9 (índice 8)
    for (let i = 8; i < rows.length; i++) {
      const r = rows[i] as unknown[]
      if (!r?.[0] || r[0] === '') continue

      const detalhe = String(r[3] ?? '').trim()
      const valor = Number(r[7]) || 0
      if (!detalhe || valor === 0) continue

      // Tenta extrair data
      const dataRaw = r[1]
      if (dataRaw instanceof Date) datas.push(dataRaw)
      else if (typeof dataRaw === 'number') {
        // Excel date serial
        datas.push(new Date((dataRaw - 25569) * 86400 * 1000))
      }

      const cat = classificarTarifa(detalhe)
      if (!agrupado[cat]) agrupado[cat] = { valor: 0, ocorrencias: 0 }
      agrupado[cat].valor += valor
      agrupado[cat].ocorrencias++

      if (cat === 'OUTROS') {
        naoClassificadosMap[detalhe] = (naoClassificadosMap[detalhe] ?? 0) + valor
      }
    }

    // Valida que o arquivo pertence à competência selecionada (Bug A corr.2)
    if (mesExplicito && anoExplicito && datas.length > 0) {
      const matching = datas.filter(d => d.getMonth() + 1 === mesExplicito && d.getFullYear() === anoExplicito).length
      if (matching / datas.length < 0.5) {
        const contagem: Record<string, number> = {}
        datas.forEach(d => { const k = `${d.getFullYear()}-${d.getMonth()+1}`; contagem[k] = (contagem[k] || 0) + 1 })
        const [topKey] = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0]
        const [topAno, topMes] = topKey.split('-').map(Number)
        return NextResponse.json({
          error: `Este relatório é de ${MESES_NOMES_PT[topMes-1]}/${topAno}, mas a competência selecionada é ${MESES_NOMES_PT[mesExplicito-1]}/${anoExplicito}. Baixe o relatório da fatura correta.`
        }, { status: 422 })
      }
    }

    // Determina período pela data mais frequente
    const dataRef = datas.length > 0
      ? datas[Math.floor(datas.length / 2)]
      : new Date()
    const periodo = { mes: dataRef.getMonth() + 1, ano: dataRef.getFullYear() }

    // Cada categoria já está líquida de cancels (cancelamentos foram roteados para sua categoria)
    const naoClassificadas = Object.entries(naoClassificadosMap)
      .map(([detalhe, valor]) => ({ detalhe, valor }))
      .filter(x => Math.abs(x.valor) > 0.005)
      .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor))

    const result: FaturamentoMLResult = {
      tarifas_venda_fatura: agrupado['TARIFA_VENDA']?.valor ?? 0,
      frete_fatura:         agrupado['FRETE']?.valor ?? 0,
      taxa_parcelamento:    agrupado['PARCELAMENTO']?.valor ?? 0,
      coleta_full_fatura:   agrupado['COLETA_FULL']?.valor ?? 0,
      publicidade:          agrupado['PUBLICIDADE']?.valor ?? 0,
      armazenagem:          agrupado['ARMAZENAGEM']?.valor ?? 0,
      pagina_ml:            agrupado['PAGINA_ML']?.valor ?? 0,
      afiliados:            agrupado['AFILIADOS']?.valor ?? 0,
      outros:               agrupado['OUTROS']?.valor ?? 0,
      total_bruto:          Object.values(agrupado).reduce((s, x) => s + x.valor, 0),
      detalhes: Object.entries(agrupado).map(([categoria, d]) => ({
        categoria, valor: d.valor, ocorrencias: d.ocorrencias,
      })).sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor)),
      periodo,
      nao_classificadas: naoClassificadas,
    }

    return NextResponse.json({ success: true, ...result, arquivo: file.name })
  } catch (err) {
    console.error('[faturamento-ml]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
