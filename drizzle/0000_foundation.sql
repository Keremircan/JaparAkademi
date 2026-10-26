-- =====================================================================
-- Temel: yetkiler, denetim kaydı ve değiştirilemezlik altyapısı
-- Bu migration akademi_owner ile çalışır. akademi_app rolü önceden var olmalıdır
-- (yerelde docker/postgres/init, production'da kurulum runbook'u oluşturur).
-- =====================================================================

-- Uygulama kullanıcısı: yalnızca DML. Owner'ın bundan sonra oluşturacağı tablolara otomatik uygulanır.
GRANT USAGE ON SCHEMA public TO akademi_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO akademi_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO akademi_app;
--> statement-breakpoint

-- pg-boss kuyruk şeması uygulama kullanıcısına aittir; DDL yetkisi yalnızca bu şemayla sınırlıdır.
CREATE SCHEMA IF NOT EXISTS pgboss AUTHORIZATION akademi_app;
--> statement-breakpoint

-- Hassas alanları maskeler (yalnızca dolu değerleri).
CREATE OR REPLACE FUNCTION app_mask_jsonb(data jsonb, keys text[])
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN data IS NULL THEN NULL
    ELSE data || coalesce(
      (SELECT jsonb_object_agg(k, to_jsonb('***'::text))
         FROM unnest(keys) AS k
        WHERE data ? k AND jsonb_typeof(data -> k) <> 'null'),
      '{}'::jsonb)
  END
$$;
--> statement-breakpoint

-- Genel denetim trigger'ı.
-- TG_ARGV[0]: birincil anahtar sütunları (virgülle), TG_ARGV[1]: maskelenecek sütunlar (virgülle)
-- Aktör ve istek kimliği transaction'da set_config('app.actor_id' / 'app.request_id') ile verilir.
CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  pk_cols   text[] := coalesce(string_to_array(nullif(TG_ARGV[0], ''), ','), '{}');
  masked    text[] := coalesce(string_to_array(nullif(TG_ARGV[1], ''), ','), '{}');
  v_old     jsonb;
  v_new     jsonb;
  v_row     jsonb;
  v_record  text;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN v_new := to_jsonb(NEW); END IF;
  IF TG_OP = 'UPDATE' AND v_old = v_new THEN
    RETURN NULL;
  END IF;

  v_row := coalesce(v_new, v_old);
  SELECT string_agg(v_row ->> c, ':' ORDER BY ord)
    INTO v_record
    FROM unnest(pk_cols) WITH ORDINALITY AS u(c, ord);

  INSERT INTO audit_log (actor_id, request_id, table_name, record_id, action, old_data, new_data)
  VALUES (
    nullif(current_setting('app.actor_id', true), '')::uuid,
    nullif(current_setting('app.request_id', true), ''),
    TG_TABLE_NAME,
    v_record,
    TG_OP,
    app_mask_jsonb(v_old, masked),
    app_mask_jsonb(v_new, masked)
  );
  RETURN NULL;
END
$$;
--> statement-breakpoint

-- Değiştirilemez kayıt koruması.
-- TG_ARGV[0]: kilit kalkmadan değişmesine izin verilen sütunlar (virgülle, boş olabilir)
-- TG_ARGV[1]: kilit sütunu (ör. submitted_at). Eski satırda doluysa kayıt tamamen donar.
-- Argümansız kullanımda kayıt hiçbir şekilde güncellenemez/silinemez.
CREATE OR REPLACE FUNCTION prevent_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  allowed  text[] := coalesce(string_to_array(nullif(TG_ARGV[0], ''), ','), '{}');
  lock_col text   := nullif(TG_ARGV[1], '');
  v_old    jsonb;
  v_new    jsonb;
  changed  text[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Değiştirilemez kayıt silinemez: %', TG_TABLE_NAME
      USING ERRCODE = 'JA001', HINT = 'Düzeltme için corrections kaydı açın.';
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

  IF lock_col IS NOT NULL THEN
    IF coalesce(jsonb_typeof(v_old -> lock_col), 'null') <> 'null' THEN
      RAISE EXCEPTION 'Kilitlenmiş kayıt güncellenemez: % (%)', TG_TABLE_NAME, lock_col
        USING ERRCODE = 'JA001', HINT = 'Düzeltme için corrections kaydı açın.';
    END IF;
    allowed := allowed || lock_col;
  END IF;

  IF NOT (changed <@ allowed) THEN
    RAISE EXCEPTION 'Değiştirilemez kayıt güncellenemez: % (%)', TG_TABLE_NAME, array_to_string(changed, ', ')
      USING ERRCODE = 'JA001', HINT = 'Düzeltme için corrections kaydı açın.';
  END IF;

  RETURN NEW;
END
$$;
--> statement-breakpoint

-- Yardımcı: tabloya denetim trigger'ı bağlar. Her yeni iş tablosu için migration'da çağrılmalıdır.
CREATE OR REPLACE FUNCTION app_attach_audit(
  p_table  regclass,
  p_pk     text[],
  p_masked text[] DEFAULT '{}',
  p_ops    text   DEFAULT 'INSERT OR UPDATE OR DELETE'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_ops NOT IN ('INSERT OR UPDATE OR DELETE', 'INSERT OR DELETE', 'INSERT OR UPDATE', 'INSERT') THEN
    RAISE EXCEPTION 'Geçersiz trigger işlemleri: %', p_ops;
  END IF;
  EXECUTE format('DROP TRIGGER IF EXISTS audit ON %s', p_table);
  EXECUTE format(
    'CREATE TRIGGER audit AFTER %s ON %s FOR EACH ROW EXECUTE FUNCTION audit_trigger(%L, %L)',
    p_ops, p_table, array_to_string(p_pk, ','), array_to_string(p_masked, ','));
END
$$;
--> statement-breakpoint

-- Yardımcı: tabloyu değiştirilemez yapar.
CREATE OR REPLACE FUNCTION app_attach_immutable(
  p_table    regclass,
  p_allowed  text[] DEFAULT '{}',
  p_lock_col text   DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS immutable ON %s', p_table);
  EXECUTE format(
    'CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION prevent_mutation(%L, %L)',
    p_table, array_to_string(p_allowed, ','), coalesce(p_lock_col, ''));
END
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION app_attach_audit(regclass, text[], text[], text) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app_attach_immutable(regclass, text[], text) FROM PUBLIC;
