import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { fetchCurrentWeather, getCoordinatesFromAddress } from '../services/weatherService'
import './WeatherAlerts.css'

function WeatherAlerts({ userInfo, deviceId }) {
  const [weatherData, setWeatherData] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(false)
  const [temperatureThreshold, setTemperatureThreshold] = useState(5) // Variação de 5°C
  const [weatherError, setWeatherError] = useState(null) // Erro ao carregar dados meteorológicos

  useEffect(() => {
    if (userInfo?.condominio_id) {
      loadWeatherData()
      // Atualiza a cada 30 minutos
      const interval = setInterval(loadWeatherData, 30 * 60 * 1000)
      return () => clearInterval(interval)
    }
  }, [userInfo, deviceId])

  const loadWeatherData = async () => {
    if (!userInfo?.condominio_id) {
      console.error('❌ [WeatherAlerts] condominio_id não disponível')
      setWeatherError('Condomínio não identificado')
      return
    }

    console.log('🌤️ [WeatherAlerts] Iniciando carregamento de dados meteorológicos...')
    setLoading(true)
    setWeatherError(null) // Limpa erros anteriores
    
    try {
      // Sempre usa "São Paulo, SP" como endereço padrão
      const enderecoPadrao = 'São Paulo, SP'
      console.log('📍 [WeatherAlerts] Usando endereço padrão:', enderecoPadrao)
      
      const coords = await getCoordinatesFromAddress(enderecoPadrao)
      if (!coords) {
        const errorMsg = 'Não foi possível obter coordenadas. Verifique se a API key está configurada.'
        console.error('❌ [WeatherAlerts]', errorMsg)
        setWeatherError(errorMsg)
        setLoading(false)
        return
      }
      
      console.log('✅ [WeatherAlerts] Coordenadas obtidas:', coords)
      const weather = await fetchCurrentWeather(coords.lat, coords.lon)
      
      if (!weather) {
        const errorMsg = 'Não foi possível obter dados meteorológicos. Verifique se a API key está configurada no arquivo .env'
        console.error('❌ [WeatherAlerts]', errorMsg)
        setWeatherError(errorMsg)
        setLoading(false)
        return
      }
      
      console.log('✅ [WeatherAlerts] Dados meteorológicos obtidos:', weather)
      setWeatherData(weather)
      setWeatherError(null) // Limpa erro se conseguiu carregar
      
      // Verifica alertas
      console.log('🔍 [WeatherAlerts] Verificando alertas de temperatura...')
      checkTemperatureAlerts(weather)
      
      // Salva no banco
      console.log('💾 [WeatherAlerts] Salvando dados no banco...')
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
        console.error('❌ [WeatherAlerts] Erro ao salvar no banco:', insertError)
        // Não define erro aqui, pois os dados foram carregados com sucesso
      } else {
        console.log('✅ [WeatherAlerts] Dados salvos no banco com sucesso')
      }
    } catch (err) {
      const errorMsg = `Erro ao carregar dados: ${err.message}`
      console.error('❌ [WeatherAlerts] Erro ao carregar dados meteorológicos:', err)
      console.error('   Stack:', err.stack)
      setWeatherError(errorMsg)
    } finally {
      setLoading(false)
      console.log('🏁 [WeatherAlerts] Carregamento finalizado')
    }
  }

  const checkTemperatureAlerts = (weather) => {
    console.log('🔍 [WeatherAlerts] Verificando alertas de temperatura...')
    console.log('   Temperatura atual:', weather.temperatura)
    console.log('   Threshold:', temperatureThreshold)
    
    const newAlerts = []
    
    // Busca última temperatura registrada
    supabase
      .from('dados_meteorologicos')
      .select('temperatura_ambiente')
      .eq('condominio_id', userInfo.condominio_id)
      .order('reading_time', { ascending: false })
      .limit(2)
      .then(({ data, error }) => {
        if (error) {
          console.error('❌ [WeatherAlerts] Erro ao buscar dados para alertas:', error)
          return
        }
        
        console.log('📊 [WeatherAlerts] Dados encontrados:', data?.length || 0, 'leituras')
        
        if (data && data.length >= 2) {
          const previousTemp = data[1].temperatura_ambiente
          const currentTemp = weather.temperatura
          const variation = Math.abs(currentTemp - previousTemp)
          
          console.log('📊 [WeatherAlerts] Comparação:', {
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
            setAlerts(newAlerts)
            console.log('⚠️ [WeatherAlerts] ALERTA DISPARADO:', alert)
          } else {
            console.log('✅ [WeatherAlerts] Variação dentro do limite, sem alerta')
            setAlerts([])
          }
        } else {
          console.log('ℹ️ [WeatherAlerts] Menos de 2 leituras disponíveis, aguardando mais dados...')
          setAlerts([])
        }
      })
      .catch(err => {
        console.error('❌ [WeatherAlerts] Erro ao verificar alertas:', err)
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

      {!weatherData && !loading && !weatherError && (
        <div className="no-weather-data">
          <p>Clique em "Atualizar Dados" para carregar informações meteorológicas de São Paulo, SP</p>
        </div>
      )}
    </div>
  )
}

export default WeatherAlerts




