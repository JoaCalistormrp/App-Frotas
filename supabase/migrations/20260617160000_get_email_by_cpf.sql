-- Public RPC: lookup auth email by CPF (used by login screen before authentication)
CREATE OR REPLACE FUNCTION public.get_email_by_cpf(cpf_input TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT au.email
  FROM auth.users au
  JOIN public.profiles p ON p.id = au.id
  WHERE regexp_replace(p.cpf, '[^0-9]', '', 'g')
      = regexp_replace(cpf_input, '[^0-9]', '', 'g')
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_by_cpf(TEXT) TO anon, authenticated;
