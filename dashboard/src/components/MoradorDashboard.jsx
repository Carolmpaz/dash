import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import Logo from './Logo'
import BillView from './BillView'
import './Dashboard.css'

function MoradorDashboard({ onLogout, user, userInfo }) {
  const [condominio, setCondominio] = useState(null)

  useEffect(() => {
    if (userInfo?.condominio_id) {
      loadCondominioInfo()
    }
  }, [userInfo])

  const loadCondominioInfo = async () => {
    try {
      const { data } = await supabase
        .from('condominios')
        .select('nome')
        .eq('id', userInfo.condominio_id)
        .single()
      
      if (data) {
        setCondominio(data.nome)
      }
    } catch (err) {
      console.error('Erro ao carregar informações do condomínio:', err)
    }
  }

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-left">
          <Logo />
          <div className="header-title-section">
            <h1>Minha Conta - Morador</h1>
          </div>
        </div>
        <div className="header-right">
          {userInfo && (
            <div className="user-info" style={{ marginRight: '15px', fontSize: '14px', color: '#666' }}>
              <span style={{ fontWeight: '600' }}>Morador</span>
              {condominio && <span style={{ marginLeft: '10px' }}>• {condominio}</span>}
              {userInfo.unidade && <span style={{ marginLeft: '10px' }}>• Unidade {userInfo.unidade}</span>}
            </div>
          )}
          <button onClick={onLogout} className="logout-button">Sair</button>
        </div>
      </header>

      <main className="dashboard-main">
        <BillView userInfo={userInfo} />
      </main>
    </div>
  )
}

export default MoradorDashboard




