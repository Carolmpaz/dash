import { useState } from 'react'
import { supabase } from '../supabaseClient'
import './ZeladorSignup.css'

function ZeladorSignup({ userInfo }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const validatePassword = (pwd) => {
    if (pwd.length < 8) {
      return 'A senha deve ter no mínimo 8 caracteres'
    }
    if (!/[a-zA-Z]/.test(pwd)) {
      return 'A senha deve conter pelo menos uma letra'
    }
    if (!/[0-9]/.test(pwd)) {
      return 'A senha deve conter pelo menos um número'
    }
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!name.trim()) {
      setError('O nome é obrigatório')
      return
    }

    if (!email.trim()) {
      setError('O e-mail é obrigatório')
      return
    }

    const passwordError = validatePassword(password)
    if (passwordError) {
      setError(passwordError)
      return
    }

    setLoading(true)

    try {
      // Cadastra o usuário no Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          data: {
            name: name.trim(),
            user_type: 'zelador'
          }
        }
      })

      if (authError) {
        setError(authError.message || 'Erro ao criar conta.')
        setLoading(false)
        return
      }

      if (authData?.user) {
        // Cria o registro na tabela users como zelador
        try {
          const { error: userTableError } = await supabase
            .from('users')
            .insert({
              id: authData.user.id,
              email: email.trim(),
              role: 'zelador',
              condominio_id: userInfo?.condominio_id || null
            })

          if (userTableError) {
            console.error('Erro ao criar registro na tabela users:', userTableError)
            setSuccess('Conta criada no sistema de autenticação. Configure o perfil no Supabase.')
          } else {
            setSuccess('Zelador cadastrado com sucesso! As credenciais foram enviadas por e-mail.')
            // Limpa o formulário
            setName('')
            setEmail('')
            setPassword('')
          }
        } catch (userTableErr) {
          console.error('Erro ao inserir na tabela users:', userTableErr)
          setSuccess('Conta criada no sistema de autenticação. Configure o perfil no Supabase.')
        }
      }
    } catch (err) {
      setError('Erro inesperado ao criar conta.')
      console.error('Erro no cadastro:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="zelador-signup-container">
      <div className="zelador-signup-header">
        <h2>Cadastrar Zelador</h2>
        <p>Preencha os dados para criar uma conta de zelador</p>
      </div>

      <form onSubmit={handleSubmit} className="zelador-signup-form">
        <div className="form-group">
          <label htmlFor="name">Nome Completo</label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Digite o nome completo"
            required
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="email">E-mail</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Digite o e-mail"
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
            placeholder="Mínimo 8 caracteres (letras e números)"
            required
            disabled={loading}
          />
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <button type="submit" className="submit-button" disabled={loading}>
          {loading ? 'Cadastrando...' : 'Cadastrar Zelador'}
        </button>
      </form>
    </div>
  )
}

export default ZeladorSignup




