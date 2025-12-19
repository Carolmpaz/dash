// Serviço para integração com API de meteorologia
// Usando Meteoblue API

const WEATHER_API_KEY = import.meta.env.VITE_WEATHER_API_KEY || 'tUjDmQehfLbA0dNl'
const WEATHER_API_URL = 'https://my.meteoblue.com/packages/basic-day_current'

// Função para buscar dados meteorológicos atuais
export const fetchCurrentWeather = async (lat, lon) => {
  console.log('🌤️ [WeatherService] Buscando dados meteorológicos...', { lat, lon })
  
  if (!WEATHER_API_KEY) {
    console.error('❌ [WeatherService] VITE_WEATHER_API_KEY não configurada!')
    console.error('   Configure a variável VITE_WEATHER_API_KEY no arquivo .env')
    return null
  }

  try {
    // Meteoblue API - coordenadas de São Paulo: -23.5475, -46.6361
    // Usa as coordenadas fornecidas ou padrão de São Paulo
    const finalLat = lat || -23.5475
    const finalLon = lon || -46.6361
    const asl = 769 // Altitude de São Paulo em metros
    
    const url = `${WEATHER_API_URL}?apikey=${WEATHER_API_KEY}&lat=${finalLat}&lon=${finalLon}&asl=${asl}&format=json`
    console.log('📡 [WeatherService] Fazendo requisição para Meteoblue API...')
    console.log('   URL:', url.replace(WEATHER_API_KEY, '***'))
    
    const response = await fetch(url)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ [WeatherService] Erro na API:', response.status, errorText)
      throw new Error(`Erro na API: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    console.log('✅ [WeatherService] Dados recebidos da API Meteoblue:', data)
    
    // Extrai dados atuais
    const current = data.data_current || {}
    const dayData = data.data_day || {}
    
    console.log('📊 [WeatherService] Dados atuais:', current)
    console.log('📊 [WeatherService] Dados do dia:', dayData)
    
    // Temperatura atual (prioriza data_current, depois usa média do dia)
    const temperatura = current.temperature !== undefined 
      ? current.temperature 
      : (dayData.temperature_mean?.[0] || dayData.temperature_instant?.[1] || 0)
    
    // Umidade média do dia (usa o primeiro dia do array, que é hoje)
    const umidade = dayData.relativehumidity_mean?.[0] 
      || dayData.relativehumidity_max?.[0] 
      || 0
    
    // Pressão média do dia
    const pressao = dayData.sealevelpressure_mean?.[0] 
      || dayData.sealevelpressure_max?.[0] 
      || 0
    
    // Velocidade do vento atual ou média
    const velocidade_vento = current.windspeed !== undefined
      ? current.windspeed
      : (dayData.windspeed_mean?.[0] || 0)
    
    // Descrição baseada no pictocode
    const pictocode = current.pictocode !== undefined 
      ? current.pictocode 
      : (dayData.pictocode?.[0] || 0)
    const descricao = getWeatherDescription(pictocode)
    
    const weatherData = {
      temperatura: parseFloat(temperatura) || 0,
      umidade: Math.round(parseFloat(umidade) || 0),
      pressao: Math.round(parseFloat(pressao) || 0),
      velocidade_vento: parseFloat(velocidade_vento) || 0,
      descricao: descricao
    }
    
    console.log('✅ [WeatherService] Dados formatados:', weatherData)
    return weatherData
  } catch (error) {
    console.error('❌ [WeatherService] Erro ao buscar dados meteorológicos:', error)
    console.error('   Detalhes:', error.message)
    return null
  }
}

// Função auxiliar para converter pictocode em descrição
function getWeatherDescription(pictocode) {
  const descriptions = {
    0: 'Céu limpo',
    1: 'Parcialmente nublado',
    2: 'Nublado',
    3: 'Nublado',
    4: 'Chuva',
    5: 'Chuva forte',
    6: 'Tempestade',
    7: 'Neve',
    8: 'Chuva com neve',
    9: 'Neblina',
    10: 'Neblina',
    11: 'Neblina',
    12: 'Neblina',
    13: 'Neblina',
    14: 'Neblina',
    15: 'Neblina',
    16: 'Neblina',
    17: 'Neblina',
    18: 'Neblina',
    19: 'Neblina',
    20: 'Neblina',
    21: 'Neblina',
    22: 'Neblina'
  }
  return descriptions[pictocode] || 'Condições desconhecidas'
}

// Função para buscar coordenadas de um endereço (geocoding)
// Para São Paulo, SP, sempre retorna as coordenadas fixas
export const getCoordinatesFromAddress = async (address) => {
  console.log('📍 [WeatherService] Buscando coordenadas para:', address)
  
  // Sempre retorna coordenadas de São Paulo, SP
  // Lat: -23.5475, Lon: -46.6361 (coordenadas de São Paulo)
  const saoPauloCoords = {
    lat: -23.5475,
    lon: -46.6361
  }
  
  console.log('✅ [WeatherService] Usando coordenadas fixas de São Paulo, SP:', saoPauloCoords)
  return saoPauloCoords
}

