export async function register() {
  // Só roda no Node.js (não no Edge Runtime)
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const INTERVALO_CHECK_MS = 15 * 60 * 1000 // verifica a cada 15 min quem precisa sincronizar
  const TIMEOUT_TICK_MS    = 2 * 60 * 1000  // aborta o tick se demorar mais de 2 minutos
  const RETRY_DELAY_MS     = 60 * 1000      // aguarda 60s antes de retry após falha de conexão
  const MAX_RETRIES        = 2

  let isRunning = false

  function isConnectionError(err: unknown): boolean {
    const msg = String(err)
    return msg.includes("Can't reach database") || msg.includes('connection pool') || msg.includes('ECONNREFUSED')
  }

  async function tick(retryCount = 0) {
    if (isRunning) {
      setTimeout(tick, INTERVALO_CHECK_MS)
      return
    }
    isRunning = true
    try {
      const { runAutoSyncInterno } = await import('@/actions/ml')
      await Promise.race([
        runAutoSyncInterno(),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('auto-sync timeout')), TIMEOUT_TICK_MS),
        ),
      ])
    } catch (err) {
      console.error('[auto-sync] Erro no tick:', err)
      // Retry automático em caso de erro de conexão com o banco
      if (isConnectionError(err) && retryCount < MAX_RETRIES) {
        isRunning = false
        console.log(`[auto-sync] Retry ${retryCount + 1}/${MAX_RETRIES} em ${RETRY_DELAY_MS / 1000}s...`)
        setTimeout(() => tick(retryCount + 1), RETRY_DELAY_MS)
        return
      }
    } finally {
      isRunning = false
    }
    setTimeout(tick, INTERVALO_CHECK_MS)
  }

  // Aguarda 60s após o boot — dá tempo para as múltiplas instâncias do cold-start
  // estabilizarem antes de disputar conexões do pool do Prisma
  setTimeout(tick, 60_000)
  console.log('[auto-sync] Scheduler iniciado — verifica a cada 15 minutos')
}
