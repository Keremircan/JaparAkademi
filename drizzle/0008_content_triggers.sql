-- =====================================================================
-- İş paketi 1.2: içerik kütüphanesi trigger'ları
-- =====================================================================

SELECT app_attach_audit('contents', '{id}', '{search_vector}');
--> statement-breakpoint
SELECT app_attach_audit('content_versions', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('content_version_locales', '{content_version_id,locale}');
--> statement-breakpoint
SELECT app_attach_audit('content_version_assets', '{content_version_id,asset_id}');
--> statement-breakpoint
SELECT app_attach_audit('media_assets', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('tag_types', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('tags', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('content_tags', '{content_id,tag_id}');
--> statement-breakpoint
SELECT app_attach_audit('approvals', '{id}');
--> statement-breakpoint

-- Onay/ret kayıtları değiştirilemez
SELECT app_attach_immutable('approvals');
--> statement-breakpoint

-- Yayınlanan sürüm (published_at dolu) değiştirilemez ve silinemez (FG-2.2).
-- Kilit kalkmadan yalnızca iş akışı alanları değişebilir.
SELECT app_attach_immutable(
  'content_versions',
  '{status,change_note,require_reread,updated_at,submitted_by,submitted_at}',
  'published_at'
);
--> statement-breakpoint

-- Yayınlanmış sürümün dil satırları ve medya bağlantıları da donar.
CREATE OR REPLACE FUNCTION content_version_child_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_version uuid;
  v_published timestamptz;
BEGIN
  v_version := CASE WHEN TG_OP = 'DELETE' THEN OLD.content_version_id ELSE NEW.content_version_id END;
  SELECT published_at INTO v_published FROM content_versions WHERE id = v_version;
  IF v_published IS NOT NULL THEN
    RAISE EXCEPTION 'Yayınlanmış içerik sürümü değiştirilemez: %', TG_TABLE_NAME
      USING ERRCODE = 'JA001', HINT = 'Yeni bir taslak sürüm açın.';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.content_version_id IS DISTINCT FROM OLD.content_version_id THEN
    RAISE EXCEPTION 'Sürüm bağlantısı değiştirilemez: %', TG_TABLE_NAME USING ERRCODE = 'JA001';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;
--> statement-breakpoint
CREATE TRIGGER published_guard BEFORE INSERT OR UPDATE OR DELETE ON content_version_locales
  FOR EACH ROW EXECUTE FUNCTION content_version_child_guard();
--> statement-breakpoint
CREATE TRIGGER published_guard BEFORE INSERT OR UPDATE OR DELETE ON content_version_assets
  FOR EACH ROW EXECUTE FUNCTION content_version_child_guard();
--> statement-breakpoint

-- Etiket türleri (FG-2.4); yeni tür eklemek migration gerektirir
INSERT INTO tag_types (id, key, sort_order) VALUES
  ('01900000-0000-7000-8000-00000000a001', 'machine', 1),
  ('01900000-0000-7000-8000-00000000a002', 'section', 2),
  ('01900000-0000-7000-8000-00000000a003', 'risk', 3),
  ('01900000-0000-7000-8000-00000000a004', 'shift', 4)
ON CONFLICT (key) DO NOTHING;
