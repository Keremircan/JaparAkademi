-- =====================================================================
-- İş paketi 2.3b: kapı — denetim, değiştirilemezlik
-- =====================================================================

SELECT app_attach_audit('contractor_clearances', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('visit_denials', '{id}');
--> statement-breakpoint

-- Geçerlilik ve red kayıtları yalnızca eklenir. Kapıda kimlik birleştirmede (karar #150) ziyaretçi bağlantısı
-- aynı kişinin asıl kaydına taşınabilir; başka alan değişmez.
SELECT app_attach_immutable('contractor_clearances', '{visitor_id}');
--> statement-breakpoint
SELECT app_attach_immutable('visit_denials');
--> statement-breakpoint
SELECT app_attach_immutable('visitor_signatures', '{visitor_id}');
--> statement-breakpoint

-- Ziyaret kilidi (karar #153): girişten sonra yalnızca çıkış alanları değişir; çıkıştan sonra kayıt donar.
-- Girişi yapılmış ziyaret silinemez. Saklama işi (app_anonymize_visitors) istisnadır.
CREATE OR REPLACE FUNCTION visit_gate_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  allowed text[] := '{status,checked_out_at,checked_out_by,badge_returned,updated_at}';
  changed text[];
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF app_retention_exempt(TG_RELID) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF OLD.checked_in_at IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Girişi yapılmış ziyaret silinemez' USING ERRCODE = 'JA001';
  END IF;
  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);
  SELECT coalesce(array_agg(k ORDER BY k), '{}')
    INTO changed
    FROM jsonb_object_keys(v_new) AS k
   WHERE v_new -> k IS DISTINCT FROM v_old -> k;
  IF cardinality(changed) = 0 THEN
    RETURN NEW;
  END IF;
  IF OLD.checked_out_at IS NOT NULL THEN
    RAISE EXCEPTION 'Çıkışı yapılmış ziyaret değiştirilemez (%)', array_to_string(changed, ', ')
      USING ERRCODE = 'JA001', HINT = 'Düzeltme için corrections kaydı açın.';
  END IF;
  IF NOT (changed <@ allowed) THEN
    RAISE EXCEPTION 'Girişi yapılmış ziyaret değiştirilemez (%)', array_to_string(changed, ', ')
      USING ERRCODE = 'JA001', HINT = 'Düzeltme için corrections kaydı açın.';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER gate_guard BEFORE UPDATE OR DELETE ON visits
  FOR EACH ROW EXECUTE FUNCTION visit_gate_guard();
