'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Package, Eye, EyeOff } from 'lucide-react'
import { loginAction } from '@/actions/auth'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const result = await loginAction(email, password)

      if (result?.error) {
        setError(result.error)
        setLoading(false)
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch (err: any) {
      setError('Erro de conexão: ' + (err?.message ?? 'tente novamente'))
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#0A0F1E' }}>
      {/* Grid pattern background */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(#1A2440 1px, transparent 1px), linear-gradient(90deg, #1A2440 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
          opacity: 0.3,
        }}
      />
      {/* Glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 60%, rgba(16,185,129,0.06) 0%, transparent 60%)',
        }}
      />

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{
              background: '#10B981',
              boxShadow: '0 0 40px rgba(16,185,129,0.35)',
            }}
          >
            <Package className="w-7 h-7 text-white" />
          </div>
          <h1
            className="text-[28px] font-black text-white tracking-tight"
            style={{ fontFamily: 'Inter, sans-serif', letterSpacing: '-0.02em' }}
          >
            ImportOS
          </h1>
          <p className="text-sm mt-1" style={{ color: '#4B5E80' }}>
            Controle total da sua operação de importação.
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8"
          style={{
            background: '#0F1629',
            border: '1px solid #1A2440',
            boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
          }}
        >
          <h2 className="text-base font-bold text-white mb-6">Entrar na plataforma</h2>

          <form onSubmit={handleLogin} className="space-y-4">
            {/* E-mail */}
            <div>
              <label
                className="block text-[11px] font-bold uppercase mb-1.5"
                style={{ color: '#4B5E80', letterSpacing: '0.08em', fontFamily: 'Inter, sans-serif' }}
              >
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                className="w-full px-3 rounded-lg outline-none transition-all text-sm"
                style={{
                  height: '40px',
                  background: '#0A0F1E',
                  border: '1.5px solid #1A2440',
                  color: '#F0F4FF',
                  fontFamily: 'Inter, sans-serif',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#10B981'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(16,185,129,0.15)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#1A2440'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>

            {/* Senha */}
            <div>
              <label
                className="block text-[11px] font-bold uppercase mb-1.5"
                style={{ color: '#4B5E80', letterSpacing: '0.08em' }}
              >
                Senha
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-3 pr-10 rounded-lg outline-none transition-all text-sm"
                  style={{
                    height: '40px',
                    background: '#0A0F1E',
                    border: '1.5px solid #1A2440',
                    color: '#F0F4FF',
                    fontFamily: 'Inter, sans-serif',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#10B981'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(16,185,129,0.15)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#1A2440'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: '#4B5E80' }}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Erro */}
            {error && (
              <div
                className="text-xs px-3 py-2 rounded-lg"
                style={{
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  color: '#F87171',
                }}
              >
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full font-bold text-sm text-white rounded-xl transition-all mt-2 disabled:opacity-60"
              style={{
                height: '44px',
                background: loading ? '#059669' : '#10B981',
                boxShadow: '0 4px 20px rgba(16,185,129,0.35)',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] mt-6" style={{ color: '#2D3F5E' }}>
          ImportOS · @fabiomachado.br
        </p>
      </div>
    </div>
  )
}
