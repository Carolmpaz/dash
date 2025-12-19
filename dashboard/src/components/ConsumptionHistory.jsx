import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import './ConsumptionHistory.css'

function ConsumptionHistory({ deviceId, userInfo, historyData: realTimeHistoryData = [] }) {
  const [startDate, setStartDate] = useState(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])
  const [dbHistoryData, setDbHistoryData] = useState([])
  const [dailyData, setDailyData] = useState([])
  const [loading, setLoading] = useState(false)
  const [chartType, setChartType] = useState('bar') // 'bar' ou 'line'

  // Combina dados do banco com dados em tempo real
  const combineData = (dbData, realTimeData) => {
    // Converte dados do banco para o formato padrão
    const dbFormatted = dbData.map(item => ({
      time: new Date(item.reading_time).toLocaleTimeString('pt-BR'),
      date: new Date(item.reading_time).toLocaleDateString('pt-BR'),
      temp_ida: parseFloat(item.temp_ida) || 0,
      temp_retorno: parseFloat(item.temp_retorno) || 0,
      deltaT: parseFloat(item.deltat) || 0,
      vazao: (parseFloat(item.vazao_l_s) || 0) * 100, // Multiplicado por 100
      potencia: parseFloat(item.potencia_kw) || 0,
      energia: parseFloat(item.energia_kwh) || 0,
      gas: (parseFloat(item.potencia_kw) || 0) * 0.1,
      reading_time: item.reading_time
    }))

    // Combina com dados em tempo real (que já estão no formato correto)
    const combined = [...dbFormatted, ...realTimeData]
    
    // Remove duplicatas baseado no timestamp (se houver)
    const unique = combined.filter((item, index, self) => 
      index === self.findIndex(t => t.time === item.time)
    )
    
    return unique.sort((a, b) => {
      const timeA = a.reading_time ? new Date(a.reading_time) : new Date('1970-01-01 ' + a.time)
      const timeB = b.reading_time ? new Date(b.reading_time) : new Date('1970-01-01 ' + b.time)
      return timeA - timeB
    })
  }

  const loadConsumptionHistory = async () => {
    if (!deviceId) return

    setLoading(true)
    try {
      const start = new Date(startDate)
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999) // Fim do dia

      const { data, error } = await supabase
        .from('leituras_sensores')
        .select('*')
        .eq('device_id', deviceId)
        .gte('reading_time', start.toISOString())
        .lte('reading_time', end.toISOString())
        .order('reading_time', { ascending: true })

      if (error) {
        console.error('Erro ao carregar histórico:', error)
        setDbHistoryData([])
      } else if (data && data.length > 0) {
        setDbHistoryData(data)
      } else {
        setDbHistoryData([])
      }
    } catch (err) {
      console.error('Erro inesperado ao carregar histórico:', err)
      setDbHistoryData([])
    } finally {
      setLoading(false)
    }
  }

  // Processa dados combinados quando dbHistoryData ou realTimeHistoryData mudarem
  useEffect(() => {
    console.log('🔄 [ConsumptionHistory] Processando dados combinados...', {
      dbHistoryData: dbHistoryData.length,
      realTimeHistoryData: realTimeHistoryData?.length || 0,
      deviceId: deviceId
    })
    
    const combined = combineData(dbHistoryData, realTimeHistoryData)
    
    if (combined.length > 0) {
      console.log('✅ [ConsumptionHistory] Dados combinados:', combined.length, 'pontos')
      // Agrupa por data
      const groupedByDate = {}
      
      combined.forEach(item => {
        const date = item.date || new Date().toLocaleDateString('pt-BR')
        if (!groupedByDate[date]) {
          groupedByDate[date] = {
            date: date,
            consumoGas: 0,
            energiaTotal: 0,
            vazaoTotal: 0,
            potenciaMedia: 0,
            tempIdaMedia: 0,
            tempRetornoMedia: 0,
            deltaTMedia: 0,
            tempIdaMax: -Infinity,
            tempRetornoMax: -Infinity,
            tempIdaMin: Infinity,
            tempRetornoMin: Infinity,
            count: 0
          }
        }
        
        groupedByDate[date].consumoGas += item.gas || 0
        groupedByDate[date].energiaTotal = Math.max(groupedByDate[date].energiaTotal, item.energia || 0)
        groupedByDate[date].vazaoTotal += (item.vazao || 0) * 30 // 30 segundos entre leituras
        groupedByDate[date].potenciaMedia += item.potencia || 0
        groupedByDate[date].tempIdaMedia += item.temp_ida || 0
        groupedByDate[date].tempRetornoMedia += item.temp_retorno || 0
        groupedByDate[date].deltaTMedia += item.deltaT || 0
        
        // Máximos e mínimos de temperatura
        if (item.temp_ida > groupedByDate[date].tempIdaMax) groupedByDate[date].tempIdaMax = item.temp_ida
        if (item.temp_ida < groupedByDate[date].tempIdaMin && item.temp_ida > 0) groupedByDate[date].tempIdaMin = item.temp_ida
        if (item.temp_retorno > groupedByDate[date].tempRetornoMax) groupedByDate[date].tempRetornoMax = item.temp_retorno
        if (item.temp_retorno < groupedByDate[date].tempRetornoMin && item.temp_retorno > 0) groupedByDate[date].tempRetornoMin = item.temp_retorno
        
        groupedByDate[date].count += 1
      })

      // Calcula médias e formata
      const daily = Object.values(groupedByDate).map(day => ({
        date: day.date,
        consumoGas: parseFloat(day.consumoGas.toFixed(4)),
        energiaTotal: parseFloat(day.energiaTotal.toFixed(2)),
        vazaoTotal: parseFloat(day.vazaoTotal.toFixed(2)),
        potenciaMedia: parseFloat((day.potenciaMedia / day.count).toFixed(2)),
        tempIdaMedia: parseFloat((day.tempIdaMedia / day.count).toFixed(2)),
        tempRetornoMedia: parseFloat((day.tempRetornoMedia / day.count).toFixed(2)),
        deltaTMedia: parseFloat((day.deltaTMedia / day.count).toFixed(2)),
        tempIdaMax: day.tempIdaMax === -Infinity ? 0 : parseFloat(day.tempIdaMax.toFixed(2)),
        tempRetornoMax: day.tempRetornoMax === -Infinity ? 0 : parseFloat(day.tempRetornoMax.toFixed(2)),
        tempIdaMin: day.tempIdaMin === Infinity ? 0 : parseFloat(day.tempIdaMin.toFixed(2)),
        tempRetornoMin: day.tempRetornoMin === Infinity ? 0 : parseFloat(day.tempRetornoMin.toFixed(2))
      }))

      setDailyData(daily)
      console.log(`✅ Histórico atualizado: ${combined.length} pontos (${dbHistoryData.length} do banco + ${realTimeHistoryData.length} em tempo real), ${daily.length} dias`)
    } else {
      setDailyData([])
    }
  }, [dbHistoryData, realTimeHistoryData])

  useEffect(() => {
    if (deviceId) {
      loadConsumptionHistory()
    }
  }, [deviceId, startDate, endDate])

  // Atualização automática periódica (a cada 30 segundos)
  useEffect(() => {
    if (!deviceId) return

    // Carrega imediatamente ao montar
    loadConsumptionHistory()

    const interval = setInterval(() => {
      console.log('🔄 [ConsumptionHistory] Atualizando dados automaticamente...')
      loadConsumptionHistory()
    }, 30000) // 30 segundos

    return () => clearInterval(interval)
  }, [deviceId])

  // Log quando historyData mudar
  useEffect(() => {
    console.log('📊 [ConsumptionHistory] historyData atualizado:', {
      tamanho: realTimeHistoryData?.length || 0,
      deviceId: deviceId,
      ultimoPonto: realTimeHistoryData?.[realTimeHistoryData.length - 1] || null
    })
  }, [realTimeHistoryData, deviceId])

  return (
    <div className="consumption-history-container">
      <div className="consumption-history-header">
        <h2>Histórico de Consumo</h2>
        <p>Compare o consumo por data no período selecionado</p>
      </div>

      <div className="date-filters">
        <div className="date-filter">
          <label>Data Inicial:</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="date-input"
          />
        </div>
        <div className="date-filter">
          <label>Data Final:</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="date-input"
          />
        </div>
        <button onClick={loadConsumptionHistory} className="refresh-button" disabled={loading}>
          {loading ? 'Carregando...' : 'Atualizar'}
        </button>
      </div>

      {dailyData.length > 0 ? (
        <>
          <div className="chart-type-selector">
            <label>Tipo de Gráfico:</label>
            <select 
              value={chartType} 
              onChange={(e) => setChartType(e.target.value)}
              className="chart-type-select"
            >
              <option value="bar">Barras</option>
              <option value="line">Linha</option>
            </select>
          </div>

          <div className="history-charts-grid">
            {/* Gráfico de Consumo de Gás */}
            <div className="history-chart-card">
              <div className="chart-header">
                <h3>Consumo de Gás por Data</h3>
              </div>
              <ResponsiveContainer width="100%" height={400}>
                {chartType === 'bar' ? (
                  <BarChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#666"
                      fontSize={12}
                      tick={{ fill: '#666' }}
                    />
                    <YAxis 
                      stroke="#666"
                      fontSize={12}
                      tick={{ fill: '#666' }}
                      label={{ value: 'Consumo (m³)', angle: -90, position: 'insideLeft' }}
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
                      dataKey="consumoGas" 
                      name="Consumo de Gás (m³)" 
                      fill="#004B87"
                      radius={[8, 8, 0, 0]}
                    />
                  </BarChart>
                ) : (
                  <LineChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#666"
                      fontSize={12}
                      tick={{ fill: '#666' }}
                    />
                    <YAxis 
                      stroke="#666"
                      fontSize={12}
                      tick={{ fill: '#666' }}
                      label={{ value: 'Consumo (m³)', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#fff', 
                        border: '1px solid #004B87',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="consumoGas" 
                      name="Consumo de Gás (m³)" 
                      stroke="#004B87" 
                      strokeWidth={3}
                      dot={{ fill: '#004B87', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* Gráfico de Energia Total */}
            <div className="history-chart-card">
              <div className="chart-header">
                <h3>Energia Total por Data</h3>
              </div>
              <ResponsiveContainer width="100%" height={400}>
                {chartType === 'bar' ? (
                  <BarChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#666"
                      fontSize={12}
                      tick={{ fill: '#666' }}
                    />
                    <YAxis 
                      stroke="#666"
                      fontSize={12}
                      tick={{ fill: '#666' }}
                      label={{ value: 'Energia (kWh)', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#fff', 
                        border: '1px solid #FFD600',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend />
                    <Bar 
                      dataKey="energiaTotal" 
                      name="Energia Total (kWh)" 
                      fill="#FFD600"
                      radius={[8, 8, 0, 0]}
                    />
                  </BarChart>
                ) : (
                  <LineChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#666"
                      fontSize={12}
                      tick={{ fill: '#666' }}
                    />
                    <YAxis 
                      stroke="#666"
                      fontSize={12}
                      tick={{ fill: '#666' }}
                      label={{ value: 'Energia (kWh)', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#fff', 
                        border: '1px solid #FFD600',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="energiaTotal" 
                      name="Energia Total (kWh)" 
                      stroke="#FFD600" 
                      strokeWidth={3}
                      dot={{ fill: '#FFD600', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* Gráfico de Vazão Total */}
            <div className="history-chart-card">
              <div className="chart-header">
                <h3>Vazão Total por Data</h3>
              </div>
              <ResponsiveContainer width="100%" height={400}>
                {chartType === 'bar' ? (
                  <BarChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#666"
                      fontSize={12}
                      tick={{ fill: '#666' }}
                    />
                    <YAxis 
                      stroke="#666"
                      fontSize={12}
                      tick={{ fill: '#666' }}
                      label={{ value: 'Vazão (L)', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#fff', 
                        border: '1px solid #00B2A9',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend />
                    <Bar 
                      dataKey="vazaoTotal" 
                      name="Vazão Total (L)" 
                      fill="#00B2A9"
                      radius={[8, 8, 0, 0]}
                    />
                  </BarChart>
                ) : (
                  <LineChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#666"
                      fontSize={12}
                      tick={{ fill: '#666' }}
                    />
                    <YAxis 
                      stroke="#666"
                      fontSize={12}
                      tick={{ fill: '#666' }}
                      label={{ value: 'Vazão (L)', angle: -90, position: 'insideLeft' }}
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
                      dataKey="vazaoTotal" 
                      name="Vazão Total (L)" 
                      stroke="#00B2A9" 
                      strokeWidth={3}
                      dot={{ fill: '#00B2A9', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* Gráfico de Potência Média */}
            <div className="history-chart-card">
              <div className="chart-header">
                <h3>Potência Média por Data</h3>
              </div>
              <ResponsiveContainer width="100%" height={400}>
                {chartType === 'bar' ? (
                  <BarChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#666"
                      fontSize={12}
                      tick={{ fill: '#666' }}
                    />
                    <YAxis 
                      stroke="#666"
                      fontSize={12}
                      tick={{ fill: '#666' }}
                      label={{ value: 'Potência (kW)', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#fff', 
                        border: '1px solid #7FC241',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend />
                    <Bar 
                      dataKey="potenciaMedia" 
                      name="Potência Média (kW)" 
                      fill="#7FC241"
                      radius={[8, 8, 0, 0]}
                    />
                  </BarChart>
                ) : (
                  <LineChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#666"
                      fontSize={12}
                      tick={{ fill: '#666' }}
                    />
                    <YAxis 
                      stroke="#666"
                      fontSize={12}
                      tick={{ fill: '#666' }}
                      label={{ value: 'Potência (kW)', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#fff', 
                        border: '1px solid #7FC241',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="potenciaMedia" 
                      name="Potência Média (kW)" 
                      stroke="#7FC241" 
                      strokeWidth={3}
                      dot={{ fill: '#7FC241', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* Gráfico de Temperaturas */}
            <div className="history-chart-card">
              <div className="chart-header">
                <h3>Temperaturas Médias por Data</h3>
              </div>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis 
                    dataKey="date" 
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
                  <Line 
                    type="monotone" 
                    dataKey="tempIdaMedia" 
                    name="Temp. Saída Média (°C)" 
                    stroke="#007CB6" 
                    strokeWidth={3}
                    dot={{ fill: '#007CB6', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="tempRetornoMedia" 
                    name="Temp. Entrada Média (°C)" 
                    stroke="#00B2E3" 
                    strokeWidth={3}
                    dot={{ fill: '#00B2E3', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="deltaTMedia" 
                    name="ΔT Média (°C)" 
                    stroke="#F89C1B" 
                    strokeWidth={3}
                    dot={{ fill: '#F89C1B', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Gráfico de Temperaturas Máximas e Mínimas */}
            <div className="history-chart-card">
              <div className="chart-header">
                <h3>Temperaturas: Máximas e Mínimas</h3>
              </div>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis 
                    dataKey="date" 
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
                  <Line 
                    type="monotone" 
                    dataKey="tempIdaMax" 
                    name="Temp. Saída Máx (°C)" 
                    stroke="#d32f2f" 
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ fill: '#d32f2f', r: 3 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="tempIdaMin" 
                    name="Temp. Saída Mín (°C)" 
                    stroke="#ff6b6b" 
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ fill: '#ff6b6b', r: 3 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="tempRetornoMax" 
                    name="Temp. Entrada Máx (°C)" 
                    stroke="#1976d2" 
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ fill: '#1976d2', r: 3 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="tempRetornoMin" 
                    name="Temp. Entrada Mín (°C)" 
                    stroke="#42a5f5" 
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ fill: '#42a5f5', r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Gráfico Comparativo Geral */}
            <div className="history-chart-card full-width">
              <div className="chart-header">
                <h3>Visão Geral: Todas as Variáveis</h3>
              </div>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#666"
                    fontSize={12}
                    tick={{ fill: '#666' }}
                  />
                  <YAxis 
                    yAxisId="left"
                    stroke="#666"
                    fontSize={12}
                    tick={{ fill: '#666' }}
                    label={{ value: 'Temperatura (°C) / Potência (kW)', angle: -90, position: 'insideLeft' }}
                  />
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    stroke="#666"
                    fontSize={12}
                    tick={{ fill: '#666' }}
                    label={{ value: 'Consumo (m³) / Energia (kWh) / Vazão (L)', angle: 90, position: 'insideRight' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#fff', 
                      border: '1px solid #007CB6',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                  <Line 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="tempIdaMedia" 
                    name="Temp. Saída (°C)" 
                    stroke="#007CB6" 
                    strokeWidth={2}
                    dot={{ fill: '#007CB6', r: 3 }}
                  />
                  <Line 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="potenciaMedia" 
                    name="Potência (kW)" 
                    stroke="#7FC241" 
                    strokeWidth={2}
                    dot={{ fill: '#7FC241', r: 3 }}
                  />
                  <Line 
                    yAxisId="right"
                    type="monotone" 
                    dataKey="consumoGas" 
                    name="Consumo Gás (m³)" 
                    stroke="#004B87" 
                    strokeWidth={2}
                    dot={{ fill: '#004B87', r: 3 }}
                  />
                  <Line 
                    yAxisId="right"
                    type="monotone" 
                    dataKey="energiaTotal" 
                    name="Energia (kWh)" 
                    stroke="#FFD600" 
                    strokeWidth={2}
                    dot={{ fill: '#FFD600', r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ) : (
        <div className="no-data-message">
          {loading ? (
            <p>Carregando dados...</p>
          ) : (
            <p>Nenhum dado encontrado no período selecionado.</p>
          )}
        </div>
      )}
    </div>
  )
}

export default ConsumptionHistory

