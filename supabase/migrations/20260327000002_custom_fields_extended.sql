-- Extend custom_field_entity enum with new types
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'contatto' AND enumtypid = 'custom_field_entity'::regtype) THEN
    ALTER TYPE custom_field_entity ADD VALUE 'contatto';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'azienda' AND enumtypid = 'custom_field_entity'::regtype) THEN
    ALTER TYPE custom_field_entity ADD VALUE 'azienda';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'pratica' AND enumtypid = 'custom_field_entity'::regtype) THEN
    ALTER TYPE custom_field_entity ADD VALUE 'pratica';
  END IF;
END $$;

-- Add folder column for GHL-style grouping
ALTER TABLE custom_fields ADD COLUMN IF NOT EXISTS folder text DEFAULT '';
-- Add is_system flag (system fields are shown read-only in UI)
ALTER TABLE custom_fields ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;
