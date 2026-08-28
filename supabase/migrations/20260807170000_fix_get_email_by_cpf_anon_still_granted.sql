-- CRÍTICO: verificação empírica mostrou que REVOKE ... FROM anon (migração
-- 20260626130000) nunca chegou a ser executado na base real, apesar de constar
-- no histórico de migrações — esta migração fazia parte de um lote que foi
-- marcado como "já aplicado" (supabase migration repair) com base em evidência
-- de OUTRAS mudanças do mesmo lote, sem verificar esta em particular.
--
-- Efeito prático até agora: QUALQUER pessoa, sem login nenhum, conseguia
-- chamar POST /rest/v1/rpc/get_email_by_cpf com a chave pública (anon) e
-- obter o e-mail de qualquer utilizador a partir do CPF. Confirmado por
-- teste direto: a chamada devolvia 200, não erro de permissão.
REVOKE EXECUTE ON FUNCTION public.get_email_by_cpf(TEXT) FROM anon;

NOTIFY pgrst, 'reload schema';
