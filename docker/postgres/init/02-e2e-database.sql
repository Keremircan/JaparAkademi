-- Yerel geliştirme ve CI: uçtan uca testlerin ayrı veritabanı (her e2e çalıştırmasında boşaltılır, npm run e2e:reset).
-- Boş volume ile ilk başlatmada kendiliğinden çalışır. Daha önce oluşturulmuş volume'da bir kez elle çalıştırın:
--   docker compose -f docker/compose.yml exec -T postgres psql -U postgres -f /docker-entrypoint-initdb.d/02-e2e-database.sql
-- Roller 01-roles-and-databases.sql'de oluşturulur.

CREATE DATABASE akademi_e2e OWNER akademi_owner TEMPLATE template0 ENCODING 'UTF8'
  LOCALE_PROVIDER icu ICU_LOCALE 'tr-TR' LOCALE 'C.UTF-8';

REVOKE ALL ON DATABASE akademi_e2e FROM PUBLIC;
GRANT CONNECT ON DATABASE akademi_e2e TO akademi_app;

\connect akademi_e2e
ALTER SCHEMA public OWNER TO akademi_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
