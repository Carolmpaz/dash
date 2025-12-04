import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import './SystemConfig.css'

function SystemConfig({ userInfo, deviceId, condominioId, onConfigUpdated }) {
  const [config, setConfig] = useState({
    setpoint_temperatura: 65.0,
    temp_min_critica: 50.0,
    temp_max_critica: 80.0,
    delta_t_minimo: 5.0,
    potencia_maxima_kw: 50.0,
    alerta_email: false,
    alerta_whatsapp: false,
    intervalo_medicao_segundos: 5
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (isOpen && userInfo && deviceId && condominioId) {
      loadConfig()
    }
  }, [isOpen, userInfo, deviceId, condominioId])

  const loadConfig = async () => {
    setLoading(true)
    try {
      // Tenta carregar configuração específica do dispositivo
      let { data, error } = await supabase
        .from('configuracao_sistema')
        .select('*')
        .eq('condominio_id', condominioId)
        .eq('device_id', deviceId)
        .single()

      // Se não encontrar, tenta configuração geral do condomínio
      if (error && error.code === 'PGRST116') {
        const { data: generalData } = await supabase
          .from('configuracao_sistema')
          .select('*')
          .eq('condominio_id', condominioId)
          .is('device_id', null)
          .single()

        if (generalData) {
          data = generalData
        }
      }

      if (data) {
        setConfig({
          setpoint_temperatura: parseFloat(data.setpoint_temperatura) || 65.0,
          temp_min_critica: parseFloat(data.temp_min_critica) || 50.0,
          temp_max_critica: parseFloat(data.temp_max_critica) || 80.0,
          delta_t_minimo: parseFloat(data.delta_t_minimo) || 5.0,
          potencia_maxima_kw: parseFloat(data.potencia_maxima_kw) || 50.0,
          alerta_email: data.alerta_email || false,
          alerta_whatsapp: data.alerta_whatsapp || false,
          intervalo_medicao_segundos: data.intervalo_medicao_segundos || 5
        })
      }
    } catch (err) {
      console.error('Erro ao carregar configurações:', err)
      setMessage('Erro ao carregar configurações')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!userInfo || userInfo.role !== 'zelador') {
      setMessage('Apenas zeladores podem editar configurações')
      return
    }

    setSaving(true)
    setMessage('')
    
    try {
      const configData = {
        condominio_id: condominioId,
        device_id: deviceId,
        setpoint_temperatura: parseFloat(config.setpoint_temperatura),
        temp_min_critica: parseFloat(config.temp_min_critica),
        temp_max_critica: parseFloat(config.temp_max_critica),
        delta_t_minimo: parseFloat(config.delta_t_minimo),
        potencia_maxima_kw: parseFloat(config.potencia_maxima_kw),
        alerta_email: config.alerta_email,
        alerta_whatsapp: config.alerta_whatsapp,
        intervalo_medicao_segundos: parseInt(config.intervalo_medicao_segundos)
      }

      // Usa upsert para criar ou atualizar
      const { error } = await supabase
        .from('configuracao_sistema')
        .upsert(configData, {
          onConflict: 'condominio_id,device_id'
        })

      if (error) {
        throw error
      }

      setMessage('Configurações salvas com sucesso!')
      if (onConfigUpdated) {
        onConfigUpdated()
      }
      
      setTimeout(() => {
        setMessage('')
      }, 3000)
    } catch (err) {
      console.error('Erro ao salvar configurações:', err)
      setMessage('Erro ao salvar configurações: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (userInfo?.role !== 'zelador' && userInfo?.role !== 'comgas') {
    return null
  }

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)} 
        className="config-button"
        style={{
          padding: '8px 16px',
          backgroundColor: '#007CB6',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '600',
          marginRight: '10px'
        }}
      >
        ⚙️ Configurações
      </button>

      {isOpen && (
        <div className="config-modal-overlay" onClick={() => setIsOpen(false)}>
          <div className="config-modal" onClick={(e) => e.stopPropagation()}>
            <div className="config-modal-header">
              <h2>Configurações do Sistema</h2>
              <button 
                onClick={() => setIsOpen(false)}
                className="config-close-button"
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#666'
                }}
              >
                ×
              </button>
            </div>

            <div className="config-modal-content">
              {loading ? (
                <p>Carregando configurações...</p>
              ) : (
                <>
                  <div className="config-section">
                    <h3>Temperaturas</h3>
                    <div className="config-row">
                      <label>
                        Setpoint de Temperatura (°C):
                        <input
                          type="number"
                          step="0.1"
                          value={config.setpoint_temperatura}
                          onChange={(e) => setConfig({...config, setpoint_temperatura: e.target.value})}
                        />
                      </label>
                    </div>
                    <div className="config-row">
                      <label>
                        Temperatura Mínima Crítica (°C):
                        <input
                          type="number"
                          step="0.1"
                          value={config.temp_min_critica}
                          onChange={(e) => setConfig({...config, temp_min_critica: e.target.value})}
                        />
                      </label>
                    </div>
                    <div className="config-row">
                      <label>
                        Temperatura Máxima Crítica (°C):
                        <input
                          type="number"
                          step="0.1"
                          value={config.temp_max_critica}
                          onChange={(e) => setConfig({...config, temp_max_critica: e.target.value})}
                        />
                      </label>
                    </div>
                    <div className="config-row">
                      <label>
                        ΔT Mínimo (°C):
                        <input
                          type="number"
                          step="0.1"
                          value={config.delta_t_minimo}
                          onChange={(e) => setConfig({...config, delta_t_minimo: e.target.value})}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="config-section">
                    <h3>Potência e Medição</h3>
                    <div className="config-row">
                      <label>
                        Potência Máxima (kW):
                        <input
                          type="number"
                          step="0.1"
                          value={config.potencia_maxima_kw}
                          onChange={(e) => setConfig({...config, potencia_maxima_kw: e.target.value})}
                        />
                      </label>
                    </div>
                    <div className="config-row">
                      <label>
                        Intervalo de Medição (segundos):
                        <input
                          type="number"
                          value={config.intervalo_medicao_segundos}
                          onChange={(e) => setConfig({...config, intervalo_medicao_segundos: e.target.value})}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="config-section">
                    <h3>Alertas</h3>
                    <div className="config-row">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input
                          type="checkbox"
                          checked={config.alerta_email}
                          onChange={(e) => setConfig({...config, alerta_email: e.target.checked})}
                        />
                        Ativar alertas por e-mail
                      </label>
                    </div>
                    <div className="config-row">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input
                          type="checkbox"
                          checked={config.alerta_whatsapp}
                          onChange={(e) => setConfig({...config, alerta_whatsapp: e.target.checked})}
                        />
                        Ativar alertas por WhatsApp
                      </label>
                    </div>
                  </div>

                  {message && (
                    <div className={`config-message ${message.includes('sucesso') ? 'success' : 'error'}`}>
                      {message}
                    </div>
                  )}

                  <div className="config-actions">
                    <button 
                      onClick={handleSave} 
                      disabled={saving}
                      className="config-save-button"
                    >
                      {saving ? 'Salvando...' : 'Salvar Configurações'}
                    </button>
                    <button 
                      onClick={() => setIsOpen(false)}
                      className="config-cancel-button"
                    >
                      Cancelar
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default SystemConfig

