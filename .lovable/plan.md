
Entrega em **5 rodadas** sequenciais. Cada rodada termina com migração aplicada + UI atualizada e fica testável antes da próxima.

---

## Rodada 1 — Corrigir anexo de fotos (urgente)

Causa: o código de `mechanic.tsx` referencia `public.maintenance_photos`, mas a migração anterior criou a tabela com colunas diferentes do que o código espera, e o schema cache do PostgREST não a enxerga.

- Migração:
  - `CREATE TABLE IF NOT EXISTS public.maintenance_photos` com: `id`, `maintenance_order_id` (FK → `maintenance_orders.id` ON DELETE CASCADE), `file_name`, `file_url` (caminho no bucket), `photo_type` (enum `falha|execucao|conclusao`), `description`, `created_by` (uuid), `created_at`.
  - GRANT para `authenticated` e `service_role`.
  - RLS: SELECT para admin/mechanic/viewer; INSERT/UPDATE/DELETE para mechanic dono + admin.
  - `NOTIFY pgrst, 'reload schema'` no fim para forçar reload do cache.
- Bucket `maintenance-photos` já existe — só revalidar policies de `storage.objects`.
- Ajustar `src/routes/mechanic.tsx` e `src/lib/maintenance.ts` para usar os nomes corretos das colunas (`maintenance_order_id`, `file_url`, `photo_type`, `description`).

## Rodada 2 — Exclusão soft + Lixeira de OS

- Migração em `maintenance_orders`:
  - `deleted_at timestamptz`, `deleted_by uuid`, `delete_reason text`.
  - Atualizar policies SELECT existentes para filtrar `deleted_at IS NULL` por padrão.
  - Nova policy `admin read deleted` permitindo admin enxergar registros com `deleted_at IS NOT NULL`.
  - Apenas admin pode `UPDATE` setando `deleted_at` (soft delete) e `DELETE` físico (purge).
- UI:
  - Botão "Excluir OS" em `admin.maintenance.$id.tsx` (somente admin) → modal pedindo motivo obrigatório → soft delete.
  - Nova rota `src/routes/admin.maintenance.trash.tsx`: lista OSs excluídas com filtros (data, placa, número, usuário que excluiu); ações **Restaurar** (limpa `deleted_at`) e **Excluir definitivamente** (DELETE físico com confirmação dupla).
  - Item "Lixeira" no `admin-sidebar.tsx`, visível só para admin.
  - Retenção indefinida (sem auto-purge).

## Rodada 3 — Perfil Consulta somente leitura

- `admin-sidebar.tsx`: para `isViewer && !isAdmin` mostrar apenas "Checklists" e "Histórico". Esconder Veículos, Motoristas, Equipe, Manutenção, Lixeira, Dashboard.
- Em `admin.tsx`: redirecionar viewer que tenta acessar rotas proibidas para `/admin/checklists`.
- Página `admin.checklists.tsx`: garantir filtros por placa, motorista, data, frota/base.
- Exportações (ambas com fotos):
  - **PDF**: usar `src/lib/admin-pdf.ts` para gerar relatório de checklists incluindo as fotos anexadas (signed URLs do bucket `checklist-photos`).
  - **Excel**: adicionar `xlsx` (`bun add xlsx`) + botão "Exportar Excel" listando checklists filtrados; fotos vão como links clicáveis na coluna "Anexos".
- Remover qualquer botão de editar/criar/excluir do viewer (auditoria visual de cada componente que ele acessa).

## Rodada 4 — Perfil Eletricista + função unificada

- Enum `app_role`: adicionar valor `'electrician'`.
- `profiles.role_function` (enum `driver_function`) já existe — adicionar valores `'eletricista'` e `'motorista_eletricista'` se faltarem.
- `admin.drivers.tsx` / `admin.team.tsx`: campo **Função** com opções Motorista / Eletricista / Motorista e Eletricista. Ao salvar, gravar `role_function` e sincronizar `user_roles` (driver e/ou electrician conforme função).
- Login: após autenticar, se `roles` inclui driver+electrician, redirecionar para `/select-role` (novo) com radio Motorista/Eletricista; escolha guardada em `localStorage` + contexto Auth, alterando menus e checklist exibido. Se só uma função, pular tela.
- `useAuth`: expor `activeFunction` e `setActiveFunction`.

## Rodada 5 — Checklist do cesto aéreo + OS por falha

Aguarda o anexo com os itens (você confirmou que vai enviar).

- Seed do template no banco:
  - `checklist_templates` com `vehicle_type='cesto_aereo'` (adicionar valor ao enum se necessário) e `name='Checklist Cesto Aéreo'`.
  - `checklist_categories` + `checklist_items` conforme PDF/imagem.
- `checklist_responses`: já tem `status`, `observation`, `photo_url`. Confirmar que a UI permite os 3 estados (Conforme / Não Conforme / Não Aplicável) — hoje só tem 2. Adicionar valor `'nao_aplicavel'` ao enum de status se faltar.
- Frontend de checklist (lado motorista/eletricista):
  - Escolher template automaticamente pela `activeFunction`: motorista → templates de veículo; eletricista → template "Cesto Aéreo".
  - Cada item: radio Conforme/NC/NA, textarea observação, upload de foto (bucket `checklist-photos`).
  - Registrar data, hora, usuário, veículo, equipamento (campo novo `equipment_id` opcional em `checklists`).
- Histórico exclusivo do eletricista: filtro em `admin.checklists.tsx` por `template.vehicle_type='cesto_aereo'` quando viewer/admin abrir aba "Cesto Aéreo".
- Abertura de OS por falha no cesto: reaproveitar o fluxo "Abrir OS" do mechanic.tsx; quando o checklist origem for de cesto, pré-preencher também `equipment_id` e as fotos anexadas viram fotos categoria `falha` da nova OS.

---

## Detalhes técnicos relevantes

- Todas as migrações seguem padrão: CREATE → GRANT → ENABLE RLS → POLICIES, e fazem `NOTIFY pgrst, 'reload schema'` quando alteram tabela referenciada pelo app.
- Roles checadas via `has_role(auth.uid(), 'admin'::app_role)` (não duplicar SELECT em tabela própria).
- Adicionar `xlsx` via `bun add xlsx` na Rodada 3.
- Nenhum dado físico é apagado de OS sem ação admin explícita na Lixeira.
- `select-role` é client-only (`ssr: false`).

## O que preciso de você

1. Confirmar para iniciar a Rodada 1 imediatamente.
2. Anexar o documento do checklist do cesto aéreo antes da Rodada 5 (pode anexar agora, eu uso quando chegar lá).
