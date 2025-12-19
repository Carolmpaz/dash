import { useState, useEffect, useRef } from 'react'
import mqtt from 'mqtt'
import { supabase } from '../supabaseClient'
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import Logo from './Logo'
import SystemConfig from './SystemConfig'
import VariableComparison from './VariableComparison'
import ConsumptionHistory from './ConsumptionHistory'
import './Dashboard.css'

function Dashboard({ onLogout, user, userInfo }) {
  const [sensorData, setSensorData] = useState({
    temp_ida: 0,
    temp_retorno: 0,
    deltaT: 0,
    vazao_L_s: 0,
    potencia_kW: 0,
    energia_kWh: 0
  })
  const [historyData, setHistoryData] = useState([])
  const [weatherData, setWeatherData] = useState([]) // Dados meteorológicos para comparação
  const [condominio, setCondominio] = useState(null)
  const [condominioInfo, setCondominioInfo] = useState(null)
  const [availableDevices, setAvailableDevices] = useState([]) // Dispositivos disponíveis para o usuário
  const [deviceId, setDeviceId] = useState(null) // ID do dispositivo selecionado
  const [isConnected, setIsConnected] = useState(false)
  const [setpoint, setSetpoint] = useState(65)
  const [systemConfig, setSystemConfig] = useState(null) // Configurações do sistema
  const [dbConnected, setDbConnected] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [activeTab, setActiveTab] = useState('dashboard') // 'dashboard', 'comparison', 'history'
  const [accumulatedValues, setAccumulatedValues] = useState({
    energiaTotal: 0,
    potenciaTotal: 0,
    gasTotal: 0,
    vazaoTotal: 0
  })
  const clientRef = useRef(null)
  const maxHistoryPoints = 50 // Máximo de pontos no histórico
  const maxHistoryLoad = 100 // Máximo de pontos a carregar do banco
  const saveIntervalRef = useRef(null) // Referência para o intervalo de salvamento
  const accumulatedIntervalRef = useRef(null) // Referência para o intervalo de salvamento de dados acumulados
  const pendingDataRef = useRef(null) // Dados pendentes para salvar

  // Função para salvar dados no Supabase com retry
  const saveToDatabase = async (data, retries = 3) => {
    if (!deviceId) {
      console.error('❌ ERRO: deviceId não disponível, não é possível salvar')
      console.error('📊 Estado atual:', { deviceId, userInfo, availableDevices })
      return
    }

    // Prepara os dados para inserção com os nomes corretos das colunas
    const insertData = {
      device_id: deviceId,
      temp_ida: data.temp_ida != null ? parseFloat(data.temp_ida) : null,
      temp_retorno: data.temp_retorno != null ? parseFloat(data.temp_retorno) : null,
      deltat: data.deltaT != null ? parseFloat(data.deltaT) : null,
      vazao_l_s: data.vazao_L_s != null ? parseFloat(data.vazao_L_s) : null,
      potencia_kw: data.potencia_kW != null ? parseFloat(data.potencia_kW) : null,
      energia_kwh: data.energia_kWh != null ? parseFloat(data.energia_kWh) : null
    }

    console.log('Tentando salvar dados no banco:', {
      device_id: insertData.device_id,
      temp_ida: insertData.temp_ida,
      temp_retorno: insertData.temp_retorno,
      deltat: insertData.deltat,
      vazao_l_s: insertData.vazao_l_s,
      potencia_kw: insertData.potencia_kw,
      energia_kwh: insertData.energia_kwh
    })

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const { data: insertedData, error } = await supabase
          .from('leituras_sensores')
          .insert(insertData)
          .select()

        if (error) {
          console.error(`❌ ERRO ao salvar (tentativa ${attempt}/${retries}):`, error)
          console.error('📋 Detalhes do erro:', {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint
          })
          
          // Se o erro for de dispositivo não encontrado, não tenta novamente
          if (error.code === '23503') {
            console.error('❌ ERRO: Dispositivo não encontrado no banco!')
            console.error('📋 Verifique se o dispositivo ESP32_001 existe na tabela dispositivos')
            console.error('📋 deviceId usado:', deviceId)
            setDbConnected(false)
            return
          }
          
          // Se o erro for de permissão RLS
          if (error.code === '42501' || error.message?.includes('permission') || error.message?.includes('policy')) {
            console.error('❌ ERRO: Permissão negada (RLS)!')
            console.error('📋 Verifique se o usuário está autenticado e tem permissão para inserir')
            console.error('📋 userInfo:', userInfo)
            setDbConnected(false)
            return
          }
          
          // Para outros erros, tenta novamente
          if (attempt < retries) {
            console.warn(`Tentativa ${attempt} falhou, tentando novamente em ${1000 * attempt}ms...`, error.message)
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt)) // Backoff exponencial
            continue
          }
          
          console.error('Erro ao salvar no banco após todas as tentativas:', error)
          setDbConnected(false)
        } else {
          console.log('Dados salvos com sucesso!', insertedData)
          setDbConnected(true)
          return // Sucesso, sai da função
        }
      } catch (err) {
        console.error(`Erro inesperado na tentativa ${attempt}:`, err)
        if (attempt < retries) {
          console.warn(`Tentando novamente em ${1000 * attempt}ms...`)
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
          continue
        }
        console.error('Erro inesperado ao salvar no banco após todas as tentativas:', err)
        setDbConnected(false)
      }
    }
  }

  // Função para carregar histórico do banco
  const loadHistoryFromDatabase = async () => {
    if (!deviceId) return
    
    setLoadingHistory(true)
    try {
      const { data, error } = await supabase
        .from('leituras_sensores')
        .select('*')
        .eq('device_id', deviceId)
        .order('reading_time', { ascending: false })
        .limit(maxHistoryLoad)

      if (error) {
        console.error('Erro ao carregar histórico:', error)
        setDbConnected(false)
      } else if (data && data.length > 0) {
        setDbConnected(true)
        // Converte os dados do banco para o formato do histórico
        const formattedData = data
          .reverse() // Inverte para ordem cronológica
          .map(item => ({
            time: new Date(item.reading_time).toLocaleTimeString('pt-BR'),
            timestamp: new Date(item.reading_time).getTime(), // Para sincronização com dados meteorológicos
            temp_ida: parseFloat(item.temp_ida) || 0,
            temp_retorno: parseFloat(item.temp_retorno) || 0,
            deltaT: parseFloat(item.deltat) || 0, // Corrigido: deltat (minúscula)
            vazao: (parseFloat(item.vazao_l_s) || 0) * 100, // Multiplicado por 100
            potencia: parseFloat(item.potencia_kw) || 0, // Corrigido: potencia_kw (minúscula)
            energia: parseFloat(item.energia_kwh) || 0, // Corrigido: energia_kwh (minúscula)
            gas: (parseFloat(item.potencia_kw) || 0) * 0.1
          }))
        
        setHistoryData(formattedData.slice(-maxHistoryPoints))
        console.log(`Histórico carregado: ${formattedData.length} pontos`)
        
        // Carrega valores acumulados de todos os dados do banco
        loadAccumulatedValues()
      } else {
        setDbConnected(true)
        console.log('Nenhum histórico encontrado no banco')
        setAccumulatedValues({ energiaTotal: 0, potenciaTotal: 0, gasTotal: 0, vazaoTotal: 0 })
      }
    } catch (err) {
      console.error('Erro inesperado ao carregar histórico:', err)
      setDbConnected(false)
    } finally {
      setLoadingHistory(false)
    }
  }

  // Função para salvar dados agregados (médias de temperatura e totais) no banco
  const saveAggregatedData = async () => {
    // Usa uma função para acessar os valores mais recentes do estado
    return new Promise((resolve) => {
      setHistoryData(currentHistory => {
        setSensorData(currentSensor => {
          if (!deviceId || !userInfo?.condominio_id || currentHistory.length === 0) {
            console.log('⏸️ Aguardando dados para salvar agregados:', { 
              deviceId, 
              condominio_id: userInfo?.condominio_id, 
              historyLength: currentHistory.length 
            })
            resolve()
            return currentSensor
          }

          // Executa o salvamento de forma assíncrona
          (async () => {
            try {
              // Calcula médias das temperaturas
              const tempIdaMedia = currentHistory.reduce((sum, p) => sum + (p.temp_ida || 0), 0) / currentHistory.length
              const tempRetornoMedia = currentHistory.reduce((sum, p) => sum + (p.temp_retorno || 0), 0) / currentHistory.length
              const deltaTMedia = currentHistory.reduce((sum, p) => sum + (p.deltaT || 0), 0) / currentHistory.length

              // Calcula totais acumulados
              const energiaTotal = Math.max(...currentHistory.map(p => p.energia || 0), currentSensor.energia_kWh || 0)
              const potenciaTotal = currentHistory.reduce((total, ponto) => total + (ponto.potencia || 0), 0)
              const gasTotal = currentHistory.reduce((total, ponto) => total + (ponto.gas || 0), 0)
              const vazaoTotal = currentHistory.reduce((total, ponto) => total + ((ponto.vazao || 0) * 30), 0)

              const hoje = new Date().toISOString().split('T')[0]

              // Verifica se já existe registro para hoje
              const { data: existing, error: checkError } = await supabase
                .from('consumo_acumulado')
                .select('id, energia_total_kwh, potencia_total_kw, gas_total_m3, vazao_total_l')
                .eq('condominio_id', userInfo.condominio_id)
                .eq('device_id', deviceId)
                .eq('data', hoje)
                .single()

              if (checkError && checkError.code !== 'PGRST116') {
                console.error('❌ Erro ao verificar dados agregados:', checkError)
                resolve()
                return
              }

              const updateData = {
                energia_total_kwh: Math.max(parseFloat(existing?.energia_total_kwh) || 0, energiaTotal),
                potencia_total_kw: (parseFloat(existing?.potencia_total_kw) || 0) + potenciaTotal,
                gas_total_m3: (parseFloat(existing?.gas_total_m3) || 0) + gasTotal,
                vazao_total_l: (parseFloat(existing?.vazao_total_l) || 0) + vazaoTotal,
                updated_at: new Date().toISOString()
              }

              if (existing) {
                // Atualiza registro existente
                const { error: updateError } = await supabase
                  .from('consumo_acumulado')
                  .update(updateData)
                  .eq('id', existing.id)

                if (updateError) {
                  console.error('❌ Erro ao atualizar dados agregados:', updateError)
                } else {
                  console.log('✅ Dados agregados atualizados:', {
                    tempIdaMedia: tempIdaMedia.toFixed(2),
                    tempRetornoMedia: tempRetornoMedia.toFixed(2),
                    deltaTMedia: deltaTMedia.toFixed(2),
                    ...updateData
                  })
                }
              } else {
                // Cria novo registro
                const { error: insertError } = await supabase
                  .from('consumo_acumulado')
                  .insert({
                    condominio_id: userInfo.condominio_id,
                    device_id: deviceId,
                    data: hoje,
                    ...updateData
                  })

                if (insertError) {
                  console.error('❌ Erro ao inserir dados agregados:', insertError)
                } else {
                  console.log('✅ Dados agregados salvos:', {
                    tempIdaMedia: tempIdaMedia.toFixed(2),
                    tempRetornoMedia: tempRetornoMedia.toFixed(2),
                    deltaTMedia: deltaTMedia.toFixed(2),
                    ...updateData
                  })
                }
              }

              // Salva também uma leitura agregada na tabela leituras_sensores com médias
              const { error: insertReadingError } = await supabase
                .from('leituras_sensores')
                .insert({
                  device_id: deviceId,
                  temp_ida: parseFloat(tempIdaMedia.toFixed(2)),
                  temp_retorno: parseFloat(tempRetornoMedia.toFixed(2)),
                  deltat: parseFloat(deltaTMedia.toFixed(2)),
                  vazao_l_s: parseFloat((vazaoTotal / (currentHistory.length * 30)).toFixed(2)), // Média da vazão
                  potencia_kw: parseFloat((potenciaTotal / currentHistory.length).toFixed(4)), // Média da potência
                  energia_kwh: parseFloat(energiaTotal.toFixed(4))
                })

              if (insertReadingError) {
                console.error('❌ Erro ao salvar leitura agregada:', insertReadingError)
              } else {
                console.log('✅ Leitura agregada salva com médias de temperatura')
              }

              resolve()
            } catch (err) {
              console.error('❌ Erro ao salvar dados agregados:', err)
              resolve()
            }
          })()
          
          return currentSensor
        })
        return currentHistory
      })
    })
  }

  // Função para salvar dados acumulados no banco de dados
  const saveAccumulatedValues = async (energiaTotal, potenciaTotal, gasTotal, vazaoTotal) => {
    console.log('🔍 saveAccumulatedValues chamada com:', {
      deviceId,
      condominio_id: userInfo?.condominio_id,
      energiaTotal,
      potenciaTotal,
      gasTotal,
      vazaoTotal
    })

    if (!deviceId) {
      console.error('❌ deviceId não disponível')
      return
    }

    if (!userInfo?.condominio_id) {
      console.error('❌ condominio_id não disponível. userInfo:', userInfo)
      return
    }

    try {
      const hoje = new Date().toISOString().split('T')[0] // Data no formato YYYY-MM-DD
      console.log('📅 Data de hoje:', hoje)

      // Verifica se já existe registro para hoje
      const { data: existing, error: checkError } = await supabase
        .from('consumo_acumulado')
        .select('id, energia_total_kwh, potencia_total_kw, gas_total_m3, vazao_total_l')
        .eq('condominio_id', userInfo.condominio_id)
        .eq('device_id', deviceId)
        .eq('data', hoje)
        .single()

      console.log('🔍 Verificação de registro existente:', { existing, checkError })

      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = nenhum resultado encontrado
        console.error('❌ Erro ao verificar dados acumulados existentes:', checkError)
        console.error('Código do erro:', checkError.code)
        console.error('Mensagem:', checkError.message)
        console.error('Detalhes:', checkError.details)
        return
      }

      if (existing) {
        console.log('📝 Atualizando registro existente:', existing.id)
        // Atualiza registro existente (soma os valores)
        const { data: updatedData, error: updateError } = await supabase
          .from('consumo_acumulado')
          .update({
            energia_total_kwh: Math.max(parseFloat(existing.energia_total_kwh) || 0, energiaTotal),
            potencia_total_kw: (parseFloat(existing.potencia_total_kw) || 0) + potenciaTotal,
            gas_total_m3: (parseFloat(existing.gas_total_m3) || 0) + gasTotal,
            vazao_total_l: (parseFloat(existing.vazao_total_l) || 0) + vazaoTotal,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
          .select()

        if (updateError) {
          console.error('❌ Erro ao atualizar dados acumulados:', updateError)
          console.error('Código do erro:', updateError.code)
          console.error('Mensagem:', updateError.message)
          console.error('Detalhes:', updateError.details)
        } else {
          console.log('✅ Dados acumulados atualizados no banco:', updatedData)
        }
      } else {
        console.log('➕ Criando novo registro de dados acumulados')
        // Cria novo registro
        const { data: insertedData, error: insertError } = await supabase
          .from('consumo_acumulado')
          .insert({
            condominio_id: userInfo.condominio_id,
            device_id: deviceId,
            data: hoje,
            energia_total_kwh: energiaTotal,
            potencia_total_kw: potenciaTotal,
            gas_total_m3: gasTotal,
            vazao_total_l: vazaoTotal
          })
          .select()

        if (insertError) {
          console.error('❌ Erro ao inserir dados acumulados:', insertError)
          console.error('Código do erro:', insertError.code)
          console.error('Mensagem:', insertError.message)
          console.error('Detalhes:', insertError.details)
          console.error('Hint:', insertError.hint)
        } else {
          console.log('✅ Dados acumulados salvos no banco com sucesso:', insertedData)
        }
      }
    } catch (err) {
      console.error('❌ Erro inesperado ao salvar dados acumulados:', err)
      console.error('Stack:', err.stack)
    }
  }

  // Função para carregar valores acumulados do banco de dados
  const loadAccumulatedValues = async () => {
    if (!deviceId || !userInfo?.condominio_id) return

    try {
      // Primeiro tenta carregar da tabela consumo_acumulado (dados do dia atual)
      const hoje = new Date().toISOString().split('T')[0]
      const { data: acumuladoData, error: acumuladoError } = await supabase
        .from('consumo_acumulado')
        .select('energia_total_kwh, potencia_total_kw, gas_total_m3, vazao_total_l')
        .eq('condominio_id', userInfo.condominio_id)
        .eq('device_id', deviceId)
        .eq('data', hoje)
        .single()

      if (!acumuladoError && acumuladoData) {
        // Usa dados da tabela consumo_acumulado
        setAccumulatedValues({
          energiaTotal: parseFloat(acumuladoData.energia_total_kwh) || 0,
          potenciaTotal: parseFloat(acumuladoData.potencia_total_kw) || 0,
          gasTotal: parseFloat(acumuladoData.gas_total_m3) || 0,
          vazaoTotal: parseFloat(acumuladoData.vazao_total_l) || 0
        })
        console.log('✅ Valores acumulados carregados da tabela consumo_acumulado:', acumuladoData)
        return
      }

      // Se não encontrar na tabela consumo_acumulado, calcula a partir de leituras_sensores
      const { data, error } = await supabase
        .from('leituras_sensores')
        .select('energia_kwh, potencia_kw, vazao_l_s')
        .eq('device_id', deviceId)

      if (error) {
        console.error('Erro ao carregar valores acumulados:', error)
        return
      }

      if (data && data.length > 0) {
        // Energia é um valor acumulado, então pega o último (maior) valor
        const energiaTotal = Math.max(...data.map(item => parseFloat(item.energia_kwh) || 0))

        // Potência total é a soma de todas as potências
        const potenciaTotal = data.reduce((sum, item) => {
          return sum + (parseFloat(item.potencia_kw) || 0)
        }, 0)

        // Gás total é a soma de todos os consumos calculados
        const gasTotal = data.reduce((sum, item) => {
          return sum + ((parseFloat(item.potencia_kw) || 0) * 0.1)
        }, 0)

        // Para vazão acumulada, assume intervalo de 30 segundos entre cada leitura salva
        const intervaloMedicao = 30 // 30 segundos
        const vazaoTotal = data.reduce((sum, item) => {
          return sum + (((parseFloat(item.vazao_l_s) || 0) * 100) * intervaloMedicao) // Multiplicado por 100
        }, 0)

        setAccumulatedValues({
          energiaTotal: energiaTotal,
          potenciaTotal: potenciaTotal,
          gasTotal: gasTotal,
          vazaoTotal: vazaoTotal
        })

        console.log('Valores acumulados calculados de leituras_sensores:', {
          energiaTotal: energiaTotal.toFixed(2),
          potenciaTotal: potenciaTotal.toFixed(2),
          gasTotal: gasTotal.toFixed(4),
          vazaoTotal: vazaoTotal.toFixed(2)
        })
      } else {
        setAccumulatedValues({ energiaTotal: 0, potenciaTotal: 0, gasTotal: 0, vazaoTotal: 0 })
      }
    } catch (err) {
      console.error('Erro ao carregar valores acumulados:', err)
    }
  }

  // Função auxiliar para salvar dados acumulados manualmente (para teste)
  const handleSaveAccumulatedManually = async () => {
    if (historyData.length === 0) {
      alert('Não há dados no histórico para salvar')
      return
    }

    const energiaTotal = Math.max(...historyData.map(p => p.energia || 0), sensorData.energia_kWh || 0)
    const potenciaTotal = historyData.reduce((total, ponto) => total + (ponto.potencia || 0), 0)
    const gasTotal = historyData.reduce((total, ponto) => total + (ponto.gas || 0), 0)
    const vazaoTotal = historyData.reduce((total, ponto) => total + ((ponto.vazao || 0) * 30), 0)

    console.log('🔧 Salvamento manual acionado:', {
      pontosNoHistorico: historyData.length,
      energiaTotal: energiaTotal.toFixed(2),
      potenciaTotal: potenciaTotal.toFixed(2),
      gasTotal: gasTotal.toFixed(4),
      vazaoTotal: vazaoTotal.toFixed(2)
    })

    await saveAccumulatedValues(energiaTotal, potenciaTotal, gasTotal, vazaoTotal)
    alert('Dados acumulados salvos! Verifique o console para detalhes.')
  }

  // Função para carregar dispositivos disponíveis baseado no role do usuário
  const loadAvailableDevices = async () => {
    if (!userInfo) {
      console.log('userInfo não disponível, aguardando...')
      return
    }

    setLoadingDevices(true)
    try {
      // Timeout para evitar travamento
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout ao carregar dispositivos')), 8000)
      )

      let query = supabase
        .from('dispositivos')
        .select('device_id, unidade, localizacao, condominio_id, condominios(nome)')

      // Filtra baseado no role
      if (userInfo.role === 'morador' && userInfo.condominio_id) {
        // Morador: apenas dispositivos do seu condomínio e unidade (se houver)
        query = query.eq('condominio_id', userInfo.condominio_id)
        if (userInfo.unidade) {
          query = query.eq('unidade', userInfo.unidade)
        }
      } else if (userInfo.role === 'zelador' && userInfo.condominio_id) {
        // Zelador: dispositivos do seu condomínio
        query = query.eq('condominio_id', userInfo.condominio_id)
      }
      // Comgás: não filtra (vê todos)

      const queryPromise = query.order('device_id')
      const { data, error } = await Promise.race([queryPromise, timeoutPromise])

      if (error) {
        console.error('Erro ao carregar dispositivos:', error)
      } else if (data && data.length > 0) {
        setAvailableDevices(data)
        console.log('✅ Dispositivos carregados:', data.length, 'dispositivo(s)')
        // Seleciona o primeiro dispositivo automaticamente
        if (!deviceId) {
          const selectedDeviceId = data[0].device_id
          setDeviceId(selectedDeviceId)
          console.log('✅ deviceId selecionado automaticamente:', selectedDeviceId)
          // Carrega informações do condomínio
          if (data[0].condominios) {
            setCondominioInfo(data[0].condominios)
            setCondominio(data[0].condominios.nome)
          }
        } else {
          console.log('ℹ️ deviceId já está configurado:', deviceId)
        }
      } else {
        console.error('❌ ERRO: Nenhum dispositivo disponível para este usuário!')
        console.error('📋 userInfo:', userInfo)
        console.error('📋 Verifique se há dispositivos cadastrados para o condomínio:', userInfo?.condominio_id)
      }
    } catch (err) {
      console.error('Erro inesperado ao carregar dispositivos:', err)
      // Continua mesmo com erro
    } finally {
      setLoadingDevices(false)
    }
  }

  // Função para carregar configurações do sistema
  const loadSystemConfig = async () => {
    if (!userInfo || !userInfo.condominio_id || !deviceId) return

    try {
      // Tenta carregar configuração específica do dispositivo primeiro
      let { data, error } = await supabase
        .from('configuracao_sistema')
        .select('*')
        .eq('condominio_id', userInfo.condominio_id)
        .eq('device_id', deviceId)
        .single()

      // Se não encontrar, tenta configuração geral do condomínio
      if (error && error.code === 'PGRST116') {
        const { data: generalData, error: generalError } = await supabase
          .from('configuracao_sistema')
          .select('*')
          .eq('condominio_id', userInfo.condominio_id)
          .is('device_id', null)
          .single()

        if (!generalError && generalData) {
          data = generalData
          error = null
        }
      }

      if (!error && data) {
        setSystemConfig(data)
        setSetpoint(parseFloat(data.setpoint_temperatura) || 65)
      }
    } catch (err) {
      console.error('Erro ao carregar configurações:', err)
    }
  }

  // Função para carregar dados meteorológicos
  const loadWeatherData = async () => {
    if (!userInfo?.condominio_id) return

    try {
      // Busca dados meteorológicos do banco (últimas 24h)
      const { data, error } = await supabase
        .from('dados_meteorologicos')
        .select('*')
        .eq('condominio_id', userInfo.condominio_id)
        .order('reading_time', { ascending: false })
        .limit(maxHistoryLoad)

      if (!error && data && data.length > 0) {
        const formattedWeather = data
          .reverse()
          .map(item => ({
            time: new Date(item.reading_time).toLocaleTimeString('pt-BR'),
            timestamp: new Date(item.reading_time).getTime(),
            temperatura: parseFloat(item.temperatura_ambiente) || 0,
            umidade: parseFloat(item.umidade) || 0
          }))
        
        setWeatherData(formattedWeather)
        console.log(`Dados meteorológicos carregados: ${formattedWeather.length} pontos`)
      } else {
        console.log('Nenhum dado meteorológico encontrado')
      }
    } catch (err) {
      console.error('Erro ao carregar dados meteorológicos:', err)
    }
  }

  // Carrega dados iniciais quando userInfo estiver disponível
  useEffect(() => {
    if (userInfo) {
      console.log('📊 userInfo disponível, carregando dispositivos...', {
        role: userInfo.role,
        condominio_id: userInfo.condominio_id,
        unidade: userInfo.unidade
      })
      loadAvailableDevices()
    } else {
      console.log('⏸️ Aguardando userInfo...')
    }
  }, [userInfo])

  // Carrega configurações e histórico quando deviceId mudar
  useEffect(() => {
    if (userInfo && deviceId) {
      loadSystemConfig()
      loadHistoryFromDatabase()
      loadWeatherData()
    }
  }, [userInfo, deviceId])

  // Carrega dados acumulados quando deviceId ou userInfo mudarem
  useEffect(() => {
    if (deviceId && userInfo?.condominio_id) {
      console.log('🔄 Carregando dados acumulados...', { deviceId, condominio_id: userInfo.condominio_id })
      loadAccumulatedValues()
    } else {
      console.log('⏸️ Aguardando deviceId e condominio_id para carregar dados acumulados', { 
        deviceId, 
        condominio_id: userInfo?.condominio_id 
      })
    }
  }, [deviceId, userInfo?.condominio_id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Configura intervalo para salvar dados a cada 30 segundos
  useEffect(() => {
    if (!deviceId) {
      // Limpa o intervalo se não houver deviceId
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current)
        saveIntervalRef.current = null
      }
      if (accumulatedIntervalRef.current) {
        clearInterval(accumulatedIntervalRef.current)
        accumulatedIntervalRef.current = null
      }
      return
    }

    // Limpa intervalos existentes antes de configurar novos
    if (saveIntervalRef.current) {
      clearInterval(saveIntervalRef.current)
    }
    if (accumulatedIntervalRef.current) {
      clearInterval(accumulatedIntervalRef.current)
    }

    // Configura intervalo de 30 segundos para salvar dados individuais
    saveIntervalRef.current = setInterval(() => {
      if (pendingDataRef.current) {
        console.log('Salvando dados no banco (intervalo de 30 segundos)...')
        saveToDatabase(pendingDataRef.current)
          .then(() => {
            // Recarrega valores acumulados após salvar
            loadAccumulatedValues()
          })
          .catch(err => {
            console.error('Erro ao salvar no banco (não crítico):', err)
          })
        // Limpa os dados pendentes após salvar
        pendingDataRef.current = null
      } else {
        console.log('Nenhum dado pendente para salvar')
      }
    }, 30 * 1000) // 30 segundos em milissegundos

    // Configura intervalo de 1 minuto para salvar dados agregados (médias e totais)
    accumulatedIntervalRef.current = setInterval(() => {
      console.log('⏰ Intervalo de salvamento de dados agregados executado')
      // Salva dados agregados com médias de temperatura e totais
      saveAggregatedData()
    }, 1 * 60 * 1000) // 1 minuto

    // Limpa os intervalos quando o componente desmontar ou deviceId mudar
    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current)
        saveIntervalRef.current = null
      }
      if (accumulatedIntervalRef.current) {
        clearInterval(accumulatedIntervalRef.current)
        accumulatedIntervalRef.current = null
      }
    }

    // Limpa o intervalo quando o componente desmontar ou deviceId mudar
    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current)
        saveIntervalRef.current = null
      }
    }
  }, [deviceId])

  // Conexão MQTT - completamente opcional e não bloqueante
  useEffect(() => {
    // Delay maior para garantir que o componente está totalmente renderizado
    const initTimeout = setTimeout(() => {
      // Tenta conectar de forma completamente assíncrona e não bloqueante
      const connectMQTT = async () => {
        let client = null
        
        try {
          // Verifica se já existe uma conexão ativa
          if (clientRef.current && clientRef.current.connected) {
            console.log('Conexão MQTT já existe')
            return
          }

          console.log('Tentando conectar ao MQTT...')
          
          // Timeout de segurança - se não conectar em 5 segundos, cancela
          const connectionTimeout = setTimeout(() => {
            console.warn('Timeout na conexão MQTT - continuando sem MQTT')
            setIsConnected(false)
          }, 5000)

          client = mqtt.connect('wss://broker.hivemq.com:8884/mqtt', {
            clientId: 'dashboard_' + Math.random().toString(16).substr(2, 8),
            reconnectPeriod: 5000,
            connectTimeout: 10000,
            // Opções para evitar bloqueio
            keepalive: 60,
            clean: true
          })

          clientRef.current = client

          client.on('connect', () => {
            clearTimeout(connectionTimeout)
            console.log('Conectado ao broker MQTT')
            setIsConnected(true)
            try {
              client.subscribe('carolinepaz/sensores', (err) => {
                if (err) {
                  console.error('Erro ao subscrever:', err)
                } else {
                  console.log('Subscrito ao tópico: carolinepaz/sensores')
                }
              })
            } catch (err) {
              console.error('Erro ao configurar subscription:', err)
            }
          })

          client.on('message', (topic, message) => {
            try {
              const data = JSON.parse(message.toString())
              const processedData = {
                temp_ida: data.temp_ida === -127 ? 0 : data.temp_ida,
                temp_retorno: data.temp_retorno === -127 ? 0 : data.temp_retorno,
                deltaT: data.deltaT || 0,
                vazao_L_s: (data.vazao_L_s || 0) * 100, // Multiplicado por 100
                potencia_kW: data.potencia_kW || 0,
                energia_kWh: data.energia_kWh || 0
              }
              
              // Atualiza os dados do sensor imediatamente
              setSensorData(processedData)
              console.log('✅ Dados do sensor atualizados:', processedData)
              console.log('📊 Vazão processada:', processedData.vazao_L_s, 'L/s')
              
              // Adiciona ao histórico com timestamp
              const timestamp = new Date().toLocaleTimeString('pt-BR')
              const historyPoint = {
                time: timestamp,
                temp_ida: processedData.temp_ida,
                temp_retorno: processedData.temp_retorno,
                deltaT: processedData.deltaT,
                vazao: processedData.vazao_L_s,
                potencia: processedData.potencia_kW,
                energia: processedData.energia_kWh,
                gas: (processedData.potencia_kW * 0.1)
              }
              
              // Atualiza o histórico imediatamente
              setHistoryData(prev => {
                const newData = [...prev, historyPoint]
                const sliced = newData.slice(-maxHistoryPoints) // Mantém apenas os últimos N pontos
                console.log('✅ Histórico atualizado:', sliced.length, 'pontos')
                
                // Salva dados acumulados automaticamente quando há pelo menos 10 pontos
                if (sliced.length >= 10 && sliced.length % 10 === 0) {
                  const energiaTotal = Math.max(...sliced.map(p => p.energia || 0), processedData.energia_kWh || 0)
                  const potenciaTotal = sliced.reduce((total, ponto) => total + (ponto.potencia || 0), 0)
                  const gasTotal = sliced.reduce((total, ponto) => total + (ponto.gas || 0), 0)
                  const vazaoTotal = sliced.reduce((total, ponto) => total + ((ponto.vazao || 0) * 30), 0)
                  
                  console.log('💾 Salvando dados acumulados automaticamente (a cada 10 pontos)...')
                  saveAccumulatedValues(energiaTotal, potenciaTotal, gasTotal, vazaoTotal)
                }
                
                return sliced
              })
              
              // Armazena os dados mais recentes para salvar a cada 30 segundos (backup)
              pendingDataRef.current = processedData
              
              // Salva imediatamente no banco quando chegam dados MQTT (se deviceId estiver disponível)
              console.log('🔍 Verificando deviceId antes de salvar:', {
                deviceId: deviceId,
                hasDeviceId: !!deviceId,
                userInfo: userInfo,
                availableDevices: availableDevices?.length || 0
              })
              
              if (deviceId) {
                console.log('💾 Tentando salvar dados MQTT no banco...')
                saveToDatabase(processedData)
                  .then((result) => {
                    console.log('✅ Dados MQTT salvos imediatamente no banco', result)
                    // Após salvar, verifica se deve salvar dados agregados (a cada 10 leituras)
                    setHistoryData(currentHistory => {
                      if (currentHistory.length >= 10 && currentHistory.length % 10 === 0) {
                        console.log('📊 Salvando dados agregados após 10 leituras...')
                        setTimeout(() => saveAggregatedData(), 1000) // Aguarda 1s para garantir que o histórico foi atualizado
                      }
                      return currentHistory
                    })
                  })
                  .catch(err => {
                    console.error('❌ ERRO ao salvar dados MQTT imediatamente:', err)
                    console.error('   Stack:', err.stack)
                    // Continua mesmo se falhar - o intervalo de 30s vai tentar novamente
                  })
              } else {
                console.error('❌ ERRO: deviceId não disponível!')
                console.error('   deviceId:', deviceId)
                console.error('   userInfo:', userInfo)
                console.error('   availableDevices:', availableDevices)
                console.error('   → Os dados MQTT serão salvos quando deviceId estiver configurado')
              }
              
              console.log('✅ Dados recebidos e processados:', {
                sensorData: processedData,
                timestamp: timestamp,
                historySize: historyData.length + 1,
                deviceId: deviceId
              })
            } catch (error) {
              console.error('Erro ao parsear JSON:', error)
            }
          })

          client.on('error', (error) => {
            console.error('Erro MQTT:', error)
            setIsConnected(false)
            // Não propaga o erro para não quebrar a aplicação
          })

          client.on('close', () => {
            console.log('Conexão MQTT fechada')
            setIsConnected(false)
          })

          client.on('offline', () => {
            console.log('Cliente MQTT offline')
            setIsConnected(false)
          })

        } catch (error) {
          console.error('Erro ao inicializar conexão MQTT:', error)
          setIsConnected(false)
          // Continua mesmo se a conexão MQTT falhar - NÃO BLOQUEIA A APLICAÇÃO
        }
      }

      // Executa de forma assíncrona sem bloquear
      connectMQTT().catch(err => {
        console.error('Erro na função connectMQTT:', err)
        setIsConnected(false)
      })
    }, 500) // Delay maior (500ms) para garantir renderização completa

    return () => {
      clearTimeout(initTimeout)
      if (clientRef.current) {
        try {
          clientRef.current.end()
          clientRef.current = null
        } catch (err) {
          console.error('Erro ao fechar conexão MQTT:', err)
        }
      }
    }
  }, []) // Executa apenas uma vez na montagem

  // Calcula valores acumulados a partir do histórico em memória
  // Isso garante que os dados apareçam mesmo sem salvar no banco
  const consumoGasCalculado = historyData.reduce((total, ponto) => {
    return total + ponto.gas
  }, 0)
  
  const energiaTotalCalculada = historyData.length > 0
    ? Math.max(...historyData.map(p => p.energia || 0))
    : sensorData.energia_kWh
  
  const potenciaTotalCalculada = historyData.reduce((total, ponto) => {
    return total + (ponto.potencia || 0)
  }, 0)
  
  const vazaoAcumuladaCalculada = historyData.reduce((total, ponto) => {
    return total + ((ponto.vazao || 0) * 30) // 30 segundos entre cada leitura
  }, 0)

  // Usa valores do banco se disponíveis, senão usa valores calculados do histórico em memória
  const consumoGas = accumulatedValues.gasTotal > 0 
    ? accumulatedValues.gasTotal.toFixed(4) 
    : consumoGasCalculado.toFixed(4)
  
  const energiaTotal = accumulatedValues.energiaTotal > 0 
    ? accumulatedValues.energiaTotal.toFixed(2) 
    : energiaTotalCalculada.toFixed(2)
  
  const potenciaTotal = accumulatedValues.potenciaTotal > 0 
    ? accumulatedValues.potenciaTotal.toFixed(2) 
    : potenciaTotalCalculada.toFixed(2)
  
  // Garante que vazaoAcumulada sempre tenha um valor válido
  const vazaoAcumulada = (accumulatedValues.vazaoTotal > 0 
    ? accumulatedValues.vazaoTotal 
    : vazaoAcumuladaCalculada) || 0

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-left">
          <Logo />
          <div className="header-title-section">
            <h1>Dashboard Caldeira</h1>
            <div className="connection-status">
              <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}></span>
              <span>{isConnected ? 'MQTT Conectado' : 'MQTT Desconectado'}</span>
              {dbConnected && (
                <>
                  <span className="status-indicator connected" style={{ marginLeft: '10px' }}></span>
                  <span>Banco OK</span>
                </>
              )}
              {loadingHistory && <span style={{ marginLeft: '10px', fontSize: '12px' }}>Carregando histórico...</span>}
            </div>
          </div>
        </div>
        <div className="header-right">
          {userInfo && deviceId && (
            <button 
              onClick={handleSaveAccumulatedManually}
              style={{
                marginRight: '15px',
                padding: '8px 16px',
                backgroundColor: '#004B87',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
              title="Salvar dados acumulados manualmente (para teste)"
            >
              💾 Salvar Acumulados
            </button>
          )}
          {userInfo && (
            <div className="user-info" style={{ marginRight: '15px', fontSize: '14px', color: '#666' }}>
              <span style={{ fontWeight: '600' }}>{userInfo.role || 'Usuário'}</span>
              {condominio && <span style={{ marginLeft: '10px' }}>• {condominio}</span>}
            </div>
          )}
          {availableDevices.length > 1 && (
            <div className="device-selector" style={{ marginRight: '15px' }}>
              <label style={{ marginRight: '8px', fontSize: '14px' }}>Dispositivo:</label>
              <select 
                value={deviceId || ''} 
                onChange={(e) => setDeviceId(e.target.value)}
                className="condominio-select"
                style={{ padding: '6px 12px', fontSize: '14px' }}
              >
                {availableDevices.map(device => (
                  <option key={device.device_id} value={device.device_id}>
                    {device.device_id} {device.unidade ? `- Unidade ${device.unidade}` : ''} {device.localizacao ? `(${device.localizacao})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          {availableDevices.length === 1 && deviceId && (
            <div className="device-info" style={{ marginRight: '15px', fontSize: '14px', color: '#666' }}>
              <span>{deviceId}</span>
            </div>
          )}
          {loadingDevices && (
            <span style={{ marginRight: '15px', fontSize: '14px', color: '#666' }}>Carregando dispositivos...</span>
          )}
          {userInfo && deviceId && userInfo.condominio_id && (
            <SystemConfig 
              userInfo={userInfo}
              deviceId={deviceId}
              condominioId={userInfo.condominio_id}
              onConfigUpdated={() => {
                loadSystemConfig()
              }}
            />
          )}
          <button onClick={onLogout} className="logout-button">
            Sair
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        {/* Tabs de Navegação */}
        <div className="dashboard-tabs">
          <button 
            className={`tab-button ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            Dashboard Principal
          </button>
          <button 
            className={`tab-button ${activeTab === 'comparison' ? 'active' : ''}`}
            onClick={() => setActiveTab('comparison')}
          >
            Análise Comparativa
          </button>
          <button 
            className={`tab-button ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            Histórico de Consumo
          </button>
        </div>

        {/* Conteúdo do Dashboard Principal */}
        {activeTab === 'dashboard' && (
          <>
            {/* Cards de valores principais */}
            <div className="kpi-cards">
          <div className="kpi-card">
            <div className="kpi-label">Temperatura de Entrada</div>
            <div className="kpi-value">{sensorData.temp_retorno.toFixed(1)}°C</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Temperatura de Saída</div>
            <div className="kpi-value">{sensorData.temp_ida.toFixed(1)}°C</div>
          </div>
          <div className="kpi-card highlight">
            <div className="kpi-label">Consumo de Gás Natural</div>
            <div className="kpi-value">{consumoGas} m³/h</div>
          </div>
          <div className="kpi-card highlight">
            <div className="kpi-label">Potência Térmica</div>
            <div className="kpi-value">{potenciaTotal} kW</div>
          </div>
          <div className="kpi-card highlight">
            <div className="kpi-label">Energia Acumulada</div>
            <div className="kpi-value">{energiaTotal} kWh</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Vazão Atual</div>
            <div className="kpi-value">{(sensorData.vazao_L_s || 0).toFixed(2)} L/s</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Vazão Acumulada</div>
            <div className="kpi-value">{typeof vazaoAcumulada === 'number' ? vazaoAcumulada.toFixed(2) : '0.00'} L</div>
          </div>
        </div>

        {/* Gráficos */}
        <div className="charts-grid">
          {/* Gráfico de Temperaturas */}
          <div className="chart-card">
            <div className="chart-header">
              <h3>Temperaturas ao Longo do Tempo</h3>
              <div className="chart-info">
                <span className="info-badge">Setpoint: {setpoint}°C</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={historyData}>
                <defs>
                  <linearGradient id="colorTempIda" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#007CB6" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#007CB6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorTempRetorno" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00B2E3" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#00B2E3" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis 
                  dataKey="time" 
                  stroke="#666"
                  fontSize={12}
                  tick={{ fill: '#666' }}
                />
                <YAxis 
                  stroke="#666"
                  fontSize={12}
                  tick={{ fill: '#666' }}
                  label={{ value: 'Temperatura (°C)', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    border: '1px solid #007CB6',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Area 
                  type="monotone" 
                  dataKey="temp_ida" 
                  name="Temperatura de Saída" 
                  stroke="#007CB6" 
                  fillOpacity={1} 
                  fill="url(#colorTempIda)"
                  strokeWidth={2}
                />
                <Area 
                  type="monotone" 
                  dataKey="temp_retorno" 
                  name="Temperatura de Entrada" 
                  stroke="#00B2E3" 
                  fillOpacity={1} 
                  fill="url(#colorTempRetorno)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Gráfico de Vazão Acumulada */}
          <div className="chart-card">
            <div className="chart-header">
              <h3>Vazão Acumulada de Água</h3>
            </div>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={historyData.map((item, index) => {
                // Calcula vazão acumulada progressivamente
                const vazaoAcumulada = historyData.slice(0, index + 1).reduce((total, ponto) => {
                  return total + ((ponto.vazao || 0) * 30) // 30 segundos entre cada leitura
                }, 0)
                return {
                  ...item,
                  vazaoAcumulada: vazaoAcumulada
                }
              })}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis 
                  dataKey="time" 
                  stroke="#666"
                  fontSize={12}
                  tick={{ fill: '#666' }}
                />
                <YAxis 
                  stroke="#666"
                  fontSize={12}
                  tick={{ fill: '#666' }}
                  label={{ value: 'Vazão Acumulada (L)', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    border: '1px solid #00B2A9',
                    borderRadius: '8px'
                  }}
                  formatter={(value) => [`${parseFloat(value).toFixed(2)} L`, 'Vazão Acumulada']}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="vazaoAcumulada" 
                  name="Vazão Acumulada (L)" 
                  stroke="#00B2A9" 
                  strokeWidth={3}
                  dot={{ fill: '#00B2A9', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Gráfico de Potência e Energia */}
          <div className="chart-card">
            <div className="chart-header">
              <h3>Potência e Energia</h3>
            </div>
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={historyData}>
                <defs>
                  <linearGradient id="colorPotencia" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7FC241" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#7FC241" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorEnergia" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FFD600" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#FFD600" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis 
                  dataKey="time" 
                  stroke="#666"
                  fontSize={12}
                  tick={{ fill: '#666' }}
                />
                <YAxis 
                  yAxisId="left"
                  stroke="#666"
                  fontSize={12}
                  tick={{ fill: '#666' }}
                  label={{ value: 'Potência (kW)', angle: -90, position: 'insideLeft' }}
                />
                <YAxis 
                  yAxisId="right" 
                  orientation="right"
                  stroke="#666"
                  fontSize={12}
                  tick={{ fill: '#666' }}
                  label={{ value: 'Energia (kWh)', angle: 90, position: 'insideRight' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    border: '1px solid #7FC241',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Area 
                  yAxisId="left"
                  type="monotone" 
                  dataKey="potencia" 
                  name="Potência (kW)" 
                  stroke="#7FC241" 
                  fillOpacity={1} 
                  fill="url(#colorPotencia)"
                  strokeWidth={2}
                />
                <Area 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="energia" 
                  name="Energia (kWh)" 
                  stroke="#FFD600" 
                  fillOpacity={1} 
                  fill="url(#colorEnergia)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Gráfico de Consumo de Gás */}
          <div className="chart-card">
            <div className="chart-header">
              <h3>Consumo de Gás Natural</h3>
            </div>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={historyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis 
                  dataKey="time" 
                  stroke="#666"
                  fontSize={12}
                  tick={{ fill: '#666' }}
                />
                <YAxis 
                  stroke="#666"
                  fontSize={12}
                  tick={{ fill: '#666' }}
                  label={{ value: 'Consumo (m³/h)', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    border: '1px solid #004B87',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Bar 
                  dataKey="gas" 
                  name="Consumo de Gás (m³/h)" 
                  fill="#004B87"
                  radius={[8, 8, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Gráfico Comparativo: Temperatura Ambiente vs Consumo de Gás */}
          {weatherData.length > 0 && (
            <div className="chart-card">
              <div className="chart-header">
                <h3>Temperatura Ambiente vs Consumo de Gás</h3>
                <div className="chart-info">
                  <span className="info-badge" style={{ backgroundColor: '#e3f2fd', color: '#1976d2' }}>
                    Análise de Eficiência Energética
                  </span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={historyData.map(item => {
                  // Sincroniza dados meteorológicos por timestamp (aproximado)
                  const weatherPoint = weatherData.find(w => 
                    Math.abs(w.timestamp - item.timestamp) < 300000 // 5 minutos de tolerância
                  ) || weatherData[0] // Fallback para primeiro ponto
                  
                  return {
                    ...item,
                    temp_ambiente: weatherPoint?.temperatura || 0
                  }
                }).filter(item => item.temp_ambiente > 0)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis 
                    dataKey="time" 
                    stroke="#666"
                    fontSize={12}
                    tick={{ fill: '#666' }}
                  />
                  <YAxis 
                    yAxisId="left"
                    stroke="#666"
                    fontSize={12}
                    tick={{ fill: '#666' }}
                    label={{ value: 'Temperatura (°C)', angle: -90, position: 'insideLeft' }}
                  />
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    stroke="#666"
                    fontSize={12}
                    tick={{ fill: '#666' }}
                    label={{ value: 'Consumo (m³/h)', angle: 90, position: 'insideRight' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#fff', 
                      border: '1px solid #9c27b0',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                  <Line 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="temp_ambiente" 
                    name="Temp. Ambiente (°C)" 
                    stroke="#9c27b0" 
                    strokeWidth={3}
                    dot={{ fill: '#9c27b0', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line 
                    yAxisId="right"
                    type="monotone" 
                    dataKey="gas" 
                    name="Consumo Gás (m³/h)" 
                    stroke="#f44336" 
                    strokeWidth={3}
                    dot={{ fill: '#f44336', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Gráfico de Delta T */}
          <div className="chart-card">
            <div className="chart-header">
              <h3>Diferença de Temperatura (ΔT)</h3>
            </div>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={historyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis 
                  dataKey="time" 
                  stroke="#666"
                  fontSize={12}
                  tick={{ fill: '#666' }}
                />
                <YAxis 
                  stroke="#666"
                  fontSize={12}
                  tick={{ fill: '#666' }}
                  label={{ value: 'ΔT (°C)', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    border: '1px solid #F89C1B',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="deltaT" 
                  name="ΔT (°C)" 
                  stroke="#F89C1B" 
                  strokeWidth={3}
                  dot={{ fill: '#F89C1B', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
          </>
        )}

        {/* Conteúdo da Análise Comparativa */}
        {activeTab === 'comparison' && (
          <VariableComparison historyData={historyData} />
        )}

        {/* Conteúdo do Histórico de Consumo */}
        {activeTab === 'history' && (
          <ConsumptionHistory deviceId={deviceId} userInfo={userInfo} historyData={historyData} />
        )}
      </main>
    </div>
  )
}

export default Dashboard
