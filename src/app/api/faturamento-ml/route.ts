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
}

/**
 * Classifica cada linha do faturamento.
 * Cancelamentos são roteados à mesma categoria que cancelam (valor negativo no arquivo).
 * Assim, somar por categoria dá o net automaticamente.
 */
function classificarTarifa(detalhe: string): string {
  const d = detalhe.toLowerCase().trim()

  // Cancelamentos: identificar primeiro e rotear para a categoria correta
  if (d.startsWith('cancelamento')) {
    if (d.includes('envio') || d.includes('devolução') || d.includes('devolucao')) return 'FRETE'
    if (d.includes('vender') || d.includes('cobrar') || d.includes('recebimento')) return 'TARIFA_VENDA'
    if (d.includes('parcelamento')) return 'PARCELAMENTO'
    return 'OUTROS'
  }

  if (d.includes('publicidade') || d.includes('campanha') || d.includes('product ads')) return 'PUBLICIDADE'
  if (d.includes('armazenamento') || d.includes('armazenagem')) return 'ARMAZENAGEM'
  if (d.includes('coleta')) return 'COLETA_FULL'
  if (d.includes('minha página') || d.includes('minha pagina')) return 'PAGINA_ML'
  if (d.includes('afiliado')) return 'AFILIADOS'
  if (d.includes('parcelamento')) return 'PARCELAMENTO'
  if (d.includes('vender') || d.includes('cobrar') || d.includes('recebimento')) return 'TARIFA_VENDA'
  // Frete: envio + devolução por envio (coleta fica em COLETA_FULL acima)
  if (d.includes('envio') || d.includes('devolução') || d.includes('devolucao')) return 'FRETE'

  return 'OUTROS'
}

export async function POST(req: NextRequest) {
  try {
    await getAuthContext()
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })

    const ws = wb.Sheets['REPORT'] ?? wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

    // Detecta o período a partir das datas das tarifas
    const datas: Date[] = []
    const agrupado: Record<string, { valor: number; ocorrencias: number }> = {}

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
    }

    // Determina período pela data mais frequente
    const dataRef = datas.length > 0
      ? datas[Math.floor(datas.length / 2)]
      : new Date()
    const periodo = { mes: dataRef.getMonth() + 1, ano: dataRef.getFullYear() }

    // Cada categoria já está líquida de cancels (cancelamentos foram roteados para sua categoria)
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
    }

    return NextResponse.json({ success: true, ...result, arquivo: file.name })
  } catch (err) {
    console.error('[faturamento-ml]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
