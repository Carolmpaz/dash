// Serviço para integração com API de meteorologia
// Usando OpenWeatherMap (gratuito até 1000 chamadas/dia)

const WEATHER_API_KEY = import.meta.env.VITE_WEATHER_API_KEY || ''
const WEATHER_API_URL = 'https://api.openweathermap.org/data/2.5/weather'

// Função para buscar dados meteorológicos atuais
export const fetchCurrentWeather = async (lat, lon) => {
  if (!WEATHER_API_KEY) {
    console.warn('⚠️ VITE_WEATHER_API_KEY não configurada. Configure no arquivo .env')
    return null
  }

  try {
    const response = await fetch(
      `${WEATHER_API_URL}?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric&lang=pt_br`
    )
    
    if (!response.ok) {
      throw new Error(`Erro na API: ${response.status}`)
    }

    const data = await response.json()
    
    return {
      temperatura: data.main.temp,
      umidade: data.main.humidity,
      pressao: data.main.pressure,
      velocidade_vento: data.wind?.speed || 0,
      descricao: data.weather[0]?.description || ''
    }
  } catch (error) {
    console.error('Erro ao buscar dados meteorológicos:', error)
    return null
  }
}

// Função para buscar coordenadas de um endereço (geocoding)
export const getCoordinatesFromAddress = async (address) => {
  if (!WEATHER_API_KEY) {
    return null
  }

  try {
    const response = await fetch(
      `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(address)}&limit=1&appid=${WEATHER_API_KEY}`
    )
    
    if (!response.ok) {
      throw new Error(`Erro na API: ${response.status}`)
    }

    const data = await response.json()
    
    if (data && data.length > 0) {
      return {
        lat: data[0].lat,
        lon: data[0].lon
      }
    }
    
    return null
  } catch (error) {
    console.error('Erro ao buscar coordenadas:', error)
    return null
  }
}

