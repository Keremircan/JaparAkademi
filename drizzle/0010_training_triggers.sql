-- =====================================================================
-- İş paketi 1.3: pozisyon kartı, modül kütüphanesi ve eğitim planı trigger'ları
-- =====================================================================

SELECT app_attach_audit('position_card_versions', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('position_card_reviews', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('modules', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('module_contents', '{module_id,content_id}');
--> statement-breakpoint
SELECT app_attach_audit('practice_tasks', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('training_plans', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('plan_modules', '{plan_id,module_id}');
--> statement-breakpoint

-- Yayınlanan kart sürümü (published_at dolu) değiştirilemez ve silinemez.
-- Taslakta yalnızca içerik ve iş akışı alanları değişebilir.
SELECT app_attach_immutable(
  'position_card_versions',
  '{status,sections,ohs_section_changed,change_note,updated_at,submitted_by,submitted_at}',
  'published_at'
);
--> statement-breakpoint

-- Gözden geçirme kayıtları değiştirilemez
SELECT app_attach_immutable('position_card_reviews');
--> statement-breakpoint

-- Yayınlanmış kartın planı ve plan modülleri de donar.
CREATE OR REPLACE FUNCTION training_plan_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_card uuid;
  v_published timestamptz;
BEGIN
  IF TG_TABLE_NAME = 'training_plans' THEN
    v_card := CASE WHEN TG_OP = 'DELETE' THEN OLD.card_version_id ELSE NEW.card_version_id END;
    IF TG_OP = 'UPDATE' AND NEW.card_version_id IS DISTINCT FROM OLD.card_version_id THEN
      RAISE EXCEPTION 'Plan bağlantısı değiştirilemez' USING ERRCODE = 'JA001';
    END IF;
  ELSE
    SELECT card_version_id INTO v_card FROM training_plans
     WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.plan_id ELSE NEW.plan_id END;
    IF TG_OP = 'UPDATE' AND NEW.plan_id IS DISTINCT FROM OLD.plan_id THEN
      RAISE EXCEPTION 'Plan bağlantısı değiştirilemez' USING ERRCODE = 'JA001';
    END IF;
  END IF;
  SELECT published_at INTO v_published FROM position_card_versions WHERE id = v_card;
  IF v_published IS NOT NULL THEN
    RAISE EXCEPTION 'Yayınlanmış kartın planı değiştirilemez: %', TG_TABLE_NAME
      USING ERRCODE = 'JA001', HINT = 'Yeni bir kart sürümü açın.';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;
--> statement-breakpoint
CREATE TRIGGER published_guard BEFORE INSERT OR UPDATE OR DELETE ON training_plans
  FOR EACH ROW EXECUTE FUNCTION training_plan_guard();
--> statement-breakpoint
CREATE TRIGGER published_guard BEFORE INSERT OR UPDATE OR DELETE ON plan_modules
  FOR EACH ROW EXECUTE FUNCTION training_plan_guard();
