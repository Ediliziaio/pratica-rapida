-- Migration: add operator_permissions JSONB to profiles
-- Fine-grained per-user permission overrides for internal operators

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS operator_permissions jsonb
DEFAULT '{
  "see_all_pratiche": true,
  "see_pricing": true,
  "can_export": true,
  "can_create_pratiche": true,
  "can_manage_clients": true,
  "can_use_communications": false,
  "can_delete_pratiche": false
}'::jsonb;

COMMENT ON COLUMN public.profiles.operator_permissions IS
  'Per-user permission settings for internal roles. see_all_pratiche: false = only assigned. see_pricing: false = hide € amounts.';
