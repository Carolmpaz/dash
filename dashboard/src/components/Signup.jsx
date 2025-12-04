import { useState, useEffect } from 'react'
import { supabase, isSupabaseConfigured } from '../supabaseClient'
import Logo from './Logo'
import './Login.css'

function Signup({ onSignup, onShowLogin, qrCodeData }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [userType, setUserType] = useState('morador')
  const [condominioId, setCondominioId] = useState(null)
  const [unidade, setUnidade] = useState('')
  // Campos para cadastro de condomínio (quando for síndico)
  const [condominioNome, setCondominioNome] = useState('')
  const [condominioEndereco, setCondominioEndereco] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  // Se vier dados do QR Code, processa
  useEffect(() => {
    if (qrCodeData) {
      try {
        const data = JSON.parse(qrCodeData)
        if (data.type === 'morador_signup' && data.condominio_id) {
          // Verifica se não expirou
          if (data.expires_at && Date.now() > data.expires_at) {
            setError('QR Code expirado. Solicite um novo código ao síndico.')
            return
          }
          setCondominioId(data.condominio_id)
          setUserType('morador')
          // Desabilita a seleção de tipo de usuário
        }
      } catch (err) {
        console.error('Erro ao processar dados do QR Code:', err)
      }
    } else {
      // Verifica se há dados no localStorage (caso venha do QRCodeLogin)
      const storedQRData = localStorage.getItem('qr_signup_data')
      if (storedQRData) {
        try {
          const data = JSON.parse(storedQRData)
          if (data.type === 'morador_signup' && data.condominio_id) {
            if (data.expires_at && Date.now() > data.expires_at) {
              localStorage.removeItem('qr_signup_data')
              setError('QR Code expirado. Solicite um novo código ao síndico.')
              return
            }
            setCondominioId(data.condominio_id)
            setUserType('morador')
            localStorage.removeItem('qr_signup_data')
          }
        } catch (err) {
          console.error('Erro ao processar dados do QR Code do localStorage:', err)
          localStorage.removeItem('qr_signup_data')
        }
      }
    }
  }, [qrCodeData])

  const validatePassword = (pwd) => {
    // Senha deve ter no mínimo 8 caracteres, incluindo letras e números
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

    // Validações
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

    if (password !== confirmPassword) {
      setError('As senhas não coincidem')
      return
    }

    // Validações específicas para síndico
    if (userType === 'sindico' && !condominioNome.trim()) {
      setError('O nome do condomínio é obrigatório para síndicos')
      return
    }

    setLoading(true)

    // Verifica se o Supabase está configurado
    if (!isSupabaseConfigured) {
      setError('O sistema não está configurado corretamente. Configure as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env')
      setLoading(false)
      return
    }

    try {
      // Cadastra o usuário no Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          data: {
            name: name.trim(),
            user_type: userType
          }
        }
      })

      if (authError) {
        // Tratamento de erros específicos do Supabase
        let errorMessage = authError.message || 'Erro ao criar conta. Tente novamente.'
        
        if (authError.message && authError.message.includes('fetch')) {
          errorMessage = 'Não foi possível conectar ao servidor. Verifique se as credenciais do Supabase estão configuradas corretamente no arquivo .env'
        } else if (authError.message && authError.message.includes('Invalid API key')) {
          errorMessage = 'Configuração do Supabase inválida. Verifique as credenciais no arquivo .env'
        } else if (authError.message && authError.message.includes('Email rate limit exceeded')) {
          errorMessage = 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.'
        } else if (authError.message && authError.message.includes('User already registered')) {
          errorMessage = 'Este e-mail já está cadastrado. Tente fazer login ou recuperar a senha.'
        }
        
        setError(errorMessage)
        setLoading(false)
        return
      }

      if (authData?.user) {
        // Aguarda um pouco para garantir que a sessão está estabelecida
        await new Promise(resolve => setTimeout(resolve, 500))
        
        // Se for síndico, cria o condomínio primeiro
        let newCondominioId = condominioId
        if (userType === 'sindico' && !condominioId && condominioNome.trim()) {
          try {
            const { data: condominioData, error: condominioError } = await supabase
              .from('condominios')
              .insert({
                nome: condominioNome.trim(),
                endereco: condominioEndereco.trim() || null
              })
              .select('id')
              .single()

            if (condominioError) {
              console.error('Erro ao criar condomínio:', condominioError)
              setError('Erro ao criar condomínio. Tente novamente.')
              setLoading(false)
              return
            }

            if (condominioData?.id) {
              newCondominioId = condominioData.id
              setCondominioId(newCondominioId)
              console.log('Condomínio criado com sucesso:', newCondominioId)
            }
          } catch (err) {
            console.error('Erro ao criar condomínio:', err)
            setError('Erro ao criar condomínio. Tente novamente.')
            setLoading(false)
            return
          }
        }
        
        // Primeiro verifica se o perfil já foi criado pelo trigger
        let profileExists = false
        try {
          const { data: existingProfile } = await supabase
            .from('users')
            .select('id, condominio_id')
            .eq('id', authData.user.id)
            .single()
          
          profileExists = !!existingProfile
          
          // Se o perfil existe, atualiza condominio_id se necessário (vindo do QR Code ou síndico)
          if (profileExists && newCondominioId) {
            const updateData = {}
            if (!existingProfile.condominio_id || existingProfile.condominio_id !== newCondominioId) {
              updateData.condominio_id = newCondominioId
            }
            if (unidade.trim()) {
              updateData.unidade = unidade.trim()
            }
            
            if (Object.keys(updateData).length > 0) {
              await supabase
                .from('users')
                .update(updateData)
                .eq('id', authData.user.id)
            }
          }
        } catch (err) {
          // Perfil não existe ainda
        }

        // Se o perfil não existe, tenta criar
        if (!profileExists) {
          try {
            // Prepara os dados para inserção
            // Primeiro tenta inserir com is_sindico (se o campo existir)
            const userData = {
              id: authData.user.id,
              email: email.trim(),
              role: userType === 'sindico' ? 'zelador' : userType,
              condominio_id: newCondominioId || null,
              unidade: unidade.trim() || null
            }

            // Se for síndico, tenta adicionar is_sindico na inserção inicial
            if (userType === 'sindico') {
              userData.is_sindico = true
            }

            // Tenta inserir
            let { error: userTableError } = await supabase
              .from('users')
              .insert(userData)

            // Se deu erro por causa de is_sindico, tenta sem esse campo
            if (userTableError && userTableError.message && (
              userTableError.message.includes('is_sindico') || 
              userTableError.message.includes('column') ||
              userTableError.code === '42703'
            )) {
              console.warn('Campo is_sindico não existe na tabela. Tentando inserir sem ele...')
              // Remove is_sindico e tenta novamente
              delete userData.is_sindico
              const { error: retryError } = await supabase
                .from('users')
                .insert(userData)
              
              if (retryError) {
                userTableError = retryError
              } else {
                // Inserção bem-sucedida sem is_sindico
                profileExists = true
                console.warn('Perfil criado sem is_sindico. Execute supabase_schema_sindico.sql para adicionar suporte a síndico.')
                // Tenta atualizar is_sindico depois (se o campo existir)
                if (userType === 'sindico') {
                  await supabase
                    .from('users')
                    .update({ is_sindico: true })
                    .eq('id', authData.user.id)
                    // Ignora erro se o campo não existir
                }
                userTableError = null
              }
            }

            // Se ainda houver erro, verifica o tipo
          if (userTableError) {
            console.error('Erro ao criar registro na tabela users:', userTableError)
              
              // Se for erro de permissão, o trigger pode ter criado
              if (userTableError.code === '42501' || userTableError.message?.includes('permission denied') || userTableError.message?.includes('RLS')) {
                // Aguarda um pouco e verifica novamente
                await new Promise(resolve => setTimeout(resolve, 1000))
                const { data: checkData } = await supabase
                  .from('users')
                  .select('id, is_sindico')
                  .eq('id', authData.user.id)
                  .single()
                
                if (checkData) {
                  // Perfil foi criado pelo trigger
                  profileExists = true
                  // Atualiza condominio_id e unidade se vier do QR Code ou for síndico
                  const updateData = {}
                  if (newCondominioId) updateData.condominio_id = newCondominioId
                  if (unidade.trim()) updateData.unidade = unidade.trim()
                  if (userType === 'sindico') updateData.is_sindico = true
                  
                  if (Object.keys(updateData).length > 0) {
                    await supabase
                      .from('users')
                      .update(updateData)
                      .eq('id', authData.user.id)
                  }
                } else {
                  setError('⚠️ Permissão negada para criar perfil automaticamente.')
                  setSuccess(' Conta criada no sistema de autenticação! Para resolver: 1) Execute o script trigger_create_user_profile.sql no Supabase, ou 2) Entre em contato com o administrador para criar o perfil manualmente.')
                }
              } else if (userTableError.code === '23505') {
                // E-mail já existe - perfil já foi criado
                profileExists = true
                // Atualiza condominio_id, unidade e is_sindico se necessário
                const updateData = {}
                if (newCondominioId) updateData.condominio_id = newCondominioId
                if (unidade.trim()) updateData.unidade = unidade.trim()
                if (userType === 'sindico') updateData.is_sindico = true
                
                if (Object.keys(updateData).length > 0) {
                  await supabase
                    .from('users')
                    .update(updateData)
                    .eq('id', authData.user.id)
                }
              } else {
                setError(`Erro ao criar perfil: ${userTableError.message || 'Erro desconhecido'}`)
                setSuccess('Conta criada no sistema de autenticação. Entre em contato com o administrador.')
              }
          } else {
              // Inserção bem-sucedida
              profileExists = true
              console.log('Perfil criado com sucesso. Role:', userData.role, 'is_sindico:', userData.is_sindico || false)
          }
        } catch (userTableErr) {
          console.error('Erro ao inserir na tabela users:', userTableErr)
            setError('Erro ao criar perfil. A conta foi criada, mas o perfil precisa ser configurado manualmente.')
          setSuccess('Conta criada no sistema de autenticação. O perfil será configurado pelo administrador.')
          }
        }

        // Se o perfil foi criado (ou já existia), mostra sucesso
        if (profileExists) {
          setSuccess('Conta criada com sucesso! Verifique seu e-mail para confirmar a conta.')
        }
        
        // Se o e-mail não precisa de confirmação, faz login automaticamente
        if (authData.session) {
          setTimeout(() => {
            onSignup(authData.user)
          }, 1500)
        }
      }
    } catch (err) {
      console.error('Erro no cadastro:', err)
      
      // Tratamento de erros mais específico
      if (err.message && err.message.includes('Failed to fetch')) {
        setError('Não foi possível conectar ao servidor. Verifique sua conexão com a internet e se o Supabase está configurado corretamente.')
      } else if (err.message && err.message.includes('NetworkError')) {
        setError('Erro de rede. Verifique sua conexão com a internet.')
      } else {
        setError(err.message || 'Erro inesperado ao criar conta. Tente novamente.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo">
          <Logo />
        </div>
        <div className="login-header">
          <h1>Cadastro</h1>
          <p>Distribuidora de Gás</p>
        </div>
        
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="name">Nome Completo</label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Digite seu nome completo"
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
              placeholder="Digite seu e-mail"
              required
              disabled={loading}
            />
          </div>

          {!condominioId && (
            <div className="form-group">
              <label htmlFor="userType">Tipo de Usuário</label>
              <select
                id="userType"
                value={userType}
                onChange={(e) => setUserType(e.target.value)}
                className="form-group input"
                disabled={loading}
                style={{ padding: '12px 16px', border: '2px solid #e0e0e0', borderRadius: '10px', fontSize: '16px' }}
              >
                <option value="morador">Morador</option>
                <option value="zelador">Zelador</option>
                <option value="sindico">Síndico</option>
                <option value="comgas">Comgás</option>
              </select>
            </div>
          )}
          {condominioId && (
            <div className="form-group">
              <div className="success-message" style={{ marginBottom: '10px' }}>
                 Cadastro via QR Code - Você será associado ao condomínio automaticamente
              </div>
            </div>
          )}
          {userType === 'sindico' && !condominioId && (
            <>
              <div className="form-group">
                <label htmlFor="condominioNome">Nome do Condomínio *</label>
                <input
                  type="text"
                  id="condominioNome"
                  value={condominioNome}
                  onChange={(e) => setCondominioNome(e.target.value)}
                  placeholder="Digite o nome do condomínio"
                  required
                  disabled={loading}
                />
                <small style={{ color: '#666', fontSize: '12px' }}>Um condomínio será criado automaticamente para você</small>
              </div>
              <div className="form-group">
                <label htmlFor="condominioEndereco">Endereço do Condomínio (opcional)</label>
                <input
                  type="text"
                  id="condominioEndereco"
                  value={condominioEndereco}
                  onChange={(e) => setCondominioEndereco(e.target.value)}
                  placeholder="Digite o endereço completo do condomínio"
                  disabled={loading}
                />
              </div>
            </>
          )}
          {condominioId && (
            <div className="form-group">
              <label htmlFor="unidade">Unidade (opcional)</label>
              <input
                type="text"
                id="unidade"
                value={unidade}
                onChange={(e) => setUnidade(e.target.value)}
                placeholder="Ex: 101, Apto 5, etc."
                disabled={loading}
              />
            </div>
          )}

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

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirmar Senha</label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Digite a senha novamente"
              required
              disabled={loading}
            />
          </div>

          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? 'Criando conta...' : 'Cadastrar'}
          </button>
        </form>

        <div className="login-hint">
          <p>Já tem uma conta? <button type="button" onClick={onShowLogin} className="link-button">Fazer login</button></p>
        </div>
      </div>
    </div>
  )
}

export default Signup

