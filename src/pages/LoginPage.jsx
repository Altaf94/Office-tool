import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, isLoggedIn } from '../lib/didarApi'

export default function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (isLoggedIn()) navigate('/', { replace: true })
  }, [navigate])

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setPending(true)
    try {
      await login(username, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #e8f5e9 0%, #e3f2fd 100%)',
      padding: '24px 16px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
        background: '#fff',
        borderRadius: '12px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
        padding: '40px 36px 36px',
      }}>
        {/* Branding */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '56px',
            height: '56px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #0d9668, #0a7)',
            marginBottom: '14px',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <polyline points="9 12 11 14 15 10"/>
            </svg>
          </div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: '700', margin: '0 0 4px', color: '#111' }}>Intent Verification Portal</h1>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>Sign in to your account to continue</p>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>For local Council use only</p>

        </div>

        {error ? (
          <div style={{
            background: '#fff5f5',
            border: '1px solid #fca5a5',
            borderRadius: '6px',
            padding: '10px 14px',
            color: '#b91c1c',
            fontSize: '14px',
            marginBottom: '16px',
          }}>{error}</div>
        ) : null}

        <form onSubmit={onSubmit} autoComplete="on">
          <label htmlFor="username" style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#444', marginBottom: '6px' }}>Username</label>
          <input
            id="username"
            name="username"
            type="text"
            required
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{
              width: '100%',
              padding: '11px 14px',
              fontSize: '14px',
              border: '1px solid #d1d5db',
              borderRadius: '7px',
              outline: 'none',
              marginBottom: '16px',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => e.target.style.borderColor = '#0d9668'}
            onBlur={e => e.target.style.borderColor = '#d1d5db'}
          />

          <label htmlFor="password" style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#444', marginBottom: '6px' }}>Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: '100%',
              padding: '11px 14px',
              fontSize: '14px',
              border: '1px solid #d1d5db',
              borderRadius: '7px',
              outline: 'none',
              marginBottom: '24px',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => e.target.style.borderColor = '#0d9668'}
            onBlur={e => e.target.style.borderColor = '#d1d5db'}
          />

          <button
            type="submit"
            disabled={pending}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '15px',
              fontWeight: '600',
              color: '#fff',
              background: pending ? '#6ee7b7' : 'linear-gradient(135deg, #0d9668, #0a7)',
              border: 'none',
              borderRadius: '7px',
              cursor: pending ? 'not-allowed' : 'pointer',
              letterSpacing: '0.02em',
              transition: 'opacity 0.15s',
            }}
          >
            {pending ? 'Signing in…' : 'Log in'}
          </button>
        </form>
      </div>
    </div>
  )
}
