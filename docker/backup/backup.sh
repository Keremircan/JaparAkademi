#!/bin/sh
# Gece yedeği (SPEC 13.1, 12.3; karar #103).
#  1. Veritabanı: pg_dump (custom biçim) → age ile şifreli → /backups/db/daily/  (ayın 1'inde monthly/ kopyası)
#  2. Dosya deposu: Garage bucket → rclone crypt ile şifreli artımlı kopya → /backups/files/
#  3. Saklama: günlük 30 gün, aylık 12 ay
#  4. BACKUP_REMOTE tanımlıysa /backups uzak S3 uyumlu depolamaya (Türkiye) eşitlenir
# Gerekli ortam: PGHOST/PGUSER/PGPASSWORD/PGDATABASE, BACKUP_AGE_RECIPIENT, BACKUP_FILES_PASSWORD,
#                S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION, S3_BUCKET_PRIVATE
set -eu

: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT (age genel anahtarı) gerekli}"
: "${BACKUP_FILES_PASSWORD:?BACKUP_FILES_PASSWORD gerekli}"

stamp=$(date +%Y%m%d-%H%M)
root=/backups
mkdir -p "$root/db/daily" "$root/db/monthly" "$root/files"
log() { echo "[yedek $(date '+%F %T')] $*"; }

# ---- 1. Veritabanı ----
db_file="$root/db/daily/akademi-$stamp.dump.age"
log "Veritabanı yedeği: $db_file"
pg_dump --format=custom --no-password "$PGDATABASE" | age -r "$BACKUP_AGE_RECIPIENT" -o "$db_file.part"
mv "$db_file.part" "$db_file"
if [ "$(date +%d)" = "01" ]; then
  cp "$db_file" "$root/db/monthly/"
fi

# ---- 2. Dosya deposu (rclone yapılandırması ortamdan) ----
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
log "Dosya deposu yedeği (artımlı, şifreli)"
# copy: depodan silinen dosya yedekte kalır (uygulama silmek yerine arşivler)
rclone copy "garage:$S3_BUCKET_PRIVATE" filescrypt: --transfers 4 --checkers 8 --stats-one-line --stats 0

# ---- 3. Saklama ----
find "$root/db/daily" -name '*.dump.age' -mtime +30 -delete
find "$root/db/monthly" -name '*.dump.age' -mtime +370 -delete

# ---- 4. Uzak kopya (isteğe bağlı) ----
if [ -n "${BACKUP_REMOTE:-}" ]; then
  log "Uzak kopya: $BACKUP_REMOTE"
  rclone sync "$root" "$BACKUP_REMOTE" --stats-one-line --stats 0
fi

log "Tamamlandı ($(du -sh "$root" | cut -f1))"
