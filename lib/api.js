const BACKEND_URL = process.env.BACKEND_API_URL

export class BackendError extends Error {
  constructor(message, code = 'BACKEND_ERROR', status = 502) {
    super(message)
    this.name = 'BackendError'
    this.code = code
    this.status = status
  }
}

export async function backendRequest(path, options = {}) {
  if (!BACKEND_URL) {
    throw new BackendError('Backend connection is not configured.', 'BACKEND_NOT_CONFIGURED', 503)
  }

  let response
  try {
    response = await fetch(`${BACKEND_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      cache: 'no-store',
    })
  } catch {
    throw new BackendError('Unable to reach the pharmacy backend.', 'BACKEND_UNREACHABLE', 503)
  }

  if (response.ok) return response.status === 204 ? null : response.json()
  if (response.status === 401 || response.status === 403) {
    throw new BackendError('The email or password is incorrect.', 'AUTH_FAILED', response.status)
  }
  if (response.status === 404) throw new BackendError('The requested delivery was not found.', 'NOT_FOUND', 404)
  throw new BackendError('The backend returned an unexpected error.', 'BACKEND_ERROR', response.status)
}

export async function signIn(email, password) {
  if (!BACKEND_URL) {
    if (email === 'driver@elcamino.com' && password === 'demo1234') {
      return { token: 'demo-jwt-token', user: { id: 'driver-demo', name: 'Alex Morgan' } }
    }
    throw new BackendError('Use the demo driver credentials to continue.', 'AUTH_FAILED', 401)
  }
  return backendRequest('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
}
