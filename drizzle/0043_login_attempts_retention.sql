-- Giriş kayıtları (login_attempts) değiştirilemezdir (0002). Saklama süresini geçenleri yalnızca bu fonksiyon siler
-- (retention.login_attempt_days, gece retention.run). Kötüye kullanım incelemesi için son 30 günün kaydı hiçbir koşulda silinemez.
CREATE OR REPLACE FUNCTION app_purge_login_attempts(p_before timestamptz)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  n bigint;
BEGIN
  IF p_before > now() - interval '30 days' THEN
    RAISE EXCEPTION 'Son 30 günün giriş kaydı silinemez' USING ERRCODE = 'JA001';
  END IF;
  PERFORM set_config('app.retention_job', 'on', true);
  DELETE FROM login_attempts WHERE at < p_before;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('app.retention_job', 'off', true);
  RETURN n;
END
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app_purge_login_attempts(timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_purge_login_attempts(timestamptz) TO akademi_app;
