import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { fetchCurrentWeather, getCoordinatesFromAddress } from '../services/weatherService'
import './AlertsManagement.css'

const GAS_PRICE_PER_M3 = 8.00

function AlertsManagement({ deviceId, userInfo, historyData: realTimeHistoryData = [] }) {
  const [activeSection, setActiveSection] = useState('consumption') // 'consumption' ou 'weather'

  // Estados para alertas de consumo
  const [gasLimit, setGasLimit] = useState(100) // m³
  const [costLimit, setCostLimit] = useState(800) // R$
  const [consumptionAlerts, setConsumptionAlerts] = useState([])
  const [currentConsumption, setCurrentConsumption] = useState(0)
  const [currentCost, setCurrentCost] = useState(0)
  const [loadingConsumption, setLoadingConsumption] = useState(false)
  const [limitsLoaded, setLimitsLoaded] = useState(false)
  const [dbConsumptionData, setDbConsumptionData] = useState([])

  // Estados para alertas meteorológicos
  const [weatherData, setWeatherData] = useState(null)
  const [weatherAlerts, setWeatherAlerts] = useState([])
  const [loadingWeather, setLoadingWeather] = useState(false)
  const [temperatureThreshold, setTemperatureThreshold] = useState(5) // Variação de 5°C
  const [weatherError, setWeatherError] = useState(null) // Erro ao carregar dados meteorológicos

  useEffect(() => {
    if (deviceId && userInfo && activeSection === 'consumption') {
      loadCurrentConsumption()
      loadLimits()
    }
  }, [deviceId, userInfo, activeSection])

  // Salva limites apenas quando mudarem manualmente (não no carregamento inicial)
  useEffect(() => {
    if (deviceId && userInfo && activeSection === 'consumption' && limitsLoaded && (gasLimit || costLimit)) {
      saveLimits()
    }
  }, [gasLimit, costLimit, deviceId, userInfo, activeSection, limitsLoaded])

  useEffect(() => {
    if (userInfo?.condominio_id && activeSection === 'weather') {
      loadWeatherData()
      const interval = setInterval(loadWeatherData, 30 * 60 * 1000)
      return () => clearInterval(interval)
    }
  }, [userInfo, deviceId, activeSection])

  const loadLimits = async () => {
    if (!userInfo?.condominio_id || !deviceId) return

    try {
      const { data } = await supabase
        .from('configuracao_sistema')
        .select('limite_consumo_gas, limite_custo')
        .eq('condominio_id', userInfo.condominio_id)
        .eq('device_id', deviceId)
        .single()

      if (data) {
        if (data.limite_consumo_gas) setGasLimit(data.limite_consumo_gas)
        if (data.limite_custo) setCostLimit(data.limite_custo)
        setLimitsLoaded(true) // Marca que os limites foram carregados
      } else {
        setLimitsLoaded(true) // Marca mesmo se não houver dados salvos
      }
    } catch (err) {
      console.error('Erro ao carregar limites:', err)
      setLimitsLoaded(true) // Marca mesmo em caso de erro
    }
  }

  const saveLimits = async () => {
    if (!userInfo?.condominio_id || !deviceId) return

    try {
      const { data: existing } = await supabase
        .from('configuracao_sistema')
        .select('id')
        .eq('condominio_id', userInfo.condominio_id)
        .eq('device_id', deviceId)
        .single()

      if (existing) {
        await supabase
          .from('configuracao_sistema')
          .update({
            limite_consumo_gas: gasLimit,
            limite_custo: costLimit,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
      } else {
        await supabase
          .from('configuracao_sistema')
          .insert({
            condominio_id: userInfo.condominio_id,
            device_id: deviceId,
            limite_consumo_gas: gasLimit,
            limite_custo: costLimit
          })
      }
    } catch (err) {
      console.error('Erro ao salvar limites:', err)
    }
  }

  const loadCurrentConsumption = async () => {
    if (!deviceId) return

    setLoadingConsumption(true)
    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      const { data, error } = await supabase
        .from('leituras_sensores')
        .select('potencia_kw')
        .eq('device_id', deviceId)
        .gte('reading_time', today.toISOString())
        .lt('reading_time', tomorrow.toISOString())

      if (!error && data) {
        setDbConsumptionData(data)
      } else {
        setDbConsumptionData([])
      }
    } catch (err) {
      console.error('Erro ao carregar consumo:', err)
      setDbConsumptionData([])
    } finally {
      setLoadingConsumption(false)
    }
  }

  // Calcula consumo atual combinando dados do banco com dados em tempo real
  useEffect(() => {
    // Consumo do banco de dados (hoje)
    const dbConsumption = dbConsumptionData.reduce((sum, item) => {
      return sum + ((parseFloat(item.potencia_kw) || 0) * 0.1)
    }, 0)

    // Consumo em tempo real (apenas dados de hoje)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const realTimeToday = realTimeHistoryData.filter(item => {
      const itemDate = item.reading_time ? new Date(item.reading_time) : new Date()
      return itemDate >= today
    })
    
    const realTimeConsumption = realTimeToday.reduce((sum, item) => {
      return sum + (item.gas || ((item.potencia || 0) * 0.1))
    }, 0)

    const totalConsumption = dbConsumption + realTimeConsumption
    setCurrentConsumption(totalConsumption)
    setCurrentCost(totalConsumption * GAS_PRICE_PER_M3)
    
    if (dbConsumptionData.length > 0 || realTimeToday.length > 0) {
      console.log(`✅ Consumo atualizado: ${totalConsumption.toFixed(4)} m³ (${dbConsumption.toFixed(4)} do banco + ${realTimeConsumption.toFixed(4)} em tempo real)`)
    }
  }, [dbConsumptionData, realTimeHistoryData])

  const checkConsumptionAlerts = useCallback(() => {
    const newAlerts = []
    
    if (currentConsumption >= gasLimit) {
      newAlerts.push({
        type: 'gas',
        message: `⚠️ Consumo de gás ultrapassou o limite: ${currentConsumption.toFixed(4)} m³ (limite: ${gasLimit} m³)`,
        value: currentConsumption,
        limit: gasLimit,
        timestamp: new Date().toLocaleString('pt-BR')
      })
    }

    if (currentCost >= costLimit) {
      newAlerts.push({
        type: 'cost',
        message: `⚠️ Custo ultrapassou o limite: R$ ${currentCost.toFixed(2)} (limite: R$ ${costLimit.toFixed(2)})`,
        value: currentCost,
        limit: costLimit,
        timestamp: new Date().toLocaleString('pt-BR')
      })
    }

    setConsumptionAlerts(newAlerts)
  }, [currentConsumption, currentCost, gasLimit, costLimit])

  // useEffect que usa checkConsumptionAlerts - deve estar DEPOIS da definição da função
  useEffect(() => {
    if (deviceId && activeSection === 'consumption') {
      checkConsumptionAlerts() // Verifica imediatamente
      const interval = setInterval(() => {
        checkConsumptionAlerts()
      }, 60000)
      return () => clearInterval(interval)
    }
  }, [deviceId, activeSection, checkConsumptionAlerts])

  const loadWeatherData = async () => {
    if (!userInfo?.condominio_id) {
      console.error('❌ [AlertsManagement] condominio_id não disponível')
      setWeatherError('Condomínio não identificado')
      return
    }

    console.log('🌤️ [AlertsManagement] Iniciando carregamento de dados meteorológicos...')
    setLoadingWeather(true)
    setWeatherError(null) // Limpa erros anteriores
    
    try {
      // Sempre usa "São Paulo, SP" como endereço padrão
      const enderecoPadrao = 'São Paulo, SP'
      console.log('📍 [AlertsManagement] Usando endereço padrão:', enderecoPadrao)
      
      const coords = await getCoordinatesFromAddress(enderecoPadrao)
      if (!coords) {
        const errorMsg = 'Não foi possível obter coordenadas. Verifique se a API key está configurada.'
        console.error('❌ [AlertsManagement]', errorMsg)
        setWeatherError(errorMsg)
        setLoadingWeather(false)
        return
      }
      
      console.log('✅ [AlertsManagement] Coordenadas obtidas:', coords)
      const weather = await fetchCurrentWeather(coords.lat, coords.lon)
      
      if (!weather) {
        const errorMsg = 'Não foi possível obter dados meteorológicos. Verifique se a API key está configurada no arquivo .env'
        console.error('❌ [AlertsManagement]', errorMsg)
        setWeatherError(errorMsg)
        setLoadingWeather(false)
        return
      }
      
      console.log('✅ [AlertsManagement] Dados meteorológicos obtidos:', weather)
      setWeatherData(weather)
      setWeatherError(null) // Limpa erro se conseguiu carregar
      
      // Verifica alertas
      console.log('🔍 [AlertsManagement] Verificando alertas de temperatura...')
      checkTemperatureAlerts(weather)
      
      // Salva no banco
      console.log('💾 [AlertsManagement] Salvando dados no banco...')
      const { error: insertError } = await supabase
        .from('dados_meteorologicos')
        .insert({
          condominio_id: userInfo.condominio_id,
          temperatura_ambiente: weather.temperatura,
          umidade: weather.umidade,
          pressao: weather.pressao,
          velocidade_vento: weather.velocidade_vento,
          descricao: weather.descricao
        })
      
      if (insertError) {
        console.error('❌ [AlertsManagement] Erro ao salvar no banco:', insertError)
        // Não define erro aqui, pois os dados foram carregados com sucesso
      } else {
        console.log('✅ [AlertsManagement] Dados salvos no banco com sucesso')
      }
    } catch (err) {
      const errorMsg = `Erro ao carregar dados: ${err.message}`
      console.error('❌ [AlertsManagement] Erro ao carregar dados meteorológicos:', err)
      console.error('   Stack:', err.stack)
      setWeatherError(errorMsg)
    } finally {
      setLoadingWeather(false)
      console.log('🏁 [AlertsManagement] Carregamento finalizado')
    }
  }

  const checkTemperatureAlerts = (weather) => {
    console.log('🔍 [AlertsManagement] Verificando alertas de temperatura...')
    console.log('   Temperatura atual:', weather.temperatura)
    console.log('   Threshold:', temperatureThreshold)
    
    const newAlerts = []
    
    supabase
      .from('dados_meteorologicos')
      .select('temperatura_ambiente')
      .eq('condominio_id', userInfo.condominio_id)
      .order('reading_time', { ascending: false })
      .limit(2)
      .then(({ data, error }) => {
        if (error) {
          console.error('❌ [AlertsManagement] Erro ao buscar dados para alertas:', error)
          return
        }
        
        console.log('📊 [AlertsManagement] Dados encontrados:', data?.length || 0, 'leituras')
        
        if (data && data.length >= 2) {
          const previousTemp = data[1].temperatura_ambiente
          const currentTemp = weather.temperatura
          const variation = Math.abs(currentTemp - previousTemp)
          
          console.log('📊 [AlertsManagement] Comparação:', {
            temperatura_anterior: previousTemp,
            temperatura_atual: currentTemp,
            variacao: variation,
            threshold: temperatureThreshold
          })

          if (variation >= temperatureThreshold) {
            const isIncrease = currentTemp > previousTemp
            const alert = {
              type: isIncrease ? 'increase' : 'decrease',
              message: isIncrease 
                ? `⚠️ Aumento significativo de temperatura detectado: ${variation.toFixed(1)}°C. Considere reduzir o setpoint da caldeira.`
                : `⚠️ Queda significativa de temperatura detectada: ${variation.toFixed(1)}°C. Considere aumentar o setpoint da caldeira.`,
              temperature: currentTemp,
              variation: variation.toFixed(1),
              timestamp: new Date().toLocaleString('pt-BR')
            }
            
            newAlerts.push(alert)
            setWeatherAlerts(newAlerts)
            console.log('⚠️ [AlertsManagement] ALERTA DISPARADO:', alert)
          } else {
            console.log('✅ [AlertsManagement] Variação dentro do limite, sem alerta')
            setWeatherAlerts([])
          }
        } else {
          console.log('ℹ️ [AlertsManagement] Menos de 2 leituras disponíveis, aguardando mais dados...')
          setWeatherAlerts([])
        }
      })
      .catch(err => {
        console.error('❌ [AlertsManagement] Erro ao verificar alertas:', err)
      })
  }

  return (
    <div className="alerts-management-container">
      <div className="alerts-management-header">
        <h2>Gerenciamento de Alertas</h2>
        <p>Configure alertas de consumo e monitoramento meteorológico</p>
      </div>

      <div className="alerts-management-tabs">
        <button 
          className={`section-tab ${activeSection === 'consumption' ? 'active' : ''}`}
          onClick={() => setActiveSection('consumption')}
        >
          Alertas de Consumo
        </button>
        <button 
          className={`section-tab ${activeSection === 'weather' ? 'active' : ''}`}
          onClick={() => setActiveSection('weather')}
        >
          Alertas Meteorológicos
        </button>
      </div>

      {activeSection === 'consumption' && (
        <div className="consumption-alerts-section">
          <div className="limits-config">
            <div className="limit-card">
              <h3>Limites Configurados</h3>
              <div className="limit-inputs">
                <div className="limit-input-group">
                  <label>Limite de Consumo de Gás (m³/dia):</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={gasLimit}
                    onChange={(e) => setGasLimit(parseFloat(e.target.value) || 0)}
                    className="limit-input"
                  />
                </div>
                <div className="limit-input-group">
                  <label>Limite de Custo (R$/dia):</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={costLimit}
                    onChange={(e) => setCostLimit(parseFloat(e.target.value) || 0)}
                    className="limit-input"
                  />
                </div>
              </div>
            </div>

            <div className="current-status-card">
              <h3>Status Atual (Hoje)</h3>
              <div className="status-grid">
                <div className="status-item">
                  <span className="status-label">Consumo:</span>
                  <span className={`status-value ${currentConsumption >= gasLimit ? 'alert' : ''}`}>
                    {currentConsumption.toFixed(4)} m³
                  </span>
                  <span className="status-limit">/ {gasLimit} m³</span>
                </div>
                <div className="status-item">
                  <span className="status-label">Custo:</span>
                  <span className={`status-value ${currentCost >= costLimit ? 'alert' : ''}`}>
                    R$ {currentCost.toFixed(2)}
                  </span>
                  <span className="status-limit">/ R$ {costLimit.toFixed(2)}</span>
                </div>
              </div>
              <div className="progress-bars">
                <div className="progress-item">
                  <div className="progress-label">Consumo</div>
                  <div className="progress-bar">
                    <div 
                      className={`progress-fill ${currentConsumption >= gasLimit ? 'alert' : ''}`}
                      style={{ width: `${Math.min((currentConsumption / gasLimit) * 100, 100)}%` }}
                    ></div>
                  </div>
                  <div className="progress-text">
                    {((currentConsumption / gasLimit) * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="progress-item">
                  <div className="progress-label">Custo</div>
                  <div className="progress-bar">
                    <div 
                      className={`progress-fill ${currentCost >= costLimit ? 'alert' : ''}`}
                      style={{ width: `${Math.min((currentCost / costLimit) * 100, 100)}%` }}
                    ></div>
                  </div>
                  <div className="progress-text">
                    {((currentCost / costLimit) * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          </div>

          {consumptionAlerts.length > 0 && (
            <div className="alerts-section">
              <h3>Alertas Ativos</h3>
              {consumptionAlerts.map((alert, index) => (
                <div key={index} className={`alert-card ${alert.type}`}>
                  <div className="alert-icon">
                    {alert.type === 'gas' ? '⛽' : '💰'}
                  </div>
                  <div className="alert-content">
                    <p className="alert-message">{alert.message}</p>
                    <span className="alert-time">{alert.timestamp}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {consumptionAlerts.length === 0 && (
            <div className="no-alerts">
              <p> Nenhum alerta ativo. Consumo dentro dos limites.</p>
            </div>
          )}

          <button onClick={loadCurrentConsumption} className="refresh-button" disabled={loadingConsumption}>
            {loadingConsumption ? 'Carregando...' : 'Atualizar Status'}
          </button>
        </div>
      )}

      {activeSection === 'weather' && (
        <div className="weather-alerts-section">
          <div className="weather-controls">
            <div className="control-group">
              <label>Sensibilidade do Alerta (°C):</label>
              <input
                type="number"
                min="1"
                max="20"
                value={temperatureThreshold}
                onChange={(e) => setTemperatureThreshold(parseFloat(e.target.value) || 5)}
                className="threshold-input"
              />
              <span className="help-text">Alerta será disparado quando a variação for maior ou igual a este valor</span>
            </div>
            <button onClick={loadWeatherData} className="refresh-weather-button" disabled={loadingWeather}>
              {loadingWeather ? 'Carregando...' : 'Atualizar Dados'}
            </button>
          </div>

          {weatherData && (
            <div className="weather-info-card">
              <h3>Condições Atuais</h3>
              <div className="weather-grid">
                <div className="weather-item">
                  <span className="weather-label">Temperatura:</span>
                  <span className="weather-value">{weatherData.temperatura.toFixed(1)}°C</span>
                </div>
                <div className="weather-item">
                  <span className="weather-label">Umidade:</span>
                  <span className="weather-value">{weatherData.umidade}%</span>
                </div>
                <div className="weather-item">
                  <span className="weather-label">Pressão:</span>
                  <span className="weather-value">{weatherData.pressao} hPa</span>
                </div>
                <div className="weather-item">
                  <span className="weather-label">Vento:</span>
                  <span className="weather-value">{weatherData.velocidade_vento.toFixed(1)} m/s</span>
                </div>
                <div className="weather-item full-width">
                  <span className="weather-label">Condições:</span>
                  <span className="weather-value">{weatherData.descricao}</span>
                </div>
              </div>
            </div>
          )}

          {weatherAlerts.length > 0 && (
            <div className="alerts-section">
              <h3>Alertas Ativos</h3>
              {weatherAlerts.map((alert, index) => (
                <div key={index} className={`alert-card ${alert.type}`}>
                  <div className="alert-icon">
                    {alert.type === 'increase' ? '📈' : '📉'}
                  </div>
                  <div className="alert-content">
                    <p className="alert-message">{alert.message}</p>
                    <span className="alert-time">{alert.timestamp}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {weatherAlerts.length === 0 && weatherData && (
            <div className="no-alerts">
              <p> Nenhum alerta ativo. Temperatura ambiente estável.</p>
            </div>
          )}

          {weatherError && (
            <div className="weather-error" style={{
              padding: '20px',
              backgroundColor: '#fee',
              border: '1px solid #fcc',
              borderRadius: '8px',
              margin: '20px 0',
              color: '#c33'
            }}>
              <h4 style={{ marginTop: 0, color: '#c33' }}>❌ Erro ao Carregar Dados Meteorológicos</h4>
              <p>{weatherError}</p>
              <div style={{ marginTop: '15px', padding: '15px', backgroundColor: '#fff', borderRadius: '5px' }}>
                <strong>Como resolver:</strong>
                <ol style={{ marginTop: '10px', paddingLeft: '20px' }}>
                  <li>Crie um arquivo <code>.env</code> na pasta <code>dash-1/dashboard/</code></li>
                  <li>Adicione: <code>VITE_WEATHER_API_KEY=sua_chave_aqui</code></li>
                  <li>Obtenha uma chave gratuita em: <a href="https://openweathermap.org/api" target="_blank" rel="noopener noreferrer">https://openweathermap.org/api</a></li>
                  <li>Reinicie o servidor (Ctrl+C e depois <code>npm run dev</code>)</li>
                </ol>
                <p style={{ marginTop: '15px', fontSize: '14px', color: '#666' }}>
                  <strong>Dica:</strong> Abra o console do navegador (F12) para ver logs detalhados do erro.
                </p>
              </div>
            </div>
          )}

          {!weatherData && !loadingWeather && !weatherError && (
            <div className="no-weather-data">
              <p>Clique em "Atualizar Dados" para carregar informações meteorológicas de São Paulo, SP</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default AlertsManagement

