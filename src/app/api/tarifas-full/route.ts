/**
 * API: Parser do Relatório de Tarifas Full (Mercado Livre)
 * 2 abas:
 * - "Tarifa de armazenamento": custo de estoque no galpão ML
 * - "Custo por serviço de coleta": frete de coleta dos produtos pelo ML
 *
 * Col 5 (índice 5) = Valor da tarifa em ambas as abas
 * Col 1 = Data da tarifa
 */
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { getAuthContext } from '@/lib/auth'

export interface TarifasFullResult {
  armazenagem: number
  coleta: number
  total: number
  periodo: { mes: number; ano: number }
  arquivo: string
}

// Extrai total e lista de datas de uma aba — sem validação de período (feita no nível do arquivo)
function extrairTotal(ws: XLSX.WorkSheet, colunaValor = 5): { total: number; datas: Date[] } {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
  let total = 0
  const datas: Date[] = []

  for (let i = 6; i < rows.length; i++) {
    const r = rows[i] as unknown[]
    if (!r?.[0] || r[0] === '') continue

    const dataCell = r[1]
    const isDate = dataCell instanceof Date || typeof dataCell === 'number'
    if (!isDate) continue

    total += Number(r[colunaValor]) || 0

    const d: Date = dataCell instanceof Date
      ? dataCell
      : new Date((dataCell as number - 25569) * 86400 * 1000)
    datas.push(d)
  }

  return { total, datas }
}

// Valida o período do arquivo contra a competência selecionada.
// Agrega datas de TODAS as abas — uma aba pequena não decide o período do arquivo.
// Regra: dominante == competência → aceita; dominante != competência → rejeita com mensagem
//        se dominante < 60% → rejeita com distribuição (impossível identificar)
function validarPeriodo(
  datasAgregadas: Date[],
  mesExplicito: number | null,
  anoExplicito: number | null,
  mesesNomes: string[],
): { valid: true; dataRef: Date } | { valid: false; error: string } {
  if (datasAgregadas.length === 0) return { valid: true, dataRef: new Date() }

  const contagem: Record<string, { count: number; dataEx: Date }> = {}
  for (const d of datasAgregadas) {
    const k = `${d.getFullYear()}-${d.getMonth() + 1}`
    if (!contagem[k]) contagem[k] = { count: 0, dataEx: d }
    contagem[k].count++
  }

  const total = datasAgregadas.length
  const sorted = Object.entries(contagem).sort((a, b) => b[1].count - a[1].count)
  const [[topKey, topData]] = sorted
  const [topAno, topMes] = topKey.split('-').map(Number)
  const dominantePerc = topData.count / total

  // Arquivo correto: dominante coincide com a competência → aceita sempre
  if (mesExplicito && anoExplicito && topMes === mesExplicito && topAno === anoExplicito) {
    return { valid: true, dataRef: topData.dataEx }
  }

  // Dominante não coincide com competência
  if (mesExplicito && anoExplicito && (topMes !== mesExplicito || topAno !== anoExplicito)) {
    if (dominantePerc >= 0.6) {
      return {
        valid: false,
        error: `Este relatório é de ${mesesNomes[topMes-1]}/${topAno}, mas a competência selecionada é ${mesesNomes[mesExplicito-1]}/${anoExplicito}. Baixe o relatório da fatura correta.`,
      }
    }
    const dist = sorted.map(([k, v]) => `${k} (${Math.round(v.count / total * 100)}%)`).join(', ')
    return {
      valid: false,
      error: `Não foi possível identificar o período deste relatório. Linhas encontradas: ${dist}. Baixe o relatório de um único mês de competência.`,
    }
  }

  // Sem competência explícita: exige dominante ≥ 60% para aceitar
  if (dominantePerc < 0.6) {
    const dist = sorted.map(([k, v]) => `${k} (${Math.round(v.count / total * 100)}%)`).join(', ')
    return {
      valid: false,
      error: `Não foi possível identificar o período deste relatório. Linhas encontradas: ${dist}. Baixe o relatório de um único mês de competência.`,
    }
  }

  return { valid: true, dataRef: topData.dataEx }
}

const MESES_NOMES_PT_FULL = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']

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

    // Extrai totais e datas de cada aba (sem validação por aba)
    const wsArm = wb.Sheets['Tarifa de armazenamento']
    const { total: armazenagem, datas: datasArm } = wsArm
      ? extrairTotal(wsArm)
      : { total: 0, datas: [] }

    const wsCol = wb.Sheets['Custo por serviço de coleta']
    const { total: coleta, datas: datasCol } = wsCol
      ? extrairTotal(wsCol)
      : { total: 0, datas: [] }

    // Valida período agregando datas de TODAS as abas — uma aba pequena não decide o período
    const datasAgregadas = [...datasArm, ...datasCol]
    const validacao = validarPeriodo(datasAgregadas, mesExplicito, anoExplicito, MESES_NOMES_PT_FULL)
    if (!validacao.valid) {
      return NextResponse.json({ error: validacao.error }, { status: 422 })
    }

    const dataRef = datasAgregadas.length > 0 ? validacao.dataRef : new Date()
    const periodo = { mes: dataRef.getMonth() + 1, ano: dataRef.getFullYear() }

    const result: TarifasFullResult = {
      armazenagem,
      coleta,
      total: armazenagem + coleta,
      periodo,
      arquivo: file.name,
    }

    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    console.error('[tarifas-full]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
