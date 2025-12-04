import { useState } from 'react'
import { supabase } from '../supabaseClient'
import Logo from './Logo'
import QRCodeLogin from './QRCodeLogin'
import './Login.css'

function Login({ onLogin, onShowSignup }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showQRCode, setShowQRCode] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password
      })

      if (authError) {
        setError(authError.message || 'Erro ao fazer login. Verifique suas credenciais.')
      } else if (data?.user) {
        onLogin(data.user)
      }
    } catch (err) {
      setError('Erro inesperado ao fazer login. Tente novamente.')
      console.error('Erro no login:', err)
    } finally {
      setLoading(false)
    }
  }

  if (showQRCode) {
    return <QRCodeLogin onLogin={onLogin} />
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo">
          <Logo />
        </div>
        <div className="login-header">
          <h1>Dashboard Caldeira</h1>
          <p>Distribuidora de Gás</p>
        </div>
        
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">E-mail</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Digite seu e-mail"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Senha</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Digite sua senha"
              required
              disabled={loading}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div className="login-hint">
          <p>Não tem uma conta? <button type="button" onClick={onShowSignup} className="link-button">Cadastre-se</button></p>
          <p style={{ marginTop: '15px' }}>
            <button type="button" onClick={() => setShowQRCode(true)} className="link-button">
              Login via QR Code (Morador)
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

export default Login

