/**
 * API: Parser do Relatório de Faturamento do Mercado Livre
 * Extrai: Publicidade, Estornos, Página ML, Afiliados, Armazenagem
 *
 * Estrutura do arquivo:
 * - Aba: REPORT
 * - Header linha 8 (índice 7)
 * - Col 3: Detalhe (tipo da tarifa)
 * - Col 7: Valor da tarifa (positivo = custo, negativo = cancelamento/estorno)
 */
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { getAuthContext } from '@/lib/auth'

export interface FaturamentoMLResult {
  publicidade: number        // Tarifa por campanha de publicidade / Product Ads
  armazenagem: number        // Tarifa pelo serviço de armazenamento Full
  pagina_ml: number          // Tarifa de manutenção da Minha página
  afiliados: number          // Tarifa de venda com afiliados
  estornos: number           // Cancelamentos de tarifas (negativo = recebeu de volta)
  outros: number             // Outras tarifas não categorizadas relevantes
  total_bruto: number        // Soma de tudo
  detalhes: Array<{ categoria: string; valor: number; ocorrencias: number }>
  periodo: { mes: number; ano: number }
}

function classificarTarifa(detalhe: string): string {
  const d = detalhe.toLowerCase()
  if (d.includes('publicidade') || d.includes('campanha') || d.includes('product ads')) return 'PUBLICIDADE'
  if (d.includes('armazenamento') || d.includes('armazenagem')) return 'ARMAZENAGEM'
  if (d.includes('minha página') || d.includes('minha pagina')) return 'PAGINA_ML'
  if (d.includes('afiliado')) return 'AFILIADOS'
  if (d.includes('cancelamento') || d.includes('cancelada') || d.includes('estorno')) return 'ESTORNO'
  if (d.includes('devolução') || d.includes('devolucao')) return 'DEVOLUCAO_FRETE'
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

    const result: FaturamentoMLResult = {
      publicidade:   agrupado['PUBLICIDADE']?.valor ?? 0,
      armazenagem:   agrupado['ARMAZENAGEM']?.valor ?? 0,
      pagina_ml:     agrupado['PAGINA_ML']?.valor ?? 0,
      afiliados:     agrupado['AFILIADOS']?.valor ?? 0,
      estornos:      agrupado['ESTORNO']?.valor ?? 0,   // já é negativo no arquivo
      outros:        (agrupado['OUTROS']?.valor ?? 0) + (agrupado['DEVOLUCAO_FRETE']?.valor ?? 0),
      total_bruto:   Object.values(agrupado).reduce((s, x) => s + x.valor, 0),
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
