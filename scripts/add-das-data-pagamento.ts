import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

async function main() {
  // Adiciona coluna das_data_pagamento na tabela faturamento_mes via SQL direto.
  // Prisma não suporta ALTER TABLE nativo — usamos $executeRawUnsafe.
  await p.$executeRawUnsafe(`
    ALTER TABLE faturamento_mes
    ADD COLUMN IF NOT EXISTS das_data_pagamento TIMESTAMPTZ;
  `)
  console.log('✅ Coluna das_data_pagamento adicionada (ou já existia)')

  // Backfill: para meses já pagos, usa updated_at como aproximação da data de pagamento.
  // Isso evita exibir null nos meses já registrados. O usuário pode editar depois com a data real.
  const result = await p.$executeRawUnsafe(`
    UPDATE faturamento_mes
    SET das_data_pagamento = updated_at
    WHERE das_status = 'PAGO' AND das_data_pagamento IS NULL;
  `)
  console.log(`✅ Backfill: ${result} registro(s) atualizados com updated_at como data aproximada`)
}

main().catch(console.error).finally(() => p.$disconnect())
