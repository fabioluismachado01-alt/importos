import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { pathToFileURL } from 'url'

// Converte "1.234,56" para número
function parseBRL(str: string): number {
  return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0
}

// Extrai texto do PDF usando pdfjs-dist
async function extrairTextoPDF(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjsLib: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const workerPath = path.resolve(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')
  pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href

  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise
  let texto = ''
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    texto += content.items.map((item: any) => item.str ?? '').join(' ') + '\n'
  }
  return texto
}

// Extrai todos os valores monetários do texto (formato X,XX BRL ou R$ X,XX)
function extrairValoresComContexto(texto: string): Array<{ contexto: string; valor: number }> {
  const resultados: Array<{ contexto: string; valor: number }> = []
  const linhas = texto.split('\n')

  for (const linha of linhas) {
    // Padrão 1: R$ X.XXX,XX
    const rgRS = /R\$\s*([\d.,]+)/g
    let m
    while ((m = rgRS.exec(linha)) !== null) {
      const valor = parseBRL(m[1])
      if (valor > 0 && valor < 1_000_000) {
        resultados.push({ contexto: linha.trim().toLowerCase(), valor })
      }
    }

    // Padrão 2: X.XXX,XX BRL  (fatura Amazon Advertising)
    const rgBRL = /([\d]{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s+BRL/g
    while ((m = rgBRL.exec(linha)) !== null) {
      const valor = parseBRL(m[1])
      if (valor > 0 && valor < 1_000_000) {
        const ctx = linha.trim().toLowerCase()
        if (!resultados.some(r => r.valor === valor && r.contexto === ctx)) {
          resultados.push({ contexto: ctx, valor })
        }
      }
    }
  }

  return resultados
}

// Encontra o total de publicidade buscando o valor LOGO APÓS a keyword no texto
function encontrarTotalPublicidade(texto: string): { valor: number; contexto: string } | null {
  const lower = texto.toLowerCase()

  // Palavras-chave em ordem de prioridade — busca o trecho após a keyword
  const keywords = [
    'valor total (imposto incluído)',
    'valor total cobrado',
    'valor faturado devido',
    'total de cobranças da campanha',
    'total de gastos', 'total gasto', 'total cobrado',
    'custo total', 'gasto total', 'total da campanha',
    'total faturado', 'valor faturado', 'cobrança total',
    'total spend',
  ]

  for (const kw of keywords) {
    const pos = lower.indexOf(kw)
    if (pos === -1) continue

    // Pega os 80 chars DEPOIS da keyword para encontrar o valor
    const trecho = texto.slice(pos + kw.length, pos + kw.length + 80)

    // Tenta R$ primeiro, depois X,XX BRL
    const mRS  = trecho.match(/R\$\s*([\d.,]+)/)
    const mBRL = trecho.match(/([\d]{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*BRL/i)
    const raw = mRS ? mRS[1] : mBRL ? mBRL[1] : null
    if (raw) {
      const valor = parseBRL(raw)
      if (valor > 0) return { valor, contexto: kw + trecho.slice(0, 40) }
    }
  }

  // Fallback: maior valor com contexto financeiro
  const todos = extrairValoresComContexto(texto)
  const relevantes = todos.filter(v =>
    v.contexto.includes('total') || v.contexto.includes('cobr') ||
    v.contexto.includes('faturado') || v.contexto.includes('gasto')
  )
  if (relevantes.length > 0) {
    relevantes.sort((a, b) => b.valor - a.valor)
    return relevantes[0]
  }
  return null
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())

    let texto = ''
    try {
      texto = await extrairTextoPDF(buffer)
    } catch (e) {
      console.error('[publicidade-amazon] pdfjs falhou:', e)
      return NextResponse.json({ error: `Erro ao ler o PDF: ${String(e)}` }, { status: 500 })
    }

    const resultado = encontrarTotalPublicidade(texto)
    const todosValores = extrairValoresComContexto(texto)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 20)

    if (resultado) {
      return NextResponse.json({
        success: true,
        total_publicidade: resultado.valor,
        contexto: resultado.contexto,
        arquivo: file.name,
        todos_valores: todosValores,
      })
    }

    return NextResponse.json({
      success: false,
      total_publicidade: null,
      mensagem: 'Não foi possível identificar o total automaticamente. Selecione abaixo ou informe manualmente.',
      arquivo: file.name,
      todos_valores: todosValores,
    })
  } catch (err) {
    console.error('[publicidade-amazon]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
