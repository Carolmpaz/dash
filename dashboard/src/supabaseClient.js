import { createClient } from "@supabase/supabase-js";

// Configuração do Supabase usando variáveis de ambiente
// Você pode encontrar estas chaves no painel do seu projeto Supabase, em Settings -> API
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

// Validação das credenciais
const hasValidCredentials = supabaseUrl && 
                            supabaseUrl !== "" && 
                            supabaseUrl !== "SUA_URL_DO_PROJETO_SUPABASE" &&
                            supabaseAnonKey && 
                            supabaseAnonKey !== "" && 
                            supabaseAnonKey !== "SUA_CHAVE_ANON_KEY";

if (!hasValidCredentials) {
  console.warn("⚠️ Credenciais do Supabase não configuradas!");
  console.warn("⚠️ Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env");
  console.warn("⚠️ O sistema funcionará em modo limitado até que as credenciais sejam configuradas.");
}

// Cria cliente apenas se as credenciais estiverem configuradas
// Se não estiverem, cria um cliente que falhará de forma mais clara
let supabase;

if (hasValidCredentials) {
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
} else {
  // Cria um cliente com uma URL inválida que falhará de forma mais clara
  // Isso evita o erro "Failed to fetch" com placeholder inexistente
  // O erro será capturado e tratado adequadamente no componente
  supabase = createClient("https://not-configured.supabase.co", "not-configured-key", {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

export { supabase };

// Exporta flag para verificar se credenciais estão configuradas
export const isSupabaseConfigured = hasValidCredentials;

