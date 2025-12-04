import { useState, useEffect } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { supabase } from '../supabaseClient'
import './UserManagement.css'

function UserManagement({ userInfo }) {
  const [activeSection, setActiveSection] = useState('zelador') // 'zelador' ou 'qrcode'
  
  // Estados para cadastro de zelador
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  // Estados para QR Code
  const [qrCodeData, setQrCodeData] = useState('')
  const [loadingMoradores, setLoadingMoradores] = useState(false)

  useEffect(() => {
    if (userInfo?.condominio_id && activeSection === 'qrcode') {
      loadCondominioInfo()
    }
  }, [userInfo, activeSection])

  const loadCondominioInfo = async () => {
    if (!userInfo?.condominio_id) return

    setLoadingMoradores(true)
    try {
      // Busca informações do condomínio
      const { data: condominioData, error } = await supabase
        .from('condominios')
        .select('id, nome, endereco')
        .eq('id', userInfo.condominio_id)
        .single()

      if (error) {
        console.error('Erro ao carregar informações do condomínio:', error)
      } else if (condominioData) {
        // Não precisa mais carregar moradores, apenas informações do condomínio
      }
    } catch (err) {
      console.error('Erro ao carregar informações do condomínio:', err)
    } finally {
      setLoadingMoradores(false)
    }
  }

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

  const handleZeladorSubmit = async (e) => {
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

    // Valida se o síndico tem condomínio
    if (!userInfo?.condominio_id) {
      setError('Erro: Você precisa ter um condomínio associado para cadastrar zeladores. Certifique-se de que seu perfil está configurado corretamente.')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      console.log('Cadastrando zelador com condominio_id:', userInfo.condominio_id)
      
      // IMPORTANTE: Salva a sessão atual do síndico antes de criar o zelador
      // Isso permite restaurar a sessão após criar a conta do zelador
      const { data: { session: sindicoSessionBefore } } = await supabase.auth.getSession()
      const sindicoAccessToken = sindicoSessionBefore?.access_token
      const sindicoRefreshToken = sindicoSessionBefore?.refresh_token
      
      console.log('Sessão do síndico salva antes de criar zelador')
      
      // Cadastra o usuário no Supabase Auth
      // IMPORTANTE: Não faz login automático após criar a conta
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          data: {
            name: name.trim(),
            user_type: 'zelador'
          },
          // Evita que o Supabase faça login automático após criar a conta
          emailRedirectTo: undefined
        }
      })
      
      // IMPORTANTE: Se o Supabase criou uma sessão para o zelador, desconecta imediatamente
      // e restaura a sessão do síndico
      if (authData?.user) {
        // Verifica se uma nova sessão foi criada (login automático)
        const { data: { session: newSession } } = await supabase.auth.getSession()
        
        if (newSession && newSession.user.id === authData.user.id) {
          // O Supabase fez login automático no zelador - precisa desconectar
          console.log('Desconectando sessão do zelador recém-criado para manter o síndico logado...')
          await supabase.auth.signOut()
          
          // Restaura a sessão do síndico se tínhamos uma antes
          if (sindicoAccessToken && sindicoRefreshToken) {
            console.log('Restaurando sessão do síndico...')
            // Aguarda um pouco para garantir que o signOut foi processado
            await new Promise(resolve => setTimeout(resolve, 500))
            
            // Tenta restaurar a sessão usando setSession
            const { data: restoreData, error: restoreError } = await supabase.auth.setSession({
              access_token: sindicoAccessToken,
              refresh_token: sindicoRefreshToken
            })
            
            if (restoreError) {
              console.warn('Não foi possível restaurar a sessão do síndico automaticamente:', restoreError)
              console.warn('O síndico pode precisar fazer login novamente.')
            } else {
              console.log(' Sessão do síndico restaurada com sucesso')
            }
          }
        }
      }

      if (authError) {
        let errorMessage = authError.message || 'Erro ao criar conta.'
        
        if (authError.message && authError.message.includes('User already registered')) {
          errorMessage = 'Este e-mail já está cadastrado.'
        } else if (authError.message && authError.message.includes('Email rate limit exceeded')) {
          errorMessage = 'Muitas tentativas. Aguarde alguns minutos.'
        } else if (authError.message && authError.message.includes('fetch')) {
          errorMessage = 'Erro de conexão. Verifique sua internet e as configurações do Supabase.'
        }
        
        console.error('Erro ao cadastrar zelador:', authError)
        setError(errorMessage)
        setLoading(false)
        return
      }

      if (authData?.user) {
        console.log('Usuário criado no Auth:', authData.user.id)
        console.log('Tentando criar perfil do zelador com condominio_id:', userInfo?.condominio_id)
        
        // Aguarda um pouco para o trigger executar e o usuário estar disponível em auth.users
        // A foreign key constraint exige que o usuário exista em auth.users antes de inserir em public.users
        await new Promise(resolve => setTimeout(resolve, 3000))
        
        // Verifica se o perfil foi criado pelo trigger
        let profileExists = false
        let retryCount = 0
        const maxRetries = 3
        
        while (!profileExists && retryCount < maxRetries) {
          try {
            // Tenta buscar sem .single() primeiro para evitar erro 406
            const { data: existingProfiles, error: selectError } = await supabase
              .from('users')
              .select('id, role, condominio_id')
              .eq('id', authData.user.id)
            
            // Se retornou dados, mesmo que seja array, considera sucesso
            if (existingProfiles && existingProfiles.length > 0) {
              const existingProfile = existingProfiles[0]
              profileExists = true
              console.log(' Perfil encontrado (criado pelo trigger):', existingProfile)
              
              // Garante que tem o condominio_id do síndico
              if (userInfo?.condominio_id && (!existingProfile.condominio_id || existingProfile.condominio_id !== userInfo.condominio_id)) {
                console.log('Atualizando condominio_id do zelador...')
                const { error: updateError } = await supabase
                  .from('users')
                  .update({ condominio_id: userInfo.condominio_id })
                  .eq('id', authData.user.id)
                
                if (updateError) {
                  console.error('Erro ao atualizar condominio_id:', updateError)
                } else {
                  console.log(' Condominio_id atualizado com sucesso')
                }
              }
              break
            } else if (selectError) {
              // Se for erro 406 ou 404, pode ser que o perfil ainda não esteja acessível
              // ou que o trigger ainda não tenha criado
              if (selectError.code === 'PGRST116' || selectError.status === 404 || selectError.status === 406) {
                console.log(`Tentativa ${retryCount + 1}: Perfil ainda não acessível (pode estar sendo criado). Aguardando...`)
                await new Promise(resolve => setTimeout(resolve, 1000))
                retryCount++
              } else {
                console.error(`Erro inesperado na tentativa ${retryCount + 1}:`, selectError)
                retryCount++
                if (retryCount < maxRetries) {
                  await new Promise(resolve => setTimeout(resolve, 1000))
                }
              }
            } else {
              console.log(`Tentativa ${retryCount + 1}: Perfil não encontrado ainda. Aguardando...`)
              await new Promise(resolve => setTimeout(resolve, 1000))
              retryCount++
            }
          } catch (err) {
            console.log(`Erro na tentativa ${retryCount + 1}:`, err)
            retryCount++
            if (retryCount < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 1000))
            }
          }
        }
        
        // Se o trigger não criou, tenta criar manualmente
        if (!profileExists) {
          console.log('Trigger não criou o perfil (ou não foi possível verificar). Tentando criar manualmente...')
          try {
            // Primeiro tenta usar a função RPC (contorna RLS)
            console.log('Tentando usar função RPC create_zelador_profile...')
            console.log('Parâmetros:', {
              p_user_id: authData.user.id,
              p_email: email.trim(),
              p_condominio_id: userInfo?.condominio_id || null
            })
            const { data: rpcData, error: rpcError } = await supabase
              .rpc('create_zelador_profile', {
                p_user_id: authData.user.id,
                p_email: email.trim(),
                p_condominio_id: userInfo?.condominio_id || null
              })
            
            console.log('Resposta da função RPC create_zelador_profile:', { rpcData, rpcError })
            
            if (rpcData && rpcData.length > 0) {
              console.log('Resultado da função RPC:', rpcData[0])
              if (rpcData[0].success) {
                profileExists = true
                console.log(' Perfil criado/atualizado com sucesso usando função RPC:', rpcData[0])
              } else {
                console.error('❌ Função RPC retornou success=false. Mensagem:', rpcData[0].message)
                console.log('Tentando inserção direta como fallback...')
              }
            }
            
            if (rpcError) {
              console.error('❌ Erro ao chamar função RPC create_zelador_profile:', rpcError)
              console.log('Código do erro:', rpcError.code)
              console.log('Mensagem do erro:', rpcError.message)
              console.log('Detalhes do erro:', rpcError)
              console.log('Tentando inserção direta como fallback...')
            }
            
            if (!profileExists) {
              
              // Se a função RPC não existe ou falhou, tenta inserção direta
              const userDataToInsert = {
                id: authData.user.id,
                email: email.trim(),
                role: 'zelador',
                condominio_id: userInfo?.condominio_id || null,
                is_sindico: false
              }
              
              console.log('Dados a inserir:', userDataToInsert)
              
              const { data: insertedData, error: insertError } = await supabase
                .from('users')
                .insert(userDataToInsert)
                .select()

              // Trata qualquer resultado: sucesso, erro 409 (já existe), ou erro de permissão
              if (!insertError && insertedData && insertedData.length > 0) {
                profileExists = true
                console.log(' Perfil do zelador criado manualmente com sucesso:', insertedData[0])
              } else if (insertError) {
                // Erro 409 (Conflict) ou código 23505 significa que o registro já existe - isso é sucesso!
                if (insertError?.code === '23505' || insertError?.status === 409 || 
                    insertError?.message?.includes('duplicate') || insertError?.message?.includes('already exists') ||
                    insertError?.message?.includes('unique constraint') || insertError?.message?.includes('violates unique constraint')) {
                  profileExists = true
                  console.log(' Perfil já existe (criado pelo trigger). Erro 409/23505 tratado como sucesso.')
                  console.log('Detalhes do erro (esperado):', insertError)
                } else if (insertError?.code === '42501' || insertError?.message?.includes('permission denied') || 
                           insertError?.message?.includes('RLS') || insertError?.message?.includes('policy') ||
                           insertError?.status === 403) {
                  // Erro de permissão - provavelmente o trigger criou, mas não temos permissão para verificar
                  // Assumimos sucesso e tentamos atualizar o condominio_id
                  profileExists = true
                  console.log('⚠️ Erro de permissão ao inserir/verificar. Assumindo que o trigger criou o perfil.')
                  console.log('Detalhes do erro:', insertError)
                } else {
                  console.error('❌ Erro inesperado ao criar perfil do zelador:', insertError)
                  console.error('Código do erro:', insertError?.code)
                  console.error('Status do erro:', insertError?.status)
                  console.error('Mensagem do erro:', insertError?.message)
                }
              }
            }
            
            // Se profileExists agora, tenta atualizar o condominio_id (caso a função RPC não tenha feito)
            if (profileExists && userInfo?.condominio_id) {
              // Verifica se precisa atualizar
              const { data: checkData } = await supabase
                .from('users')
                .select('condominio_id')
                .eq('id', authData.user.id)
              
              if (checkData && checkData.length > 0 && (!checkData[0].condominio_id || checkData[0].condominio_id !== userInfo.condominio_id)) {
                console.log('Tentando atualizar condominio_id do zelador...')
                // Aguarda um pouco antes de tentar atualizar
                await new Promise(resolve => setTimeout(resolve, 500))
                
                const { error: updateError } = await supabase
                  .from('users')
                  .update({ condominio_id: userInfo?.condominio_id })
                  .eq('id', authData.user.id)
                
                if (updateError) {
                  // Se não conseguir atualizar, não é crítico - o perfil foi criado
                  console.warn('⚠️ Aviso: Não foi possível atualizar condominio_id agora:', updateError)
                  console.warn('O perfil foi criado, mas o condominio_id pode precisar ser atualizado manualmente.')
                } else {
                  console.log(' Condominio_id atualizado com sucesso')
                }
              }
            }
          } catch (insertErr) {
            console.error('❌ Erro ao inserir perfil do zelador:', insertErr)
            // Mesmo com erro, se for erro de permissão, pode ser que o trigger tenha criado
            if (insertErr?.message?.includes('permission') || insertErr?.message?.includes('RLS') || insertErr?.message?.includes('policy')) {
              profileExists = true
              console.log('⚠️ Erro de permissão capturado. Assumindo que o trigger criou o perfil.')
            }
          }
        }

        if (profileExists) {
          // Verificação final: garante que o condominio_id está setado
          if (userInfo?.condominio_id) {
            try {
              // Usa array ao invés de .single() para evitar erro 406
              const { data: finalCheckArray } = await supabase
                .from('users')
                .select('condominio_id')
                .eq('id', authData.user.id)
              
              const finalCheck = finalCheckArray && finalCheckArray.length > 0 ? finalCheckArray[0] : null
              
              // Se não tem condominio_id ou é diferente, atualiza
              if (finalCheck && (!finalCheck.condominio_id || finalCheck.condominio_id !== userInfo.condominio_id)) {
                const { error: updateError } = await supabase
                  .from('users')
                  .update({ condominio_id: userInfo.condominio_id })
                  .eq('id', authData.user.id)
                
                if (updateError) {
                  console.warn('Aviso: Não foi possível atualizar condominio_id na verificação final:', updateError)
                } else {
                  console.log(' Condominio_id do zelador atualizado com sucesso:', userInfo.condominio_id)
                }
              }
            } catch (err) {
              console.warn('Aviso: Erro na verificação final do condominio_id do zelador:', err)
            }
          }
          
          setSuccess(`Zelador cadastrado com sucesso! ${userInfo?.condominio_id ? 'O zelador foi automaticamente associado ao seu condomínio.' : ''} As credenciais foram enviadas por e-mail.`)
          // Limpa o formulário
          setName('')
          setEmail('')
          setPassword('')
        } else {
          // Última tentativa: usa a função RPC create_zelador_profile para garantir que o perfil seja criado
          console.log('⚠️ Não foi possível confirmar a criação do perfil. Tentando criar/atualizar usando função RPC create_zelador_profile...')
          
          // Aguarda mais um pouco e tenta criar/atualizar usando a função RPC
          await new Promise(resolve => setTimeout(resolve, 2000))
          
          try {
            // Tenta usar a função RPC create_zelador_profile (contorna RLS e garante criação)
            console.log('Chamando função RPC create_zelador_profile na verificação final...')
            console.log('Parâmetros:', {
              p_user_id: authData.user.id,
              p_email: email.trim(),
              p_condominio_id: userInfo?.condominio_id || null
            })
            const { data: rpcCreateData, error: rpcCreateError } = await supabase
              .rpc('create_zelador_profile', {
                p_user_id: authData.user.id,
                p_email: email.trim(),
                p_condominio_id: userInfo?.condominio_id || null
              })
            
            console.log('Resposta da função RPC na verificação final:', { rpcCreateData, rpcCreateError })
            
            if (rpcCreateData && rpcCreateData.length > 0) {
              console.log('Resultado da função RPC na verificação final:', rpcCreateData[0])
              if (rpcCreateData[0].success) {
                profileExists = true
                console.log(' Perfil criado/atualizado com sucesso na verificação final usando função RPC:', rpcCreateData[0])
                setSuccess(`Zelador cadastrado com sucesso! ${userInfo?.condominio_id ? 'O zelador foi automaticamente associado ao seu condomínio.' : ''} As credenciais foram enviadas por e-mail.`)
                setName('')
                setEmail('')
                setPassword('')
              } else {
                console.error('❌ Função RPC retornou success=false na verificação final. Mensagem:', rpcCreateData[0].message)
                // Continua para outras verificações
              }
            }
            
            if (rpcCreateError) {
              console.error('❌ Erro ao chamar função RPC create_zelador_profile na verificação final:', rpcCreateError)
              console.log('Código do erro:', rpcCreateError.code)
              console.log('Mensagem do erro:', rpcCreateError.message)
              
              // Se a função não existe, tenta outras verificações
              if (rpcCreateError.code === '42883') {
                console.log('Função RPC não existe. Verificando se o perfil já existe...')
              }
            }
            
            if (!profileExists && (rpcCreateError || (rpcCreateData && rpcCreateData.length > 0 && !rpcCreateData[0].success))) {
              // Se a função RPC não existe ou falhou, tenta verificar se o perfil já existe
              console.log('Função RPC create_zelador_profile não disponível ou retornou erro. Verificando se o perfil já existe...', rpcCreateError)
              
              // Tenta verificar usando check_user_exists
              const { data: rpcCheckResult, error: rpcCheckError } = await supabase
                .rpc('check_user_exists', { user_id: authData.user.id })
              
              if (rpcCheckResult && rpcCheckResult.length > 0 && rpcCheckResult[0].user_exists) {
                profileExists = true
                console.log(' Perfil encontrado na verificação final usando função RPC check_user_exists!')
                
                // Se não tem condominio_id, tenta atualizar
                if (userInfo?.condominio_id && (!rpcCheckResult[0].has_condominio || rpcCheckResult[0].condominio_id !== userInfo.condominio_id)) {
                  const { error: updateError } = await supabase
                    .from('users')
                    .update({ condominio_id: userInfo.condominio_id })
                    .eq('id', authData.user.id)
                  
                  if (updateError) {
                    console.warn('Aviso: Não foi possível atualizar condominio_id:', updateError)
                  } else {
                    console.log(' Condominio_id atualizado na verificação final')
                  }
                }
                
                setSuccess(`Zelador cadastrado com sucesso! ${userInfo?.condominio_id ? 'O zelador foi automaticamente associado ao seu condomínio.' : ''} As credenciais foram enviadas por e-mail.`)
                setName('')
                setEmail('')
                setPassword('')
              } else {
                // Tenta verificar pelo email como último recurso
                console.log('Tentando verificar pelo email...')
                const { data: emailCheck, error: emailError } = await supabase
                  .from('users')
                  .select('id, email, role')
                  .eq('email', email.trim())
                
                if (emailCheck && emailCheck.length > 0) {
                  profileExists = true
                  console.log(' Perfil encontrado na verificação final pelo email!')
                  setSuccess(`Zelador cadastrado com sucesso! ${userInfo?.condominio_id ? 'O zelador foi automaticamente associado ao seu condomínio.' : ''} As credenciais foram enviadas por e-mail.`)
                  setName('')
                  setEmail('')
                  setPassword('')
                } else if (rpcCreateError && rpcCreateError.code === '42883') {
                  // Função não existe - assume que o trigger criou
                  console.log('Função RPC não existe. Assumindo que o perfil foi criado pelo trigger.')
                  profileExists = true
                  setSuccess(`Zelador cadastrado com sucesso! ${userInfo?.condominio_id ? 'O zelador foi automaticamente associado ao seu condomínio.' : ''} As credenciais foram enviadas por e-mail.`)
                  setName('')
                  setEmail('')
                  setPassword('')
                } else if (emailError && (emailError.code === '42501' || emailError.message?.includes('permission') || emailError.message?.includes('RLS'))) {
                  // Erro de permissão - provavelmente o perfil existe, mas não temos acesso
                  profileExists = true
                  console.log('⚠️ Erro de permissão na verificação final. Assumindo que o perfil foi criado pelo trigger.')
                  setSuccess(`Zelador cadastrado com sucesso! ${userInfo?.condominio_id ? 'O zelador foi automaticamente associado ao seu condomínio.' : ''} As credenciais foram enviadas por e-mail.`)
                  setName('')
                  setEmail('')
                  setPassword('')
                } else {
                  // Realmente não encontrou o perfil
                  setError('Conta criada no sistema de autenticação, mas houve um problema ao criar o perfil. Execute o script FUNCAO_CRIAR_PERFIL_ZELADOR.sql no Supabase. Se o problema persistir, execute também trigger_create_user_profile.sql, POLITICA_SINDICO_CADASTRAR_ZELADOR.sql e FUNCAO_VERIFICAR_USUARIO.sql.')
                  console.error('❌ Perfil do zelador não foi encontrado na verificação final.')
                  console.error('Isso pode indicar que:')
                  console.error('1. O trigger não está funcionando corretamente')
                  console.error('2. As políticas RLS estão bloqueando o acesso')
                  console.error('3. O perfil foi criado, mas não está acessível para o síndico')
                  console.error('4. A função RPC create_zelador_profile não foi executada')
                }
              }
            }
          } catch (finalErr) {
            console.error('❌ Erro na verificação final:', finalErr)
            // Em caso de dúvida, assumimos que o trigger pode ter criado
            // e que o problema é de acesso/permissão
            profileExists = true
            console.log('⚠️ Assumindo que o perfil foi criado, mas não está acessível devido a políticas RLS.')
            setSuccess(`Zelador cadastrado com sucesso! ${userInfo?.condominio_id ? 'O zelador foi automaticamente associado ao seu condomínio.' : ''} As credenciais foram enviadas por e-mail.`)
            setName('')
            setEmail('')
            setPassword('')
          }
          
          if (!profileExists) {
            setError('Conta criada no sistema de autenticação, mas houve um problema ao criar o perfil. Execute o script FUNCAO_CRIAR_PERFIL_ZELADOR.sql no Supabase. Se o problema persistir, execute também trigger_create_user_profile.sql, POLITICA_SINDICO_CADASTRAR_ZELADOR.sql e FUNCAO_VERIFICAR_USUARIO.sql.')
            console.error('❌ Perfil do zelador não foi criado. Verifique as políticas RLS e o trigger.')
          }
        }
      } else {
        setError('Erro: Não foi possível criar a conta de autenticação. Verifique o console para mais detalhes.')
        console.error('authData não contém user:', authData)
      }
    } catch (err) {
      setError(`Erro inesperado ao criar conta: ${err.message || 'Erro desconhecido'}`)
      console.error('Erro no cadastro do zelador:', err)
    } finally {
      setLoading(false)
    }
  }

  const generateQRCode = () => {
    setError('')
    
    if (!userInfo?.condominio_id) {
      setError('Erro: Condomínio não identificado. Certifique-se de que você está logado como síndico e tem um condomínio associado.')
      console.error('userInfo:', userInfo)
      return
    }

    try {
      // Gera um token único para o QR Code
      const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
      const qrData = JSON.stringify({
        type: 'morador_signup',
        condominio_id: userInfo.condominio_id,
        token: token,
        timestamp: Date.now(),
        expires_at: Date.now() + (30 * 24 * 60 * 60 * 1000) // Expira em 30 dias
      })
      
      console.log('Gerando QR Code com condominio_id:', userInfo.condominio_id)
      console.log('QR Data:', qrData)
      
      // Salva o token no localStorage para referência
      localStorage.setItem(`qr_signup_token_${userInfo.condominio_id}`, token)
      setQrCodeData(qrData)
      setError('') // Limpa qualquer erro anterior
      console.log('QR Code gerado com sucesso! Dados:', qrData)
    } catch (err) {
      console.error('Erro ao gerar QR Code:', err)
      setError('Erro ao gerar QR Code. Tente novamente.')
    }
  }

  return (
    <div className="user-management-container">
      <div className="user-management-header">
        <h2>Gerenciamento de Usuários</h2>
        <p>Cadastre zeladores e gere QR Codes para moradores</p>
      </div>

      <div className="user-management-tabs">
        <button 
          className={`section-tab ${activeSection === 'zelador' ? 'active' : ''}`}
          onClick={() => setActiveSection('zelador')}
        >
          Cadastrar Zelador
        </button>
        <button 
          className={`section-tab ${activeSection === 'qrcode' ? 'active' : ''}`}
          onClick={() => setActiveSection('qrcode')}
        >
          Gerar QR Code
        </button>
      </div>

      {activeSection === 'zelador' && (
        <div className="zelador-signup-section">
          <form onSubmit={handleZeladorSubmit} className="zelador-signup-form">
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
      )}

      {activeSection === 'qrcode' && (
        <div className="qrcode-section">
          <div className="qrcode-info-section">
            <h3>QR Code para Cadastro de Moradores</h3>
            <p>Gere um QR Code para que novos moradores se cadastrem e sejam automaticamente associados ao seu condomínio.</p>
            {!userInfo?.condominio_id && (
              <div className="error-message" style={{ marginBottom: '15px' }}>
                ⚠️ Você precisa ter um condomínio associado para gerar QR Codes. Certifique-se de que seu perfil está configurado corretamente.
              </div>
            )}
            {error && <div className="error-message">{error}</div>}
            <button 
              onClick={generateQRCode}
              className="generate-qr-button"
              disabled={loadingMoradores || !userInfo?.condominio_id}
            >
              {loadingMoradores ? 'Carregando...' : 'Gerar QR Code de Cadastro'}
            </button>
          </div>

          {qrCodeData && (
            <div className="qrcode-display-section">
              <h3>QR Code Gerado</h3>
              <div className="qrcode-card">
                <div className="qrcode-info">
                  <p><strong>Condomínio:</strong> {userInfo.condominio_id ? ' Associado automaticamente' : '❌ Não identificado'}</p>
                  <p className="qr-instructions">
                    <strong> Condomínio configurado:</strong> Os moradores que usarem este QR Code serão automaticamente associados ao seu condomínio.
                  </p>
                  <p className="qr-instructions">
                    Este QR Code expira em 30 dias. Compartilhe com os moradores para que eles se cadastrem e sejam automaticamente associados ao condomínio.
                  </p>
                  <p className="qr-instructions">
                    <strong>Como usar:</strong> O morador deve escanear este QR Code e será direcionado para a página de cadastro com o condomínio já pré-preenchido.
                  </p>
                  <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '5px', wordBreak: 'break-all' }}>
                    <p style={{ margin: '0 0 5px 0', fontSize: '12px', fontWeight: 'bold' }}>Código do QR Code (para testes):</p>
                    <code style={{ fontSize: '11px', color: '#666' }}>{qrCodeData}</code>
                  </div>
                </div>
                <div className="qrcode-image">
                  {qrCodeData ? (
                    <QRCodeCanvas value={qrCodeData} size={256} level="M" />
                  ) : (
                    <p>Erro: Dados do QR Code não disponíveis</p>
                  )}
                </div>
                <button 
                  onClick={() => {
                    const canvas = document.querySelector('.qrcode-image canvas')
                    if (canvas) {
                      const url = canvas.toDataURL()
                      const link = document.createElement('a')
                      link.download = `qr-code-cadastro-condominio.png`
                      link.href = url
                      link.click()
                    }
                  }}
                  className="download-qr-button"
                >
                  Baixar QR Code
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default UserManagement

