import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import './VariableComparison.css'

function VariableComparison({ historyData }) {
  const [variable1, setVariable1] = useState('temp_ida')
  const [variable2, setVariable2] = useState('temp_retorno')

  const variableOptions = [
    { value: 'temp_ida', label: 'Temperatura de Saída (°C)', color: '#007CB6' },
    { value: 'temp_retorno', label: 'Temperatura de Entrada (°C)', color: '#00B2E3' },
    { value: 'deltaT', label: 'Diferença de Temperatura (ΔT) (°C)', color: '#F89C1B' },
    { value: 'vazao', label: 'Vazão (L/s)', color: '#00B2A9' },
    { value: 'potencia', label: 'Potência (kW)', color: '#7FC241' },
    { value: 'energia', label: 'Energia (kWh)', color: '#FFD600' },
    { value: 'gas', label: 'Consumo de Gás (m³/h)', color: '#004B87' }
  ]

  const getVariableData = (variable) => {
    return historyData.map(item => ({
      time: item.time,
      value: item[variable] || 0
    }))
  }

  const var1Option = variableOptions.find(v => v.value === variable1)
  const var2Option = variableOptions.find(v => v.value === variable2)

  return (
    <div className="variable-comparison-container">
      <div className="variable-comparison-header">
        <h2>Análise Comparativa de Variáveis</h2>
        <p>Selecione duas variáveis para comparar em um gráfico</p>
      </div>

      <div className="variable-selectors">
        <div className="variable-selector">
          <label>Variável 1:</label>
          <select 
            value={variable1} 
            onChange={(e) => setVariable1(e.target.value)}
            className="variable-select"
          >
            {variableOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="variable-selector">
          <label>Variável 2:</label>
          <select 
            value={variable2} 
            onChange={(e) => setVariable2(e.target.value)}
            className="variable-select"
          >
            {variableOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="comparison-chart-card">
        <div className="chart-header">
          <h3>
            {var1Option?.label} vs {var2Option?.label}
          </h3>
        </div>
        <ResponsiveContainer width="100%" height={500}>
          <LineChart data={historyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis 
              dataKey="time" 
              stroke="#666"
              fontSize={12}
              tick={{ fill: '#666' }}
            />
            <YAxis 
              yAxisId="left"
              stroke="#666"
              fontSize={12}
              tick={{ fill: '#666' }}
              label={{ value: var1Option?.label || 'Variável 1', angle: -90, position: 'insideLeft' }}
            />
            <YAxis 
              yAxisId="right"
              orientation="right"
              stroke="#666"
              fontSize={12}
              tick={{ fill: '#666' }}
              label={{ value: var2Option?.label || 'Variável 2', angle: 90, position: 'insideRight' }}
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
              dataKey={variable1} 
              name={var1Option?.label || 'Variável 1'} 
              stroke={var1Option?.color || '#007CB6'} 
              strokeWidth={3}
              dot={{ fill: var1Option?.color || '#007CB6', r: 4 }}
              activeDot={{ r: 6 }}
            />
            <Line 
              yAxisId="right"
              type="monotone" 
              dataKey={variable2} 
              name={var2Option?.label || 'Variável 2'} 
              stroke={var2Option?.color || '#00B2E3'} 
              strokeWidth={3}
              dot={{ fill: var2Option?.color || '#00B2E3', r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default VariableComparison






