/**
 * Parser do Relatório de Vendas Amazon
 *
 * Formato:
 * - Linha 0: header das colunas (sem linhas de metadata)
 * - Linha 1+: dados
 * - Valores em BRL com ponto decimal ("89.9")
 *
 * Colunas:
 * 0: Data           1: Status          2: Grupo de Pagamento
 * 3: Tipo transação  4: ID pedido       5: Detalhes do produto
 * 6: Custo total produto (Receita Bruta)
 * 7: Total descontos promocionais (negativo = cupom)
 * 8: Tarifas da Amazon (negativo = comissão)
 * 9: Outros         10: (total) (BRL)
 *
 * Fonte oficial: Receita Bruta, Comissão Amazon, Pedidos, Unidades, SKU por produto
 */
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'

const COL = {
  DATA: 0, STATUS: 1, GRUPO_PAG: 2, TIPO: 3, PEDIDO: 4,
  PRODUTO: 5, RECEITA: 6, DESCONTO: 7, COMISSAO: 8, OUTROS: 9, TOTAL: 10,
}

function parseBRL(v: unknown): number {
  // Valores no formato inglês: "89.9", "-22.59"
  const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''))
  return isNaN(n) ? 0 : n
}

function normalizarNomeProduto(nome: string): string {
  return String(nome ?? '').trim().slice(0, 80)
}

function parseDateBR(str: string): Date | null {
  // "31/05/2026"
  const m = str.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) return null
  return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]))
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await getAuthContext()
    const formData = await req.formData()
    const file = formData.get('file') as File
    const mesExplicito = formData.get('mes') ? parseInt(String(formData.get('mes'))) : null
    const anoExplicito = formData.get('ano') ? parseInt(String(formData.get('ano'))) : null

    if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buffer, { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

    if (rows.length < 2) return NextResponse.json({ error: 'Arquivo vazio ou formato incorreto' }, { status: 400 })

    // Valida cabeçalho — deve conter "Tipo de transação"
    const header = rows[0].map(c => String(c).toLowerCase())
    if (!header.some(h => h.includes('tipo de transa'))) {
      return NextResponse.json({
        error: 'Este arquivo não parece ser o Relatório de Vendas Amazon. Verifique se enviou o arquivo correto.'
      }, { status: 400 })
    }

    // Busca custos do catálogo por nome do produto
    const produtos = await prisma.produto_catalogo.findMany({
      where: { workspace_id: workspaceId },
      select: { nome: true, custo_brl: true, sku_interno: true },
    })

    // Index por nome normalizado e SKU
    const custoPorNome: Record<string, number> = {}
    const nomePorSku: Record<string, string> = {}
    produtos.forEach(p => {
      if (p.custo_brl) {
        custoPorNome[p.nome.toLowerCase()] = p.custo_brl
        if (p.sku_interno) {
          nomePorSku[p.sku_interno.toUpperCase()] = p.nome
          custoPorNome[p.sku_interno.toUpperCase()] = p.custo_brl
        }
      }
    })

    // Acumuladores
    let receita_bruta = 0
    let comissao_amazon = 0
    let descontos = 0
    let outros = 0
    let pedidos = 0
    let unidades = 0

    const diasComVenda = new Set<string>()
    const porProduto: Record<string, {
      nome: string; unidades: number; pedidos: number
      receita: number; comissao: number; custo_unit: number; sem_custo: boolean
    }> = {}

    // Processa a partir da linha 1 (header = linha 0)
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]
      if (!r || !r[COL.TIPO]) continue

      const tipo = String(r[COL.TIPO]).trim()
      // Apenas pagamentos de pedidos
      if (!tipo.toLowerCase().includes('pagamento')) continue

      const rec  = parseBRL(r[COL.RECEITA])
      const desc = parseBRL(r[COL.DESCONTO])   // negativo = cupom
      const com  = parseBRL(r[COL.COMISSAO])   // negativo = comissão
      const out  = parseBRL(r[COL.OUTROS])

      receita_bruta   += rec
      comissao_amazon += Math.abs(com)
      descontos       += Math.abs(desc)
      outros          += out
      pedidos++
      unidades++

      // Data
      const d = parseDateBR(String(r[COL.DATA] ?? ''))
      if (d) diasComVenda.add(d.toISOString().split('T')[0])

      // Por produto
      const nomeProduto = normalizarNomeProduto(String(r[COL.PRODUTO] ?? ''))
      if (nomeProduto) {
        const chave = nomeProduto
        const custo = custoPorNome[nomeProduto.toUpperCase()] ??
          Object.entries(custoPorNome).find(([k]) =>
            nomeProduto.toLowerCase().includes(k.toLowerCase()) ||
            k.toLowerCase().includes(nomeProduto.toLowerCase().slice(0, 20))
          )?.[1] ?? 0

        if (!porProduto[chave]) {
          porProduto[chave] = {
            nome: nomeProduto, unidades: 0, pedidos: 0,
            receita: 0, comissao: 0,
            custo_unit: custo, sem_custo: !custo,
          }
        }
        porProduto[chave].unidades++
        porProduto[chave].pedidos++
        porProduto[chave].receita  += rec
        porProduto[chave].comissao += Math.abs(com)
      }
    }

    const diasArr = [...diasComVenda].sort()
    const dataInicio = diasArr[0] ?? ''
    const dataFim    = diasArr[diasArr.length - 1] ?? ''
    const ano = anoExplicito ?? parseInt(dataFim.split('-')[0])
    const mes = mesExplicito ?? parseInt(dataFim.split('-')[1])

    const produtosArray = Object.values(porProduto)
      .map(p => ({
        ...p,
        ticket_medio:   p.unidades > 0 ? p.receita / p.unidades : 0,
        custo_total:    p.custo_unit * p.unidades,
        margem_perc:    p.receita > 0
          ? ((p.receita - p.comissao - p.custo_unit * p.unidades) / p.receita) * 100
          : 0,
      }))
      .sort((a, b) => b.receita - a.receita)

    return NextResponse.json({
      arquivo: file.name,
      fonte: 'RELATORIO_VENDAS',
      periodo: { inicio: dataInicio, fim: dataFim, ano, mes },
      // Receita
      receita_bruta,
      descontos,
      comissao_amazon,
      outros,
      // Volume
      pedidos,
      unidades,
      dias_com_venda: diasComVenda.size,
      ticket_medio: unidades > 0 ? receita_bruta / unidades : 0,
      // Por produto
      produtos: produtosArray,
    })
  } catch (err) {
    console.error('[analisar-relatorio-vendas]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
