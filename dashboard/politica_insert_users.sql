-- Política para permitir que usuários criem seu próprio registro na tabela users
-- Execute este script no SQL Editor do Supabase

-- Ativar RLS na tabela users (se ainda não estiver ativado)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Política para permitir que usuários criem seu próprio registro
-- Isso permite que após o signup, o usuário possa inserir seu próprio registro
DROP POLICY IF EXISTS "Users can insert their own record" ON public.users;
CREATE POLICY "Users can insert their own record"
ON public.users FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Política para permitir que usuários vejam seu próprio registro
DROP POLICY IF EXISTS "Users can view their own record" ON public.users;
CREATE POLICY "Users can view their own record"
ON public.users FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Política para permitir que usuários atualizem seu próprio registro (limitado)
-- Apenas campos específicos podem ser atualizados pelo próprio usuário
DROP POLICY IF EXISTS "Users can update their own record" ON public.users;
CREATE POLICY "Users can update their own record"
ON public.users FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Comgás pode ver e editar todos os usuários
DROP POLICY IF EXISTS "Comgas can manage all users" ON public.users;
CREATE POLICY "Comgas can manage all users"
ON public.users FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
        AND u.role = 'comgas'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
        AND u.role = 'comgas'
    )
);

