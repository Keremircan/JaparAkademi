# Yedekten geri dönüş

SPEC 13.1: günlük veritabanı yedeği + dosya deposu aynası, şifreli; **üç ayda bir geri dönüş testi**.
Yedekler `backup` servisinde alınır (`docker/backup/backup.sh`, her gece 02:30):

| Ne | Nerede | Biçim | Saklama |
|---|---|---|---|
| Veritabanı | `docker/backups/db/daily/akademi-<tarih>.dump.age` | `pg_dump` (custom) → `age` ile şifreli | 30 gün |
| Veritabanı (aylık) | `docker/backups/db/monthly/` | ayın 1'indeki günlük yedeğin kopyası | 12 ay |
| Dosya deposu | `docker/backups/files/` | rclone crypt (içerik ve dosya adları şifreli), artımlı | depodan silinen dosya yedekte kalır |
| Uzak kopya | `BACKUP_REMOTE` (tanımlıysa) | `docker/backups` dizininin eşi | uzak depolamanın kuralı |

Açmak için gereken gizli bilgiler **sunucuda değil kasada** durur: age gizli anahtarı ve `BACKUP_FILES_PASSWORD`.
Ayrıca geri dönen ortamın `docker/.env.production` dosyasında eski ortamdaki `BETTER_AUTH_SECRET`, `NATIONAL_ID_ENC_KEYS`, `NATIONAL_ID_HMAC_KEY` ve `S3_*` değerleri aynı olmalıdır (aksi halde oturum, TC ve dosya erişimi bozulur).

## Geri dönüş adımları

Boş bir ortama (yeni sunucu ya da `down -v` ile volume'ları silinmiş ortam) geri yükler.

```bash
cd /opt/japar-akademi
C="docker compose -f docker/compose.prod.yml --env-file docker/.env.production"

# 1. Uygulama kapalıyken yalnızca veritabanı ve depo
$C up -d postgres garage

# 2. Depo düzeni, anahtar ve bucket (veritabanı migration'ı ÇALIŞTIRILMAZ)
$C run --rm --no-deps migrate node_modules/.bin/tsx scripts/storage-init.ts

# 3. Yedekleri sunucuya getirin (uzak kopyadan ise): rclone copy <BACKUP_REMOTE> docker/backups
# 4. age gizli anahtarını geçici olarak konteynere verin, geri yükleyin, anahtarı silin
$C up -d backup
docker cp age-anahtari.txt "$($C ps -q backup)":/tmp/age-key.txt
$C exec backup /usr/local/bin/restore.sh /backups/db/daily/<dosya>.dump.age /tmp/age-key.txt
$C exec backup rm -f /tmp/age-key.txt

# 5. Geri kalanı başlatın (migrate yeniden çalışır; yeni migration yoksa değişiklik yapmaz)
$C up -d
```

> Git Bash (Windows) kullanıyorsanız konteyner yolları değişmesin diye önce `export MSYS_NO_PATHCONV=1`.

## Doğrulama

1. `curl -s https://$APP_DOMAIN/api/health` → `{"status":"ok","database":true,"storage":true}`
2. Yedekten önceki bir kullanıcıyla giriş (şifresi yedekteki şifre olmalı).
3. Kayıt sayıları yedek anındakilerle aynı: `$C exec postgres psql -U postgres -d akademi -c "select count(*) from personnel"`
4. Bir video/PDF içeriği açılıyor; bir sertifikanın PDF'i iniyor.
5. Denetim kaydı ekranında yedek anına kadarki kayıtlar görünüyor.

## Son test

| Tarih | Ortam | Sonuç |
|---|---|---|
| 2026-10-27 | Yerel makine, üretim compose (`*.localhost`, Caddy yerel sertifika) | **Başarılı.** Yedek alındı → bütün volume'lar silindi (`down -v`) → boş ortama geri yüklendi. Personel, denetim kaydı ve ayar satırları aynı; depodaki test dosyası içeriğiyle geri geldi; yöneticinin yedekten önce değiştirdiği şifreyle giriş yapıldı; sağlık kontrolü veritabanı ve depo için olumlu. |

Bir sonraki test: üç ay içinde, **sunucu ortamında** (staging ya da üretim kopyası) aynı adımlarla. Sonuç bu tabloya eklenir.
