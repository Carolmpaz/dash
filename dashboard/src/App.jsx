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
  const [showSignup, setShowSignup] = useState(false)
  const [loading, setLoading] = useState(true)
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
          console.log('Usuário não encontrado na tabela users. Configure o perfil do usuário no Supabase.')
        } else {
          console.warn('Erro ao carregar informações do usuário:', userError.message)
        }
      }

      if (userData) {
        // Garante que is_sindico seja um booleano (pode ser null se o campo não existir)
        const userInfoWithDefaults = {
          ...userData,
          is_sindico: userData.is_sindico === true // Converte para boolean explícito
        }
        console.log('========================================')
        console.log('UserInfo carregado do banco:', userInfoWithDefaults)
        console.log('Role:', userInfoWithDefaults.role)
        console.log('is_sindico (tipo):', typeof userInfoWithDefaults.is_sindico)
        console.log('is_sindico (valor):', userInfoWithDefaults.is_sindico)
        console.log('É síndico?', userInfoWithDefaults.role === 'zelador' && userInfoWithDefaults.is_sindico === true)
        console.log('========================================')
        setUserInfo(userInfoWithDefaults)
        return
      }

      // Se não encontrou, tenta usar a função get_user_info
      try {
        const rpcPromise = supabase.rpc('get_user_info')
        const { data: functionData, error: functionError } = await Promise.race([rpcPromise, timeoutPromise])

        if (functionError) {
          console.warn('Função get_user_info não disponível:', functionError.message)
        } else if (functionData && functionData.length > 0) {
          setUserInfo(functionData[0])
          return
        }
      } catch (rpcError) {
        console.warn('Erro ao chamar função get_user_info:', rpcError.message)
      }

      // Se chegou aqui, não encontrou informações - define valores padrão
      console.warn('Não foi possível carregar informações do usuário. Usando valores padrão.')
      setUserInfo({ role: null, condominio_id: null, unidade: null, is_sindico: false })
    } catch (err) {
      console.error('Erro inesperado ao carregar informações do usuário:', err)
      // Define valores padrão mesmo em caso de erro
      setUserInfo({ role: null, condominio_id: null, unidade: null, is_sindico: false })
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
    setUser(userData)
    setIsAuthenticated(true)
    setShowSignup(false)
    // Força o recarregamento do userInfo após login
    if (userData?.id) {
      console.log('Recarregando userInfo após login para usuário:', userData.id)
      await loadUserInfo(userData.id)
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
    // Debug: log das informações do usuário
    console.log('========================================')
    console.log('RENDERIZANDO DASHBOARD')
    console.log('userInfo completo:', JSON.stringify(userInfo, null, 2))
    console.log('userInfo.role:', userInfo?.role)
    console.log('userInfo.is_sindico:', userInfo?.is_sindico)
    console.log('Tipo de is_sindico:', typeof userInfo?.is_sindico)
    console.log('user.id:', user?.id)
    console.log('========================================')
    
    if (!userInfo || !userInfo.role) {
      console.log('⚠️ userInfo ou role não disponível, usando Dashboard padrão (Comgás)')
      return <Dashboard onLogout={handleLogout} user={user} userInfo={userInfo} />
    }

    // Verifica se é síndico (zelador com flag is_sindico = true)
    // IMPORTANTE: Verifica explicitamente se is_sindico é true (não apenas truthy)
    const isSindico = userInfo.role === 'zelador' && userInfo.is_sindico === true
    console.log('Verificação de síndico:', {
      role: userInfo.role,
      is_sindico: userInfo.is_sindico,
      roleIsZelador: userInfo.role === 'zelador',
      isSindicoCheck: isSindico
    })

    if (isSindico) {
      console.log(' Usuário identificado como Síndico (zelador com is_sindico=true)')
      return <SindicoDashboard onLogout={handleLogout} user={user} userInfo={userInfo} />
    }

    // Se for zelador mas não é síndico
    if (userInfo.role === 'zelador') {
      console.log(' Usuário identificado como Zelador (não síndico)')
      return <ZeladorDashboard onLogout={handleLogout} user={user} userInfo={userInfo} />
    }

    switch (userInfo.role) {
      case 'morador':
        console.log(' Usuário identificado como Morador')
        return <MoradorDashboard onLogout={handleLogout} user={user} userInfo={userInfo} />
      case 'comgas':
        console.log(' Usuário identificado como Comgás')
        return <Dashboard onLogout={handleLogout} user={user} userInfo={userInfo} />
      default:
        console.log('⚠️ Role desconhecido:', userInfo.role, '- usando Dashboard padrão (Comgás)')
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
      ) : (
        renderDashboard()
      )}
    </div>
  )
}

export default App

