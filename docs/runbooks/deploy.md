# Kurulum ve yayın (üretim)

JAPAR Akademi, Türkiye'deki bir Linux sunucuda Docker Compose ile çalışır (SPEC 11.1, 13.1).
Servisler: `postgres`, `garage` (dosya deposu), `migrate` (tek seferlik), `app`, `worker`, `caddy` (HTTPS), `backup`.
Dosyalar: `docker/compose.prod.yml`, `docker/Dockerfile`, `docker/caddy/Caddyfile`, `docker/backup/`, `docker/postgres/init-prod/`.

## 1. Sunucu gereksinimleri

- Ubuntu 24.04 LTS (ya da güncel bir Linux), en az 4 vCPU, 8 GB RAM, 100 GB+ disk (video ve yedekler için daha fazlası önerilir)
- Docker Engine 27+ ve Docker Compose eklentisi
- 80 ve 443 numaralı portlar internete açık (Let's Encrypt sertifikası için)
- İki DNS kaydı sunucunun IP adresine:
  - `APP_DOMAIN` — uygulama (ör. `akademi.japar.com.tr`)
  - `FILES_DOMAIN` — dosya deposu (ör. `dosya.akademi.japar.com.tr`). Tarayıcı video, PDF ve görselleri imzalı adreslerle doğrudan buradan alır.
- Saat dilimi önemli değil (uygulama ve veritabanı `Europe/Istanbul` ile hesaplar), ama `timedatectl set-timezone Europe/Istanbul` loglarda kolaylık sağlar.

## 2. İlk kurulum

```bash
git clone <repo-adresi> /opt/japar-akademi
cd /opt/japar-akademi
cp docker/.env.production.example docker/.env.production
chmod 600 docker/.env.production
```

`docker/.env.production` içindeki bütün değerleri doldurun. Rastgele değerler:

```bash
openssl rand -hex 32        # şifre/token
openssl rand -base64 32     # BETTER_AUTH_SECRET, NATIONAL_ID_HMAC_KEY
echo "1:$(openssl rand -base64 32)"   # NATIONAL_ID_ENC_KEYS
echo "GK$(openssl rand -hex 12)"      # S3_ACCESS_KEY_ID
openssl rand -hex 32                  # S3_SECRET_ACCESS_KEY
```

**Yedek şifreleme anahtarı (age):** bir yönetici bilgisayarında üretin; **gizli anahtar sunucuya konmaz**, kurumsal kasada (ör. iki ayrı kişide) saklanır.

```bash
docker run --rm alpine sh -c "apk add -q age && age-keygen"   # ya da yerel kurulumla: age-keygen
# "public key: age1..." satırını BACKUP_AGE_RECIPIENT'e yazın; çıktının tamamını kasaya koyun
```

> `NATIONAL_ID_ENC_KEYS`, `NATIONAL_ID_HMAC_KEY`, `BACKUP_FILES_PASSWORD` ve age gizli anahtarı kaybolursa TC bilgileri ve yedekler açılamaz. Bu değerlerin kopyası kasada tutulur.

## 3. Başlatma

```bash
cd /opt/japar-akademi
C="docker compose -f docker/compose.prod.yml --env-file docker/.env.production"
$C pull                 # app ve worker imajları (GHCR)
$C up -d --build        # backup imajı sunucuda derlenir
$C ps
$C logs migrate         # "Migration'lar tamamlandı" görülmeli
```

İlk sistem yöneticisini açın (ilk girişte şifresini değiştirmek zorundadır):

```bash
$C run --rm --no-deps migrate node_modules/.bin/tsx scripts/db-seed.ts
```

Doğrulama:

```bash
curl -s https://$APP_DOMAIN/api/health     # {"status":"ok","database":true,"storage":true}
```

Tarayıcıda `https://APP_DOMAIN` → sicil `000001` ve `SEED_ADMIN_PASSWORD` ile giriş → şifre değiştirme → KVKK onayı.

## 4. Güncelleme (yeni sürüm)

`main`'e birleştirilen her değişiklik CI'da test edilir; geçerse imajlar `ghcr.io/<sahip>/japar-akademi-{app,worker}:latest` ve `:<commit>` etiketleriyle gönderilir.

```bash
cd /opt/japar-akademi && git pull     # compose/Caddy/yedek dosyaları için
$C pull
$C up -d                               # migrate önce çalışır, sonra app ve worker yeniden başlar
$C logs --since 10m migrate app worker
```

Geri almak için `docker/.env.production` içinde `APP_IMAGE` ve `WORKER_IMAGE`'ı önceki commit etiketine çevirip `$C up -d` çalıştırın.
Migration'lar geri alınmaz; şema değişikliği içeren bir sürümü geri almak gerekiyorsa önce yedekten dönüş planlayın (restore.md).

## 5. Günlük işletim

| Ne | Nasıl |
|---|---|
| Loglar | `$C logs -f app worker` (JSON, pino). Docker logları servis başına 10 × 20 MB ile sınırlı. |
| Worker canlı mı | Loglarda 5 dakikada bir heartbeat; `$C ps` durumları |
| Yedek | Her gece 02:30 (`backup` servisi). Son yedek: `ls -lt docker/backups/db/daily | head` |
| Elle yedek | `$C exec backup /usr/local/bin/backup.sh` |
| E-posta hataları | Sistem yöneticisine uygulama içi bildirim ("Bazı e-postalar gönderilemedi") |
| Disk | `df -h`, `docker system df`. Video ve yedekler en çok yer kaplar. |
| Sertifika (HTTPS) | Caddy otomatik yeniler; sorun olursa `$C logs caddy` |

## 6. Güvenlik notları

- `docker/.env.production` yalnızca root okuyabilir (`chmod 600`); repoya girmez.
- Veritabanı ve Garage portları dışarı açılmaz; yalnızca Caddy 80/443 dinler.
- Caddy güvenlik başlıklarını ekler (HSTS, CSP, X-Frame-Options, Permissions-Policy, Referrer-Policy).
- CI her değişiklikte bağımlılık güvenlik taraması yapar (`scripts/audit-check.mjs`); düzeltmesi olmayan ve incelenen istisnalar `audit-allowlist.json`'dadır ve gerekçeleri yazılıdır.
- Kişisel veri yurt dışına gönderilmez. İmajlar GHCR'de durur ama yalnızca kod içerir. E-posta kurumun M365 kiracısından gider (Graph `Mail.Send`).
