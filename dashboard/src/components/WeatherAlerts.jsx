import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { fetchCurrentWeather, getCoordinatesFromAddress } from '../services/weatherService'
import './WeatherAlerts.css'

function WeatherAlerts({ userInfo, deviceId }) {
  const [weatherData, setWeatherData] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(false)
  const [temperatureThreshold, setTemperatureThreshold] = useState(5) // Variação de 5°C

  useEffect(() => {
    if (userInfo?.condominio_id) {
      loadWeatherData()
      // Atualiza a cada 30 minutos
      const interval = setInterval(loadWeatherData, 30 * 60 * 1000)
      return () => clearInterval(interval)
    }
  }, [userInfo, deviceId])

  const loadWeatherData = async () => {
    if (!userInfo?.condominio_id) return

    setLoading(true)
    try {
      // Busca endereço do condomínio
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
            // Salva no banco
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
      setLoading(false)
    }
  }

  const checkTemperatureAlerts = (weather) => {
    const newAlerts = []
    
    // Busca última temperatura registrada
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
            setAlerts(newAlerts)
          }
        }
      })
  }

  return (
    <div className="weather-alerts-container">
      <div className="weather-alerts-header">
        <h2>Alertas Meteorológicos</h2>
        <p>Monitoramento de temperatura ambiente para otimização da caldeira</p>
      </div>

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
        <button onClick={loadWeatherData} className="refresh-weather-button" disabled={loading}>
          {loading ? 'Carregando...' : 'Atualizar Dados'}
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

      {alerts.length > 0 && (
        <div className="alerts-section">
          <h3>Alertas Ativos</h3>
          {alerts.map((alert, index) => (
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

      {alerts.length === 0 && weatherData && (
        <div className="no-alerts">
          <p> Nenhum alerta ativo. Temperatura ambiente estável.</p>
        </div>
      )}

      {!weatherData && !loading && (
        <div className="no-weather-data">
          <p>Configure o endereço do condomínio para receber alertas meteorológicos.</p>
        </div>
      )}
    </div>
  )
}

export default WeatherAlerts




