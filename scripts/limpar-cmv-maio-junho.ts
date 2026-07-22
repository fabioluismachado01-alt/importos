import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const IDS_DELETAR = [
  // MAIO
  'cmrc1cc830002vc4s3b7ub680', // [Amazon]
  'cmrc1cc830001vc4sltug3kwf', // [Magalu]
  'cmrc1cc830003vc4s6u3rdgkh', // [Shopee]
  'cmrc1cc820000vc4stbnigdfe', // [TikTok]
  'cmr9l02x8002tvcg0sb7h97d2', // CMV manual R$234k
  'cmrc1cc830004vc4sgn6bulx6', // ML Import
  // JUNHO
  'cmrc1cc9y0006vc4sc0regkxl', // [Amazon]
  'cmrc1cc9y0005vc4s1xr525hn', // [Magalu]
  'cmrc1cc9y0007vc4suj7ve0cp', // [Shopee]
  'cmrc1cc9y0008vc4s20v1v98q', // [TikTok]
  'cmr9l030d0033vcg05ri59p49', // CMV manual R$223k
]

async function main() {
  const r = await prisma.lancamento.deleteMany({ where: { id: { in: IDS_DELETAR } } })
  console.log(`✓ ${r.count} lançamentos CMV deletados de Maio e Junho`)
  console.log('Pronto — pode re-subir as planilhas normalmente pelo sistema.')
}
main().catch(console.error).finally(() => prisma.$disconnect())
