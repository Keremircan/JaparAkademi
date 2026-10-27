#!/bin/sh
# Yedekten geri dönüş (docs/runbooks/restore.md). Boş bir ortama (yeni volume'lar) geri yükler.
#   restore.sh <db-yedegi.dump.age> <age-gizli-anahtar-dosyasi>
# Gizli anahtar sunucuda tutulmaz; geri dönüş sırasında konteynere geçici olarak verilir.
# Ortam: PGHOST/PGUSER/PGPASSWORD/PGDATABASE, BACKUP_FILES_PASSWORD, S3_* (backup.sh ile aynı)
set -eu

db_backup="${1:?Kullanım: restore.sh <db-yedegi.dump.age> <age-gizli-anahtar-dosyasi>}"
identity="${2:?age gizli anahtar dosyası gerekli}"
root=/backups
log() { echo "[geri dönüş $(date '+%F %T')] $*"; }

# ---- Veritabanı ----
log "Veritabanı geri yükleniyor: $db_backup"
age -d -i "$identity" "$db_backup" > /tmp/akademi.dump
# Roller ve boş veritabanı init betiğiyle oluşturulmuş olmalı (docker/postgres/init-prod)
pg_restore --no-password --dbname "$PGDATABASE" --clean --if-exists --exit-on-error /tmp/akademi.dump
rm -f /tmp/akademi.dump

# ---- Dosya deposu ----
export RCLONE_CONFIG_GARAGE_TYPE=s3
export RCLONE_CONFIG_GARAGE_PROVIDER=Other
export RCLONE_CONFIG_GARAGE_ENDPOINT="$S3_ENDPOINT"
export RCLONE_CONFIG_GARAGE_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID"
export RCLONE_CONFIG_GARAGE_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_GARAGE_REGION="$S3_REGION"
export RCLONE_CONFIG_GARAGE_FORCE_PATH_STYLE=true
export RCLONE_CONFIG_FILESCRYPT_TYPE=crypt
export RCLONE_CONFIG_FILESCRYPT_REMOTE="$root/files"
RCLONE_CONFIG_FILESCRYPT_PASSWORD=$(rclone obscure "$BACKUP_FILES_PASSWORD")
export RCLONE_CONFIG_FILESCRYPT_PASSWORD
log "Dosyalar geri yükleniyor"
rclone copy filescrypt: "garage:$S3_BUCKET_PRIVATE" --transfers 4 --stats-one-line --stats 0

log "Tamamlandı. Uygulamayı başlatıp doğrulama adımlarını uygulayın (restore.md)."
