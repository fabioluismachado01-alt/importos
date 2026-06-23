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
  let dataRef: Date | null = null

  // Header geralmente na linha 6 (índice 5), dados a partir do índice 6
  for (let i = 6; i < rows.length; i++) {
    const r = rows[i] as unknown[]
    if (!r?.[0] || r[0] === '') continue
    const valor = Number(r[colunaValor]) || 0
    total += valor

    if (!dataRef) {
      const d = r[1]
      if (d instanceof Date) dataRef = d
      else if (typeof d === 'number') dataRef = new Date((d - 25569) * 86400 * 1000)
    }
  }
  return { total, dataRef }
}

export async function POST(req: NextRequest) {
  try {
    await getAuthContext()
    const formData = await req.formData()
    const file = formData.get('file') as File
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
