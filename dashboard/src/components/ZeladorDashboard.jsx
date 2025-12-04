import { useState, useEffect, useRef } from 'react'
import mqtt from 'mqtt'
import { supabase } from '../supabaseClient'
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import Logo from './Logo'
import SystemConfig from './SystemConfig'
import ConsumptionHistory from './ConsumptionHistory'
import EducationalGuide from './EducationalGuide'
import WeatherAlerts from './WeatherAlerts'
import './Dashboard.css'

function ZeladorDashboard({ onLogout, user, userInfo }) {
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
  const [condominioInfo, setCondominioInfo] = useState(null)
  const [availableDevices, setAvailableDevices] = useState([])
  const [deviceId, setDeviceId] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [setpoint, setSetpoint] = useState(65)
  const [systemConfig, setSystemConfig] = useState(null)
  const [dbConnected, setDbConnected] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [activeTab, setActiveTab] = useState('dashboard')
  const clientRef = useRef(null)
  const maxHistoryPoints = 50
  const maxHistoryLoad = 100

  // Função para salvar dados no Supabase
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
          if (error.code === '23503') {
            console.warn('Dispositivo não encontrado no banco.')
            setDbConnected(false)
            return
          }
          if (attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
            continue
          }
          console.error('Erro ao salvar no banco:', error)
          setDbConnected(false)
        } else {
          setDbConnected(true)
          return
        }
      } catch (err) {
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
          continue
        }
        console.error('Erro inesperado ao salvar no banco:', err)
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
        const formattedData = data
          .reverse()
          .map(item => ({
            time: new Date(item.reading_time).toLocaleTimeString('pt-BR'),
            timestamp: new Date(item.reading_time).getTime(),
            temp_ida: parseFloat(item.temp_ida) || 0,
            temp_retorno: parseFloat(item.temp_retorno) || 0,
            deltaT: parseFloat(item.deltaT) || 0,
            vazao: parseFloat(item.vazao_L_s) || 0,
            potencia: parseFloat(item.potencia_kW) || 0,
            energia: parseFloat(item.energia_kWh) || 0,
            gas: (parseFloat(item.potencia_kW) || 0) * 0.1
          }))
        
        setHistoryData(formattedData.slice(-maxHistoryPoints))
      } else {
        setDbConnected(true)
      }
    } catch (err) {
      console.error('Erro inesperado ao carregar histórico:', err)
      setDbConnected(false)
    } finally {
      setLoadingHistory(false)
    }
  }

  // Função para carregar dispositivos
  const loadAvailableDevices = async () => {
    if (!userInfo) return

    setLoadingDevices(true)
    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 8000)
      )

      let query = supabase
        .from('dispositivos')
        .select('device_id, unidade, localizacao, condominio_id, condominios(nome)')

      if (userInfo.role === 'zelador' && userInfo.condominio_id) {
        query = query.eq('condominio_id', userInfo.condominio_id)
      }

      const queryPromise = query.order('device_id')
      const { data, error } = await Promise.race([queryPromise, timeoutPromise])

      if (error) {
        console.error('Erro ao carregar dispositivos:', error)
      } else if (data && data.length > 0) {
        setAvailableDevices(data)
        if (!deviceId) {
          setDeviceId(data[0].device_id)
          if (data[0].condominios) {
            setCondominioInfo(data[0].condominios)
            setCondominio(data[0].condominios.nome)
          }
        }
      }
    } catch (err) {
      console.error('Erro ao carregar dispositivos:', err)
    } finally {
      setLoadingDevices(false)
    }
  }

  // Carrega dados iniciais
  useEffect(() => {
    if (userInfo) {
      loadAvailableDevices()
    }
  }, [userInfo])

  useEffect(() => {
    if (userInfo && deviceId) {
      loadHistoryFromDatabase()
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
      setIsConnected(true)
      client.subscribe('carolinepaz/sensores', (err) => {
        if (err) {
          console.error('Erro ao subscrever:', err)
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
          return newData.slice(-maxHistoryPoints)
        })
        
        saveToDatabase(processedData)
      } catch (error) {
        console.error('Erro ao parsear JSON:', error)
      }
    })

    client.on('error', (error) => {
      console.error('Erro MQTT:', error)
      setIsConnected(false)
    })

    return () => {
      if (client) {
        client.end()
      }
    }
  }, [])

  const consumoGas = (sensorData.potencia_kW * 0.1).toFixed(4)
  const intervaloMedicao = 5
  const vazaoAcumulada = historyData.reduce((total, ponto) => {
    return total + (ponto.vazao * intervaloMedicao)
  }, 0)

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-left">
          <Logo />
          <div className="header-title-section">
            <h1>Dashboard Caldeira - Zelador</h1>
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
              <span style={{ fontWeight: '600' }}>Zelador</span>
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
          <button onClick={onLogout} className="logout-button">
            Sair
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="dashboard-tabs">
          <button 
            className={`tab-button ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            Dashboard Principal
          </button>
          <button 
            className={`tab-button ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            Histórico de Consumo
          </button>
          <button 
            className={`tab-button ${activeTab === 'guide' ? 'active' : ''}`}
            onClick={() => setActiveTab('guide')}
          >
            Guia Educativo
          </button>
          <button 
            className={`tab-button ${activeTab === 'weather' ? 'active' : ''}`}
            onClick={() => setActiveTab('weather')}
          >
            Alertas Meteorológicos
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
                  <h3>Vazão de Água</h3>
                </div>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={historyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis dataKey="time" stroke="#666" fontSize={12} tick={{ fill: '#666' }} />
                    <YAxis stroke="#666" fontSize={12} tick={{ fill: '#666' }} label={{ value: 'Vazão (L/s)', angle: -90, position: 'insideLeft' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #00B2A9', borderRadius: '8px' }} />
                    <Legend />
                    <Line type="monotone" dataKey="vazao" name="Vazão (L/s)" stroke="#00B2A9" strokeWidth={3} dot={{ fill: '#00B2A9', r: 4 }} activeDot={{ r: 6 }} />
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
                      <linearGradient id="colorPotenciaZelador" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#7FC241" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#7FC241" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorEnergiaZelador" x1="0" y1="0" x2="0" y2="1">
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
                      fill="url(#colorPotenciaZelador)"
                      strokeWidth={2}
                    />
                    <Area 
                      yAxisId="right"
                      type="monotone" 
                      dataKey="energia" 
                      name="Energia (kWh)" 
                      stroke="#FFD600" 
                      fillOpacity={1} 
                      fill="url(#colorEnergiaZelador)"
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
          <ConsumptionHistory deviceId={deviceId} userInfo={userInfo} />
        )}

        {activeTab === 'guide' && (
          <EducationalGuide />
        )}

        {activeTab === 'weather' && (
          <WeatherAlerts userInfo={userInfo} deviceId={deviceId} />
        )}
      </main>
    </div>
  )
}

export default ZeladorDashboard




