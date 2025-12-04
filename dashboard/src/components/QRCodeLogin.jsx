import { useState, useEffect } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { supabase } from '../supabaseClient'
import Logo from './Logo'
import './QRCodeLogin.css'

function QRCodeLogin({ onLogin }) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleQRScan = async (scannedData) => {
    try {
      setLoading(true)
      const data = JSON.parse(scannedData)
      
      // Processa QR Code de cadastro (novo fluxo)
      if (data.type === 'morador_signup' && data.condominio_id) {
        // Verifica se o QR Code não expirou
        if (data.expires_at && Date.now() > data.expires_at) {
          setError('QR Code expirado. Solicite um novo código ao síndico.')
          setLoading(false)
          return
        }

        // Salva os dados do QR Code no localStorage para o Signup usar
        // IMPORTANTE: Salva como string JSON, não como objeto stringificado duas vezes
        localStorage.setItem('qr_signup_data', scannedData)
        
        // Redireciona para o cadastro
        setError('QR Code válido! Redirecionando para o cadastro...')
        setTimeout(() => {
          // Redireciona para a página principal com parâmetros de signup
          const qrEncoded = encodeURIComponent(scannedData)
          // Força o redirecionamento completo
          window.location.replace(`/?signup=true&qr=${qrEncoded}`)
        }, 1000)
        return
      }

      // Processa QR Code de login (fluxo antigo - mantido para compatibilidade)
      if (data.type === 'morador_login' && data.morador_id && data.token) {
        if (data.expires_at && Date.now() > data.expires_at) {
          setError('QR Code expirado. Solicite um novo código ao síndico.')
          setLoading(false)
          return
        }

        const storedToken = localStorage.getItem(`qr_token_${data.morador_id}`)
        if (storedToken === data.token) {
          const { data: userData, error } = await supabase
            .from('users')
            .select('id, email, role')
            .eq('id', data.morador_id)
            .eq('role', 'morador')
            .single()

          if (error || !userData) {
            setError('Usuário não encontrado. Entre em contato com o síndico.')
          } else {
            setError('QR Code válido. Redirecionando...')
            setTimeout(() => {
              if (onLogin) {
                window.location.href = '/login'
              }
            }, 2000)
          }
        } else {
          setError('QR Code inválido ou expirado')
        }
      } else {
        setError('QR Code inválido. Certifique-se de que é um QR Code de cadastro de morador.')
      }
    } catch (err) {
      setError('Erro ao processar QR Code. Verifique se o código está correto.')
      console.error('Erro ao processar QR Code:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="qrcode-login-container">
      <div className="qrcode-login-card">
        <div className="login-logo">
          <Logo />
        </div>
        <div className="qrcode-login-header">
          <h1>Login via QR Code</h1>
          <p>Escaneie o QR Code fornecido pelo síndico</p>
        </div>

        <div className="qrcode-scan-section">
          <h3>Escaneie o QR Code</h3>
          <p>Use a câmera do seu dispositivo para escanear o QR Code fornecido pelo síndico para se cadastrar</p>
          <input
            type="text"
            placeholder="Cole aqui o código do QR Code ou escaneie com a câmera"
            className="qr-input"
            onChange={(e) => {
              const value = e.target.value.trim()
              if (value && (value.startsWith('{') || value.startsWith('{"'))) {
                handleQRScan(value)
              }
            }}
          />
          <p className="qr-help-text">
            O QR Code do síndico irá direcioná-lo para o cadastro, associando você automaticamente ao condomínio correto.
          </p>
        </div>

        <div className="manual-login-option">
          <p>Ou faça login manualmente:</p>
          <button onClick={() => window.location.href = '/login'} className="manual-login-button">
            Login Manual
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}
        {loading && <div className="loading-message">Processando...</div>}
      </div>
    </div>
  )
}

export default QRCodeLogin

