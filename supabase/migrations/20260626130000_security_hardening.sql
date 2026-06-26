-- Security hardening: revoke anonymous access to get_email_by_cpf SQL function.
-- The CPF→email lookup remains available exclusively via the TanStack Start
-- server function (findEmailByCpf in staff.functions.ts), which is the controlled path.
-- Removing the anon grant eliminates the direct REST API vector
-- (POST /rest/v1/rpc/get_email_by_cpf without authentication).

REVOKE EXECUTE ON FUNCTION public.get_email_by_cpf(TEXT) FROM anon;

NOTIFY pgrst, 'reload schema';
