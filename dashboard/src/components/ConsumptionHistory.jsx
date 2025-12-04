import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import './ConsumptionHistory.css'

function ConsumptionHistory({ deviceId, userInfo }) {
  const [startDate, setStartDate] = useState(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])
  const [historyData, setHistoryData] = useState([])
  const [dailyData, setDailyData] = useState([])
  const [loading, setLoading] = useState(false)
  const [chartType, setChartType] = useState('bar') // 'bar' ou 'line'

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
      } else if (data && data.length > 0) {
        // Agrupa por data
        const groupedByDate = {}
        
        data.forEach(item => {
          const date = new Date(item.reading_time).toLocaleDateString('pt-BR')
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
          
          const consumo = (parseFloat(item.potencia_kW) || 0) * 0.1
          const energia = parseFloat(item.energia_kWh) || 0
          const vazao = parseFloat(item.vazao_L_s) || 0
          const potencia = parseFloat(item.potencia_kW) || 0
          const tempIda = parseFloat(item.temp_ida) || 0
          const tempRetorno = parseFloat(item.temp_retorno) || 0
          const deltaT = parseFloat(item.deltaT) || 0
          
          groupedByDate[date].consumoGas += consumo
          groupedByDate[date].energiaTotal = Math.max(groupedByDate[date].energiaTotal, energia)
          groupedByDate[date].vazaoTotal += vazao * 5 // Assumindo intervalo de 5 segundos
          groupedByDate[date].potenciaMedia += potencia
          groupedByDate[date].tempIdaMedia += tempIda
          groupedByDate[date].tempRetornoMedia += tempRetorno
          groupedByDate[date].deltaTMedia += deltaT
          
          // Máximos e mínimos de temperatura
          if (tempIda > groupedByDate[date].tempIdaMax) groupedByDate[date].tempIdaMax = tempIda
          if (tempIda < groupedByDate[date].tempIdaMin && tempIda > 0) groupedByDate[date].tempIdaMin = tempIda
          if (tempRetorno > groupedByDate[date].tempRetornoMax) groupedByDate[date].tempRetornoMax = tempRetorno
          if (tempRetorno < groupedByDate[date].tempRetornoMin && tempRetorno > 0) groupedByDate[date].tempRetornoMin = tempRetorno
          
          groupedByDate[date].count += 1
        })

        // Calcula médias e formata
        const daily = Object.values(groupedByDate).map(day => ({
          date: day.date,
          consumoGas: parseFloat(day.consumoGas.toFixed(4)),
          energiaTotal: parseFloat(day.energiaTotal.toFixed(2)),
          vazaoTotal: parseFloat(day.vazaoTotal.toFixed(2)), // Já em litros
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
        setHistoryData(data)
        console.log(`Histórico carregado: ${data.length} pontos, ${daily.length} dias`)
      } else {
        setDailyData([])
        setHistoryData([])
        console.log('Nenhum dado encontrado no período')
      }
    } catch (err) {
      console.error('Erro inesperado ao carregar histórico:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (deviceId) {
      loadConsumptionHistory()
    }
  }, [deviceId, startDate, endDate])

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

