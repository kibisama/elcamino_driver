'use client'

import { useActionState } from 'react'
import { loginAction } from './actions'

const initialState = { error: '' }

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState)
  return <form action={action} aria-describedby={state.error ? 'login-error' : undefined}><label htmlFor="email">Work email<input id="email" name="email" type="email" autoComplete="username" placeholder="driver@elcamino.com" required /></label><label htmlFor="password">Password<input id="password" name="password" type="password" autoComplete="current-password" placeholder="Enter password" required /></label>{state.error && <p id="login-error" className="sync-error" role="alert">{state.error}</p>}<button className="primary-button full" type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button><p className="demo-hint">Demo: driver@elcamino.com · demo1234</p></form>
}
