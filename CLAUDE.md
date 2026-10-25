# JAPAR AKADEMİ

JAPAR'a yeni başlayan personelin pozisyonuna özel teorik eğitim → teorik sınav → pratik eğitim → pratik sınav → yetkinlik onayı akışını tamamladığı; ziyaretçilerin tesise girmeden İSG bilgilendirmesi aldığı web tabanlı eğitim ve dokümantasyon platformu (mobil uyumlu web + PWA).

**Tam mimari ve gereksinimler: `docs/SPEC.md`** · Kaynak gereksinim dokümanı: `docs/source/japar-akademi-gereksinim-dokumani.pdf`
Yeni bir özelliğe, tabloya veya ekrana başlamadan önce SPEC.md'nin ilgili bölümünü oku. SPEC.md ile bu dosya çelişirse bu dosyadaki "Değişmez kurallar" geçerlidir; çelişkiyi bana bildir.

## Stack
- Next.js 16 (App Router, Server Components, Server Actions, `proxy.ts`), React 19, TypeScript (strict)
  - Bu Next.js sürümü eğitim verindekinden farklı: kod yazmadan önce `node_modules/next/dist/docs/` altındaki ilgili rehberi oku (bkz. `AGENTS.md`). `middleware.ts` yok, `proxy.ts` var. `cacheComponents` açık.
- PostgreSQL 17 + Drizzle ORM (drizzle-kit migration), Better Auth (sicil no + şifre)
- MinIO (S3 uyumlu depolama), pg-boss (kuyruk + zamanlanmış işler, ayrı `worker` süreci), ffmpeg (HLS)
- Tailwind CSS 4 + shadcn/ui (base-nova) + vaul, next-intl (varsayılan `tr`), Zod
- `@react-pdf/renderer` + `qrcode` (sertifika), `exceljs` (içe/dışa aktarma), Microsoft Graph (e-posta), Serwist (PWA kabuğu), Web Speech API (sesli okuma)
- Test: Vitest (birim + gerçek Postgres ile entegrasyon), Playwright (mobil + masaüstü)
- Barındırma: Türkiye'de Linux VM, Docker Compose (`app`, `worker`, `postgres`, `minio`, `caddy`)

## Değişmez kurallar
- **Tek kurum (JAPAR).** Multi-tenant yapı, `org_id`/`tenant_id` kolonu YOK.
- **Veriler Türkiye'de.** Kişisel veri veya içerik yurt dışındaki bir servise gönderilmez: Vercel, Supabase Cloud, Cloudflare/Mux, bulut TTS, yurt dışı analitik veya hata takibi kullanılmaz. Tek istisna kurumun Microsoft 365 kiracısıdır (yalnızca e-posta; Faz 3'te SSO).
- **SMS yok.** Hiçbir fazda SMS sağlayıcısı eklenmez. Kanallar: uygulama içi, web push, e-posta.
- **Roller:** `personnel` (herkes), `trainer`, `section_manager`, `ohs_specialist`, `hr`, `security`, `sysadmin`. Bir kişi birden çok role sahip olabilir. "Kursiyer" bir rol değildir; aktif eğitim ataması olan personeldir. Ziyaretçinin hesabı yoktur.
- **Yetki tek yerde:** `src/server/authz`. Veriye yalnızca `src/server/services` üzerinden erişilir; bileşen veya Server Action doğrudan Drizzle sorgusu yazmaz. Her servis fonksiyonu önce yetki ve kapsam kontrolü yapar. `proxy.ts` yalnızca iyimser yönlendirme içindir; yetki kontrolü değildir.
- **Görünürlük sınırları:**
  - Kursiyer soru bankasını ve başkasının sonucunu göremez; sınavdan sonra doğru cevapları görmez.
  - Eğitmen soru bankasını göremez, yalnızca kendisine atanan kursiyerleri görür.
  - Bölüm sorumlusu yalnızca kapsamındaki org düğümlerini (alt düğümler dahil) görür.
  - İK soruları değiştiremez.
  - Güvenlik personel eğitim verisini göremez.
- **Kimse kendi kaydını değerlendiremez veya onaylayamaz** (sınav, pratik görev, işe başlama).
- **Kayıtlar değiştirilemez:** teslim edilmiş sınav denemesi, pratik işaretleme, pratik sınav sonucu, imza, onay/ret, işe başlama kararı, sertifika, KVKK onayı.
  - Bu tablolarda UPDATE/DELETE veritabanı trigger'ıyla engellenir. Düzeltme = yeni `corrections` kaydı + gerekçe.
  - Silme yerine arşivleme yapılır.
- **Denetim kaydı:** her iş tablosunda `audit_trigger` bulunur. Her transaction'da `app.actor_id` ayarlanır. `audit_log` append-only'dir.
- **Durum geçişleri** (içerik yayını, sınav teslimi, onaylar, atama durumları) yalnızca servis fonksiyonları ve `src/server/state/` durum makineleriyle yapılır.
- **Karar insana bırakılır:** sistem personeli otomatik reddetmez veya süreci sonlandırmaz; bildirim gönderir, kararı insan verir.
- **Her eşik bir parametredir:** sınav notu, soru sayısı, süre, hak, bekleme, geçerlilik, saklama süresi, tehlike sınıfı vb. kodda sabit yazılmaz; `settings` tablosundan okunur (SPEC Bölüm 14).
- **KVKK:** TC kimlik no şifreli (AES-256-GCM) saklanır, ekranda maskeli gösterilir; tamını yalnızca İK görür ve her görüntüleme loglanır. Saklama süreleri dolunca anonimleştirme işi çalışır.
- **Erişilebilirlik:** min 48px dokunma alanı, büyük butonlar, ikon + metin, sesli okuma, WCAG 2.1 AA. Kursiyer ve eğitmen ekranları telefon önceliklidir.
- Arayüz metinleri hard-code edilmez; `messages/tr.json` (ve `en.json`) üzerinden gelir.
- Tüm tarihler veritabanında `timestamptz` tipindedir; hesaplar `Europe/Istanbul` (`org.timezone`) ile yapılır.
- Gizli anahtarlar yalnızca `.env` dosyasında tutulur (repo dışı); `.env.example` güncel tutulur.

## Kod düzeni
- Rotalar: `src/app/[locale]/(public)/…` (login, verify, kiosk) ve `src/app/[locale]/(app)/…` (learn, exam, trainer, manage, admin, security, reports). Tek uygulama kabuğu, menü role göre oluşur.
- Arayüz ve Server Action'lar `src/features/<alan>/` altında (components/, actions.ts, schemas.ts).
- Sunucu tarafı `src/server/`: `db/` (Drizzle şema), `auth/`, `authz/`, `services/`, `state/`, `jobs/`, `storage/`, `mail/`, `crypto/`.
- Worker giriş noktası: `src/worker/index.ts`.
- Migration'lar `drizzle/` altında. Trigger'lar ve yetkiler elle yazılmış SQL migration'larıdır.
- Docker dosyaları `docker/`, testler `tests/unit`, `tests/integration`, `tests/e2e`.
- Server Action ve Route Handler girdileri her zaman Zod ile doğrulanır.
- Kod tanımlayıcıları (tablo, sütun, değişken) İngilizce; kullanıcıya görünen metinler Türkçe.

## Komutlar
> İş paketi 1.0 (teknik temel) kurulduktan sonra bu bölümü gerçek komutlarla güncelle.
- `docker compose -f docker/compose.yml up -d` (postgres + minio)
- `npm run dev` / `npm run build` / `npm run lint` / `npm run typecheck` / `npm run test`
- `npm run test:integration` / `npx playwright test`
- `npm run db:generate` / `npm run db:migrate` / `npm run db:seed`
- `npm run worker`

## Çalışma şekli
- SPEC.md Bölüm 16.2'deki Faz 1 iş paketlerine göre ilerle; bir seferde tek paket.
- Büyük işlerde önce plan çıkar, onay al, sonra uygula.
- Her şema değişikliği = yeni migration + ilgili entegrasyon testi (özellikle yetki, kapsam ve değiştirilemezlik senaryoları).
- Testleri ilgili FG numarasıyla adlandır (ör. `FG-3.4 ön koşul tamamlanmadan modül kilitli`).
- Bir görevi bitirmeden önce lint, typecheck ve testleri çalıştır.
- SPEC.md'de karşılığı olmayan bir karar vermen gerekirse varsayım yapmadan önce sor.
