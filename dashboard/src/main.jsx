import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

// Adiciona tratamento de erros globais não capturados
window.addEventListener('error', (event) => {
  console.error('Erro global capturado:', event.error)
  // Previne que o erro quebre completamente a aplicação
  event.preventDefault()
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('Promise rejeitada não tratada:', event.reason)
  // Previne que a promise rejeitada quebre a aplicação
  event.preventDefault()
})

try {
  const root = ReactDOM.createRoot(document.getElementById('root'))
  root.render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
} catch (error) {
  console.error('Erro ao renderizar aplicação:', error)
  // Fallback: renderiza uma mensagem de erro
  const rootElement = document.getElementById('root')
  if (rootElement) {
    rootElement.innerHTML = `
      <div style="display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; padding: 20px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
        <h2>Erro ao carregar a aplicação</h2>
        <p>Por favor, recarregue a página.</p>
        <button onclick="window.location.reload()" style="padding: 10px 20px; margin-top: 20px; background: white; color: #667eea; border: none; border-radius: 4px; cursor: pointer; font-size: 16px;">
          Recarregar
        </button>
      </div>
    `
  }
}

