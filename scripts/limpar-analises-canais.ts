import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// Lançamentos gerados pelos uploads de cada plataforma (NÃO manuais)
const LANCS_MAIO = [
  // ML Import
  'cmq9ij9he000dvc4wm4ksv7px', // receita
  'cmq9ij9he000ivc4wbsrf8fgy', // armazenagem
  'cmq9ij9he000jvc4wtl8lvwkr', // frete coleta
  'cmq9ij9he000evc4ws7vq00bj', // tarifas
  'cmq9ij9he000fvc4w4ugz189d', // frete envio
  'cmq9ij9he000lvc4webuynez4', // outras taxas
  'cmq9ij9he000mvc4wivnbenlv', // estornos
  // Amazon
  'cmpzrppnb0013vc3gyheqmefa', // receita vendas
  'cmpzrppnb0014vc3gpqjoq413', // ajustes FBA
  'cmpzrppnb0015vc3ghogc2ur4', // tarifas comissão
  'cmpzrppnb0016vc3ggvcqm571', // armazenagem FBA
  'cmpzrppnc0017vc3gi52i8x4w', // armazenagem taxa
  'cmpzrppnc0018vc3g5dggprxz', // mensalidade
  'cmpzrppnc0019vc3g2e7vp5zr', // outras taxas
  'cmpzrppnc001avc3ggrbk1h1f', // ads
  // Shopee
  'cmpzswaui001uvc3g6lld7hgo', // receita
  'cmpzswaui001vvc3g595isctu', // tarifas comissão
  'cmpzswaui001wvc3gt1tmmr0k', // tarifas serviço
  'cmpzswaui001xvc3g8gnanpj7', // ads
  // TikTok
  'cmpzyerfl00ejvc3glu9oxvpw', // receita
  'cmpzyerfl00ekvc3g6d70v0gy', // tarifas
  'cmpzyerfl00elvc3gvufp3s4w', // ads afiliados
  // Magalu
  'cmpzztpxf0002vcpobcix4rf3', // receita
  'cmpzztpxf0003vcpo3ridendb', // tarifas
]

const LANCS_JUNHO = [
  // TikTok
  'cmr3rdzsj0002js04ud6wooc7', // receita
  'cmr3rdzsj0003js04l6fs5otu', // tarifas
  'cmr3rdzsj0004js042yfobbtb', // ads afiliados
  'cmr3rdzsj0005js04ypeax9i2', // frete
  // Shopee
  'cmr3q4rgu0002jo04114vbx40', // receita
  'cmr3q4rgu0003jo04dlah60ex', // tarifas comissão
  'cmr3q4rgu0004jo04drse3xxb', // tarifas serviço
  'cmr3q4rgu0005jo0451twoa2h', // ads
  // Magalu
  'cmr3s8vi6000cjs049w6s2iev', // receita
  'cmr3s8vi6000djs04a5qll613', // tarifas
]

const ML_ANALISE_RELATORIO_MAIO = 'cmpy63z3o0005vcxoortkju5x'

async function main() {
  // Deleta ml_analise_sku em cascata e ml_analise_relatorio de Maio
  const skus = await prisma.ml_analise_sku.deleteMany({
    where: { relatorio_id: ML_ANALISE_RELATORIO_MAIO },
  })
  console.log(`✓ ${skus.count} ml_analise_sku deletados`)

  await prisma.ml_analise_relatorio.delete({ where: { id: ML_ANALISE_RELATORIO_MAIO } })
  console.log(`✓ ml_analise_relatorio Maio deletado`)

  // Deleta lançamentos dos uploads
  const todos = [...LANCS_MAIO, ...LANCS_JUNHO]
  const r = await prisma.lancamento.deleteMany({ where: { id: { in: todos } } })
  console.log(`✓ ${r.count}/${todos.length} lançamentos de upload deletados`)
  console.log('\nPronto — pode re-subir todas as planilhas normalmente.')
}
main().catch(console.error).finally(() => prisma.$disconnect())
