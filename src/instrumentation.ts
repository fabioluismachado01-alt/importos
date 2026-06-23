export async function register() {
  // Só roda no Node.js (não no Edge Runtime)
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const INTERVALO_CHECK_MS = 15 * 60 * 1000 // verifica a cada 15 min quem precisa sincronizar

  async function tick() {
    try {
      const { runAutoSyncInterno } = await import('@/actions/ml')
      await runAutoSyncInterno()
    } catch (err) {
      console.error('[auto-sync] Erro no tick:', err)
    }
    setTimeout(tick, INTERVALO_CHECK_MS)
  }

  // Aguarda 30s após o boot para não sobrecarregar na inicialização
  setTimeout(tick, 30_000)
  console.log('[auto-sync] Scheduler iniciado — verifica a cada 15 minutos')
}
