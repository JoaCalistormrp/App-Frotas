# Auditoria de Segurança — Checklist Frota (Grupo Tomaz)

**Data:** 2026-08-07
**Stack real auditada:** TanStack Start (React 19 + Vite 7 + Nitro SSR, TypeScript) · Supabase (Postgres + Auth + Storage + Edge Functions em Deno) · deploy Vercel · wrappers Electron/Capacitor.

> O pedido original de auditoria descrevia uma stack Flask/Python + SQLAlchemy/Jinja. Esta aplicação não usa nada disso — não há Flask, SQLAlchemy, Jinja, `requirements.txt` nem Python em lado nenhum. O checklist foi adaptado item a item para os equivalentes reais desta stack (RLS do Postgres em vez de queries SQLAlchemy, `npm audit` em vez de pip-audit, headers via `vercel.json` em vez de Flask, autenticação Bearer/localStorage em vez de cookies de sessão Flask, etc.). Não existe Bandit nem equivalente Python a rodar — não há código Python no projeto.

## O que a aplicação faz e superfície de ataque

App interno de gestão de frota para a Grupo Tomaz: motoristas preenchem checklists diários de veículos (com fotos), mecânicos abrem/gerem ordens de serviço (OS), administradores gerem utilizadores/veículos/agendamento, e há um módulo de licitações e um módulo financeiro que consulta um ERP Oracle externo. Distribuído como PWA, app Android (Capacitor) e app desktop (Electron), mas o núcleo é sempre a mesma web app React servida via Vercel, falando com um único projeto Supabase (não há ambiente de staging separado — tudo aponta para produção real).

**Superfície de ataque:** login público (CPF ou e-mail + password), ~20 tabelas Postgres todas expostas via PostgREST com RLS, 3 Edge Functions Deno públicas (Oracle, notificações push, autenticação de licitações), upload de ficheiros (fotos de checklist/manutenção, documentos de veículo/motorista) para Supabase Storage, uma ligação a um ERP Oracle on-premise via credenciais só-servidor, e funções servidor (TanStack `createServerFn`) para operações administrativas (gestão de utilizadores, aprovação de OS, licitações).

---

## Achados

| # | Severidade | Ficheiro:linha | Achado | Status |
|---|---|---|---|---|
| 1 | **Crítica** | `get_email_by_cpf` (RPC Postgres) | **Qualquer pessoa, sem login nenhum**, conseguia chamar `POST /rest/v1/rpc/get_email_by_cpf` com a chave pública (`anon`) e um CPF arbitrário, e obter o e-mail de **qualquer** utilizador no sistema — bypass total de autorização, exposição de PII sem precisar de conta. Confirmado por chamada HTTP direta (não é suspeita — testei e reproduzi). Ver detalhe abaixo, incluindo uma correção anterior que parecia ter resolvido isto mas na prática não tinha efeito nenhum. | ✅ **Corrigido** |
| 2 | **Média** | `src/lib/staff.functions.ts:280` (`findEmailByCpf`) | Endpoint público (pré-login, sem auth), sem rate limiting próprio — permite enumerar CPFs válidos e obter o e-mail associado por tentativa-e-erro | ⚠️ **Pendente** — ver Riscos residuais |
| 3 | **Média** *(suspeita, precisa de confirmação no dashboard)* | Config Supabase Auth (fora do repo) | Testei o endpoint `POST /auth/v1/signup` diretamente (fora da UI) com o mesmo padrão de e-mail sintético que a app usa (`<cpf>@frota.local`). O pedido passou a validação de formato e só foi travado pelo *rate limit* de e-mail da própria Supabase — não por "signups disabled". Isso é indício forte (não confirmação 100%, parei de testar para não gastar a cota de e-mail real do projeto) de que o auto-registo público está ativo ao nível da API, independente da UI não mostrar formulário de registo | ⚠️ **Pendente decisão** |
| 4 | **Média** | `vercel.json:32` (CSP) | `script-src 'self' 'unsafe-inline' 'unsafe-eval'` — headers de segurança já estão excelentes (HSTS, X-Frame-Options, nosniff, Permissions-Policy, CSP presente), mas `unsafe-inline`/`unsafe-eval` anulam boa parte da proteção do CSP contra XSS caso surja um XSS noutro ponto | ⚠️ **Pendente** — requer teste antes de apertar (pode quebrar libs como jsPDF/canvg) |
| 5 | **Baixa** | `supabase/functions/oracle-financial-query/` | Edge Function com credenciais Oracle embutidas na lógica, não é chamada por nenhum código do frontend atual (foi substituída por `src/lib/oracle.server.ts`) — se ainda estiver deployada, é superfície de ataque órfã e esquecida | ⚠️ **Pendente** — não consigo confirmar status de deploy sem acesso ao dashboard |
| 6 | **Baixa** | Vários `*.functions.ts` (`throw new Error(error.message)`) | Mensagens de erro cruas do Postgres (nomes de constraint/coluna) por vezes chegam ao `toast.error()` do cliente. Impacto baixo porque a maioria destes caminhos já é admin/master-only | ℹ️ **Aceito** — ver observação |
| 7 | **Baixa** | `src/lib/auth.tsx:118` (`signUp`) | Fluxo de auto-registo existe no código mas não tem formulário na UI (`AuthScreen` só tem login) — combinado com o achado #3, é mais uma confirmação de que o caminho de signup está vivo no cliente, mesmo sem botão visível | ℹ️ **Informativo**, mesma causa do #3 |
| 8 | Informativo | `npm audit` | 18 vulnerabilidades em dependências (2 críticas, 8 altas, 6 médias, 2 baixas) | ✅ **17 corrigidas** via `npm audit fix` (patches não-destrutivos, build e typecheck confirmados a passar depois). 1 restante (`xlsx`, sem fix disponível) — ver abaixo |

### Detalhe do achado #1 (corrigido) — e como quase ficou mal corrigido

**Ficheiro:** `supabase/migrations/20260617160000_get_email_by_cpf.sql`

**O que um atacante conseguia fazer — sem precisar de login:**
```
POST /rest/v1/rpc/get_email_by_cpf
apikey: <chave pública anon, a mesma que vem embutida no bundle da app>
{ "cpf_input": "<11 dígitos>" }
```
→ devolve o e-mail associado a esse CPF, para **qualquer** utilizador da tabela `profiles`, incluindo admins/masters, sem autenticação nenhuma. Combinado com CPFs obtidos de outra fonte (vazamento, lista de funcionários, engenharia social), isto mapeia CPF→e-mail de toda a equipa a partir da internet aberta.

**Por que era desnecessário:** o único consumidor deste RPC no código (`findEmailByCpf` em `staff.functions.ts`) usa o cliente `service_role`, que ignora GRANTs de função Postgres — não precisa de nenhum GRANT explícito para funcionar. Nenhum componente do frontend chama esta RPC diretamente pelo cliente `anon`/`authenticated`.

**A parte instrutiva — três tentativas até acertar:**
1. Uma migração de 2026-06-26 (`20260626130000_security_hardening.sql`) já tinha tentado `REVOKE EXECUTE ... FROM anon`. Essa migração fazia parte de um lote que, numa sessão anterior deste mesmo projeto, foi marcado como "já aplicado" no histórico do CLI (`supabase migration repair`) com base em evidência de **outras** mudanças do mesmo lote (tabelas/colunas que essas migrações criavam) — sem verificar o efeito específico *desta* migração. Na prática, o `REVOKE` nunca correu na base real.
2. Ao começar a corrigir isto agora, apliquei primeiro `REVOKE ... FROM authenticated` (migração `20260807160000`) — parecia razoável (só o `authenticated` tinha grant explícito no ficheiro original). Testei com a chave `anon` esperando bloqueio, e continuou a devolver `200`. Apliquei então o `REVOKE ... FROM anon` que faltava (`20260807170000`) — continuou a devolver `200`.
3. A causa raiz real: o Postgres concede `EXECUTE` a `PUBLIC` **por padrão** na criação de uma função, a não ser que seja revogado explicitamente — e a migração original nunca fez isso. Revogar de `anon`/`authenticated` estava a remover grants redundantes, enquanto o grant real (via `PUBLIC`, herdado por todos os roles) continuava intacto. A correção efetiva foi `REVOKE EXECUTE ... FROM PUBLIC` (migração `20260807180000`).

**Verificação final (não é suposição — testado):**
```
anon:         401 {"code":"42501", message:"permission denied for function get_email_by_cpf"}
service_role: 200 (continua a funcionar — findEmailByCpf/login por CPF não foi afetado)
```

**Lição para o processo:** `supabase migration repair` marca uma migração inteira como aplicada com base em amostragem — se uma migração faz várias coisas (cria tabela X **e** revoga um grant Y), verificar só que a tabela X existe não prova que o `REVOKE` Y correu. Reverifiquei empiricamente outro achado do mesmo lote (RLS de `licitacoes`, que supostamente corrigia um "bypass total" de acesso) criando um utilizador de teste sem role/módulo e confirmando que `SELECT * FROM licitacoes` devolve 0 linhas — esse aplicou corretamente. O `get_email_by_cpf` foi um caso específico (grants de função têm esse comportamento por omissão diferente de RLS em tabelas), não um sintoma de todo o lote estar por aplicar — mas só descobri isso testando, não assumindo.

---

## O que foi corrigido

1. **`get_email_by_cpf` — acesso não autenticado a PII (Crítica).** Três migrações (`20260807160000`, `20260807170000`, `20260807180000` — a última é a que realmente resolve, ver detalhe acima), aplicadas em produção e verificadas por chamada HTTP direta antes/depois.
2. **17 de 18 vulnerabilidades de dependências.** `npm audit fix` (semver-safe, sem mudança de major version). Build de produção e `tsc --noEmit` confirmados a passar depois da atualização.

## O que não foi corrigido, e porquê

- **#2 — rate limiting em `findEmailByCpf`:** corrigir isto direito precisa de estado partilhado entre invocações serverless (Redis/Upstash, ou replicar o padrão que já existe em `licitacao-auth`/`auth_attempts` para esta função). Implementar isso às pressas numa função que faz parte do fluxo de login de produção é exatamente o tipo de mudança que pode quebrar login para utilizadores legítimos se a lógica de limite estiver errada — decisão vossa sobre a abordagem (infra nova vs. reaproveitar `auth_attempts`).
- **#3 — self-signup possivelmente aberto:** não é uma correção de código, é uma configuração no painel do Supabase (Authentication → Settings → "Allow new users to sign up"). Não tenho acesso a esse painel a partir daqui. Preciso que confirmem se o auto-registo é intencional (não parece ser, já que a UI só mostra login e a criação de contas é feita pelo admin via `createStaffUser`).
- **#4 — CSP `unsafe-inline`/`unsafe-eval`:** apertar isto pode quebrar bibliotecas como jsPDF/canvg/html2canvas (usadas nos relatórios PDF) sem eu conseguir testar exaustivamente todos os fluxos que geram PDF. Precisa de um passe dedicado com teste manual de cada exportação de PDF antes de remover.
- **#5 — Edge Function Oracle órfã:** não consigo confirmar se `oracle-financial-query` ainda está deployada (isso vive no dashboard/CLI da Supabase associado a functions, que não tenho como listar remotamente a partir daqui com certeza). Recomendo `supabase functions list` e, se aparecer lá, `supabase functions delete oracle-financial-query`.
- **#6 — mensagens de erro cruas:** é um padrão espalhado por ~6 ficheiros; trocar por mensagens genéricas em todos eles é uma mudança de comportamento visível (menos detalhe nos erros mostrados a admins) que preferi não fazer sem confirmar que não há nenhum fluxo que dependa do texto exato do erro.

## Riscos residuais (exigem decisão vossa ou mudança de infraestrutura)

1. **Confirmar/desativar self-signup público** no painel Supabase, se não for intencional.
2. **Rate limiting** nas funções servidor sensíveis sem proteção própria (`findEmailByCpf` é a mais exposta por ser pré-login; `resetStaffPassword`/`createStaffUser`/`deleteStaffUser` são admin-only mas também sem limite de tentativas — risco menor porque já exigem sessão admin válida).
3. **CSP mais estrita** — remover `unsafe-eval`/`unsafe-inline` depois de testar todos os fluxos de exportação PDF/Excel.
4. **Sessão em `localStorage`** em vez de cookie `httpOnly`: reduz risco de CSRF (não há cookie enviado automaticamente), mas aumenta o raio de um XSS (JS malicioso conseguiria ler o token diretamente). É uma troca arquitetural, não um bug — mudar isso é uma decisão de arquitetura de sessão, não uma correção pontual.
5. **`xlsx@0.18.5`** tem 2 CVEs (Prototype Pollution, ReDoS) sem correção publicada no npm. Confirmei que a app só usa as funções de **escrita** (`json_to_sheet`/`writeFile`) para exportar dados próprios — nunca faz parse de ficheiro enviado por utilizador — por isso não é explorável no uso atual. Se algum dia for adicionada importação/upload de `.xlsx`, isto precisa de ser revisto (ou trocar de biblioteca).
6. **Edge Function `oracle-financial-query`** possivelmente órfã — confirmar deploy status e remover se não usada.

## O que foi verificado e confirmado seguro (não são achados)

- **`service_role` key nunca chega ao cliente.** Isolada em `client.server.ts`, só importada por ficheiros `.server.ts`/`*.functions.ts`. Confirmei por build real + grep no bundle de produção (`.vercel/output/static/`) que nem a service_role key, nem as credenciais Oracle, nem a query SQL do Oracle aparecem em nenhum ficheiro servido ao browser — só no bundle servidor.
- **RLS habilitada em todas as ~20 tabelas** com dados de utilizador, sem exceções.
- **RLS de `licitacoes` testada empiricamente**, não só lida no código: criei um utilizador de teste sem role admin/master e sem acesso ao módulo `licitacao`, autentiquei como ele de verdade, e confirmei que `SELECT * FROM licitacoes` devolve 0 linhas. A política que substituiu o antigo `auth.uid() IS NOT NULL` (bypass total) está mesmo ativa.
- **Zero políticas `using (true)` vivas** fora de dados de catálogo legitimamente públicos-para-autenticados (lista de veículos, templates de checklist) — a única política `using(true)` mais permissiva encontrada no histórico já tinha sido substituída por uma versão restrita numa migração posterior.
- **`user_roles` não tem caminho de auto-escalonamento** — só admin/master conseguem escrever nessa tabela; um utilizador não consegue conceder-se a si mesmo um role superior.
- **Funções `SECURITY DEFINER`** (`has_role`, `has_admin_or_master`, `next_order_number`, `handle_new_user`) usam `set search_path = public` (previne search_path hijacking) e, quando relevante, fazem a sua própria checagem de role internamente antes de agir.
- **Zero SQL Injection** — Supabase client (parametrizado) em todo o lado; a única query Oracle raw usa bind variables (`:1`, `:2`), não concatenação.
- **Zero `dangerouslySetInnerHTML`** com dados de utilizador (a única ocorrência é num componente de gráficos, injeta CSS de config estático, não dados de utilizador).
- **Zero `eval`/`child_process`/command injection.**
- **CORS nas Edge Functions é `*`, mas sem `Access-Control-Allow-Credentials: true`** — como a autenticação é 100% via header `Authorization: Bearer`, não cookie, o wildcard não permite roubo de sessão via CORS (o browser não anexa automaticamente o token de outro site). Ainda assim, restringir à origem real da app seria defesa em profundidade — não apliquei porque não sei se há outros consumidores legítimos (Electron/Capacitor) que dependem do wildcard.
- **Mensagens de erro de login já são sanitizadas** (`sanitizeAuthError` em `auth.tsx`) — não distingue "utilizador não existe" de "password errada", prevenindo user enumeration por essa via.
- **IDOR:** revi `staff.functions.ts`, `maintenance.functions.ts`, `licitacao.functions.ts`, `schedule.functions.ts` — todas as operações que mudam estado verificam role (admin/master/mechanic conforme o caso) e/ou posse (`created_by = auth.uid()`) antes de agir. Não encontrei um endpoint que aceite um `id` e altere/devolva dados sem checar autorização.
- **Storage buckets:** `checklist-photos` foi criado público mas uma migração posterior tornou-o privado (`update storage.buckets set public = false`) com políticas RLS scoped por dono; `vehicle-docs`, `maintenance-signatures`, `driver-docs` são privados desde a criação, com políticas de pasta-por-utilizador.
- **Chaves VAPID:** só a pública (`VITE_VAPID_PUBLIC_KEY`) aparece no cliente, como é esperado do protocolo Web Push. A privada só existe na Edge Function.

---

## `npm audit` — detalhe

Antes: 18 vulnerabilidades (2 críticas, 8 altas, 6 médias, 2 baixas).
Depois de `npm audit fix`: 1 restante.

| Pacote | Severidade | Alcançável em produção? | Ação |
|---|---|---|---|
| `seroval` | Crítica | Sim — dependência de runtime de `@tanstack/router-core` (serialização de dados SSR) | ✅ Corrigido |
| `tar` | Crítica | Não — só usado por `@capacitor/cli`/`electron-builder` em builds locais, nunca no runtime do servidor web | ✅ Corrigido (mesmo assim) |
| `vite`, `postcss`, `esbuild`, `@babel/core` | Alta/Baixa | Não — ferramentas de build, não fazem parte do bundle servido | ✅ Corrigido |
| `undici` | Alta | Parcial — via `cheerio` (build-time do plugin TanStack Start) e `electron-builder` | ✅ Corrigido |
| `dompurify` | Média | Baixo — transitiva de `jspdf`, só usada se a app chamar `doc.html()`, o que não acontece neste código | ✅ Corrigido |
| `xlsx` | Alta | **Sim, mas só a função de escrita é usada** — CVEs são no parser, que a app nunca invoca | ❌ Sem fix — risco aceite, ver Riscos residuais |

Não instalei `pip-audit`/`bandit` (Python) nem `safety` — não há código Python no repositório, seriam ferramentas sem alvo.
