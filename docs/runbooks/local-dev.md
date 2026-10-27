# Yerel geliştirme ortamı

## Gereksinimler
- **Node.js 24+** (npm 11)
- **ffmpeg** (video HLS dönüştürme; worker ve entegrasyon testleri kullanır). Windows: `winget install Gyan.FFmpeg`. Yeni açılan terminallerde PATH'e girer; girmezse `.env` içinde `FFMPEG_PATH` / `FFPROBE_PATH` tam yolunu verin (ör. `C:/Users/<kullanıcı>/AppData/Local/Microsoft/WinGet/Links/ffmpeg.exe`). ffmpeg yoksa video testi atlanır.
- **Docker Desktop** (Windows'ta WSL 2 altyapısıyla). Lisans notu: 250'den fazla çalışan veya 10 M$ üzeri gelirli şirketlerde ticari kullanım ücretlidir; gerekirse Rancher Desktop veya WSL içinde Docker Engine aynı şekilde çalışır.
- En az ~10 GB boş disk (imajlar, veritabanı ve Playwright tarayıcısı).

## İlk kurulum
```bash
npm ci
cp .env.example .env
```
`.env` içinde doldurulacaklar:
- `BETTER_AUTH_SECRET`: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`: örnek değerler yerelde kullanılabilir; farklı istenirse `GK` + 24 hex / 64 hex karakter.
- `SEED_ADMIN_PASSWORD`, `SEED_DEMO_PASSWORD`: en az 8 karakter, yaygın olmayan şifreler.
- `S3_PUBLIC_ENDPOINT`: yerelde boş bırakın (tarayıcı da `S3_ENDPOINT`'e erişir). Production'da tarayıcının eriştiği genel depolama adresi.
- `NATIONAL_ID_ENC_KEYS`: `node -e "console.log('1:'+require('crypto').randomBytes(32).toString('base64'))"`
- `NATIONAL_ID_HMAC_KEY`: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
  (Bu iki anahtar kaybolursa şifreli TC numaraları çözülemez; production'da ayrıca yedeklenmelidir.)

Ardından:
```bash
npm run docker:up        # PostgreSQL :5433 + Garage :3900/:3903
npm run storage:init     # Garage düğüm düzeni, anahtar ve bucket
npm run db:migrate       # geliştirme veritabanı
npm run db:migrate -- --test
npm run db:seed          # sistem yöneticisi + demo kullanıcılar
npm run dev              # http://localhost:3000
npm run worker:dev       # ayrı terminalde (arka plan işleri; medya işleme, sertifika PDF'i, e-posta bunsuz bekler)
                         # worker esbuild ile dist/worker.mjs'e derlenip Node ile çalışır (değişiklikte yeniden başlar)
```

## Demo kullanıcılar (yalnızca geliştirme)
Şifre: `.env` içindeki `SEED_DEMO_PASSWORD`.

| Sicil | Ad | Roller | Pozisyon |
|---|---|---|---|
| 1001 | Ayşe Yılmaz | personel (yeni işe giren) | Pres Operatörü |
| 1002 | Mehmet Usta | pratik eğitmen | Vardiya Şefi |
| 1003 | Fatma Demir | bölüm sorumlusu (kapsam: Üretim) | Üretim Müdürü |
| 1004 | Can Öztürk | İSG uzmanı | İSG Uzmanı |
| 1005 | Elif Şahin | İK | İK Uzmanı |
| 1006 | Murat Kaya | güvenlik | Güvenlik Görevlisi |
| 1007 | Zeynep Çelik | eğitmen + bölüm sorumlusu + İSG + İK | İK Uzmanı |

Seed ayrıca örnek organizasyon ağacını (Üretim → Pres Hattı / Montaj, Kalite, İK, İSG, Güvenlik, BT) ve "TASLAK" işaretli bir KVKK aydınlatma metni yayınlar; bu yüzden her kullanıcıdan ilk girişte onay istenir.

Sistem yöneticisi: `SEED_ADMIN_SICIL` / `SEED_ADMIN_PASSWORD` (ilk girişte şifre değiştirmek zorunlu).

## Testler
```bash
npm test                  # birim
npm run test:integration  # akademi_test veritabanını her çalıştırmada sıfırlar
npx playwright install chromium   # bir kez
npm run test:e2e          # çalışan dev sunucusunu kullanır, yoksa başlatır
```

## Veritabanına bağlanmak
```bash
docker compose -f docker/compose.yml exec postgres psql -U postgres -d akademi
```
Kullanıcılar: `postgres` (süper kullanıcı), `akademi_owner` (migration), `akademi_app` (uygulama). Veritabanları Türkçe ICU sıralamasıyla (`tr-TR`) açılır.

## Sık karşılaşılan sorunlar

### Port 5432 dolu
Makinede başka bir PostgreSQL çalışıyorsa çakışmasın diye Docker'daki veritabanı **5433** portunda yayınlanır.

### Windows: "SWC native addon: validate cache root … DACL grants replacement rights"
SWC (Next.js eklentileri ve Serwist kullanıyor) yerel dosyasını `AppData\Local\swc` altına çıkarır ve bu klasörün izinlerini sıkı denetler. Klasör başka bir uygulama kapsayıcısına yazma izni veriyorsa reddeder. Çözüm: yalnızca sizin yazabildiğiniz bir klasör gösterin (kullanıcı ortam değişkeni, bir kez):
```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.cache\swc-native"
[Environment]::SetEnvironmentVariable("SWC_NATIVE_BINDING_CACHE", "$env:USERPROFILE\.cache\swc-native", "User")
```
Terminali ve editörü yeniden açın.

### npm "install scripts not covered by allowScripts" uyarısı
npm 11 paket kurulum betiklerini onay olmadan çalıştırmaz. `@swc/core` onaylıdır (`package.json` → `allowScripts`). Diğerleri (esbuild, unrs-resolver vb.) betiksiz çalışıyor; sorun çıkarsa `npm install-scripts approve <paket>` ile onaylanır.

### `npm run dev`: "Unexpected non-whitespace character after JSON"
Production derlemesinden (`npm run build`) sonra geliştirme sunucusu `.next` önbelleğini okuyamayabilir. `.next` klasörünü silip `npm run dev`'i yeniden başlatın.

### Garage'ı sıfırlamak
```bash
docker compose -f docker/compose.yml down -v   # TÜM yerel veriler silinir (veritabanı dahil)
```
Sonra "İlk kurulum" adımlarını tekrarlayın.
