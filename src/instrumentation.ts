export async function register() {
  // Só roda no Node.js (não no Edge Runtime)
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const INTERVALO_CHECK_MS = 15 * 60 * 1000 // verifica a cada 15 min quem precisa sincronizar
  const TIMEOUT_TICK_MS = 2 * 60 * 1000 // aborta o tick se demorar mais de 2 minutos

  let isRunning = false

  async function tick() {
    // Impede ticks sobrepostos dentro da mesma instância do servidor
    if (isRunning) {
      setTimeout(tick, INTERVALO_CHECK_MS)
      return
    }
    isRunning = true
    try {
      const { runAutoSyncInterno } = await import('@/actions/ml')
      // Timeout para evitar que um tick travado segure conexões indefinidamente
      await Promise.race([
        runAutoSyncInterno(),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('auto-sync timeout')), TIMEOUT_TICK_MS),
        ),
      ])
    } catch (err) {
      console.error('[auto-sync] Erro no tick:', err)
    } finally {
      isRunning = false
      setTimeout(tick, INTERVALO_CHECK_MS)
    }
  }

  // Fix one-time: corrige SKU ATS-2 → ATS-6 no produto Comedouro Azul
  async function fixSkuAzul() {
    try {
      const { prisma } = await import('@/lib/prisma')
      const produto = await prisma.produto_catalogo.findFirst({
        where: { sku_interno: 'ATS-2', nome: { contains: 'Azul' } },
      })
      if (produto) {
        await prisma.produto_catalogo.update({ where: { id: produto.id }, data: { sku_interno: 'ATS-6' } })
        console.log('[fix-sku] ATS-2 → ATS-6 corrigido:', produto.nome)
      } else {
        console.log('[fix-sku] Nada a corrigir (ATS-2 Azul não encontrado — já foi feito ou não existe)')
      }
    } catch (err) {
      console.error('[fix-sku] Erro:', err)
    }
  }
  fixSkuAzul()

  // Aguarda 60s após o boot — dá tempo para as múltiplas instâncias do cold-start
  // estabilizarem antes de disputar conexões do pool do Prisma
  setTimeout(tick, 60_000)
  console.log('[auto-sync] Scheduler iniciado — verifica a cada 15 minutos')
}
