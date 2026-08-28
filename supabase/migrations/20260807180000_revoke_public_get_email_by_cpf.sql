-- Causa raiz real do achado crítico anterior: Postgres concede EXECUTE a
-- PUBLIC por padrão na criação de uma função, salvo REVOKE explícito. A
-- migração original (20260617160000) nunca revogou de PUBLIC — só fez GRANT
-- adicional para anon/authenticated. Por isso, revogar de anon/authenticated
-- (migrações 20260626130000 e as duas anteriores a esta) não teve nenhum
-- efeito real: PUBLIC continuava a dar acesso a todos os roles, autenticados
-- ou não. Confirmado por teste direto após as revogações anteriores —
-- a chamada anónima continuava a devolver 200.
REVOKE EXECUTE ON FUNCTION public.get_email_by_cpf(TEXT) FROM PUBLIC;

-- service_role não depende de GRANT (bypassa), continua a funcionar.
-- Nenhum outro role precisa de acesso direto a esta função.

NOTIFY pgrst, 'reload schema';
