/**
 * Gera e retorna o template Excel para Vendas Avulsas
 */
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function GET() {
  const wb = XLSX.utils.book_new()

  // ── Aba principal: Vendas ──────────────────────────────────────────────────
  const header = [
    'Data', 'Canal', 'SKU', 'Produto', 'Quantidade',
    'Preço Unitário', 'Desconto', 'Taxa Plataforma (%)', 'Observação',
  ]

  const exemplos = [
    ['01/06/2026', 'Casas Bahia', 'INV02',  'Descascador de Pinhão', 2, 89.90, 0,    15, 'Loja física'],
    ['15/06/2026', 'OLX',        'INV073', 'Pazinha 2.0mm',          1, 39.90, 5.00,  0, 'WhatsApp'],
    ['20/06/2026', 'Venda Direta','INV072','Pazinha 2.8mm',           3, 39.90, 0,     0, 'Feira'],
  ]

  const ws = XLSX.utils.aoa_to_sheet([header, ...exemplos])

  // Larguras
  ws['!cols'] = [
    { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 30 },
    { wch: 10 }, { wch: 15 }, { wch: 10 }, { wch: 18 }, { wch: 20 },
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Vendas')

  // ── Aba de instruções ──────────────────────────────────────────────────────
  const instrucoes = [
    ['INSTRUÇÕES — Vendas Avulsas ImportOS'],
    [''],
    ['Como preencher:'],
    ['• Data         → formato DD/MM/AAAA'],
    ['• Canal        → nome livre (ex: Casas Bahia, OLX, Venda Direta, WhatsApp)'],
    ['• SKU          → código exato do seu catálogo (ex: INV02, INV073)'],
    ['• Produto      → nome do produto (informativo)'],
    ['• Quantidade   → número inteiro'],
    ['• Preço Unit.  → preço unitário de venda (número, sem R$)'],
    ['• Desconto     → valor absoluto descontado (0 se não houve)'],
    ['• Taxa Plat %  → percentual de comissão da plataforma (0 se venda direta)'],
    ['• Observação   → campo livre'],
    [''],
    ['Cálculos automáticos:'],
    ['• Receita = (Preço Unitário × Quantidade) − Desconto'],
    ['• Taxa   = Receita × (Taxa Plataforma % / 100)'],
    ['• CMV    = buscado automaticamente do catálogo pelo SKU'],
    [''],
    ['Dica: não altere o cabeçalho da aba "Vendas". Pode adicionar linhas à vontade.'],
  ]

  const wsInstr = XLSX.utils.aoa_to_sheet(instrucoes)
  wsInstr['!cols'] = [{ wch: 70 }]
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instruções')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="template_vendas_avulsas.xlsx"',
    },
  })
}
