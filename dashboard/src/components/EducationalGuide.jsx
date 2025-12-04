import './EducationalGuide.css'

function EducationalGuide() {
  return (
    <div className="educational-guide-container">
      <div className="guide-header">
        <h2>Guia Educativo - Operação da Caldeira</h2>
        <p>Aprenda a manusear os equipamentos e utilizar a plataforma corretamente</p>
      </div>

      <div className="guide-content">
        <section className="guide-section">
          <h3>1. Entendendo o Dashboard</h3>
          <div className="guide-card">
            <h4>Cards de Informação</h4>
            <ul>
              <li><strong>Temperatura de Entrada:</strong> Temperatura da água que retorna do sistema</li>
              <li><strong>Temperatura de Saída:</strong> Temperatura da água que sai da caldeira</li>
              <li><strong>Consumo de Gás:</strong> Quantidade de gás natural consumida (m³/h)</li>
              <li><strong>Potência Térmica:</strong> Potência gerada pela caldeira (kW)</li>
              <li><strong>Energia Acumulada:</strong> Total de energia gerada (kWh)</li>
              <li><strong>Vazão Acumulada:</strong> Volume total de água circulado (L)</li>
            </ul>
          </div>

          <div className="guide-card">
            <h4>Gráficos</h4>
            <ul>
              <li>Os gráficos mostram a evolução das variáveis ao longo do tempo</li>
              <li>Use o histórico para identificar padrões e anomalias</li>
              <li>Monitore especialmente as temperaturas para garantir eficiência</li>
            </ul>
          </div>
        </section>

        <section className="guide-section">
          <h3>2. Operação da Caldeira</h3>
          <div className="guide-card">
            <h4>Verificações Diárias</h4>
            <ol>
              <li>Verifique a temperatura de saída (deve estar próxima ao setpoint configurado)</li>
              <li>Monitore o consumo de gás - aumentos súbitos podem indicar problemas</li>
              <li>Observe o delta T (diferença entre temperatura de saída e entrada)</li>
              <li>Verifique se há vazamentos ou ruídos anormais</li>
            </ol>
          </div>

          <div className="guide-card">
            <h4>Manutenção Preventiva</h4>
            <ul>
              <li>Limpeza periódica dos sensores de temperatura</li>
              <li>Verificação do sensor de vazão</li>
              <li>Inspeção visual dos componentes</li>
              <li>Registro de anomalias no sistema</li>
            </ul>
          </div>
        </section>

        <section className="guide-section">
          <h3>3. Configurações do Sistema</h3>
          <div className="guide-card">
            <h4>Setpoint de Temperatura</h4>
            <p>O setpoint define a temperatura desejada de saída da caldeira. Ajuste conforme necessário:</p>
            <ul>
              <li>Temperaturas muito altas aumentam o consumo de gás</li>
              <li>Temperaturas muito baixas podem não atender a demanda</li>
              <li>Recomenda-se manter entre 60°C e 70°C para uso residencial</li>
            </ul>
          </div>

          <div className="guide-card">
            <h4>Alertas e Notificações</h4>
            <p>O sistema pode ser configurado para enviar alertas quando:</p>
            <ul>
              <li>A temperatura ultrapassar limites críticos</li>
              <li>O consumo de gás estiver acima do normal</li>
              <li>Houver falhas nos sensores</li>
            </ul>
          </div>
        </section>

        <section className="guide-section">
          <h3>4. Interpretando os Dados</h3>
          <div className="guide-card">
            <h4>Sinais de Problemas</h4>
            <div className="alert-box warning">
              <strong>⚠️ Atenção:</strong>
              <ul>
                <li>Delta T muito baixo (&lt; 5°C) pode indicar baixa eficiência</li>
                <li>Consumo de gás elevado com baixa potência indica problema</li>
                <li>Temperaturas instáveis podem indicar falha no controle</li>
                <li>Vazão zero pode indicar problema no sensor ou na bomba</li>
              </ul>
            </div>
          </div>

          <div className="guide-card">
            <h4>Otimização</h4>
            <ul>
              <li>Monitore os horários de maior consumo</li>
              <li>Ajuste o setpoint conforme a demanda</li>
              <li>Use o histórico para identificar padrões de uso</li>
              <li>Compare períodos para identificar melhorias</li>
            </ul>
          </div>
        </section>

        <section className="guide-section">
          <h3>5. Navegação na Plataforma</h3>
          <div className="guide-card">
            <h4>Abas Disponíveis</h4>
            <ul>
              <li><strong>Dashboard Principal:</strong> Visão geral em tempo real</li>
              <li><strong>Histórico de Consumo:</strong> Análise de dados históricos</li>
              <li><strong>Guia Educativo:</strong> Este guia de referência</li>
              <li><strong>Alertas Meteorológicos:</strong> Avisos sobre mudanças de temperatura</li>
            </ul>
          </div>

          <div className="guide-card">
            <h4>Dicas de Uso</h4>
            <ul>
              <li>Use filtros de data no histórico para análises específicas</li>
              <li>Exporte dados quando necessário para relatórios</li>
              <li>Configure alertas personalizados conforme sua necessidade</li>
              <li>Mantenha o sistema atualizado para melhor performance</li>
            </ul>
          </div>
        </section>

        <section className="guide-section">
          <h3>6. Contato e Suporte</h3>
          <div className="guide-card">
            <p>Em caso de dúvidas ou problemas:</p>
            <ul>
              <li>Consulte este guia primeiro</li>
              <li>Verifique os alertas do sistema</li>
              <li>Entre em contato com o suporte técnico</li>
              <li>Documente problemas para facilitar a resolução</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  )
}

export default EducationalGuide




