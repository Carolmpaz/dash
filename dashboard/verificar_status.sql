-- =====================================================
-- SCRIPT PARA VERIFICAR STATUS COMPLETO
-- =====================================================
-- Execute este script para verificar se tudo está funcionando
-- =====================================================

-- 1. Verificar dispositivos
SELECT '=== DISPOSITIVOS ===' AS info;
SELECT device_id, condominio_id, unidade, localizacao FROM dispositivos;

-- 2. Verificar usuários no Auth
SELECT '=== USUÁRIOS NO AUTH ===' AS info;
SELECT id, email, created_at 
FROM auth.users 
WHERE email IN (
    'sindico@exemplo.com',
    'zelador@exemplo.com',
    'morador@exemplo.com',
    'comgas@exemplo.com'
)
ORDER BY email;

-- 3. Verificar usuários na tabela users
SELECT '=== USUÁRIOS NA TABELA USERS ===' AS info;
SELECT id, email, role, condominio_id, unidade, is_sindico 
FROM users
ORDER BY email;

-- 4. Verificar leituras (últimas 10)
SELECT '=== ÚLTIMAS 10 LEITURAS ===' AS info;
SELECT 
    id,
    device_id,
    temp_ida,
    temp_retorno,
    deltat,
    vazao_l_s,
    potencia_kw,
    energia_kwh,
    reading_time
FROM leituras_sensores 
WHERE device_id = 'ESP32_001'
ORDER BY reading_time DESC 
LIMIT 10;

-- 5. Contar total de leituras
SELECT '=== ESTATÍSTICAS DE LEITURAS ===' AS info;
SELECT 
    COUNT(*) as total_leituras,
    MIN(reading_time) as primeira_leitura,
    MAX(reading_time) as ultima_leitura,
    AVG(temp_ida) as temp_ida_media,
    AVG(temp_retorno) as temp_retorno_media,
    AVG(vazao_l_s) as vazao_media,
    SUM(potencia_kw) as potencia_total,
    MAX(energia_kwh) as energia_maxima
FROM leituras_sensores 
WHERE device_id = 'ESP32_001';

-- 6. Verificar dados acumulados
SELECT '=== DADOS ACUMULADOS ===' AS info;
SELECT 
    id,
    condominio_id,
    device_id,
    data,
    energia_total_kwh,
    potencia_total_kw,
    gas_total_m3,
    vazao_total_l,
    updated_at
FROM consumo_acumulado 
WHERE device_id = 'ESP32_001'
ORDER BY data DESC, updated_at DESC 
LIMIT 5;

-- =====================================================
-- INTERPRETAÇÃO DOS RESULTADOS
-- =====================================================

-- ✅ Se dispositivos aparecerem: Dispositivo está cadastrado
-- ✅ Se usuários no Auth aparecerem: Usuários foram criados no Auth
-- ❌ Se usuários na tabela users NÃO aparecerem: Execute corrigir_usuarios.sql
-- ✅ Se leituras aparecerem: Leituras estão sendo salvas!
-- ✅ Se dados acumulados aparecerem: Sistema de agregação está funcionando

