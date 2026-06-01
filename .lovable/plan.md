# Reestruturação Tomaz Checklist — Plano em 4 Entregas

O pedido cobre frontend, backend, banco, permissões e UX de praticamente todos os módulos. Para entregar com qualidade (e sem quebrar o que já funciona), vou dividir em 4 entregas. Cada uma é validável de forma independente.

---

## Entrega 1 — Correções críticas (PRIORIDADE MÁXIMA)

**Foco: destravar SMI/SMV e estabilizar navegação/autenticação.**

1. **Bug SMI/SMV não abre**
   - Investigar `/admin/maintenance` e `/admin/maintenance/$id` (route tree, RLS, casts incorretos do supabase em `admin.maintenance.tsx`).
   - Remover os `as never as ...` que estão escondendo erros de tipo e podem estar quebrando a query.
   - Garantir que `Link to="/admin/maintenance/$id" params={{ id: "new" }}` resolva corretamente (a rota usa `$id`, então "new" precisa ser tratado no componente).
   - Validar RLS em `maintenance_orders` para admin/mechanic.
   - Validar bucket `maintenance-signatures` e upload.

2. **Estabilidade geral**
   - Auth: revisar `auth.tsx` (race condition entre `getSession` e `onAuthStateChange`, roles carregando depois do render).
   - Loading states corretos (sem tela branca / infinite spinner) em rotas admin/mechanic.
   - Sidebar: verificar links quebrados, conflito de perfis.
   - Corrigir tela branca/erros de sessão reportados.

3. **Rodapé com crédito**
   - "Desenvolvido por Julia Ramos" em todas as áreas.

**Entregável:** SMI/SMV abrindo, criando, editando e fechando ordens. Login estável para todos os perfis.

---

## Entrega 2 — Perfil Mecânico (independente do Motorista)

1. **Migração:**
   - `profiles.terminated_at`, `profiles.terminated_by`, `profiles.termination_reason` (baixa de motorista).
   - Trigger/RLS para bloquear login de motorista desligado.
   - Mecânico passa a ter perfil próprio (não cria registro em motoristas; trigger `handle_new_user` ajustado).
   - `maintenance_orders`: adicionar `started_at`, `finished_at`, ampliar enum de status para `aberta | em_andamento | aguardando_peca | finalizada`.

2. **Painel do mecânico (`/mechanic`) reformulado:**
   - Checklists do dia + histórico com filtros (data, placa, motorista, status).
   - Ordens: criar, editar, atualizar status, observações técnicas, anexar fotos, timestamps automáticos.
   - Histórico do veículo com falhas recorrentes.
   - Sem acesso a cadastros administrativos.

3. **Cadastro independente de mecânico** (na aba Equipe do admin) — sem vínculo com tabela de motoristas.

---

## Entrega 3 — Perfil Consulta + Dashboard Executivo

1. **Área `/viewer` (ou reaproveitando `/admin` com guard de leitura):**
   - Layout dedicado read-only.
   - Consultas: checklists do dia, histórico, ordens, veículos, motoristas.
   - Timeline da manutenção (quem abriu, quem concluiu, datas, observações).
   - Filtros: placa, frota, mecânico, status, data, tipo.
   - Bloquear todos os botões de edição/exclusão no frontend e validar no backend (RLS).

2. **Dashboard executivo no `/admin`:**
   - Cards: veículos parados, manutenções em aberto, checklists pendentes, falhas recorrentes, top veículos com manutenção, indisponíveis, CNHs vencendo.
   - Exportação de relatórios.

---

## Entrega 4 — Cadastro de Condutores + Alertas CNH + Baixa

1. **Nova interface dedicada de condutores** (`/admin/drivers` reformulada):
   - Tela inicial enxuta: botão de acesso, contagem de ativos/inativos, alertas CNH.
   - Cadastro completo (nome, CPF, telefone, empresa, cargo, admissão, CNH, categoria, validade).
   - Foto da CNH usada como foto do perfil (visível apenas para admin).
   - Filtros e exportação de relatórios.

2. **Sistema de alertas CNH automático:**
   - Migração: view/função SQL que calcula faixa (90/60/30/vencida).
   - Notificações no dashboard e em uma nova aba de notificações.
   - (Opcional) cron diário via `/api/public/cron/cnh-alerts`.

3. **Baixa de motoristas:**
   - Botão "Desligar motorista" com motivo.
   - Registro automático de data/hora/responsável.
   - Bloqueio de login para desligados, mas histórico preservado.
   - Botão de excluir (admin) com confirmação dupla.

---

## Detalhes técnicos relevantes

- **Banco:** migrações novas, sem reescrever as antigas. Cada migração inclui GRANTs + RLS.
- **Permissões:** `has_role(uid, role)` (já existe) usado em todos os policies. Frontend usa guards em `admin.tsx` + novos guards em `mechanic.tsx` / `viewer.tsx`.
- **Performance:** queries com `select` específico (não `*`), índices em `created_at`, `vehicle_id`, `driver_id`, `status`. Realtime ativado apenas onde necessário.
- **Quebra de arquivos grandes:** `admin.drivers.tsx` e `admin.maintenance.$id.tsx` serão divididos em componentes em `src/components/admin/`.
- **Stack mantida:** TanStack Start, Supabase via `createServerFn` quando precisar de service role, shadcn/ui.

---

## Pergunta antes de começar

Posso seguir direto com a **Entrega 1** (que destrava SMI/SMV e estabiliza o sistema) e depois cada entrega seguinte requer sua aprovação? Ou prefere que eu rode **as 4 entregas em sequência sem pausar**?

Recomendo começar pela Entrega 1 e validar antes de prosseguir — assim você consegue testar o módulo crítico imediatamente.
