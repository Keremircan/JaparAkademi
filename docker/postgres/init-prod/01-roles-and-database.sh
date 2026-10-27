#!/bin/sh
# Üretim: veritabanı kullanıcıları ve veritabanı (boş volume ile ilk açılışta bir kez çalışır).
#   akademi_owner : migration'ları çalıştırır, tabloların sahibidir
#   akademi_app   : uygulama ve worker bu kullanıcıyla bağlanır (en az yetki)
# Şifreler ortam değişkenlerinden gelir (AKADEMI_OWNER_PASSWORD, AKADEMI_APP_PASSWORD); repoda şifre yoktur.
set -eu

: "${AKADEMI_OWNER_PASSWORD:?AKADEMI_OWNER_PASSWORD gerekli}"
: "${AKADEMI_APP_PASSWORD:?AKADEMI_APP_PASSWORD gerekli}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v owner_pw="$AKADEMI_OWNER_PASSWORD" -v app_pw="$AKADEMI_APP_PASSWORD" <<'SQL'
CREATE ROLE akademi_owner LOGIN PASSWORD :'owner_pw';
CREATE ROLE akademi_app LOGIN PASSWORD :'app_pw';
GRANT akademi_app TO akademi_owner WITH SET TRUE, INHERIT FALSE;

-- Türkçe sıralama (ğ, ş, ı, İ) için ICU tr-TR
CREATE DATABASE akademi OWNER akademi_owner TEMPLATE template0 ENCODING 'UTF8'
  LOCALE_PROVIDER icu ICU_LOCALE 'tr-TR' LOCALE 'C.UTF-8';
REVOKE ALL ON DATABASE akademi FROM PUBLIC;
GRANT CONNECT ON DATABASE akademi TO akademi_app;

\connect akademi
ALTER SCHEMA public OWNER TO akademi_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
SQL
