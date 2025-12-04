import { useState, useEffect } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { supabase } from '../supabaseClient'
import './QRCodeGenerator.css'

function QRCodeGenerator({ userInfo }) {
  const [moradores, setMoradores] = useState([])
  const [selectedMorador, setSelectedMorador] = useState(null)
  const [qrCodeData, setQrCodeData] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (userInfo?.condominio_id) {
      loadMoradores()
    }
  }, [userInfo])

  const loadMoradores = async () => {
    if (!userInfo?.condominio_id) return

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, unidade')
        .eq('role', 'morador')
        .eq('condominio_id', userInfo.condominio_id)
        .order('unidade')

      if (error) {
        console.error('Erro ao carregar moradores:', error)
      } else if (data) {
        setMoradores(data)
      }
    } catch (err) {
      console.error('Erro ao carregar moradores:', err)
    } finally {
      setLoading(false)
    }
  }

  const generateQRCode = (morador) => {
    // Gera um token único para o QR Code
    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    const qrData = JSON.stringify({
      type: 'morador_login',
      morador_id: morador.id,
      email: morador.email,
      token: token,
      timestamp: Date.now(),
      expires_at: Date.now() + (7 * 24 * 60 * 60 * 1000) // Expira em 7 dias
    })
    
    // Salva o token no banco (opcional - pode usar uma tabela de tokens)
    localStorage.setItem(`qr_token_${morador.id}`, token)
    setQrCodeData(qrData)
    setSelectedMorador(morador)
  }

  return (
    <div className="qrcode-generator-container">
      <div className="qrcode-generator-header">
        <h2>Gerar QR Code para Moradores</h2>
        <p>Gere QR Codes para que os moradores façam login na plataforma</p>
      </div>

      <div className="qrcode-generator-content">
        <div className="moradores-list">
          <h3>Moradores do Condomínio</h3>
          {loading ? (
            <p>Carregando moradores...</p>
          ) : moradores.length > 0 ? (
            <div className="moradores-grid">
              {moradores.map(morador => (
                <div key={morador.id} className="morador-card">
                  <div className="morador-info">
                    <strong>{morador.email}</strong>
                    {morador.unidade && <span>Unidade {morador.unidade}</span>}
                  </div>
                  <button 
                    onClick={() => generateQRCode(morador)}
                    className="generate-qr-button"
                  >
                    Gerar QR Code
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p>Nenhum morador cadastrado no condomínio.</p>
          )}
        </div>

        {qrCodeData && selectedMorador && (
          <div className="qrcode-display-section">
            <h3>QR Code Gerado</h3>
            <div className="qrcode-card">
              <div className="qrcode-info">
                <p><strong>Morador:</strong> {selectedMorador.email}</p>
                {selectedMorador.unidade && <p><strong>Unidade:</strong> {selectedMorador.unidade}</p>}
                <p className="qr-instructions">
                  Este QR Code expira em 7 dias. Compartilhe com o morador para acesso à plataforma.
                </p>
              </div>
              <div className="qrcode-image">
                <QRCodeCanvas value={qrCodeData} size={256} />
              </div>
              <button 
                onClick={() => {
                  const canvas = document.querySelector('.qrcode-image canvas')
                  if (canvas) {
                    const url = canvas.toDataURL()
                    const link = document.createElement('a')
                    link.download = `qr-code-${selectedMorador.email}.png`
                    link.href = url
                    link.click()
                  }
                }}
                className="download-qr-button"
              >
                Baixar QR Code
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default QRCodeGenerator




