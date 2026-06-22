ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS checklist_types text[] DEFAULT '{}';
