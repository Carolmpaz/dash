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
  const clientRef = useRef(null)
  const maxHistoryPoints = 50 // Máximo de pontos no histórico
  const maxHistoryLoad = 100 // Máximo de pontos a carregar do banco

  // Função para salvar dados no Supabase com retry
  const saveToDatabase = async (data, retries = 3) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const { error } = await supabase
          .from('leituras_sensores')
          .insert({
            device_id: deviceId,
            temp_ida: data.temp_ida || null,
            temp_retorno: data.temp_retorno || null,
            deltaT: data.deltaT || null,
            vazao_L_s: data.vazao_L_s || null,
            potencia_kW: data.potencia_kW || null,
            energia_kWh: data.energia_kWh || null
          })

        if (error) {
          // Se o erro for de dispositivo não encontrado, não tenta novamente
          if (error.code === '23503') {
            console.warn('Dispositivo não encontrado no banco. Configure o device_id e cadastre o dispositivo.')
            setDbConnected(false)
            return
          }
          
          // Para outros erros, tenta novamente
          if (attempt < retries) {
            console.warn(`Tentativa ${attempt} falhou, tentando novamente...`, error.message)
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt)) // Backoff exponencial
            continue
          }
          
          console.error('Erro ao salvar no banco após todas as tentativas:', error)
          setDbConnected(false)
        } else {
          setDbConnected(true)
          return // Sucesso, sai da função
        }
      } catch (err) {
        if (attempt < retries) {
          console.warn(`Erro inesperado na tentativa ${attempt}, tentando novamente...`, err)
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
            deltaT: parseFloat(item.deltaT) || 0,
            vazao: parseFloat(item.vazao_L_s) || 0,
            potencia: parseFloat(item.potencia_kW) || 0,
            energia: parseFloat(item.energia_kWh) || 0,
            gas: (parseFloat(item.potencia_kW) || 0) * 0.1
          }))
        
        setHistoryData(formattedData.slice(-maxHistoryPoints))
        console.log(`Histórico carregado: ${formattedData.length} pontos`)
      } else {
        setDbConnected(true)
        console.log('Nenhum histórico encontrado no banco')
      }
    } catch (err) {
      console.error('Erro inesperado ao carregar histórico:', err)
      setDbConnected(false)
    } finally {
      setLoadingHistory(false)
    }
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
        // Seleciona o primeiro dispositivo automaticamente
        if (!deviceId) {
          setDeviceId(data[0].device_id)
          // Carrega informações do condomínio
          if (data[0].condominios) {
            setCondominioInfo(data[0].condominios)
            setCondominio(data[0].condominios.nome)
          }
        }
      } else {
        console.warn('Nenhum dispositivo disponível para este usuário')
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
      loadAvailableDevices()
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

  // Conexão MQTT
  useEffect(() => {
    const client = mqtt.connect('ws://broker.hivemq.com:8000/mqtt', {
      clientId: 'dashboard_' + Math.random().toString(16).substr(2, 8),
      reconnectPeriod: 5000,
      connectTimeout: 10000
    })

    clientRef.current = client

    client.on('connect', () => {
      console.log('Conectado ao broker MQTT')
      setIsConnected(true)
      client.subscribe('carolinepaz/sensores', (err) => {
        if (err) {
          console.error('Erro ao subscrever:', err)
        } else {
          console.log('Subscrito ao tópico: carolinepaz/sensores')
        }
      })
    })

    client.on('message', (topic, message) => {
      try {
        const data = JSON.parse(message.toString())
        const processedData = {
          temp_ida: data.temp_ida === -127 ? 0 : data.temp_ida,
          temp_retorno: data.temp_retorno === -127 ? 0 : data.temp_retorno,
          deltaT: data.deltaT || 0,
          vazao_L_s: data.vazao_L_s || 0,
          potencia_kW: data.potencia_kW || 0,
          energia_kWh: data.energia_kWh || 0
        }
        
        setSensorData(processedData)
        
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
        
        setHistoryData(prev => {
          const newData = [...prev, historyPoint]
          return newData.slice(-maxHistoryPoints) // Mantém apenas os últimos N pontos
        })
        
        // Salva no banco de dados
        saveToDatabase(processedData)
        
        console.log('Dados recebidos:', processedData)
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

    return () => {
      if (client) {
        client.end()
      }
    }
  }, [])

  const consumoGas = (sensorData.potencia_kW * 0.1).toFixed(4)

  // Calcula vazão acumulada (soma de todas as vazões do histórico)
  // Assumindo intervalo de 5 segundos entre cada medição (conforme código Arduino)
  const intervaloMedicao = 5 // segundos
  const vazaoAcumulada = historyData.reduce((total, ponto) => {
    return total + (ponto.vazao * intervaloMedicao) // vazão em L/s * segundos = litros
  }, 0)

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
            <div className="kpi-value">{sensorData.potencia_kW.toFixed(2)} kW</div>
          </div>
          <div className="kpi-card highlight">
            <div className="kpi-label">Energia Acumulada</div>
            <div className="kpi-value">{sensorData.energia_kWh.toFixed(2)} kWh</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Vazão Acumulada</div>
            <div className="kpi-value">{vazaoAcumulada.toFixed(2)} L</div>
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

          {/* Gráfico de Vazão */}
          <div className="chart-card">
            <div className="chart-header">
              <h3>Vazão de Água</h3>
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
                  label={{ value: 'Vazão (L/s)', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    border: '1px solid #00B2A9',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="vazao" 
                  name="Vazão (L/s)" 
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
          <ConsumptionHistory deviceId={deviceId} userInfo={userInfo} />
        )}
      </main>
    </div>
  )
}

export default Dashboard
