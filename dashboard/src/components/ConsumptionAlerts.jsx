import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import './ConsumptionAlerts.css'

const GAS_PRICE_PER_M3 = 8.00

function ConsumptionAlerts({ deviceId, userInfo }) {
  const [gasLimit, setGasLimit] = useState(100) // m³
  const [costLimit, setCostLimit] = useState(800) // R$
  const [alerts, setAlerts] = useState([])
  const [currentConsumption, setCurrentConsumption] = useState(0)
  const [currentCost, setCurrentCost] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (deviceId && userInfo) {
      loadCurrentConsumption()
    }
  }, [deviceId, userInfo])

  useEffect(() => {
    if (deviceId && userInfo && (gasLimit || costLimit)) {
      // Salva limites no banco quando mudarem
      saveLimits()
    }
  }, [gasLimit, costLimit])

  useEffect(() => {
    if (deviceId) {
      // Verifica alertas a cada minuto
      const interval = setInterval(checkAlerts, 60000)
      return () => clearInterval(interval)
    }
  }, [deviceId, gasLimit, costLimit])

  const saveLimits = async () => {
    if (!userInfo?.condominio_id) return

    try {
      // Salva limites na tabela de configurações
      // Primeiro tenta atualizar, se não existir, cria
      const { data: existing } = await supabase
        .from('configuracao_sistema')
        .select('id')
        .eq('condominio_id', userInfo.condominio_id)
        .eq('device_id', deviceId)
        .single()

      if (existing) {
        const { error } = await supabase
          .from('configuracao_sistema')
          .update({
            limite_consumo_gas: gasLimit,
            limite_custo: costLimit,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
        
        if (error) console.error('Erro ao atualizar limites:', error)
      } else {
        const { error } = await supabase
          .from('configuracao_sistema')
          .insert({
            condominio_id: userInfo.condominio_id,
            device_id: deviceId,
            limite_consumo_gas: gasLimit,
            limite_custo: costLimit
          })
        
        if (error) console.error('Erro ao criar limites:', error)
      }

      if (error) {
        console.error('Erro ao salvar limites:', error)
      }
    } catch (err) {
      console.error('Erro ao salvar limites:', err)
    }
  }

  const loadCurrentConsumption = async () => {
    if (!deviceId) return

    setLoading(true)
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
      setLoading(false)
    }
  }

  const checkAlerts = () => {
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

    setAlerts(newAlerts)
  }

  return (
    <div className="consumption-alerts-container">
      <div className="alerts-header">
        <h2>Alertas de Consumo</h2>
        <p>Configure limites e receba alertas quando ultrapassados</p>
      </div>

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

      {alerts.length > 0 && (
        <div className="alerts-section">
          <h3>Alertas Ativos</h3>
          {alerts.map((alert, index) => (
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

      {alerts.length === 0 && (
        <div className="no-alerts">
          <p> Nenhum alerta ativo. Consumo dentro dos limites.</p>
        </div>
      )}

      <button onClick={loadCurrentConsumption} className="refresh-button" disabled={loading}>
        {loading ? 'Carregando...' : 'Atualizar Status'}
      </button>
    </div>
  )
}

export default ConsumptionAlerts

