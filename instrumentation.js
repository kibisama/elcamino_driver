import { startBackendMonitor } from './lib/realtime.js'

export async function register() {
  // Keep the monitor server-only; instrumentation runs in the active Next.js runtime.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    startBackendMonitor()
  }
}
