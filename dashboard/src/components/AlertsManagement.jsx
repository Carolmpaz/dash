import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { fetchCurrentWeather, getCoordinatesFromAddress } from '../services/weatherService'
import './AlertsManagement.css'

const GAS_PRICE_PER_M3 = 8.00

function AlertsManagement({ deviceId, userInfo }) {
  const [activeSection, setActiveSection] = useState('consumption') // 'consumption' ou 'weather'

  // Estados para alertas de consumo
  const [gasLimit, setGasLimit] = useState(100) // m³
  const [costLimit, setCostLimit] = useState(800) // R$
  const [consumptionAlerts, setConsumptionAlerts] = useState([])
  const [currentConsumption, setCurrentConsumption] = useState(0)
  const [currentCost, setCurrentCost] = useState(0)
  const [loadingConsumption, setLoadingConsumption] = useState(false)
  const [limitsLoaded, setLimitsLoaded] = useState(false)

  // Estados para alertas meteorológicos
  const [weatherData, setWeatherData] = useState(null)
  const [weatherAlerts, setWeatherAlerts] = useState([])
  const [loadingWeather, setLoadingWeather] = useState(false)
  const [temperatureThreshold, setTemperatureThreshold] = useState(5) // Variação de 5°C

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
        .select('potencia_kW')
        .eq('device_id', deviceId)
        .gte('reading_time', today.toISOString())
        .lt('reading_time', tomorrow.toISOString())

      if (!error && data) {
        const totalConsumption = data.reduce((sum, item) => {
          return sum + ((parseFloat(item.potencia_kW) || 0) * 0.1)
        }, 0)

        setCurrentConsumption(totalConsumption)
        setCurrentCost(totalConsumption * GAS_PRICE_PER_M3)
      }
    } catch (err) {
      console.error('Erro ao carregar consumo:', err)
    } finally {
      setLoadingConsumption(false)
    }
  }

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
    if (!userInfo?.condominio_id) return

    setLoadingWeather(true)
    try {
      const { data: condominioData } = await supabase
        .from('condominios')
        .select('endereco')
        .eq('id', userInfo.condominio_id)
        .single()

      if (condominioData?.endereco) {
        const coords = await getCoordinatesFromAddress(condominioData.endereco)
        if (coords) {
          const weather = await fetchCurrentWeather(coords.lat, coords.lon)
          if (weather) {
            setWeatherData(weather)
            checkTemperatureAlerts(weather)
            await supabase
              .from('dados_meteorologicos')
              .insert({
                condominio_id: userInfo.condominio_id,
                temperatura_ambiente: weather.temperatura,
                umidade: weather.umidade,
                pressao: weather.pressao,
                velocidade_vento: weather.velocidade_vento,
                descricao: weather.descricao
              })
          }
        }
      }
    } catch (err) {
      console.error('Erro ao carregar dados meteorológicos:', err)
    } finally {
      setLoadingWeather(false)
    }
  }

  const checkTemperatureAlerts = (weather) => {
    const newAlerts = []
    
    supabase
      .from('dados_meteorologicos')
      .select('temperatura_ambiente')
      .eq('condominio_id', userInfo.condominio_id)
      .order('reading_time', { ascending: false })
      .limit(2)
      .then(({ data }) => {
        if (data && data.length >= 2) {
          const previousTemp = data[1].temperatura_ambiente
          const currentTemp = weather.temperatura
          const variation = Math.abs(currentTemp - previousTemp)

          if (variation >= temperatureThreshold) {
            const isIncrease = currentTemp > previousTemp
            newAlerts.push({
              type: isIncrease ? 'increase' : 'decrease',
              message: isIncrease 
                ? `⚠️ Aumento significativo de temperatura detectado: ${variation.toFixed(1)}°C. Considere reduzir o setpoint da caldeira.`
                : `⚠️ Queda significativa de temperatura detectada: ${variation.toFixed(1)}°C. Considere aumentar o setpoint da caldeira.`,
              temperature: currentTemp,
              variation: variation.toFixed(1),
              timestamp: new Date().toLocaleString('pt-BR')
            })
            setWeatherAlerts(newAlerts)
          }
        }
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

          {!weatherData && !loadingWeather && (
            <div className="no-weather-data">
              <p>Configure o endereço do condomínio para receber alertas meteorológicos.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default AlertsManagement

