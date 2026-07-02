/**
 * Parser do template de Vendas Avulsas (.xlsx)
 *
 * Colunas (aba "Vendas"):
 *  0  Data            1  Canal          2  SKU
 *  3  Produto         4  Quantidade     5  Preço Unitário
 *  6  Desconto        7  Taxa Plataforma (%)   8  Observação
 */
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'

function n(v: unknown): number {
  return parseFloat(String(v ?? '').replace('R$', '').replace(/\s/g, '').replace(',', '.')) || 0
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

    // Busca aba "Vendas" (case-insensitive)
    const sheetName = wb.SheetNames.find(s => s.toLowerCase().includes('venda')) ?? wb.SheetNames[0]
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

    if (rows.length < 2) return NextResponse.json({ error: 'Arquivo vazio' }, { status: 400 })

    const header = rows[0].map(c => String(c).toLowerCase())
    if (!header.some(h => h.includes('canal') || h.includes('sku') || h.includes('pre'))) {
      return NextResponse.json({ error: 'Este arquivo não parece ser o template de Vendas Avulsas.' }, { status: 400 })
    }

    // Busca custos do catálogo
    const produtos = await prisma.produto_catalogo.findMany({
      where: { workspace_id: workspaceId },
      select: { sku_interno: true, custo_brl: true, nome: true },
    })
    const custoPorSku: Record<string, number> = {}
    const nomePorSku: Record<string, string> = {}
    produtos.forEach(p => {
      if (p.sku_interno) {
        custoPorSku[p.sku_interno.toUpperCase()] = p.custo_brl ?? 0
        nomePorSku[p.sku_interno.toUpperCase()]  = p.nome
      }
    })

    // Acumuladores
    let receita_total  = 0
    let taxas_total    = 0
    let pedidos        = 0
    let unidades_total = 0

    const canais: Record<string, { canal: string; receita: number; taxas: number; pedidos: number }> = {}
    const skus: Record<string, {
      sku: string; nome_catalogo: string; nome_produto: string
      canal: string; unidades: number; receita: number; taxas: number
      custo_unit: number; custo_total: number; sem_custo: boolean
      lucro_bruto: number; margem_perc: number; ticket_medio: number
    }> = {}

    const datas: Date[] = []

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] as unknown[]
      const sku = String(r[2] ?? '').trim().toUpperCase()
      if (!sku) continue

      const dataStr = String(r[0] ?? '').trim()
      if (dataStr) {
        const [d, m, y] = dataStr.split('/')
        if (d && m && y) datas.push(new Date(parseInt(y), parseInt(m) - 1, parseInt(d)))
      }

      const canal     = String(r[1] ?? '').trim() || 'Sem canal'
      const nomeProd  = String(r[3] ?? '').trim()
      const qty       = Math.max(1, parseInt(String(r[4] ?? '1')) || 1)
      const precoUnit = n(r[5])
      const desconto  = n(r[6])
      const taxaPerc  = n(r[7]) / 100

      const receita = (precoUnit * qty) - desconto
      const taxa    = receita * taxaPerc

      receita_total  += receita
      taxas_total    += taxa
      unidades_total += qty
      pedidos++

      // Por canal
      if (!canais[canal]) canais[canal] = { canal, receita: 0, taxas: 0, pedidos: 0 }
      canais[canal].receita += receita
      canais[canal].taxas   += taxa
      canais[canal].pedidos++

      // Por SKU
      const custo_unit = custoPorSku[sku] ?? 0
      const key = `${sku}::${canal}`
      if (!skus[key]) {
        skus[key] = {
          sku, canal,
          nome_catalogo: nomePorSku[sku] ?? '',
          nome_produto:  nomeProd,
          unidades: 0, receita: 0, taxas: 0,
          custo_unit, custo_total: 0, sem_custo: custo_unit === 0,
          lucro_bruto: 0, margem_perc: 0, ticket_medio: 0,
        }
      }
      skus[key].unidades += qty
      skus[key].receita  += receita
      skus[key].taxas    += taxa
    }

    const skusArray = Object.values(skus).map(s => {
      const custo_total = s.custo_unit * s.unidades
      const lucro_bruto = s.receita - s.taxas - custo_total
      return {
        ...s, custo_total, lucro_bruto,
        margem_perc:  s.receita > 0 ? (lucro_bruto / s.receita) * 100 : 0,
        ticket_medio: s.unidades > 0 ? s.receita / s.unidades : 0,
      }
    }).sort((a, b) => b.receita - a.receita)

    const cmv_total = skusArray.reduce((s, x) => s + x.custo_total, 0)
    const sku_sem_custo = [...new Set(skusArray.filter(s => s.sem_custo).map(s => s.sku))]

    datas.sort((a, b) => a.getTime() - b.getTime())
    const dataFim = datas[datas.length - 1]
    const anoFinal = anoExplicito ?? (dataFim?.getFullYear() ?? new Date().getFullYear())
    const mesFinal = mesExplicito ?? ((dataFim?.getMonth() ?? new Date().getMonth()) + 1)

    return NextResponse.json({
      arquivo: file.name,
      periodo: { ano: anoFinal, mes: mesFinal },
      receita_total,
      taxas_total,
      liquido_total: receita_total - taxas_total,
      cmv_total,
      pedidos,
      unidades_total,
      canais: Object.values(canais).sort((a, b) => b.receita - a.receita),
      skus: skusArray,
      alertas: { sku_sem_custo },
    })
  } catch (err) {
    console.error('[analisar-vendas-avulsas]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
