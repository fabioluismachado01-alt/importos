-- Segurança: fecha o acesso público (PostgREST/anon key) a todas as tabelas do schema public.
-- O ImportOS acessa o banco só via Prisma com o usuário postgres (dono das tabelas), que ignora RLS,
-- então nada muda para o app. Sem policies = ninguém lê/escreve pela API REST do Supabase.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
