/**
 * Exportação do DRE mensal em PDF
 * GET /api/export/pdf-mes?ano=2026&mes=5
 */
import { NextRequest, NextResponse } from 'next/server'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'
import { getMesNome } from '@/lib/utils'
import { getMarketplaceBrand } from '@/components/marketplace/MarketplaceLogo'
import { PDFDocumento } from './documento'

const CANAIS_CONFIG = [
  { key: 'MERCADO_LIVRE', tag: 'ML Import', label: 'Mercado Livre' },
  { key: 'AMAZON',        tag: '[Amazon]',  label: 'Amazon' },
  { key: 'SHOPEE',        tag: '[Shopee]',  label: 'Shopee' },
  { key: 'TIKTOK',        tag: '[TikTok]',  label: 'TikTok Shop' },
  { key: 'MAGALU',        tag: '[Magalu]',  label: 'Magalu' },
]

export async function GET(req: NextRequest) {
  try {
    const { workspaceId } = await getAuthContext()
    const { searchParams } = new URL(req.url)
    const ano = parseInt(searchParams.get('ano') ?? '') || new Date().getFullYear()
    const mes = parseInt(searchParams.get('mes') ?? '') || new Date().getMonth() + 1

    const fat = await prisma.faturamento_mes.findUnique({
      where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano, mes } },
      include: { lancamentos: true },
    })

    if (!fat) return new NextResponse('Mês não encontrado', { status: 404 })

    // Análise por canal a partir dos lançamentos
    const canaisData = CANAIS_CONFIG.map(c => {
      const receita = fat.lancamentos
        .filter(l => l.tipo === 'RECEITA' && l.canal === c.key)
        .reduce((s, l) => s + l.valor, 0)
      const despesas = fat.lancamentos
        .filter(l => (l.tipo === 'DESPESA_VARIAVEL' || l.tipo === 'DESPESA_FIXA') && l.descricao.includes(c.tag))
        .reduce((s, l) => s + l.valor, 0)
      const lucro = receita - despesas
      const margem = receita > 0 ? (lucro / receita) * 100 : 0
      const participacao = fat.receita_total > 0 ? (receita / fat.receita_total) * 100 : 0
      const brand = getMarketplaceBrand(c.key)
      return { ...c, receita, despesas, lucro, margem, participacao, cor: brand.cor, iconCor: brand.iconCor }
    }).filter(c => c.receita > 0).sort((a, b) => b.receita - a.receita)

    // Outros recebimentos (receitas sem canal específico)
    const canaisKeys = new Set(CANAIS_CONFIG.map(c => c.key))
    const outrosLancamentos = fat.lancamentos
      .filter(l => l.tipo === 'RECEITA' && (!l.canal || !canaisKeys.has(l.canal)))
      .map(l => ({ descricao: l.descricao, valor: l.valor, categoria: l.categoria }))

    const mesNome = getMesNome(mes)
    const dataGeracao = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(
      React.createElement(PDFDocumento as any, {
        fat: fat as unknown as Record<string, number>,
        canaisData,
        outrosLancamentos,
        mesNome,
        ano,
        dataGeracao,
      }) as any
    )

    const uint8 = new Uint8Array(buffer)
    return new NextResponse(uint8, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="DRE-${mesNome}-${ano}.pdf"`,
      },
    })
  } catch (err) {
    console.error('[pdf-mes]', err)
    return new NextResponse(`Erro ao gerar PDF: ${String(err)}`, { status: 500 })
  }
}
