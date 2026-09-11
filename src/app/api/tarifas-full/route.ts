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

function extrairTotal(ws: XLSX.WorkSheet, colunaValor = 5): { total: number; dataRef: Date | null } {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
  let total = 0
  const contagem: Record<string, { count: number; dataEx: Date }> = {}

  // Header geralmente na linha 6 (índice 5), dados a partir do índice 6
  for (let i = 6; i < rows.length; i++) {
    const r = rows[i] as unknown[]
    if (!r?.[0] || r[0] === '') continue

    // Valida que col 1 é uma data — linhas de total/imposto não têm data e devem ser ignoradas
    const dataCell = r[1]
    const isDate = dataCell instanceof Date || typeof dataCell === 'number'
    if (!isDate) continue

    const valor = Number(r[colunaValor]) || 0
    total += valor

    const d: Date = dataCell instanceof Date
      ? dataCell
      : new Date((dataCell as number - 25569) * 86400 * 1000)
    const chave = `${d.getFullYear()}-${d.getMonth() + 1}`
    if (!contagem[chave]) contagem[chave] = { count: 0, dataEx: d }
    contagem[chave].count++
  }

  // Exige que o mês dominante represente ≥ 60% das linhas — evita aceitar arquivo espalhado
  const totalLinhas = Object.values(contagem).reduce((s, c) => s + c.count, 0)
  const dominante = Object.values(contagem).sort((a, b) => b.count - a.count)[0]
  if (!dominante || (totalLinhas > 0 && dominante.count / totalLinhas < 0.6)) {
    // Monta descrição da distribuição para o erro
    const dist = Object.entries(contagem)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([k, v]) => `${k} (${Math.round(v.count / totalLinhas * 100)}%)`)
      .join(', ')
    throw new Error(`Não foi possível identificar o período deste relatório. Linhas encontradas: ${dist}. Baixe o relatório de um único mês de competência.`)
  }
  const dataRef = dominante.dataEx
  return { total, dataRef }
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

    // Aba 1: Armazenagem
    const wsArm = wb.Sheets['Tarifa de armazenamento']
    const { total: armazenagem, dataRef: dataArm } = wsArm
      ? extrairTotal(wsArm)
      : { total: 0, dataRef: null }

    // Aba 2: Coleta
    const wsCol = wb.Sheets['Custo por serviço de coleta']
    const { total: coleta } = wsCol ? extrairTotal(wsCol) : { total: 0 }

    const dataRef = dataArm ?? new Date()
    const periodo = { mes: dataRef.getMonth() + 1, ano: dataRef.getFullYear() }

    // Valida que o arquivo pertence à competência selecionada (Bug A corr.2)
    if (mesExplicito && anoExplicito && dataArm) {
      const mesArquivo = dataArm.getMonth() + 1
      const anoArquivo = dataArm.getFullYear()
      if (mesArquivo !== mesExplicito || anoArquivo !== anoExplicito) {
        return NextResponse.json({
          error: `Este relatório é de ${MESES_NOMES_PT_FULL[mesArquivo-1]}/${anoArquivo}, mas a competência selecionada é ${MESES_NOMES_PT_FULL[mesExplicito-1]}/${anoExplicito}. Baixe o relatório da fatura correta.`
        }, { status: 422 })
      }
    }

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
