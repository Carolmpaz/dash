import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import ZeladorDashboard from './components/ZeladorDashboard'
import SindicoDashboard from './components/SindicoDashboard'
import MoradorDashboard from './components/MoradorDashboard'
import QRCodeLogin from './components/QRCodeLogin'
import Signup from './components/Signup'
import './App.css'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const [userInfo, setUserInfo] = useState(null) // Informações do perfil (role, condominio_id, unidade)
  const [loadingUserInfo, setLoadingUserInfo] = useState(false) // Estado para carregamento do userInfo
  const [showSignup, setShowSignup] = useState(false)
  const [loading, setLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)
  // Estado para dados do QR Code (deve estar antes de qualquer return)
  const [qrCodeData, setQrCodeData] = useState(() => {
    try {
      const stored = localStorage.getItem('qr_signup_data')
      return stored || null
    } catch {
      return null
    }
  })

  // Função para carregar informações do perfil do usuário
  const loadUserInfo = async (userId) => {
    setLoadingUserInfo(true)
    try {
      // Timeout para evitar travamento
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout ao carregar userInfo')), 5000)
      )

      // Primeiro tenta buscar da tabela users
      const queryPromise = supabase
        .from('users')
        .select('role, condominio_id, unidade, is_sindico')
        .eq('id', userId)
        .single()

      const { data: userData, error: userError } = await Promise.race([queryPromise, timeoutPromise])

      if (userError) {
        // Se a tabela não existe ou erro de permissão, apenas loga e continua
        if (userError.code === 'PGRST116') {
          // Tabela não encontrada ou usuário não cadastrado - normal para primeiro acesso
          console.error('❌ ERRO: Usuário não encontrado na tabela users!')
          console.error('   User ID:', userId)
          console.error('   Código do erro:', userError.code)
          console.error('   Mensagem:', userError.message)
          console.error('   → Execute o script criar_usuarios_completo.sql para criar os usuários')
        } else {
          console.error('❌ ERRO ao carregar informações do usuário:')
          console.error('   User ID:', userId)
          console.error('   Código do erro:', userError.code)
          console.error('   Mensagem:', userError.message)
          console.error('   Detalhes:', userError.details)
          console.error('   Hint:', userError.hint)
        }
      }

      if (userData) {
        // IMPORTANTE: A tabela users pode ter 'role' ou a RPC pode retornar 'user_role'
        // Garante que sempre tenha 'role' normalizado
        const roleValue = userData.role || userData.user_role
        const userInfoWithDefaults = {
          ...userData,
          role: roleValue?.toLowerCase() || roleValue, // Normaliza o role para lowercase
          user_role: roleValue, // Mantém também user_role para compatibilidade
          is_sindico: userData.is_sindico === true // Converte para boolean explícito
        }
        console.log('========================================')
        console.log('✅ UserInfo carregado do banco:')
        console.log('   User ID:', userId)
        console.log('   Role (original):', userData.role)
        console.log('   Role (normalizado):', userInfoWithDefaults.role)
        console.log('   Condominio ID:', userInfoWithDefaults.condominio_id)
        console.log('   Unidade:', userInfoWithDefaults.unidade)
        console.log('   is_sindico (tipo):', typeof userInfoWithDefaults.is_sindico)
        console.log('   is_sindico (valor):', userInfoWithDefaults.is_sindico)
        console.log('   É síndico?', userInfoWithDefaults.role === 'zelador' && userInfoWithDefaults.is_sindico === true)
        console.log('   Dados completos:', JSON.stringify(userInfoWithDefaults, null, 2))
        console.log('========================================')
        setUserInfo(userInfoWithDefaults)
        setLoadingUserInfo(false)
        return
      } else {
        console.error('❌ ERRO: userData é null ou undefined!')
        console.error('   userId:', userId)
        console.error('   userError:', userError)
        setLoadingUserInfo(false)
      }

      // Se não encontrou, tenta usar a função get_user_info
      try {
        const rpcPromise = supabase.rpc('get_user_info')
        const { data: functionData, error: functionError } = await Promise.race([rpcPromise, timeoutPromise])

        if (functionError) {
          console.warn('Função get_user_info não disponível:', functionError.message)
        } else if (functionData && functionData.length > 0) {
          // IMPORTANTE: A função RPC retorna user_role, não role
          const rpcData = functionData[0]
          const rpcUserInfo = {
            ...rpcData,
            role: (rpcData.user_role || rpcData.role)?.toLowerCase(), // Mapeia user_role para role
            user_role: rpcData.user_role, // Mantém também user_role para compatibilidade
            is_sindico: rpcData.is_sindico === true
          }
          console.log('✅ UserInfo carregado via RPC:')
          console.log('   Dados originais:', rpcData)
          console.log('   Dados mapeados:', rpcUserInfo)
          console.log('   Role final:', rpcUserInfo.role)
          setUserInfo(rpcUserInfo)
          setLoadingUserInfo(false)
          return
        }
      } catch (rpcError) {
        console.warn('Erro ao chamar função get_user_info:', rpcError.message)
      }

      // Se chegou aqui, não encontrou informações - define valores padrão
      console.warn('Não foi possível carregar informações do usuário. Usando valores padrão.')
      setUserInfo({ role: null, condominio_id: null, unidade: null, is_sindico: false })
      setLoadingUserInfo(false)
    } catch (err) {
      console.error('Erro inesperado ao carregar informações do usuário:', err)
      // Define valores padrão mesmo em caso de erro
      setUserInfo({ role: null, condominio_id: null, unidade: null, is_sindico: false })
      setLoadingUserInfo(false)
    }
  }

  useEffect(() => {
    // Timeout de segurança para evitar tela de carregamento infinita
    const loadingTimeout = setTimeout(() => {
      console.warn('Timeout no carregamento inicial - forçando desativação do loading')
      setLoading(false)
    }, 10000) // 10 segundos

    // Verifica se já existe uma sessão ativa
    const checkSession = async () => {
      try {
        // Timeout para a chamada do Supabase
        const sessionPromise = supabase.auth.getSession()
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout ao verificar sessão')), 5000)
        )
        
        const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise])
        
        if (session?.user) {
          setUser(session.user)
          setIsAuthenticated(true)
          // Carrega userInfo sem bloquear
          loadUserInfo(session.user.id).catch(err => {
            console.error('Erro ao carregar userInfo:', err)
          })
        }
      } catch (error) {
        console.error('Erro ao verificar sessão:', error)
        // Mesmo com erro, permite continuar
      } finally {
        clearTimeout(loadingTimeout)
        setLoading(false)
      }
    }

    checkSession()

    // Escuta mudanças na autenticação
    let subscription = null
    try {
      const { data: { subscription: sub } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
          try {
        if (session?.user) {
          setUser(session.user)
          setIsAuthenticated(true)
              // Carrega userInfo sem bloquear
              loadUserInfo(session.user.id).catch(err => {
                console.error('Erro ao carregar userInfo:', err)
              })
        } else {
          setUser(null)
          setUserInfo(null)
          setIsAuthenticated(false)
        }
          } catch (err) {
            console.error('Erro no onAuthStateChange:', err)
          } finally {
            clearTimeout(loadingTimeout)
        setLoading(false)
      }
        }
      )
      subscription = sub
    } catch (err) {
      console.error('Erro ao configurar onAuthStateChange:', err)
      clearTimeout(loadingTimeout)
      setLoading(false)
    }

    return () => {
      clearTimeout(loadingTimeout)
      if (subscription) {
      subscription.unsubscribe()
      }
    }
  }, [])

  // Verifica se há dados de QR Code na URL ou localStorage (deve estar antes de qualquer return)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const qrParam = urlParams.get('qr')
    const signupParam = urlParams.get('signup')
    
    // Se houver parâmetro signup=true na URL, mostra o signup
    if (signupParam === 'true') {
      setShowSignup(true)
    }
    
    if (qrParam) {
      try {
        const qrData = decodeURIComponent(qrParam)
        localStorage.setItem('qr_signup_data', qrData)
        setQrCodeData(qrData)
        setShowSignup(true)
      } catch (err) {
        console.error('Erro ao processar QR Code da URL:', err)
      }
    } else {
      // Se não há qr na URL, verifica localStorage
      const storedQRData = localStorage.getItem('qr_signup_data')
      if (storedQRData) {
        try {
          const qrData = JSON.parse(storedQRData)
          if (qrData.type === 'morador_signup') {
            setQrCodeData(storedQRData)
            setShowSignup(true)
          }
        } catch (err) {
          console.error('Erro ao processar QR Code do localStorage:', err)
        }
      }
    }
  }, [])

  const handleLogin = async (userData) => {
    try {
      setUser(userData)
      setIsAuthenticated(true)
      setShowSignup(false)
      // Força o recarregamento do userInfo após login
      if (userData?.id) {
        console.log('Recarregando userInfo após login para usuário:', userData.id)
        // Não bloqueia se loadUserInfo falhar
        loadUserInfo(userData.id).catch(err => {
          console.error('Erro ao carregar userInfo após login:', err)
          // Define valores padrão para não travar
          setUserInfo({ role: null, condominio_id: null, unidade: null, is_sindico: false })
        })
      }
    } catch (error) {
      console.error('Erro no handleLogin:', error)
      // Garante que a aplicação não trave
      setUserInfo({ role: null, condominio_id: null, unidade: null, is_sindico: false })
    }
  }

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
      setUser(null)
      setIsAuthenticated(false)
    } catch (error) {
      console.error('Erro ao fazer logout:', error)
    }
  }

  // Se houver erro crítico, mostra mensagem de erro
  if (hasError) {
    return (
      <div className="App">
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100vh',
          padding: '20px',
          textAlign: 'center',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white'
        }}>
          <h2>Erro ao carregar a aplicação</h2>
          <p style={{ marginTop: '10px', marginBottom: '20px' }}>
            {errorMessage || 'Ocorreu um erro inesperado. Por favor, recarregue a página.'}
          </p>
          <button 
            onClick={() => window.location.reload()} 
            style={{
              padding: '10px 20px',
              backgroundColor: 'white',
              color: '#667eea',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            Recarregar Página
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="App">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <p>Carregando...</p>
        </div>
      </div>
    )
  }

  // Função para renderizar o dashboard apropriado baseado no role
  const renderDashboard = () => {
    try {
      // Debug: log das informações do usuário
      console.log('========================================')
      console.log('🔍 RENDERIZANDO DASHBOARD')
      console.log('userInfo completo:', JSON.stringify(userInfo, null, 2))
      console.log('userInfo.role:', userInfo?.role)
      console.log('userInfo.is_sindico:', userInfo?.is_sindico)
      console.log('Tipo de is_sindico:', typeof userInfo?.is_sindico)
      console.log('user.id:', user?.id)
      console.log('user.email:', user?.email)
      console.log('========================================')
      
      if (!userInfo || !userInfo.role) {
        console.error('❌ ERRO: userInfo ou role não disponível!')
        console.error('userInfo:', userInfo)
        console.error('userInfo?.role:', userInfo?.role)
        console.error('user?.id:', user?.id)
        console.error('user?.email:', user?.email)
        console.error('')
        console.error('🔧 SOLUÇÃO:')
        console.error('   1. Verifique se o usuário existe na tabela users:')
        console.error('      SELECT * FROM users WHERE id = \'' + (user?.id || 'USER_ID') + '\';')
        console.error('   2. Se não existir, execute criar_usuarios_completo.sql')
        console.error('   3. Recarregue a página após criar o usuário')
        console.log('⚠️ Usando Dashboard padrão (Comgás)')
        return <Dashboard onLogout={handleLogout} user={user} userInfo={userInfo} />
      }

      // Normaliza o role para lowercase para comparação
      const normalizedRole = userInfo.role?.toLowerCase()
      
      // Verifica se é síndico (zelador com flag is_sindico = true OU role='sindico')
      // IMPORTANTE: Verifica explicitamente se is_sindico é true (não apenas truthy)
      const isSindico = (normalizedRole === 'zelador' && userInfo.is_sindico === true) || normalizedRole === 'sindico'
      console.log('🔍 Verificação de síndico:', {
        role: userInfo.role,
        normalizedRole: normalizedRole,
        is_sindico: userInfo.is_sindico,
        roleIsZelador: normalizedRole === 'zelador',
        roleIsSindico: normalizedRole === 'sindico',
        isSindicoCheck: isSindico
      })

      if (isSindico) {
        console.log('✅ Usuário identificado como SÍNDICO')
        console.log('📊 Renderizando SindicoDashboard')
        return <SindicoDashboard onLogout={handleLogout} user={user} userInfo={userInfo} />
      }

      // Se for zelador mas não é síndico
      if (normalizedRole === 'zelador') {
        console.log('✅ Usuário identificado como ZELADOR (não síndico)')
        console.log('📊 Renderizando ZeladorDashboard')
        return <ZeladorDashboard onLogout={handleLogout} user={user} userInfo={userInfo} />
      }

      // Verifica role específico (já normalizado acima)
      console.log('🔍 Verificando role específico:', normalizedRole)

      switch (normalizedRole) {
        case 'morador':
          console.log('✅ Usuário identificado como MORADOR')
          console.log('📊 Renderizando MoradorDashboard')
          return <MoradorDashboard onLogout={handleLogout} user={user} userInfo={userInfo} />
        case 'comgas':
          console.log('✅ Usuário identificado como COMGÁS')
          console.log('📊 Renderizando Dashboard (Comgás)')
          return <Dashboard onLogout={handleLogout} user={user} userInfo={userInfo} />
        default:
          console.error('❌ ERRO: Role desconhecido ou inválido:', userInfo.role)
          console.error('📋 Role recebido:', JSON.stringify(userInfo.role))
          console.error('📋 Tipo do role:', typeof userInfo.role)
          console.log('⚠️ Usando Dashboard padrão (Comgás)')
          return <Dashboard onLogout={handleLogout} user={user} userInfo={userInfo} />
      }
    } catch (error) {
      console.error('❌ ERRO ao renderizar dashboard:', error)
      console.error('Stack:', error.stack)
      // Em caso de erro, renderiza o dashboard padrão
      return <Dashboard onLogout={handleLogout} user={user} userInfo={userInfo} />
    }
  }

  return (
    <div className="App">
      {!isAuthenticated ? (
        showSignup ? (
          <Signup 
            onSignup={handleLogin} 
            onShowLogin={() => setShowSignup(false)}
            qrCodeData={qrCodeData}
          />
        ) : (
          <Login onLogin={handleLogin} onShowSignup={() => setShowSignup(true)} />
        )
      ) : loadingUserInfo ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
          <div style={{ fontSize: '18px', marginBottom: '20px' }}>Carregando informações do usuário...</div>
          <div style={{ fontSize: '14px', color: '#666' }}>Aguarde enquanto verificamos seu perfil</div>
        </div>
      ) : (
        renderDashboard()
      )}
    </div>
  )
}

export default App

