/**
 * API: Parser do Relatório de Pagamentos de Faturas ML
 *
 * IMPORTANTE: Este arquivo NÃO contém os pagamentos cobrados automaticamente
 * nas transações (ex: R$23.649 descontado das vendas). O ML avisa isso na
 * própria planilha. Este relatório só mostra:
 * - Estornos recebidos pelo vendedor
 * - Pagamentos manuais feitos fora das transações
 *
 * Para saber o saldo devedor total, use o Relatório de Faturamento.
 *
 * Estrutura:
 * - Aba: "Pagamentos e estornos"
 * - Header: linha 10 (índice 9)
 * - Dados: linha 11 em diante (índice 10+)
 * - Col 0: Número do pagamento (vazio para estornos)
 * - Col 1: Número do estorno  (vazio para pagamentos)
 * - Col 2: Tipo (Pagamento | Estorno)
 * - Col 3: Meio de pagamento
 * - Col 5: Status
 * - Col 7: Valor total
 * - Col 8: Valor aplicado a este mês
 */
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { getAuthContext } from '@/lib/auth'

export interface PagamentoItem {
  tipo: string
  status: string
  valor_total: number
  valor_mes: number
}

export async function POST(req: NextRequest) {
  try {
    await getAuthContext()
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })

    const ws = wb.Sheets['Pagamentos e estornos'] ?? wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

    const itens: PagamentoItem[] = []
    let totalEstornos  = 0
    let totalPagamentos = 0

    // Header na linha 10 (índice 9), dados a partir de índice 10
    for (let i = 10; i < rows.length; i++) {
      const r = rows[i] as unknown[]
      if (!r || r.length === 0) continue

      // Verifica se a linha tem algum dado útil (col 7 = Valor total)
      const valor_total = Number(r[7]) || 0
      const valor_mes   = Number(r[8]) || 0
      if (valor_total === 0 && valor_mes === 0) continue

      const tipo   = String(r[2] ?? '').trim()
      const status = String(r[5] ?? '').trim()

      itens.push({ tipo, status, valor_total, valor_mes })

      if (tipo.toLowerCase() === 'estorno' || String(r[1] ?? '').trim() !== '') {
        // É um estorno (dinheiro que volta para o vendedor)
        totalEstornos += Math.abs(valor_total)
      } else {
        // É um pagamento feito pelo vendedor
        totalPagamentos += Math.abs(valor_total)
      }
    }

    return NextResponse.json({
      success:           true,
      arquivo:           file.name,
      total_estornos:    totalEstornos,    // dinheiro que o ML devolveu
      total_pagamentos:  totalPagamentos,  // pagamentos manuais feitos
      total_itens:       itens.length,
      itens,
      aviso: 'Pagamentos cobrados automaticamente nas transações não aparecem aqui (conforme informado pelo ML).',
    })
  } catch (err) {
    console.error('[pagamentos-ml]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
