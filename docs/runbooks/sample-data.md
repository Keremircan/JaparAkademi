# Örnek veri (kararlar #296–297)

Canlı sitede eğitim, tanıtım ve deneme için **her eklenebilir kayıttan en az bir örnek** yükler: içerik kütüphanesi,
modüller, soru bankası, pozisyon kartı ve eğitim planı, bir kursiyerin sertifikaya kadar bütün akışı, yetkinlikler,
periyodik eğitim, çalışma programı, ziyaretçi kayıtları ve birkaç sistem ayarı. Kayıtlar ekranların kullandığı servis
fonksiyonlarıyla oluşturulur; yani sistemde bir kullanıcının ekrandan girdiği kayıtlarla aynıdır.

Örnekler tek komutla temizlenir. Değiştirilemez kayıtlar (sınav denemesi, imza, sertifika vb.) normalde hiç silinmez;
**tek istisna bu temizliktir** ve yalnızca `sample_records` tablosunda örnek olarak işaretli kayıtları kapsar
(proje sahibinin 2026-11-09 kararı, karar #296). Gerçek kayıtlar değiştirilemez kalır.

> **Sessiz kip (karar #297).** Yükleme sırasında gerçek kişilere bildirim, e-posta ya da telefon bildirimi gitmez.
> Örnek kişilerin hesabı etkinleştirilmez, davet gönderilmez; bu kişiler giriş yapamaz. Gece çalışan işler (geciken
> eğitim, işaretlenmemiş pratik görev, süresi dolan İSG eğitimi ve yetkinlik uyarıları, haftalık ekip özeti, tekrar
> eğitimi) örnek kişileri atlar.

İçerik metinleri resmî mevzuat ve kurum kaynaklarından derlenip kendi cümlelerimizle yazılmıştır; kaynak listesi
`scripts/sample-data/KAYNAKLAR.md`'dedir. Görseller, video ve PDF'ler yükleme sırasında üretilir, dışarıdan medya
indirilmez.

## 0. Başlamadan önce

| Ne | Not |
|---|---|
| Yeni sürüm yayında | Örnek veri paketini içeren sürüm sunucuda olmalı (`docs/runbooks/deploy.md` → Güncelleme). `migrate` servisi `0063`–`0064` değişikliklerini uygular |
| Üst yönetici sicil no'su | Kayıtları sizin adınıza oluşturur (`--owner`). Sicil aktif ve **Üst yönetici** rolünde olmalı |
| Pozisyon | Varsayılan `MAK-DROPLAST-PRES` (Üretim → Makine → Droplast/Pres İşçisi). Pozisyonun kartı olmamalı ve pozisyonda eğitim bekleyen gerçek kişi bulunmamalı; yoksa kart yayınlanınca onlara örnek plan atanırdı. Başka bir pozisyon için `--position <kod>` |
| Yayında yasal metinler | Ziyaretçi kuralları + ziyaretçi KVKK metni yayında değilse ziyaret ön kayıtta kalır (bilgilendirme, giriş-çıkış ve tahliye yoklaması atlanır). Personel açık rıza metni yayında değilse profil fotoğrafı atlanır. Komut bu metinleri **yayınlamaz** |
| Sunucuda yer | Medya için birkaç MB yeterlidir |

Mevcut departman, bölüm, pozisyon ve personel kayıtları değiştirilmez. Kurum ağacına yeni birim eklenmez.

## 1. Yedek alın

İsteğe bağlı ama önerilir; gece yedeğini beklemeden elle bir yedek alın:

```bash
cd /opt/japar-akademi
C="docker compose -f docker/compose.prod.yml --env-file docker/.env.production"
$C exec backup /usr/local/bin/backup.sh
```

## 2. Ön kontrol

Ön kontrol hiçbir şey yazmaz; yüklemenin yapılıp yapılamayacağını ve neyin atlanacağını söyler:

```bash
$C run --rm migrate node scripts/sample-data/run.mjs load --owner <sicil no> --check
```

- **"Ön kontrol geçti"**: yükleme yapılabilir.
- **YÜKLENEMEZ** başlığı altındaki satırlar düzeltilmeden yükleme başlamaz (ör. sicil üst yönetici değil, pozisyonun
  zaten kartı var, örnek sicil numaraları kullanılıyor, örnek veri zaten yüklü).
- **Notlar** bilgi içindir (ör. "Yüklenici bilgilendirme paketi yok: örnek paket yayınlanır ve temizlemeye kadar gerçek
  yükleniciler de onu görür"). Notu kabul etmiyorsanız yüklemeyin.

## 3. Yükleme

```bash
$C run --rm migrate node scripts/sample-data/run.mjs load --owner <sicil no>
```

Yükleme 3–5 dakika sürer (video dönüştürme ve sertifika PDF'leri worker'da işlenir; worker çalışıyor olmalı). Her satır
geçen süreyle yazılır (`[42 sn] Soru bankası oluşturuluyor…`). Sonda **Bitti.** ve temizleme listesine yazılan kök
kayıtların tablo tablo sayısı görünür.

Bağlantı koparsa ya da komut hata verirse [7. Sorun olursa](#7-sorun-olursa) bölümüne bakın.

## 4. Neler yüklenir

| Ekran | Örnek |
|---|---|
| Personel | 8 örnek kişi, sicil `ORNEK-…`, adlarının sonunda "(Örnek)": eğitmen, bölüm sorumlusu, İSG uzmanı, güvenlik, kursiyer ve pozisyonda çalışan 3 kişi (biri Excel aktarımıyla). Hiçbiri giriş yapamaz |
| İçerik kütüphanesi | Pozisyonun bölümünde 8 içerik, 7 türün hepsi (metin, PDF, video, galeri, talimat, kontrol listesi, form şablonu), Türkçe + İngilizce, etiketli; onay akışından geçmiş. Kontrol listesinin "tekrar oku" isteyen ikinci sürümü |
| Modüller | Teorik, İSG, pratik eğitim, teorik sınav ve pratik sınav modülleri; ara değerlendirme soruları ve pratik görevler |
| Soru bankası | 30'dan fazla soru, dört tipin hepsi (çoktan seçmeli, doğru/yanlış, eşleştirme, görselde işaretleme); bir kısmı Excel aktarımıyla; bir sorunun düzeltilmiş ikinci sürümü |
| Pozisyon kartı ve plan | `MAK-DROPLAST-PRES` için 13 bölümlü kart, eğitim planı; yeni göstergeli ikinci sürüm (sürüm karşılaştırması görülebilir) |
| Eğitim akışı | Kursiyerin teorik eğitimi, sınıf eğitimi (imzalı katılım formu PDF'i), gözetmen kodlu teorik sınavı, pratik görev işaretlemeleri, imzalı pratik sınavı, işe başlama onayı, QR kodlu yetkinlik sertifikası; İSG modüllerinin katılım belgeleri; "tekrar oku" görevi |
| Yetkinlik | 4 yetkinlik; eğitimle verilen ve bölüm sorumlusunun elle verdiği kayıtlar |
| Periyodik eğitim | Sistem dışı son eğitim tarihleri (ekrandan ve Excel'den) ve "Şimdi başlat" ile açılmış eğitim |
| Çalışma programı | "Gündüz vardiyası akışı" ve kursiyerin kendi kopyası |
| Ziyaretçi | Yüklenici firma, kara liste kaydı, yüklenici bilgilendirme paketi (yayında paket yoksa), giriş ve çıkışı yapılmış ziyaret, tahliye yoklaması tatbikatı (içeride gerçek ziyaretçi varsa atlanır) |
| Sistem | Ortak cihaz "Örnek Kiosk – Ziyaretçi Girişi"; yayınlanmamış "Ziyaretçi ve Yüklenici Kuralları" taslağı; KKD listesine "Toz maskesi (FFP2)"; sertifika için geçici imza yetkilisi (sertifika düzenlenince listeden çıkar); kursiyerin açık rızayla profil fotoğrafı |

Kayıtlar gerçek kayıtlarla yan yana durur: raporlarda, yönetim özetinde, ziyaretçi defterinde ve toplu davet listesinde
temizlenene kadar görünür.

## 5. Uygulamada bakın

- **İçerik kütüphanesi** → Makine bölümü; **Organizasyon** → Droplast/Pres İşçisi → Pozisyon kartı.
- **Personel** → "Örnek" araması; Emre Yıldız (Örnek) sayfasında eğitim, sınav, pratik ve sertifikalar.
- **Raporlar** → Yetkinlik matrisi, eğitim ve sınav raporları.
- **Güvenlik** → Ziyaretler, firmalar, kara liste, tahliye.
- Sertifikanın QR kodu herkese açık doğrulama sayfasını açar.

## 6. Temizleme

Önce deneyin; deneme hiçbir şey silmez, neyin silineceğini ve neyin korunacağını listeler:

```bash
$C run --rm migrate node scripts/sample-data/run.mjs purge --check
```

Sonra silin:

```bash
$C run --rm migrate node scripts/sample-data/run.mjs purge --yes
```

- Bütün örnek kayıtlar ve alt kayıtları tek transaction'da silinir; dosyalar transaction'dan sonra depodan silinir.
- KKD listesine eklenen öğe çıkarılır; parametre listeleri yükleme öncesine döner.
- Denetim kaydı silinmez: örnek kayıtların oluşturulma ve silinme satırları **Denetim** ekranında kalır.
- **KORUNAN** başlığı: bir örnek kayıt sonradan gerçek bir kayıtla bağlandıysa (ör. örnek içerik gerçek bir modüle
  eklendi, gerçek bir personel örnek kartın planıyla eğitime başladı) o kayıt ve ona bağlı olanlar silinmez, nedeni
  yazılır. Bağı ekrandan kaldırıp (modülden içeriği çıkarın vb.) `purge --yes`'i yeniden çalıştırın; kalanlar da silinir.

Temizledikten sonra örnek veri yeniden yüklenebilir.

## 7. Sorun olursa

- **Yükleme yarıda kaldı** (bağlantı koptu, hata verdi): o ana kadar oluşturulan kayıtlar zaten temizleme listesindedir.
  `purge --yes` ile temizleyin, nedeni giderin, yüklemeyi yeniden çalıştırın.
- **"Örnek veri zaten yüklü"**: önce temizleyin.
- **"Medya işleme zaman aşımına uğradı"**: worker çalışıyor mu bakın (`$C ps worker`, `$C logs --since 10m worker`).
  Worker bir dakika içinde dosyayı almazsa yükleyici kendisi işler; zaman aşımı ffmpeg'in çalışmadığını gösterir.
- Komut yalnızca `sample_records`'taki kayıtlara dokunur; gerçek bir kaydı silmesi gerekseydi silmez, **KORUNAN**
  olarak raporlar.

## Geliştirme ortamında

Yerel veritabanı ve depoyla aynı komutlar (`.env`'deki bağlantılar kullanılır):

```bash
node --env-file-if-exists=.env scripts/sample-data/run.mjs load --owner <sicil no> --check
```

```bash
node --env-file-if-exists=.env scripts/sample-data/run.mjs purge --check
```

Yerelde `MAK-DROPLAST-PRES` yoksa kartı olmayan başka bir pozisyon verin (`--position <kod>`). Komut kodu esbuild ile
`dist/sample-data.mjs`'e derleyip çalıştırır (tsx, PDF kütüphanesini yükleyemez). Entegrasyon testi:
`tests/integration/sample-data.test.ts` (ffmpeg gerekir).
