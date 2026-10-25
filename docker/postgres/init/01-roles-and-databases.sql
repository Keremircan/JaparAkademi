-- Yerel geliştirme: veritabanı kullanıcıları ve veritabanları.
-- Konteyner ilk kez başlatıldığında (boş volume) bir kez çalışır.
--   akademi_owner : migration'ları çalıştırır, tabloların sahibidir
--   akademi_app   : uygulama ve worker bu kullanıcıyla bağlanır (en az yetki)
-- Şema seviyesindeki yetkiler drizzle/ migration'larındadır; production'da da aynı roller oluşturulmalıdır.

CREATE ROLE akademi_owner LOGIN PASSWORD 'akademi_owner_dev';
CREATE ROLE akademi_app LOGIN PASSWORD 'akademi_app_dev';
-- Owner, akademi_app adına nesne (pgboss şeması) oluşturabilsin; akademi_app'in yetkilerini miras almaz.
GRANT akademi_app TO akademi_owner WITH SET TRUE, INHERIT FALSE;

-- Türkçe sıralama (ğ, ş, ı, İ) için ICU tr-TR
CREATE DATABASE akademi OWNER akademi_owner TEMPLATE template0 ENCODING 'UTF8'
  LOCALE_PROVIDER icu ICU_LOCALE 'tr-TR' LOCALE 'C.UTF-8';
CREATE DATABASE akademi_test OWNER akademi_owner TEMPLATE template0 ENCODING 'UTF8'
  LOCALE_PROVIDER icu ICU_LOCALE 'tr-TR' LOCALE 'C.UTF-8';

REVOKE ALL ON DATABASE akademi FROM PUBLIC;
REVOKE ALL ON DATABASE akademi_test FROM PUBLIC;
GRANT CONNECT ON DATABASE akademi TO akademi_app;
GRANT CONNECT ON DATABASE akademi_test TO akademi_app;

\connect akademi
ALTER SCHEMA public OWNER TO akademi_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;

\connect akademi_test
ALTER SCHEMA public OWNER TO akademi_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
