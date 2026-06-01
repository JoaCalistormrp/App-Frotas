# Reestruturação da Área Administrativa

Vou transformar a área admin atual (que está toda em `src/routes/index.tsx`) num **hub administrativo modular**, com rotas separadas, navegação por cards/menu lateral, e novos módulos (SMV/SMI, veículos completos, motoristas completos, histórico geral).

Como o escopo é muito grande, proponho dividir em **3 entregas** para manter qualidade e permitir validação a cada passo. Confirme qual ordem prefere ou aprove o pacote completo.

---

## ENTREGA 1 — Fundação + Dashboard + Histórico + Veículos

### 1.1 Banco de dados (migração)
- Adicionar em `vehicles`: `brand`, `year`, `renavam`, `category` (enum: `pesado` | `operacional` | `administrativo`), `mileage`, `fuel_type`, `document_url`.
- Adicionar em `profiles`: `base`, `role_function` (enum: `diretor` | `administrativo` | `encarregado` | `motorista`), `unlock_card`, `cnh_photo_url`, `cnh_renewal_history` (jsonb).
- Criar tabela `maintenance_orders` (SMV/SMI):
  - `id`, `order_number` (texto, ex: `OS01_VOT`), `order_type` (`SMI` | `SMV`), `base_code` (`VOT`/`SRQ`/`CDA`/`TDS`/`PLN`/`MDC`/`PRB`/`ITR`/`FZD`/`OBRA`), `checklist_id` (FK), `vehicle_id`, `driver_id`, `failure_description`, `maintenance_type`, `workshop`, `status` (`pendente` | `em_manutencao` | `solucionado`), `observations`, `mechanic_signature_url`, `responsible_signature_url`, `signed_at`, `created_at`, `updated_at`.
  - RLS: admin total; criador pode ler.
  - Função/sequência para gerar `order_number` por base.
- Adicionar em `checklist_responses`: `resolution_status` (`pendente` | `em_manutencao` | `solucionado`).
- Bucket privado `vehicle-docs` e `maintenance-signatures`.

### 1.2 Rotas novas (TanStack)
Reorganizar `src/routes/`:
- `_admin.tsx` — layout admin com sidebar (Sidebar do shadcn) e guard de role.
- `_admin/index.tsx` — **Dashboard** (cards de navegação, alertas CNH, falhas do dia, checklists do dia).
- `_admin/checklists.tsx` — **Histórico Geral** com filtros (data, veículo, motorista, base, categoria, status, falhas).
- `_admin/vehicles.tsx` — gestão de veículos (CRUD, upload doc, categorias, filtros).
- `_admin/drivers.tsx` — gestão de motoristas (mover de index.tsx; já existe parcialmente).
- `_admin/maintenance.tsx` — lista de SMV/SMI.
- `_admin/maintenance.$id.tsx` — formulário de SMV/SMI (criar/editar/imprimir/PDF).

### 1.3 Página inicial (motorista)
- `routes/index.tsx` continua sendo o app do motorista (checklist). Admins logados são redirecionados para `/admin`.

---

## ENTREGA 2 — Módulo SMV/SMI completo
- Formulário de SMV/SMI com todos os campos solicitados.
- Geração automática de `order_number` (`OS{N}_{BASE}`) via função SQL.
- Vincular ao checklist que originou a falha.
- Botão "SOLUCIONADO" no checklist abre form de SMI/SMV pré-preenchido.
- Export PDF (usando `jsPDF` + logo da empresa) e Excel (usando `xlsx`).
- Layout profissional com campos de assinatura (mecânico + responsável + data).

---

## ENTREGA 3 — Refinamentos
- Histórico de renovação de CNH (timeline na ficha do motorista).
- Histórico de checklists na ficha do motorista.
- Filtros avançados de motoristas (base, função, CNH vencida/a vencer).
- Perfis administrativos com permissão para emitir relatórios (nova role `report_viewer` ou similar).
- Polimento visual final, responsividade mobile.

---

## Detalhes técnicos
- **Stack:** TanStack Start (rotas em `src/routes/`), Supabase, shadcn/ui.
- **Sidebar:** `components/ui/sidebar` (já disponível) com ícones lucide.
- **PDF:** `jspdf` + `jspdf-autotable` (pacotes a instalar).
- **Excel:** `xlsx` (a instalar).
- **Code organization:** extrair componentes grandes de `src/routes/index.tsx` para `src/components/admin/*`.

---

## Pergunta para você
Posso prosseguir com a **Entrega 1** (fundação, migração, dashboard, histórico, veículos) agora? Ou prefere que eu faça **as três entregas em sequência sem pausa** (vai demorar mais, mas entrega tudo)?
