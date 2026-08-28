-- Security audit finding (Alta): get_email_by_cpf(TEXT) ainda tinha GRANT EXECUTE
-- para o role "authenticated" (a migração 20260626130000 só revogou "anon").
-- Isso permitia que QUALQUER utilizador autenticado (até o role de menor
-- privilégio, "driver") chamasse POST /rest/v1/rpc/get_email_by_cpf com um
-- CPF arbitrário e recebesse de volta o e-mail de QUALQUER pessoa no sistema
-- — bypass total de autorização, exposição de PII (CPF é dado sensível LGPD).
--
-- Verificado que isso é seguro remover: o único caller no código,
-- `findEmailByCpf` em src/lib/staff.functions.ts, usa o cliente service_role
-- (supabaseAdmin), que ignora GRANTs de função — não depende deste GRANT
-- para funcionar. Nenhum código chama esta RPC via cliente authenticated/anon.
REVOKE EXECUTE ON FUNCTION public.get_email_by_cpf(TEXT) FROM authenticated;

NOTIFY pgrst, 'reload schema';
