# JAPAR AKADEMİ

JAPAR'a yeni başlayan personelin pozisyonuna özel teorik eğitim → teorik sınav → pratik eğitim → pratik sınav → yetkinlik onayı akışını tamamladığı; ziyaretçilerin tesise girmeden İSG bilgilendirmesi aldığı web tabanlı eğitim ve dokümantasyon platformu (mobil uyumlu web + PWA).

**Tam mimari ve gereksinimler: `docs/SPEC.md`** · Kaynak gereksinim dokümanı: `docs/source/japar-akademi-gereksinim-dokumani.pdf`
Yeni bir özelliğe, tabloya veya ekrana başlamadan önce SPEC.md'nin ilgili bölümünü oku. SPEC.md ile bu dosya çelişirse bu dosyadaki "Değişmez kurallar" geçerlidir; çelişkiyi bana bildir.

## Stack
- Next.js 16 (App Router, Server Components, Server Actions, `proxy.ts`), React 19, TypeScript (strict)
  - Bu Next.js sürümü eğitim verindekinden farklı: kod yazmadan önce `node_modules/next/dist/docs/` altındaki ilgili rehberi oku (bkz. `AGENTS.md`). `middleware.ts` yok, `proxy.ts` var. `cacheComponents` açık.
- PostgreSQL 17 + Drizzle ORM (drizzle-kit migration), Better Auth (sicil no + şifre)
- Garage (S3 uyumlu depolama; AWS SDK ile), pg-boss (kuyruk + zamanlanmış işler, ayrı `worker` süreci), ffmpeg (HLS)
- Tailwind CSS 4 + shadcn/ui (base-nova) + vaul, next-intl (varsayılan `tr`), Zod
- `@react-pdf/renderer` + `qrcode` (sertifika), `exceljs` (içe/dışa aktarma), Microsoft Graph (e-posta), Serwist (PWA kabuğu), Web Speech API (sesli okuma)
- Test: Vitest (birim + gerçek Postgres ile entegrasyon), Playwright (mobil + masaüstü)
- Barındırma: Türkiye'de Linux VM, Docker Compose (`app`, `worker`, `postgres`, `garage`, `caddy`)

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
- Kod tanımlayıcıları (tablo, sütun, değişken) İngilizce; kullanıcıya görünen metinler Türkçe ("siz" hitabı).

### Veritabanı kalıpları
- Veri değiştiren her servis işlemi `withActor(actor, tx => …)` içinde çalışır (denetim kaydına aktör yazılır). Seed/worker için `systemActor("<ad>")`.
- Yeni iş tablosu = Drizzle şeması + `npm run db:generate` + elle yazılmış bir migration'da `SELECT app_attach_audit('<tablo>', '{<pk>}', '{<maskeli sütunlar>}')`; değiştirilemezse ayrıca `SELECT app_attach_immutable('<tablo>', '{<izinli sütunlar>}', '<kilit sütunu>')`.
- Uygulama `akademi_app` (yalnızca DML), migration'lar `akademi_owner` ile çalışır. `audit_log`'a uygulama yazamaz; satırları trigger yazar.
- Değiştirilemezlik ihlali `JA001` SQLSTATE'idir (`isImmutableViolation`).

### Next.js 16 kalıpları (cacheComponents açık)
- Dil `next/root-params` ile okunur (`setRequestLocale` kullanılmaz). Server Action'da root params yoktur; next-intl orada istek dilini kullanır.
- Oturum okuyan her sayfa içeriğini kendi `<Suspense fallback={<PageSkeleton />}>` sınırına alır (`loading.tsx` "instant navigation" doğrulamasını karşılamıyor).
- Oturum: `requireUser()` / `getSectionUser(key)` (`src/server/auth/current-user.ts`). Yetkisiz bölümde `notFound()` değil `<NotFoundView />` döndürülür (Suspense içinde notFound akıştan sonra çalışmıyor).
- Better Auth'un HTTP rotası yoktur; kimlik işlemleri `src/server/services/auth.ts` + Server Action. Çerezler `applySetCookies` ile yazılır.
- Base UI `Button`'ı bağlantı olarak kullanırken `nativeButton={false}` + `render={<Link …/>}`.
- Oturum sırası `requireUser()` içinde: giriş → şifre değiştirme (`mustChangePassword`) → KVKK onayı (`/consent`) → sayfa.
- Mutasyon sonrası aynı sayfada kalınıyorsa `refresh()` (`next/cache`), başka sayfaya gidiliyorsa next-intl `redirect`.

### Uygulama kalıpları
- Server Action: Zod ile ayrıştır → `actionUser()` → `runAction(() => servis(...))` → `ActionResult` (`src/features/shared/action-result.ts`). Hata kodu arayüzde `errors.<kod>` ile gösterilir (`<FormError />`).
- Tek tık eylemler `<ActionButton action={eylem.bind(null, id)} />`, formlar `useActionState`.
- Yönetim sayfaları: `adminAccess("<yetki>")` null ise `<NotFoundView />`; servis `NotFoundError`'u `orNull()` ile 404 görünümüne çevrilir.
- Kapsam: `orgScopeFor(actor)` / `isPersonInScope()` (`src/server/authz/scope.ts`). İK ve sysadmin tüm ağacı görür.
- TC kimlik no yalnızca `src/server/crypto/national-id.ts` ile işlenir (`protectNationalId`, `decryptNationalId`); tam TC görüntüleme `data_access_log`'a yazılır.
- Kişiye verilen tek seferlik çıktılar (geçici şifre PDF'i) sunucuda saklanmaz; eylem sonucu base64 döner, istemci `downloadBase64` ile indirir.
- PDF: `@react-pdf/renderer` + `src/server/pdf/fonts/Geist-Regular.ttf` (Türkçe karakter); Excel: `exceljs`. İkisi de `serverExternalPackages`'ta.
- Metinler `messages/tr.json`'da; `en.json`'da olmayan anahtar Türkçeye düşer (`src/i18n/request.ts`).
- İçerik kütüphanesi: erişim kuralları `src/server/services/content/access.ts` (SQL karşılığı `visibilityFilter`), yayın akışı `src/server/state/content.ts`. Gövde şemaları `services/content/body.ts` (taslak gevşek, onaya gönderim katı). Sayfalar `libraryAccess()` ile korunur.
- Medya: tarayıcı imzalı URL ile doğrudan Garage'a yükler (64 MB üstü 16 MB'lık parçalar) → `completeUpload` → `media.process` kuyruğu → worker (`services/media/process.ts`). Dosyalar istemciye yalnızca `/api/media/...` üzerinden (yetki + imzalı yönlendirme) verilir.
- Kuyruklar `src/server/jobs/queues.ts`'te tanımlanır ve `db:migrate` sırasında oluşturulur; uygulama iş göndermek için `enqueue()` (`jobs/send.ts`), işleyiciler `jobs/registry.ts`.
- Pozisyon kartı ve plan: `src/server/services/positions/` (servis, `card-schema.ts` bölüm şeması + zorunlu alan kontrolü, `plan-settings.ts` plan bazında parametreler — `SETTINGS` şemalarıyla doğrulanır). Durum makinesi `src/server/state/position-card.ts`. Modüller `src/server/services/modules.ts`. Yetki içerik erişim kurallarını kullanır (`content/access.ts`).
- Atama ve teorik eğitim: motor `src/server/services/assignments/engine.ts` (transaction içi: `createAssignment`, `syncAssignmentForPerson` — hesap açma/personel güncelleme/aktarımda çağrılır, `assignWaitingForPosition` — kart yayınında, `createRereadTasks` — "tekrar oku" yayınında, `refreshAssignment`/`completeModule`). Görünümler ve İK işlemleri `assignments/index.ts`, kursiyer işlemleri `assignments/learner.ts`. Durum makinesi `src/server/state/assignment.ts`. Tarih hesapları `src/lib/dates.ts` (`org.timezone`).
- Atamada plan sabitlenir: modül ayarları, içerik sürümleri, kart sürümü ve görevler `assignment_modules` / `assignment_items`'a kopyalanır; sonradan değişen modül/içerik süren atamayı etkilemez.
- Sınıf eğitimi `services/classroom.ts`, ara değerlendirme `services/quiz.ts`, ortak cihaz `services/devices.ts` (çerez `akademi_device`, girişte ortak mod zorlanır).
- Soru bankası `services/questions/` (`index.ts`: yetki `canView`/`canEdit`, sürüm + İSG onayı, havuz `poolForModules`/`poolModuleIds`; `parse.ts` + `import.ts`: Excel önizleme/aktarım). Sayfalar `questionsAccess()` ile korunur. İstemci bileşeni `parse.ts`'i (exceljs) içe aktarmaz; ortak sabitler `src/lib/questions.ts`.
- Teorik sınav `services/exams/` (`index.ts`: `examInfo`, `startExam`, `getAttempt`, `answerExam`, `submitExam`, süre dolumu `finalizeExpiredAttempt` + `exam.timeout` kuyruğu; `proctor.ts`: gözetmen kodu, HMAC özet, hatalı kod kilidi). Saf kurallar (çekim, puan, hak, bekleme) `src/server/state/exam.ts`. Kursiyere doğru cevap dönen hiçbir görünüm yazılmaz.
- Pratik eğitim ve sınav `services/practice/` (`markTask`, `evaluatorOverview`, pratik sınav formu: `startPracticalExam` → `savePracticalDraft` → `signPracticalExam` (kursiyer + değerlendiren) → `secondSignPracticalExam`/`returnPracticalExam`; kalınca `applyResult`). Saf kurallar `src/server/state/practice.ts`. İmza `services/signatures.ts` (PNG yükleme transaction dışında, `createSignature` içinde; özet kanonik JSON SHA-256). Medya erişimi `getAssetForViewer` → soru görseli (`canViewQuestionAsset`) → pratik fotoğraf/imza (`canViewPracticeAsset`).
- İşe başlama onayı ve süreç kararı `services/readiness/` (`readinessReview`, `approveReadiness`/`rejectReadiness`, `decideProcess`; tekrar açma `reopenForReview`). Sertifika `services/certificates/` (`issuePositionCertificate`/`issueAttendance` transaction içinde, içerik `snapshot`'ta dondurulur; `render.ts` worker'da PDF üretir; `verifyFromRequest` hız sınırlı herkese açık doğrulama). Saf kurallar `src/server/state/certification.ts`. İSG modülü tamamlanınca `completeModule` katılım belgesi düzenler.
- PDF görselleri: `@react-pdf` progressive JPEG çizmez ve dosya yolundan görsel yüklemez; görseller `{ data: Buffer, format }` olarak verilir (logo `src/server/pdf/assets/japar-logo.png`). Worker'da metinler `createTranslator` + `messages/tr.json` ile.
- Bildirim `services/notifications/` (`notify(tx, …)` olayla aynı transaction'da; alıcı yardımcıları `usersWithRole`, `sectionManagersForUnit/ForPerson`; onay kuyruğu için `notifyApprovalPending`; konu kapanınca `resolveNotifications`). Metin yalnızca tür + parametre olarak saklanır, `notifications.kinds.<tür>` ile gösterilir. E-posta `email_outbox` → `dispatch.ts` (worker, `mail.dispatch`) → `src/server/mail` (Graph ya da `MAIL_TRANSPORT=log`). E-postayla şifre sıfırlama `services/password-reset.ts`.
- Raporlar `services/reports/` (`runReport` yetki + kapsam; sonuç sütun anahtarı + ham değer; `format.ts` ekran/Excel/PDF ortak hücre biçimi; `export.ts` Excel/PDF + `report_exports` kaydı; indirme `/api/reports/[kind]`). Denetim ekranı `services/audit.ts`, KVKK dışa aktarma `services/personal-export.ts`. Saf hesaplar `src/server/state/reports.ts`.
- Yeni kuyruk eklenince `npm run db:migrate` yeniden çalıştırılır (kuyruklar migrate sırasında oluşturulur).
- Parametreler ekranı: `services/settings/catalog.ts` (grup + alan türü + gerekçe zorunluluğu), `listSettingsFor` / `updateSettingFromScreen`. Yeni parametre = registry + katalog + `settings.items.<anahtar_alt_çizgili>` metni (birim testi denetler).
- Saklama: `services/retention.ts` (`retention.run`, her gece) + saf kurallar `state/retention.ts`. Değiştirilemez tablolara yalnızca `app_anonymize_people` / `app_purge_audit` dokunur (`drizzle/0025`); yeni kişi verisi içeren tablo eklenirse bu fonksiyona ve denetim maskelemesine eklenir.
- Ziyaretçi temeli `services/visitors/` (`visits.ts` ön kayıt + görünürlük, `blacklist.ts`, `companies.ts`, `briefings.ts` sürümlü TR/EN paketler, `identity.ts` TC/pasaport). Saf kurallar `state/visits.ts`. Sayfalar `securityAccess()` ile korunur (`/security/...`); ev sahibi `/visits`. Kimlik no ve kara liste bilgisi ev sahibine dönmez. Ziyaretçi metinleri `services/legal.ts` (`LEGAL_KINDS`, TR + EN birlikte yayın).
- Ziyaretçi ekranları (hesapsız) `src/app/[locale]/(public)/{v/[token],kiosk,visit}` + `features/visitor-flow/`. Yetki ziyaret belirteciyle `services/visitors/session.ts` (`visitForToken`) ya da kiosk çereziyle (`recognizeKiosk`); akış `services/visitors/flow.ts`, aktör `systemActor("visitor")`. Sunucu süreyi ve sırayı doğrular, doğru cevap dönmez. Bu sayfalar önce `connection()` çağırır. Ziyaretçi metinleri `messages/en.json`'da da olmalı.
- Kapı `services/visitors/gate.ts` (`gateList`, `checkIn` — kimlik birleştirme + kara liste reddi `visit_denials`, `checkOut`, `activeClearanceUntil`). Girişten sonra `visits` trigger'la kilitli (`visit_gate_guard`); testte tarihi değiştirmek için trigger tablo sahibiyle geçici kapatılır.
- Tahliye `services/visitors/evacuation.ts` (`insideNow`, yoklama `startRollcall`/`refreshRollcall`/`setSafe`/`endRollcall`, `evacuationPdf`); bağlantısız son liste `src/lib/evacuation-cache.ts` (IndexedDB) + çevrimdışı sayfası. Ziyaretçi raporları rapor altyapısında (`visitors`, `contractors`; `hasOrgFilters` false).
- Tekrar eğitimi `services/assignments/recert.ts` (`runRecert`: son tamamlanış + `recert.lead_days`, `createAssignment(…, { renew })`, `assignment_modules.renews_id`) + saf kurallar `state/recert.ts`. Zamanlanmış eğitim bildirimleri `services/assignments/alerts.ts` (`training.daily` 06:00, `training.weekly` Pazartesi 08:00). Bir kez gidecek bildirimde `notify(…, { once: true })`; önek ile kapatma `resolveNotificationsByPrefix`.
- Worker esbuild ile `dist/worker.mjs` (ESM) olarak derlenir (`scripts/build-worker.mjs`); tsx CJS modu @react-pdf'i yükleyemez. Tek seferlik PDF denemeleri için geçici bir Vitest testi kullanın.
- Oturum/ortam okuyan sunucu kodu önce istek verisini okur (`await headers()` / `connection()`), sonra env'e veya veritabanına dokunur; aksi halde Docker derlemesindeki prerender env doğrulamasında düşer.
- Üretim: `docker/Dockerfile` (`app` standalone + `worker` hedefleri), `docker/compose.prod.yml` (`migrate`, `app`, `worker`, `postgres`, `garage`, `caddy`, `backup`), `docker/caddy/Caddyfile` (güvenlik başlıkları, CSP), `docker/backup/` (age + rclone crypt). App imajı serwist rotası için esbuild/serwist paketlerini ve `src/app/sw.ts`'i kopyalar; bunlara dokunan değişiklikte imajı deneyin. Runbook'lar `docs/runbooks/deploy.md`, `restore.md`.
- CI bağımlılık taraması `scripts/audit-check.mjs`: yüksek/kritik bulgu ya düzeltilir ya da gerekçesiyle `audit-allowlist.json`'a yazılır.
- Turlar: sınavda kalınca `reopenModule` teorik modülün `round` değerini artırıp adımlarını yeni tura kopyalar. Adım okuyan/sayan her sorgu `assignment_items.round = assignment_modules.round` koşulunu kullanır.
- Next `cacheComponents` önceki sayfaları gizli tutabilir: e2e testlerinde aynı kimlikli öğeler çoğalabilir, görünür olanı seçin (`filter({ visible: true })`). Adım bileşenleri gibi durum tutan istemci bileşenlerine `key` verin.
- Sürüm karşılaştırma: `src/lib/diff.ts` (LCS; satır ve kelime farkı) + `features/positions/components/diff-view.tsx`.
- Server Action'a istemci nesnesi gönderirken düz nesne olmalı: TipTap `getJSON()` prototipsiz nesne üretir, `JSON.parse(JSON.stringify(...))` ile düzleştirilir.

## Komutlar
Kurulum ayrıntıları: `docs/runbooks/local-dev.md`.
- `npm run docker:up` / `npm run docker:down` — PostgreSQL (localhost:5433) + Garage (S3 :3900, admin :3903)
- `npm run storage:init` — Garage düğüm düzeni, erişim anahtarı ve bucket (tekrar çalıştırılabilir)
- `npm run db:migrate` — Drizzle migration'ları + pg-boss şeması (`-- --test` ile test veritabanı)
- `npm run db:reset` — YEREL veritabanını boşaltıp yeniden kurar (`-- --test` ile test veritabanı)
- `npm run db:seed` — sistem yöneticisi + (geliştirmede) her rol için demo kullanıcı
- `npm run db:generate` — şemadan yeni migration üretir
- `npm run dev` / `npm run build` / `npm run start` / `npm run worker` (`worker:dev` izlemeli, `worker:build` yalnızca derler)
- `npm run lint` / `npm run typecheck` / `npm test` (birim) / `npm run test:integration` (gerçek test DB) / `npm run test:e2e` (Playwright, mobil + masaüstü)
- `npm run icons` — PWA ikonlarını üretir
- `node scripts/audit-check.mjs` — üretim bağımlılıklarının güvenlik taraması (CI ile aynı)
- Üretim yığını: `docker compose -f docker/compose.prod.yml --env-file docker/.env.production …` (bkz. `docs/runbooks/deploy.md`)
- Bu Windows makinesinde Next/SWC için `SWC_NATIVE_BINDING_CACHE` kullanıcı ortam değişkeni gerekir (runbook'a bakın).

## Çalışma şekli
- SPEC.md Bölüm 16.2'deki Faz 1 iş paketlerine göre ilerle; bir seferde tek paket.
- Büyük işlerde önce plan çıkar, onay al, sonra uygula.
- Her şema değişikliği = yeni migration + ilgili entegrasyon testi (özellikle yetki, kapsam ve değiştirilemezlik senaryoları).
- Testleri ilgili FG numarasıyla adlandır (ör. `FG-3.4 ön koşul tamamlanmadan modül kilitli`).
- Bir görevi bitirmeden önce lint, typecheck ve testleri çalıştır.
- SPEC.md'de karşılığı olmayan bir karar vermen gerekirse varsayım yapmadan önce sor.
