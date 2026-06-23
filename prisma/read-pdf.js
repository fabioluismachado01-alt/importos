const pdf = require('pdf-parse')
const fs  = require('fs')

async function main() {
  const buf  = fs.readFileSync('C:/Users/fabio/Downloads/fatura publicidade amazon maio.pdf')
  const data = await pdf(buf)
  console.log('Pages:', data.numpages)
  console.log('Chars:', data.text.length)
  console.log('\n=== TEXTO COMPLETO ===')
  console.log(data.text)
}
main().catch(e => console.error('ERRO:', e.message))
