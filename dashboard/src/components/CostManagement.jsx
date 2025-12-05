import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import './CostManagement.css'

const GAS_PRICE_PER_M3 = 8.00 // R$ 8,00 por m³

function CostManagement({ deviceId, userInfo, historyData: realTimeHistoryData = [] }) {
  const [startDate, setStartDate] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])
  const [dbCostData, setDbCostData] = useState([])
  const [dailyCosts, setDailyCosts] = useState([])
  const [monthlyCosts, setMonthlyCosts] = useState([])
  const [loading, setLoading] = useState(false)
  const [chartType, setChartType] = useState('bar')
  const [totalCost, setTotalCost] = useState(0)

  // Combina dados do banco com dados em tempo real
  const combineData = (dbData, realTimeData) => {
    // Converte dados do banco para o formato padrão
    const dbFormatted = dbData.map(item => ({
      time: new Date(item.reading_time).toLocaleTimeString('pt-BR'),
      date: new Date(item.reading_time).toLocaleDateString('pt-BR'),
      potencia: parseFloat(item.potencia_kw) || 0,
      gas: (parseFloat(item.potencia_kw) || 0) * 0.1,
      reading_time: item.reading_time
    }))

    // Converte dados em tempo real para o formato padrão
    const realTimeFormatted = realTimeData.map(item => ({
      time: item.time,
      date: new Date().toLocaleDateString('pt-BR'),
      potencia: item.potencia || 0,
      gas: item.gas || ((item.potencia || 0) * 0.1),
      reading_time: new Date().toISOString()
    }))

    // Combina e remove duplicatas
    const combined = [...dbFormatted, ...realTimeFormatted]
    const unique = combined.filter((item, index, self) => 
      index === self.findIndex(t => t.time === item.time)
    )
    
    return unique.sort((a, b) => {
      const timeA = a.reading_time ? new Date(a.reading_time) : new Date('1970-01-01 ' + a.time)
      const timeB = b.reading_time ? new Date(b.reading_time) : new Date('1970-01-01 ' + b.time)
      return timeA - timeB
    })
  }

  const loadCostData = async () => {
    if (!deviceId) return

    setLoading(true)
    try {
      const start = new Date(startDate)
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)

      const { data, error } = await supabase
        .from('leituras_sensores')
        .select('*')
        .eq('device_id', deviceId)
        .gte('reading_time', start.toISOString())
        .lte('reading_time', end.toISOString())
        .order('reading_time', { ascending: true })

      if (error) {
        console.error('Erro ao carregar dados:', error)
        setDbCostData([])
      } else if (data && data.length > 0) {
        setDbCostData(data)
      } else {
        setDbCostData([])
      }
    } catch (err) {
      console.error('Erro ao carregar dados de custo:', err)
      setDbCostData([])
    } finally {
      setLoading(false)
    }
  }

  // Processa dados combinados quando dbCostData ou realTimeHistoryData mudarem
  useEffect(() => {
    const combined = combineData(dbCostData, realTimeHistoryData)
    
    if (combined.length > 0) {
      // Agrupa por data
      const groupedByDate = {}
      
      combined.forEach(item => {
        const date = item.date || new Date().toLocaleDateString('pt-BR')
        if (!groupedByDate[date]) {
          groupedByDate[date] = {
            date: date,
            consumoGas: 0,
            count: 0
          }
        }
        
        groupedByDate[date].consumoGas += item.gas || 0
        groupedByDate[date].count += 1
      })

      // Calcula custos diários
      const daily = Object.values(groupedByDate).map(day => ({
        date: day.date,
        consumoGas: parseFloat(day.consumoGas.toFixed(4)),
        custo: parseFloat((day.consumoGas * GAS_PRICE_PER_M3).toFixed(2))
      }))

      // Agrupa por mês
      const groupedByMonth = {}
      daily.forEach(day => {
        const month = day.date.split('/')[1] + '/' + day.date.split('/')[2]
        if (!groupedByMonth[month]) {
          groupedByMonth[month] = {
            month: month,
            consumoGas: 0,
            custo: 0
          }
        }
        groupedByMonth[month].consumoGas += day.consumoGas
        groupedByMonth[month].custo += day.custo
      })

      const monthly = Object.values(groupedByMonth).map(month => ({
        month: month.month,
        consumoGas: parseFloat(month.consumoGas.toFixed(4)),
        custo: parseFloat(month.custo.toFixed(2))
      }))

      setDailyCosts(daily)
      setMonthlyCosts(monthly)
      setTotalCost(daily.reduce((sum, day) => sum + day.custo, 0))
      console.log(`✅ Custos atualizados: ${combined.length} pontos (${dbCostData.length} do banco + ${realTimeHistoryData.length} em tempo real)`)
    } else {
      setDailyCosts([])
      setMonthlyCosts([])
      setTotalCost(0)
    }
  }, [dbCostData, realTimeHistoryData])

  useEffect(() => {
    if (deviceId) {
      loadCostData()
    }
  }, [deviceId, startDate, endDate])

  return (
    <div className="cost-management-container">
      <div className="cost-header">
        <h2>Gestão de Custos</h2>
        <p>R$ {GAS_PRICE_PER_M3.toFixed(2)} por m³ de gás natural</p>
      </div>

      <div className="cost-summary">
        <div className="summary-card">
          <div className="summary-label">Custo Total no Período</div>
          <div className="summary-value">R$ {totalCost.toFixed(2)}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Consumo Total</div>
          <div className="summary-value">{(totalCost / GAS_PRICE_PER_M3).toFixed(4)} m³</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Custo Médio Diário</div>
          <div className="summary-value">
            R$ {dailyCosts.length > 0 ? (totalCost / dailyCosts.length).toFixed(2) : '0.00'}
          </div>
        </div>
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
        <button onClick={loadCostData} className="refresh-button" disabled={loading}>
          {loading ? 'Carregando...' : 'Atualizar'}
        </button>
      </div>

      {dailyCosts.length > 0 ? (
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

          <div className="cost-charts-grid">
            <div className="cost-chart-card">
              <div className="chart-header">
                <h3>Custo Diário</h3>
              </div>
              <ResponsiveContainer width="100%" height={400}>
                {chartType === 'bar' ? (
                  <BarChart data={dailyCosts}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis dataKey="date" stroke="#666" fontSize={12} tick={{ fill: '#666' }} />
                    <YAxis stroke="#666" fontSize={12} tick={{ fill: '#666' }} label={{ value: 'Custo (R$)', angle: -90, position: 'insideLeft' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #004B87', borderRadius: '8px' }} />
                    <Legend />
                    <Bar dataKey="custo" name="Custo (R$)" fill="#004B87" radius={[8, 8, 0, 0]} />
                  </BarChart>
                ) : (
                  <LineChart data={dailyCosts}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis dataKey="date" stroke="#666" fontSize={12} tick={{ fill: '#666' }} />
                    <YAxis stroke="#666" fontSize={12} tick={{ fill: '#666' }} label={{ value: 'Custo (R$)', angle: -90, position: 'insideLeft' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #004B87', borderRadius: '8px' }} />
                    <Legend />
                    <Line type="monotone" dataKey="custo" name="Custo (R$)" stroke="#004B87" strokeWidth={3} dot={{ fill: '#004B87', r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>

            <div className="cost-chart-card">
              <div className="chart-header">
                <h3>Consumo vs Custo</h3>
              </div>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={dailyCosts}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis dataKey="date" stroke="#666" fontSize={12} tick={{ fill: '#666' }} />
                  <YAxis yAxisId="left" stroke="#666" fontSize={12} tick={{ fill: '#666' }} label={{ value: 'Consumo (m³)', angle: -90, position: 'insideLeft' }} />
                  <YAxis yAxisId="right" orientation="right" stroke="#666" fontSize={12} tick={{ fill: '#666' }} label={{ value: 'Custo (R$)', angle: 90, position: 'insideRight' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #007CB6', borderRadius: '8px' }} />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="consumoGas" name="Consumo (m³)" stroke="#00B2A9" strokeWidth={3} dot={{ fill: '#00B2A9', r: 4 }} />
                  <Line yAxisId="right" type="monotone" dataKey="custo" name="Custo (R$)" stroke="#004B87" strokeWidth={3} dot={{ fill: '#004B87', r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {monthlyCosts.length > 0 && (
              <div className="cost-chart-card full-width">
                <div className="chart-header">
                  <h3>Custo Mensal</h3>
                </div>
                <ResponsiveContainer width="100%" height={400}>
                  {chartType === 'bar' ? (
                    <BarChart data={monthlyCosts}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                      <XAxis dataKey="month" stroke="#666" fontSize={12} tick={{ fill: '#666' }} />
                      <YAxis stroke="#666" fontSize={12} tick={{ fill: '#666' }} label={{ value: 'Custo (R$)', angle: -90, position: 'insideLeft' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #004B87', borderRadius: '8px' }} />
                      <Legend />
                      <Bar dataKey="custo" name="Custo (R$)" fill="#004B87" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  ) : (
                    <LineChart data={monthlyCosts}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                      <XAxis dataKey="month" stroke="#666" fontSize={12} tick={{ fill: '#666' }} />
                      <YAxis stroke="#666" fontSize={12} tick={{ fill: '#666' }} label={{ value: 'Custo (R$)', angle: -90, position: 'insideLeft' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #004B87', borderRadius: '8px' }} />
                      <Legend />
                      <Line type="monotone" dataKey="custo" name="Custo (R$)" stroke="#004B87" strokeWidth={3} dot={{ fill: '#004B87', r: 4 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="no-data-message">
          {loading ? <p>Carregando dados...</p> : <p>Nenhum dado encontrado no período selecionado.</p>}
        </div>
      )}
    </div>
  )
}

export default CostManagement




