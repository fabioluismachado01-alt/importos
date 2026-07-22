import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
async function run() {
  const ws = await p.workspace.findUnique({ where: { slug: 'nacao-import-demo' } })
  const membro = await p.workspace_membro.findFirst({ where: { workspace_id: ws!.id } })
  console.log('user_id:', membro?.user_id)
}
run().catch(e => console.error(e.message)).finally(() => p.$disconnect())
