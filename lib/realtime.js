const DEFAULT_INTERVAL_MS = 30_000

/**
 * Lightweight server-side connectivity monitor for the pharmacy BFF.
 * Set BACKEND_URL to the separate Express API origin in deployment.
 */
export function startBackendMonitor({
  url = process.env.BACKEND_URL,
  intervalMs = Number(process.env.BACKEND_HEALTH_INTERVAL_MS) || DEFAULT_INTERVAL_MS,
} = {}) {
  if (!url || process.env.NODE_ENV === 'test') return () => {}

  let stopped = false
  let timer

  const check = async () => {
    try {
      const response = await fetch(`${url.replace(/\/$/, '')}/health`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      console.info('[bff] backend connection healthy')
    } catch (error) {
      console.error('[bff] backend connection unavailable', error instanceof Error ? error.message : error)
    }
  }

  void check()
  timer = setInterval(() => {
    if (!stopped) void check()
  }, intervalMs)

  return () => {
    stopped = true
    clearInterval(timer)
  }
}

export function backendUrl(path = '') {
  const base = process.env.BACKEND_URL
  if (!base) return null
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}
