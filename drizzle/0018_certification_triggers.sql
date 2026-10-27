-- =====================================================================
-- İş paketi 1.7: işe başlama onayı, karar kayıtları, sertifika ve yetkinlik trigger'ları
-- =====================================================================

SELECT app_attach_audit('readiness_decisions', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('decision_records', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('certificates', '{id}', '{verify_token}');
--> statement-breakpoint
SELECT app_attach_audit('competencies', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('competency_grants', '{id}');
--> statement-breakpoint

-- İşe başlama kararı ve süreç kararı değiştirilemez (SPEC Bölüm 7)
SELECT app_attach_immutable('readiness_decisions');
--> statement-breakpoint
SELECT app_attach_immutable('decision_records');
--> statement-breakpoint
SELECT app_attach_immutable('competency_grants');
--> statement-breakpoint

-- Sertifika: yalnızca PDF bağlantısı ve iptal alanları yazılabilir; iptalden (revoked_at) sonra kilitli
SELECT app_attach_immutable('certificates', '{pdf_asset_id,status,revoked_reason,revoked_by}', 'revoked_at');
--> statement-breakpoint

-- PDF bağlantısı bir kez yazılır; geçerli sertifika silinemez (iptal edilir)
CREATE OR REPLACE FUNCTION certificate_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Sertifika silinemez; iptal edin' USING ERRCODE = 'JA001';
  END IF;
  IF OLD.pdf_asset_id IS NOT NULL AND NEW.pdf_asset_id IS DISTINCT FROM OLD.pdf_asset_id THEN
    RAISE EXCEPTION 'Sertifika belgesi değiştirilemez' USING ERRCODE = 'JA001';
  END IF;
  IF NEW.status = 'revoked' AND (NEW.revoked_at IS NULL OR NEW.revoked_reason IS NULL OR NEW.revoked_by IS NULL) THEN
    RAISE EXCEPTION 'İptal gerekçesi ve iptal eden zorunludur' USING ERRCODE = 'JA001';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER certificate_guard BEFORE UPDATE OR DELETE ON certificates
  FOR EACH ROW EXECUTE FUNCTION certificate_guard();
