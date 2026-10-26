import { ShieldCheck } from 'lucide-react'
import { LoginForm } from './login-form'

export default function LoginPage() {
  return <main className="auth-shell"><section className="auth-card"><div className="brand-mark"><ShieldCheck /><span>EL CAMINO PHARMACY</span></div><p className="eyebrow">DRIVER PORTAL</p><h1>Sign in to continue</h1><p className="auth-copy">Access your assigned deliveries and proof of delivery.</p><LoginForm /><p className="secure-note"><ShieldCheck /> Secure BFF session · JWT protected</p></section></main>
}
