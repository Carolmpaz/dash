import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

// Verifica se o elemento root existe
const rootElement = document.getElementById('root')

if (!rootElement) {
  console.error('Elemento root não encontrado!')
  document.body.innerHTML = `
    <div style="display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; padding: 20px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
      <h2>Erro: Elemento root não encontrado</h2>
      <p>Verifique se existe um elemento com id="root" no HTML.</p>
    </div>
  `
} else {
  try {
    const root = ReactDOM.createRoot(rootElement)
    root.render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    )
  } catch (error) {
    console.error('Erro ao renderizar aplicação:', error)
    rootElement.innerHTML = `
      <div style="display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; padding: 20px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
        <h2>Erro ao carregar a aplicação</h2>
        <p>Por favor, recarregue a página.</p>
        <button onclick="window.location.reload()" style="padding: 10px 20px; margin-top: 20px; background: white; color: #667eea; border: none; border-radius: 4px; cursor: pointer; font-size: 16px;">
          Recarregar
        </button>
        <pre style="margin-top: 20px; text-align: left; background: rgba(255,255,255,0.1); padding: 10px; border-radius: 4px; font-size: 12px;">
          ${error.toString()}
        </pre>
      </div>
    `
  }
}

