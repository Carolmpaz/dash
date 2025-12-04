import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import './BillView.css'

const GAS_PRICE_PER_M3 = 8.00

function BillView({ userInfo }) {
  const [startDate, setStartDate] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])
  const [billData, setBillData] = useState([])
  const [loading, setLoading] = useState(false)
  const [totalCost, setTotalCost] = useState(0)
  const [currentMonthCost, setCurrentMonthCost] = useState(0)

  useEffect(() => {
    if (userInfo) {
      loadBillData()
    }
  }, [userInfo, startDate, endDate])

  const loadBillData = async () => {
    if (!userInfo?.condominio_id || !userInfo?.unidade) return

    setLoading(true)
    try {
      const start = new Date(startDate)
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)

      // Busca dispositivos da unidade do morador
      const { data: devices } = await supabase
        .from('dispositivos')
        .select('device_id')
        .eq('condominio_id', userInfo.condominio_id)
        .eq('unidade', userInfo.unidade)

      if (!devices || devices.length === 0) {
        setBillData([])
        setTotalCost(0)
        setLoading(false)
        return
      }

      const deviceIds = devices.map(d => d.device_id)

      const { data, error } = await supabase
        .from('leituras_sensores')
        .select('*')
        .in('device_id', deviceIds)
        .gte('reading_time', start.toISOString())
        .lte('reading_time', end.toISOString())
        .order('reading_time', { ascending: true })

      if (error) {
        console.error('Erro ao carregar dados:', error)
      } else if (data && data.length > 0) {
        const groupedByDate = {}
        
        data.forEach(item => {
          const date = new Date(item.reading_time).toLocaleDateString('pt-BR')
          if (!groupedByDate[date]) {
            groupedByDate[date] = {
              date: date,
              consumoGas: 0
            }
          }
          const consumo = (parseFloat(item.potencia_kW) || 0) * 0.1
          groupedByDate[date].consumoGas += consumo
        })

        const daily = Object.values(groupedByDate).map(day => ({
          date: day.date,
          consumoGas: parseFloat(day.consumoGas.toFixed(4)),
          custo: parseFloat((day.consumoGas * GAS_PRICE_PER_M3).toFixed(2))
        }))

        setBillData(daily)
        setTotalCost(daily.reduce((sum, day) => sum + day.custo, 0))

        // Calcula custo do mês atual
        const now = new Date()
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        const currentMonthData = daily.filter(day => {
          const dayDate = new Date(day.date.split('/').reverse().join('-'))
          return dayDate >= currentMonthStart
        })
        setCurrentMonthCost(currentMonthData.reduce((sum, day) => sum + day.custo, 0))
      } else {
        setBillData([])
        setTotalCost(0)
        setCurrentMonthCost(0)
      }
    } catch (err) {
      console.error('Erro ao carregar dados da conta:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bill-view-container">
      <div className="bill-header">
        <h2>Minha Conta de Gás</h2>
        <p>R$ {GAS_PRICE_PER_M3.toFixed(2)} por m³ de gás natural</p>
      </div>

      <div className="bill-summary">
        <div className="summary-card highlight">
          <div className="summary-label">Total no Período</div>
          <div className="summary-value">R$ {totalCost.toFixed(2)}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Mês Atual</div>
          <div className="summary-value">R$ {currentMonthCost.toFixed(2)}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Consumo Total</div>
          <div className="summary-value">{(totalCost / GAS_PRICE_PER_M3).toFixed(4)} m³</div>
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
        <button onClick={loadBillData} className="refresh-button" disabled={loading}>
          {loading ? 'Carregando...' : 'Atualizar'}
        </button>
      </div>

      {billData.length > 0 ? (
        <div className="bill-charts">
          <div className="bill-chart-card">
            <div className="chart-header">
              <h3>Valor da Conta por Data</h3>
            </div>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={billData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis dataKey="date" stroke="#666" fontSize={12} tick={{ fill: '#666' }} />
                <YAxis stroke="#666" fontSize={12} tick={{ fill: '#666' }} label={{ value: 'Custo (R$)', angle: -90, position: 'insideLeft' }} />
                <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #004B87', borderRadius: '8px' }} />
                <Legend />
                <Bar dataKey="custo" name="Valor da Conta (R$)" fill="#004B87" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bill-chart-card">
            <div className="chart-header">
              <h3>Consumo vs Valor</h3>
            </div>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={billData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis dataKey="date" stroke="#666" fontSize={12} tick={{ fill: '#666' }} />
                <YAxis yAxisId="left" stroke="#666" fontSize={12} tick={{ fill: '#666' }} label={{ value: 'Consumo (m³)', angle: -90, position: 'insideLeft' }} />
                <YAxis yAxisId="right" orientation="right" stroke="#666" fontSize={12} tick={{ fill: '#666' }} label={{ value: 'Custo (R$)', angle: 90, position: 'insideRight' }} />
                <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #007CB6', borderRadius: '8px' }} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="consumoGas" name="Consumo (m³)" stroke="#00B2A9" strokeWidth={3} dot={{ fill: '#00B2A9', r: 4 }} />
                <Line yAxisId="right" type="monotone" dataKey="custo" name="Valor (R$)" stroke="#004B87" strokeWidth={3} dot={{ fill: '#004B87', r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="no-data-message">
          {loading ? <p>Carregando dados...</p> : <p>Nenhum dado encontrado no período selecionado.</p>}
        </div>
      )}
    </div>
  )
}

export default BillView




