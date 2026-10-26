'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { BackendError, signIn } from '../../lib/api'

export async function loginAction(_previousState, formData) {
  const email = String(formData.get('email') || '').trim()
  const password = String(formData.get('password') || '')
  if (!email || !password) return { error: 'Enter your work email and password.' }

  try {
    const session = await signIn(email, password)
    const cookieStore = await cookies()
    cookieStore.set('driver_session', session.token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8 })
  } catch (error) {
    if (error instanceof BackendError) return { error: error.message }
    return { error: 'Sign in failed. Please try again.' }
  }
  redirect('/deliveries')
}
