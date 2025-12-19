import { useState, useEffect, useRef } from 'react'
import mqtt from 'mqtt'
import { supabase } from '../supabaseClient'
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import Logo from './Logo'
import SystemConfig from './SystemConfig'
import ConsumptionHistory from './ConsumptionHistory'
import CostManagement from './CostManagement'
import AlertsManagement from './AlertsManagement'
import UserManagement from './UserManagement'
import './Dashboard.css'

function SindicoDashboard({ onLogout, user, userInfo }) {
  const [sensorData, setSensorData] = useState({
    temp_ida: 0,
    temp_retorno: 0,
    deltaT: 0,
    vazao_L_s: 0,
    potencia_kW: 0,
    energia_kWh: 0
  })
  const [historyData, setHistoryData] = useState([])
  const [condominio, setCondominio] = useState(null)
  const [availableDevices, setAvailableDevices] = useState([])
  const [deviceId, setDeviceId] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [setpoint, setSetpoint] = useState(65)
  const [dbConnected, setDbConnected] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [activeTab, setActiveTab] = useState('costs')
  const clientRef = useRef(null)
  const maxHistoryPoints = 50
  const maxHistoryLoad = 100
  const saveIntervalRef = useRef(null)
  const accumulatedIntervalRef = useRef(null)
  const pendingDataRef = useRef(null)
  const [accumulatedValues, setAccumulatedValues] = useState({
    energiaTotal: 0,
    potenciaTotal: 0,
    gasTotal: 0,
    vazaoTotal: 0
  })

  const saveToDatabase = async (data, retries = 3) => {
    if (!deviceId) {
      console.warn('deviceId não disponível, não é possível salvar')
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

    console.log('Tentando salvar dados no banco:', insertData)

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const { data: insertedData, error } = await supabase
          .from('leituras_sensores')
          .insert(insertData)
          .select()

        if (error) {
          console.error(`Erro ao salvar (tentativa ${attempt}/${retries}):`, error)
          
          if (error.code === '23503') {
            console.warn('Dispositivo não encontrado no banco.')
            setDbConnected(false)
            return
          }
          if (attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
            continue
          }
          setDbConnected(false)
        } else {
          console.log('Dados salvos com sucesso!', insertedData)
          setDbConnected(true)
          return
        }
      } catch (err) {
        console.error(`Erro inesperado na tentativa ${attempt}:`, err)
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
          continue
        }
        setDbConnected(false)
      }
    }
  }

  // Função para salvar dados agregados (médias de temperatura e totais) no banco
  const saveAggregatedData = async () => {
    return new Promise((resolve) => {
      setHistoryData(currentHistory => {
        setSensorData(currentSensor => {
          if (!deviceId || !userInfo?.condominio_id || currentHistory.length === 0) {
            console.log('⏸️ Aguardando dados para salvar agregados (Sindico):', { 
              deviceId, 
              condominio_id: userInfo?.condominio_id, 
              historyLength: currentHistory.length 
            })
            resolve()
            return currentSensor
          }

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

              const { data: existing, error: checkError } = await supabase
                .from('consumo_acumulado')
                .select('id, energia_total_kwh, potencia_total_kw, gas_total_m3, vazao_total_l')
                .eq('condominio_id', userInfo.condominio_id)
                .eq('device_id', deviceId)
                .eq('data', hoje)
                .single()

              if (checkError && checkError.code !== 'PGRST116') {
                console.error('❌ Erro ao verificar dados agregados (Sindico):', checkError)
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
                const { error: updateError } = await supabase
                  .from('consumo_acumulado')
                  .update(updateData)
                  .eq('id', existing.id)

                if (updateError) {
                  console.error('❌ Erro ao atualizar dados agregados (Sindico):', updateError)
                } else {
                  console.log('✅ Dados agregados atualizados (Sindico):', {
                    tempIdaMedia: tempIdaMedia.toFixed(2),
                    tempRetornoMedia: tempRetornoMedia.toFixed(2),
                    deltaTMedia: deltaTMedia.toFixed(2),
                    ...updateData
                  })
                }
              } else {
                const { error: insertError } = await supabase
                  .from('consumo_acumulado')
                  .insert({
                    condominio_id: userInfo.condominio_id,
                    device_id: deviceId,
                    data: hoje,
                    ...updateData
                  })

                if (insertError) {
                  console.error('❌ Erro ao inserir dados agregados (Sindico):', insertError)
                } else {
                  console.log('✅ Dados agregados salvos (Sindico):', {
                    tempIdaMedia: tempIdaMedia.toFixed(2),
                    tempRetornoMedia: tempRetornoMedia.toFixed(2),
                    deltaTMedia: deltaTMedia.toFixed(2),
                    ...updateData
                  })
                }
              }

              // Salva leitura agregada com médias
              const { error: insertReadingError } = await supabase
                .from('leituras_sensores')
                .insert({
                  device_id: deviceId,
                  temp_ida: parseFloat(tempIdaMedia.toFixed(2)),
                  temp_retorno: parseFloat(tempRetornoMedia.toFixed(2)),
                  deltat: parseFloat(deltaTMedia.toFixed(2)),
                  vazao_l_s: parseFloat((vazaoTotal / (currentHistory.length * 30)).toFixed(2)),
                  potencia_kw: parseFloat((potenciaTotal / currentHistory.length).toFixed(4)),
                  energia_kwh: parseFloat(energiaTotal.toFixed(4))
                })

              if (insertReadingError) {
                console.error('❌ Erro ao salvar leitura agregada (Sindico):', insertReadingError)
              } else {
                console.log('✅ Leitura agregada salva com médias (Sindico)')
              }

              resolve()
            } catch (err) {
              console.error('❌ Erro ao salvar dados agregados (Sindico):', err)
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
    if (!deviceId || !userInfo?.condominio_id) {
      console.warn('deviceId ou condominio_id não disponível, não é possível salvar dados acumulados')
      return
    }

    try {
      const hoje = new Date().toISOString().split('T')[0]

      const { data: existing, error: checkError } = await supabase
        .from('consumo_acumulado')
        .select('id, energia_total_kwh, potencia_total_kw, gas_total_m3, vazao_total_l')
        .eq('condominio_id', userInfo.condominio_id)
        .eq('device_id', deviceId)
        .eq('data', hoje)
        .single()

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('Erro ao verificar dados acumulados existentes:', checkError)
        return
      }

      if (existing) {
        const { error: updateError } = await supabase
          .from('consumo_acumulado')
          .update({
            energia_total_kwh: Math.max(parseFloat(existing.energia_total_kwh) || 0, energiaTotal),
            potencia_total_kw: (parseFloat(existing.potencia_total_kw) || 0) + potenciaTotal,
            gas_total_m3: (parseFloat(existing.gas_total_m3) || 0) + gasTotal,
            vazao_total_l: (parseFloat(existing.vazao_total_l) || 0) + vazaoTotal,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)

        if (updateError) {
          console.error('Erro ao atualizar dados acumulados:', updateError)
        } else {
          console.log('✅ Dados acumulados atualizados no banco (Sindico):', {
            energiaTotal: energiaTotal.toFixed(2),
            potenciaTotal: potenciaTotal.toFixed(2),
            gasTotal: gasTotal.toFixed(4),
            vazaoTotal: vazaoTotal.toFixed(2)
          })
        }
      } else {
        const { error: insertError } = await supabase
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

        if (insertError) {
          console.error('Erro ao inserir dados acumulados:', insertError)
        } else {
          console.log('✅ Dados acumulados salvos no banco (Sindico):', {
            energiaTotal: energiaTotal.toFixed(2),
            potenciaTotal: potenciaTotal.toFixed(2),
            gasTotal: gasTotal.toFixed(4),
            vazaoTotal: vazaoTotal.toFixed(2)
          })
        }
      }
    } catch (err) {
      console.error('Erro inesperado ao salvar dados acumulados:', err)
    }
  }

  // Função para carregar valores acumulados do banco de dados
  const loadAccumulatedValues = async () => {
    if (!deviceId || !userInfo?.condominio_id) return

    try {
      const hoje = new Date().toISOString().split('T')[0]
      const { data: acumuladoData, error: acumuladoError } = await supabase
        .from('consumo_acumulado')
        .select('energia_total_kwh, potencia_total_kw, gas_total_m3, vazao_total_l')
        .eq('condominio_id', userInfo.condominio_id)
        .eq('device_id', deviceId)
        .eq('data', hoje)
        .single()

      if (!acumuladoError && acumuladoData) {
        setAccumulatedValues({
          energiaTotal: parseFloat(acumuladoData.energia_total_kwh) || 0,
          potenciaTotal: parseFloat(acumuladoData.potencia_total_kw) || 0,
          gasTotal: parseFloat(acumuladoData.gas_total_m3) || 0,
          vazaoTotal: parseFloat(acumuladoData.vazao_total_l) || 0
        })
        console.log('✅ Valores acumulados carregados da tabela consumo_acumulado (Sindico):', acumuladoData)
        return
      }

      const { data, error } = await supabase
        .from('leituras_sensores')
        .select('energia_kwh, potencia_kw, vazao_l_s')
        .eq('device_id', deviceId)

      if (error) {
        console.error('Erro ao carregar valores acumulados:', error)
        return
      }

      if (data && data.length > 0) {
        const energiaTotal = Math.max(...data.map(item => parseFloat(item.energia_kwh) || 0))
        const potenciaTotal = data.reduce((sum, item) => sum + (parseFloat(item.potencia_kw) || 0), 0)
        const gasTotal = data.reduce((sum, item) => sum + ((parseFloat(item.potencia_kw) || 0) * 0.1), 0)
        const intervaloMedicao = 30
        const vazaoTotal = data.reduce((sum, item) => sum + (((parseFloat(item.vazao_l_s) || 0) * 100) * intervaloMedicao), 0) // Multiplicado por 100

        setAccumulatedValues({
          energiaTotal: energiaTotal,
          potenciaTotal: potenciaTotal,
          gasTotal: gasTotal,
          vazaoTotal: vazaoTotal
        })
      } else {
        setAccumulatedValues({ energiaTotal: 0, potenciaTotal: 0, gasTotal: 0, vazaoTotal: 0 })
      }
    } catch (err) {
      console.error('Erro ao carregar valores acumulados:', err)
    }
  }

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
        setDbConnected(false)
      } else if (data && data.length > 0) {
        setDbConnected(true)
        const formattedData = data.reverse().map(item => ({
          time: new Date(item.reading_time).toLocaleTimeString('pt-BR'),
          timestamp: new Date(item.reading_time).getTime(),
          temp_ida: parseFloat(item.temp_ida) || 0,
          temp_retorno: parseFloat(item.temp_retorno) || 0,
          deltaT: parseFloat(item.deltat) || 0,
            vazao: (parseFloat(item.vazao_l_s) || 0) * 100, // Multiplicado por 100
          potencia: parseFloat(item.potencia_kw) || 0,
          energia: parseFloat(item.energia_kwh) || 0,
          gas: (parseFloat(item.potencia_kw) || 0) * 0.1
        }))
        setHistoryData(formattedData.slice(-maxHistoryPoints))
      } else {
        setDbConnected(true)
      }
    } catch (err) {
      setDbConnected(false)
    } finally {
      setLoadingHistory(false)
    }
  }

  const loadAvailableDevices = async () => {
    if (!userInfo) {
      console.log('⏸️ userInfo não disponível (Sindico), aguardando...')
      return
    }
    
    setLoadingDevices(true)
    try {
      console.log('🔍 Carregando dispositivos (Sindico)...', {
        role: userInfo.role,
        condominio_id: userInfo.condominio_id,
        is_sindico: userInfo.is_sindico
      })
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 8000)
      )
      
      // Primeiro tenta usar a função RPC (não passa por RLS, evita recursão)
      let data = null
      let error = null
      
      if (userInfo.condominio_id) {
        console.log('📋 Tentando usar função RPC get_dispositivos_by_condominio...')
        try {
          const rpcPromise = supabase.rpc('get_dispositivos_by_condominio', {
            p_condominio_id: userInfo.condominio_id
          })
          const rpcResult = await Promise.race([rpcPromise, timeoutPromise])
          
          if (rpcResult.data) {
            // Formatar dados da RPC para o formato esperado
            data = rpcResult.data.map(item => ({
              device_id: item.device_id,
              unidade: item.unidade,
              localizacao: item.localizacao,
              condominio_id: item.condominio_id,
              condominios: item.nome_condominio ? { nome: item.nome_condominio } : null
            }))
            console.log('✅ Dispositivos carregados via RPC (Sindico):', data.length, 'dispositivo(s)')
          } else {
            error = rpcResult.error
          }
        } catch (rpcError) {
          console.warn('⚠️ Função RPC não disponível, tentando query direta...', rpcError)
          // Se RPC falhar, tenta query direta
          let query = supabase
            .from('dispositivos')
            .select('device_id, unidade, localizacao, condominio_id, condominios(nome)')
          
          if ((userInfo.role === 'zelador' || userInfo.is_sindico) && userInfo.condominio_id) {
            query = query.eq('condominio_id', userInfo.condominio_id)
            console.log('📋 Filtrando dispositivos por condominio_id:', userInfo.condominio_id)
          }
          
          const queryPromise = query.order('device_id')
          const queryResult = await Promise.race([queryPromise, timeoutPromise])
          data = queryResult.data
          error = queryResult.error
        }
      } else {
        // Se não tem condominio_id, tenta query direta
        let query = supabase
          .from('dispositivos')
          .select('device_id, unidade, localizacao, condominio_id, condominios(nome)')
        
        const queryPromise = query.order('device_id')
        const queryResult = await Promise.race([queryPromise, timeoutPromise])
        data = queryResult.data
        error = queryResult.error
      }
      
      if (error) {
        console.error('❌ Erro ao carregar dispositivos (Sindico):', error)
        console.error('   Código:', error.code)
        console.error('   Mensagem:', error.message)
      } else if (data && data.length > 0) {
        setAvailableDevices(data)
        console.log('✅ Dispositivos carregados (Sindico):', data.length, 'dispositivo(s)')
        console.log('📋 Dispositivos:', data.map(d => ({ device_id: d.device_id, unidade: d.unidade, localizacao: d.localizacao })))
        
        if (!deviceId) {
          const selectedDeviceId = data[0].device_id
          setDeviceId(selectedDeviceId)
          console.log('✅ deviceId selecionado automaticamente (Sindico):', selectedDeviceId)
          console.log('📋 deviceId agora está disponível para salvar dados!')
          
          if (data[0].condominios) {
            setCondominio(data[0].condominios.nome)
          }
        } else {
          console.log('ℹ️ deviceId já está configurado (Sindico):', deviceId)
        }
      } else {
        console.error('❌ ERRO: Nenhum dispositivo disponível para este usuário (Sindico)!')
        console.error('📋 userInfo:', userInfo)
        console.error('📋 Role:', userInfo.role)
        console.error('📋 Condominio ID:', userInfo.condominio_id)
        console.error('📋 is_sindico:', userInfo.is_sindico)
        console.error('📋 Verifique se há dispositivos cadastrados para o condomínio:', userInfo?.condominio_id)
        console.error('📋 Execute o script dados_exemplo_automatico.sql para criar dispositivos')
      }
    } catch (err) {
      console.error('❌ Erro inesperado ao carregar dispositivos (Sindico):', err)
    } finally {
      setLoadingDevices(false)
    }
  }

  useEffect(() => {
    if (userInfo) {
      console.log('🔄 useEffect: userInfo disponível, carregando dispositivos (Sindico)...', {
        role: userInfo.role,
        condominio_id: userInfo.condominio_id,
        is_sindico: userInfo.is_sindico
      })
      loadAvailableDevices()
    } else {
      console.log('⏸️ useEffect: userInfo não disponível ainda (Sindico)')
    }
  }, [userInfo])

  useEffect(() => {
    if (userInfo && deviceId) {
      loadHistoryFromDatabase()
      loadAccumulatedValues()
    }
  }, [userInfo, deviceId])

  // Configura intervalo para salvar dados a cada 30 segundos
  useEffect(() => {
    if (!deviceId) {
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
            loadAccumulatedValues()
          })
          .catch(err => {
            console.error('Erro ao salvar no banco (não crítico):', err)
          })
        pendingDataRef.current = null
      } else {
        console.log('Nenhum dado pendente para salvar')
      }
    }, 30 * 1000) // 30 segundos

    // Configura intervalo de 1 minuto para salvar dados agregados (médias e totais)
    accumulatedIntervalRef.current = setInterval(() => {
      console.log('⏰ Intervalo de salvamento de dados agregados executado (Sindico)')
      // Salva dados agregados com médias de temperatura e totais
      saveAggregatedData()
    }, 1 * 60 * 1000) // 1 minuto

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
  }, [deviceId])

  useEffect(() => {
    let client = null
    
    try {
      client = mqtt.connect('wss://broker.hivemq.com:8884/mqtt', {
        clientId: 'dashboard_' + Math.random().toString(16).substr(2, 8),
        reconnectPeriod: 5000,
        connectTimeout: 10000
      })
      clientRef.current = client
      
      client.on('connect', () => {
        setIsConnected(true)
        try {
          client.subscribe('carolinepaz/sensores', (err) => {
            if (err) console.error('Erro ao subscrever:', err)
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
          console.log('✅ Dados do sensor atualizados (Sindico):', processedData)
          
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
            const sliced = newData.slice(-maxHistoryPoints)
            console.log('✅ Histórico atualizado (Sindico):', sliced.length, 'pontos')
            console.log('📊 Último ponto do histórico:', historyPoint)
            return sliced
          })
          
          // Armazena os dados mais recentes para salvar a cada 30 segundos (backup)
          pendingDataRef.current = processedData
          
          // Salva imediatamente no banco quando chegam dados MQTT (se deviceId estiver disponível)
          console.log('🔍 Verificando deviceId antes de salvar (Sindico):', {
            deviceId: deviceId,
            hasDeviceId: !!deviceId,
            userInfo: userInfo,
            availableDevices: availableDevices?.length || 0
          })
          
          if (deviceId) {
            console.log('💾 Tentando salvar dados MQTT no banco (Sindico)...')
            saveToDatabase(processedData)
              .then((result) => {
                console.log('✅ Dados MQTT salvos imediatamente no banco (Sindico)', result)
                // Após salvar, verifica se deve salvar dados agregados (a cada 10 leituras)
                setHistoryData(currentHistory => {
                  if (currentHistory.length >= 10 && currentHistory.length % 10 === 0) {
                    console.log('📊 Salvando dados agregados após 10 leituras (Sindico)...')
                    setTimeout(() => saveAggregatedData(), 1000)
                  }
                  return currentHistory
                })
              })
              .catch(err => {
                console.error('❌ ERRO ao salvar dados MQTT imediatamente (Sindico):', err)
                console.error('   Stack:', err.stack)
              })
          } else {
            console.error('❌ ERRO: deviceId não disponível (Sindico)!')
            console.error('   deviceId:', deviceId)
            console.error('   userInfo:', userInfo)
            console.error('   availableDevices:', availableDevices)
            console.error('   → Os dados MQTT serão salvos quando deviceId estiver configurado')
            console.error('   → Verifique se há dispositivos cadastrados para o condomínio:', userInfo?.condominio_id)
          }
        } catch (error) {
          console.error('Erro ao parsear JSON:', error)
        }
      })
      
      client.on('error', (error) => {
        console.error('Erro MQTT:', error)
        setIsConnected(false)
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
    }
    
    return () => {
      if (client) {
        try {
          client.end()
        } catch (err) {
          console.error('Erro ao fechar conexão MQTT:', err)
        }
      }
    }
  }, [])

  // Calcula valores acumulados a partir do histórico em memória
  const consumoGasCalculado = historyData.reduce((total, ponto) => {
    return total + (ponto.gas || 0)
  }, 0)
  
  const energiaTotalCalculada = historyData.length > 0
    ? Math.max(...historyData.map(p => p.energia || 0))
    : sensorData.energia_kWh
  
  const potenciaTotalCalculada = historyData.reduce((total, ponto) => {
    return total + (ponto.potencia || 0)
  }, 0)
  
  const intervaloMedicao = 30 // 30 segundos entre cada leitura
  const vazaoAcumuladaCalculada = historyData.reduce((total, ponto) => {
    return total + ((ponto.vazao || 0) * intervaloMedicao)
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
            <h1>Dashboard Caldeira - Síndico</h1>
            <div className="connection-status">
              <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}></span>
              <span>{isConnected ? 'MQTT Conectado' : 'MQTT Desconectado'}</span>
              {dbConnected && (
                <>
                  <span className="status-indicator connected" style={{ marginLeft: '10px' }}></span>
                  <span>Banco OK</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="header-right">
          {userInfo && (
            <div className="user-info" style={{ marginRight: '15px', fontSize: '14px', color: '#666' }}>
              <span style={{ fontWeight: '600' }}>Síndico</span>
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
                    {device.device_id} {device.unidade ? `- Unidade ${device.unidade}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          {userInfo && deviceId && userInfo.condominio_id && (
            <SystemConfig 
              userInfo={userInfo}
              deviceId={deviceId}
              condominioId={userInfo.condominio_id}
              onConfigUpdated={() => {}}
            />
          )}
          <button onClick={onLogout} className="logout-button">Sair</button>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="dashboard-tabs">
          <button className={`tab-button ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            Dashboard Principal
          </button>
          <button className={`tab-button ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
            Histórico de Consumo
          </button>
          <button className={`tab-button ${activeTab === 'costs' ? 'active' : ''}`} onClick={() => setActiveTab('costs')}>
            Gestão de Custos
          </button>
          <button className={`tab-button ${activeTab === 'alerts' ? 'active' : ''}`} onClick={() => setActiveTab('alerts')}>
            Alertas
          </button>
          <button className={`tab-button ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
            Gerenciar Usuários
          </button>
        </div>

        {activeTab === 'dashboard' && (
          <>
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
            <div className="charts-grid">
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
                    <XAxis dataKey="time" stroke="#666" fontSize={12} tick={{ fill: '#666' }} />
                    <YAxis stroke="#666" fontSize={12} tick={{ fill: '#666' }} label={{ value: 'Temperatura (°C)', angle: -90, position: 'insideLeft' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #007CB6', borderRadius: '8px' }} />
                    <Legend />
                    <Area type="monotone" dataKey="temp_ida" name="Temperatura de Saída" stroke="#007CB6" fillOpacity={1} fill="url(#colorTempIda)" strokeWidth={2} />
                    <Area type="monotone" dataKey="temp_retorno" name="Temperatura de Entrada" stroke="#00B2E3" fillOpacity={1} fill="url(#colorTempRetorno)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
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
                    <XAxis dataKey="time" stroke="#666" fontSize={12} tick={{ fill: '#666' }} />
                    <YAxis stroke="#666" fontSize={12} tick={{ fill: '#666' }} label={{ value: 'Vazão Acumulada (L)', angle: -90, position: 'insideLeft' }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#fff', border: '1px solid #00B2A9', borderRadius: '8px' }}
                      formatter={(value) => [`${parseFloat(value).toFixed(2)} L`, 'Vazão Acumulada']}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="vazaoAcumulada" name="Vazão Acumulada (L)" stroke="#00B2A9" strokeWidth={3} dot={{ fill: '#00B2A9', r: 4 }} activeDot={{ r: 6 }} />
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
                      <linearGradient id="colorPotenciaSindico" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#7FC241" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#7FC241" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorEnergiaSindico" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#FFD600" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#FFD600" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis dataKey="time" stroke="#666" fontSize={12} tick={{ fill: '#666' }} />
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
                    <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #7FC241', borderRadius: '8px' }} />
                    <Legend />
                    <Area 
                      yAxisId="left"
                      type="monotone" 
                      dataKey="potencia" 
                      name="Potência (kW)" 
                      stroke="#7FC241" 
                      fillOpacity={1} 
                      fill="url(#colorPotenciaSindico)"
                      strokeWidth={2}
                    />
                    <Area 
                      yAxisId="right"
                      type="monotone" 
                      dataKey="energia" 
                      name="Energia (kWh)" 
                      stroke="#FFD600" 
                      fillOpacity={1} 
                      fill="url(#colorEnergiaSindico)"
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
                    <XAxis dataKey="time" stroke="#666" fontSize={12} tick={{ fill: '#666' }} />
                    <YAxis 
                      stroke="#666"
                      fontSize={12}
                      tick={{ fill: '#666' }}
                      label={{ value: 'Consumo (m³/h)', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #004B87', borderRadius: '8px' }} />
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
            </div>
          </>
        )}

        {activeTab === 'history' && (
          <ConsumptionHistory 
            key={`history-${deviceId}-${historyData.length}`}
            deviceId={deviceId} 
            userInfo={userInfo} 
            historyData={historyData} 
          />
        )}
        {activeTab === 'costs' && (
          <CostManagement 
            key={`costs-${deviceId}-${historyData.length}`}
            deviceId={deviceId} 
            userInfo={userInfo} 
            historyData={historyData} 
          />
        )}
        {activeTab === 'alerts' && <AlertsManagement deviceId={deviceId} userInfo={userInfo} historyData={historyData} />}
        {activeTab === 'users' && <UserManagement userInfo={userInfo} />}
      </main>
    </div>
  )
}

export default SindicoDashboard

