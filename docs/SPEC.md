# JAPAR Akademi — Mimari ve Gereksinim Dokümanı (v1.0)

> Kaynak: `docs/source/japar-akademi-gereksinim-dokumani.pdf` (Recep Yalçın, 25.10.2026).
> Bu doküman, kaynak dokümanı ve proje sahibiyle netleştirilen kararları (Bölüm 17) birleştirir.
> FG-x.y numaraları kaynak dokümandaki numaralardır; test ve kabulde referans olarak kullanılır.

---

## 1. Ürün Özeti

### 1.1 Amaç
JAPAR Akademi, JAPAR'a yeni başlayan her personelin işe başlamadan önce pozisyonuna özel **teorik eğitimi, pratik uygulamayı ve sınavı** tamamladığı; ziyaretçilerin de tesise girmeden **İSG bilgilendirmesini** aldığı web tabanlı eğitim ve dokümantasyon platformudur.

### 1.2 Problem
- İş tanımları, rutinler, raporlama şekilleri ve İSG kuralları kişilerin kafasında, dağınık dosyalarda veya sözlü aktarımda.
- Eğitimin verildiği, anlaşıldığı ve kimin hangi işe hazır olduğu kayıt altında değil.
- Akademi bu bilgiyi tek yerde toplar, herkese aynı standartta öğretir ve "bu kişi bu işi yapmaya yetkin" kararını **kanıtla birlikte** saklar.

### 1.3 Ürün İlkeleri
1. **Kanıtlı ve denetlenebilir.** Eğitim, sınav, onay ve imza kayıtları yasal kayıttır; sonradan değiştirilemez. Düzeltme yalnızca yeni kayıt ve gerekçeyle yapılır.
2. **Tek kaynak.** Pozisyon kartı hem iş tanımı hem eğitim içeriğidir. İş tanımı değişirse eğitim de değişir.
3. **Karar insana bırakılır.** Sistem personeli otomatik olarak işten çıkarmaz, reddetmez. Tüm haklarda başarısız olan personel için bildirim gönderir, kararı İK ve bölüm sorumlusu verir.
4. **Herkes için kullanılabilir.** Okuma-yazma seviyesi düşük personel için büyük butonlar, görsel ağırlıklı içerik ve sesli okuma sunulur.
5. **Veri Türkiye'de.** Kişisel veri yurt dışındaki bir servise gönderilmez. Tek istisna, kurumun kendi Microsoft 365 kiracısıdır (e-posta).
6. **Her eşik bir parametredir.** Sınav notları, süreler, haklar ve geçerlilik süreleri kodda sabit yazılmaz.

### 1.4 Kapsam
**Kapsam içi**
- Pozisyon bazlı içerik kütüphanesi: iş tanımı, iş akışı, rutinler, raporlama, dikkat edilecekler, İSG
- Yeni personel için teorik eğitim → teorik sınav → pratik eğitim → pratik sınav → yetkinlik onayı akışı
- Ziyaretçi, taşeron ve stajyer için kısa İSG bilgilendirmesi, onay ve giriş kaydı (Faz 2)
- Mevcut personel için periyodik tekrar eğitimleri ve süresi dolan sertifika takibi (Faz 2–3)
- Eğitim, sınav ve ziyaretçi kayıtlarının raporlanması ve denetime hazır arşivi

**Kapsam dışı (ilk sürüm)**
- Bordro, puantaj ve izin hesapları (JAPAR İK uygulamasında kalır; Akademi yalnızca personel listesini okur)
- İşe alım ve aday değerlendirme
- Turnike/kartlı geçiş donanımı (yalnızca entegrasyon noktası tanımlanır, Faz 3)
- **SMS.** Maliyet nedeniyle hiçbir fazda SMS kullanılmaz. Bildirim kanalları: uygulama içi, web push ve e-posta.
- Ayrı native mobil uygulama (mobil uyumlu web + kurulabilir PWA yeterlidir)

### 1.5 Kurulum Modeli
- Tek kurum (JAPAR). Çok kiracılı (multi-tenant) yapı yoktur.
- Barındırma: **Türkiye'deki bir bulut sağlayıcısında Linux VM + Docker Compose.** Sağlayıcı henüz seçilmedi; mimari sağlayıcıdan bağımsızdır.
- Ortamlar: `staging` ve `production` (ayrı VM'ler veya ayrı Compose projeleri).

---

## 2. Roller ve Yetkiler

### 2.1 Roller
Her kullanıcı bir **personel** kaydıdır. Roller personelin üzerine eklenir ve **bir kişi birden fazla role sahip olabilir** (ör. bir usta hem personel hem pratik eğitmen).

| Rol kodu | Ad | Kim | Ne yapar | Ne göremez / yapamaz |
|---|---|---|---|---|
| `personnel` | Personel (temel) | Hesabı olan herkes | Kendi profili, sertifikaları ve atanmış eğitimleri. **Aktif eğitim ataması varsa "Kursiyer" ekranları açılır.** Faz 2'de ziyaretçi ön kaydı açabilir (ev sahibi). | Başkalarının sonuçları, soru bankası |
| `trainer` | Pratik eğitmen / mentor | Usta, şef | Kendisine atanan kursiyerlerin pratik görevlerini işaretler, pratik sınavı değerlendirir, gözetmen kodu üretir, sınıf eğitimi kaydeder | Soru bankası (göremez, düzenleyemez); kendisine atanmamış kursiyerler |
| `section_manager` | Bölüm sorumlusu | Departman/bölüm/vardiya amiri | Kapsamındaki pozisyon kartlarını ve içerikleri hazırlar, onaylar; soru bankasını yönetir; ekibinin ilerlemesini izler; işe başlama onayı verir | Kapsamı dışındaki bölümlerin kişisel sonuçları |
| `ohs_specialist` | İSG uzmanı | İş güvenliği uzmanı, işyeri hekimi | Tüm İSG içeriklerini ve ziyaretçi bilgilendirmesini yönetir, İSG içerik/sorularını onaylar, "uzaktan verilebilir mi" alanını belirler, tehlike sınıfını ayarlar, İSG kayıtlarını raporlar | — |
| `hr` | İK | İnsan kaynakları | Personel kaydı ve Excel aktarımı, pozisyon atama, eğitim planı başlatma, şifre sıfırlama, tüm raporlar, ortak (İSG dışı) içerik yönetimi | Soru içeriklerini değiştiremez (yalnızca görür) |
| `security` | Güvenlik / resepsiyon | Kapı görevlisi | Ziyaretçi kaydı, bilgilendirme durumu, giriş-çıkış, tahliye yoklaması (Faz 2) | Personel eğitim verisi |
| `sysadmin` | Sistem yöneticisi | BT | Kullanıcı, rol, parametre, entegrasyon ve cihaz (kiosk) ayarları, denetim kaydı görüntüleme | — (her erişimi denetim kaydına yazılır) |

**Ziyaretçi** bir rol değildir; hesabı yoktur. Kendisine özel bağlantı, kapı tableti veya QR ile tek seferlik oturum açar (Faz 2).

### 2.2 Kapsam Kuralları
- **Bölüm sorumlusu kapsamı** organizasyon ağacındaki bir veya birden fazla düğüme atanır (`role_scopes`). Bir departmana atanan sorumlu, altındaki tüm bölümleri ve pozisyonları yönetir. Bir bölüme atanan yalnızca o bölümü yönetir.
- **Ekip** = kapsamdaki pozisyonlara bağlı personel.
- **Pratik eğitmen** yalnızca atamada eğitmen olarak seçildiği kursiyerleri görür. Bu kursiyerlerin teorik ilerlemesini yalnızca "hangi aşamada" seviyesinde görür; sınav cevaplarını göremez.
- **Güvenlik** personelin eğitim verisini göremez. Yalnızca ziyaretçi/taşeron kayıtlarını ve tesis içindekiler listesini görür.
- **İSG uzmanı** tüm personelin İSG eğitim kayıtlarını görür.
- **Kursiyer** sınavdan sonra puanını, geçti/kaldı sonucunu ve konu bazında doğru/yanlış özetini görür. Doğru cevaplar gösterilmez, böylece soru bankası sızmaz.

### 2.3 Yetki Matrisi (özet)
| Yetenek | personnel | trainer | section_manager | ohs_specialist | hr | security | sysadmin |
|---|---|---|---|---|---|---|---|
| Kendi eğitimini alma, sınava girme | ✅ (ataması varsa) | ✅* | ✅* | ✅* | ✅* | ✅* | ✅* |
| Organizasyon ağacı ve pozisyon tanımı | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Pozisyon kartı / içerik taslağı | ❌ | ✅ (kendi bölümü) | ✅ (kapsam) | ✅ (İSG) | ✅ (ortak) | ❌ | ❌ |
| İçerik/kart onayı (1. adım) | ❌ | ❌ | ✅ (kapsam) | ❌ | ✅ (ortak, İSG dışı) | ❌ | ❌ |
| İSG onayı (2. adım) | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Soru bankası düzenleme | ❌ | ❌ | ✅ (kapsam) | ✅ | 👁 okuma | ❌ | ❌ |
| Personel kaydı, Excel aktarımı, plan başlatma | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Pratik görev işaretleme, pratik sınav (1. imza) | ❌ | ✅ (kendi kursiyeri) | ✅ (kapsam) | ❌ | ❌ | ❌ | ❌ |
| Pratik sınav 2. imza, işe başlama onayı | ❌ | ❌ | ✅ (kapsam) | ❌ | ❌ | ❌ | ❌ |
| Gözetmen kodu üretme | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Raporlar | ❌ | ❌ | ✅ (kapsam) | ✅ (İSG) | ✅ (tümü) | ✅ (ziyaretçi) | ✅ |
| Parametreler, roller, entegrasyon | ❌ | ❌ | ❌ | ✅ (yalnızca İSG parametreleri) | ❌ | ❌ | ✅ |

\* Her rol aynı zamanda personeldir. Kendisine eğitim atanmışsa kursiyer ekranlarını kullanır.

### 2.4 Kendi Kaydına Onay Yasağı
Bir kişi kendisiyle ilgili sınav değerlendirmesi, pratik görev işaretlemesi veya işe başlama onayı yapamaz. Örneğin kursiyer olan bir eğitmen kendi görevlerini işaretleyemez.

---

## 3. Uçtan Uca Süreç

### 3.1 Yeni Personel
```
İK personeli kaydeder / Excel'den aktarır + pozisyon seçer
   → pozisyonun yayındaki eğitim planı otomatik atanır (FG-3.2)
   → İK pratik eğitmeni ve hedef tamamlanma tarihini seçer
1. Teorik eğitim   : ortak modüller + pozisyon modülleri (sıralı, ön koşullu)
2. Teorik sınav    : bankadan rastgele, süreli, otomatik puanlı
3. Pratik eğitim   : görev listesi, 3 seviye (gösterir → gözetiminde yapar → tek başına yapar)
4. Pratik sınav    : değerlendirme formu, eğitmen + bölüm sorumlusu imzası
5. Yetkinlik onayı : bölüm sorumlusu "işe başlayabilir" der → PDF sertifika (QR)
```
- Bir modül bitmeden sonraki kilitli kalır (FG-3.4). Pratik sınav, tüm görevler "tek başına yapar" seviyesine gelince açılır (FG-5.3).
- **Teorik sınavda kalma:** sınavın ön koşulu olan teorik modüller "tekrar gerekli" durumuna geçer. Kursiyer bu modülleri yeniden tamamlar. Yeni deneme en erken bekleme süresi (varsayılan 24 saat) dolunca açılır.
- **Pratik sınavda kalma:** "Yapamadı" denen ve eşik altında kalan kriterlerin görevleri "gözetiminde yapar" seviyesine düşürülür. Eğitmen bu görevleri yeniden "tek başına yapar" seviyesine getirince yeni hak açılır.
- **Tüm haklar bittiğinde:** atama `awaiting_decision` durumuna geçer. İK ve bölüm sorumlusuna (İSG kritikse İSG uzmanına da) bildirim gider. İnsan kararı üç seçenekten biridir, her biri gerekçeyle kaydedilir: **ek hak tanı**, **ek eğitim ata**, **süreci sonlandır**. İşten çıkarma gibi kararlar sistem dışında verilir.
- **İşe başlama onayında ret:** gerekçe yazılır ve tekrar açılacak modüller seçilir.

### 3.2 Pozisyon Değişikliği (FG-3.3)
Yeni pozisyonun planı atanır. Kişinin daha önce tamamladığı ve geçerliliği süren **aynı modüller** (modül kimliğine göre) tamamlanmış sayılır; yalnızca farklı olan modüller açılır. Eski atama `cancelled` (gerekçe: `position_change`) olur. Eski pozisyonun sertifikası süresi dolana kadar geçerli kalır.

### 3.3 Tekrar Eğitimi (FG-7.3)
Geçerlilik süresi olan modül veya sertifikanın bitişinden N gün önce (varsayılan 30) sistem tekrar eğitim atamasını otomatik açar (gerekçe: `recertification`). Atamada yalnızca süresi dolan modüller ve bunlara bağlı sınavlar yer alır.

### 3.4 İçerik Güncellemesi (FG-2.2)
Yeni sürümü yayınlayan kişi "tekrar oku ve onayla" seçeneğini işaretlerse, önceki sürümü tamamlamış herkese bir **okuma görevi** açılır (son tarih parametresi varsayılan 14 gün). Bu görev mevcut sertifikayı geçersiz kılmaz, ama raporlarda "bekleyen okuma" olarak görünür.

### 3.5 Ziyaretçi (Faz 2)
Ziyaretçi bilgilendirmeyi tamamlayıp kuralları onaylamadan ziyaretçi kartı alamaz. Ayrıntılar Bölüm 8'de.

---

## 4. Modüller ve Fonksiyonel Gereksinimler

### 4.1 Organizasyon ve Pozisyon Yapısı
- **FG-1.1** Departman → Bölüm → Pozisyon hiyerarşisi (ör. Üretim → Pres Hattı → Pres Operatörü). Ağaç `org_units` tablosunda tutulur (tür: `department` | `section`). Pozisyon bir bölüme ya da doğrudan bir departmana bağlanabilir.
- **FG-1.2** Her pozisyona bir pozisyon kartı (Bölüm 5) ve bir eğitim planı bağlanır. Eğitim planı, kartın 13. bölümüdür.
- **FG-1.3** **Ortak modüller** (genel İSG, şirket tanıtımı, KVKK, disiplin kuralları) tek yerden yönetilir ve her planın başına otomatik eklenir. Ortak modül hedefi: tüm personel, yalnızca mavi yaka veya yalnızca beyaz yaka. Pozisyona özel modüller bunlara ek olarak eklenir.
- **FG-1.4** Personel listesi Excel'den içe aktarılır (Faz 1). JAPAR İK uygulamasından otomatik aktarım Faz 3'te gelir.
  - Zorunlu sütunlar: sicil no, ad soyad, departman, pozisyon, işe giriş tarihi, yaka tipi. Opsiyonel sütunlar: TC kimlik no, telefon, e-posta.
  - Akış: dosya yükle → önizleme ve satır bazında doğrulama → onayla. Kayıtlar sicil no'ya göre eklenir veya güncellenir. Bilinmeyen departman/pozisyon satırı hatalı sayılır; otomatik oluşturulmaz.
  - Yeni hesaplara geçici şifre üretilir. İK bunları yazdırılabilir bir PDF listesi olarak **yalnızca bir kez** görür. Personel ilk girişte şifresini değiştirir.

### 4.2 İçerik Kütüphanesi
- **FG-2.1** İçerik tipleri: `text` (zengin metin sayfası), `pdf`, `video`, `gallery` (görsel/fotoğraf galerisi), `instruction` (adım adım, fotoğraflı talimat), `checklist` (kontrol listesi), `form_template` (ör. vardiya raporu örneği).
- **FG-2.2** Her içerik sürümlüdür: kim, ne zaman, ne değiştirdi (değişiklik notu 2. sürümden itibaren zorunlu). Yayınlanan sürüm değiştirilemez; düzenleme yeni taslak sürüm açar. Yeni sürümde "tekrar oku ve onayla" seçimlidir (Bölüm 3.4).
- **FG-2.3** Yayın akışı:
  ```
  draft ──gönder──▶ section_review ──onay──▶ (İSG ise) ohs_review ──onay──▶ published ──▶ archived
     ▲                    │ret                       │ret
     └────────────────────┴──────────────────────────┘
  ```
  - Taslağı gönderen bölüm sorumlusuysa ve içerik onun kapsamındaysa `section_review` adımı geçilmiş sayılır. Bu durum onay kaydına "hazırlayan = onaylayan" olarak yazılır.
  - Ortak, İSG dışı içerikte 1. adım onayını İK verir.
  - İSG içeriğinde (`is_ohs = true`) İSG uzmanı onayı her zaman ayrıca gerekir. İSG uzmanının kendi hazırladığı İSG içeriği tek adımda yayınlanır.
  - Ret gerekçesi zorunludur. Tüm onay ve retler değiştirilemez `approvals` kayıtlarıdır.
- **FG-2.4** Etiketler: makine, bölüm, risk, vardiya (etiket türleri genişletilebilir; taslak hazırlayan bu türlere yeni etiket ekleyebilir). Başlık, metin ve etiketlerde Türkçe tam metin araması yapılır (PostgreSQL `tsvector`): `turkish` sözlüğü aksanlı metinde kök eşleşmesi (güvenliği → güvenlik), `simple` + `unaccent` aksan/büyük harf farkı olmadan önek eşleşmesi sağlar; ikisi birleştirilir.
- **FG-2.5** Çoklu dil altyapısı: her içerik sürümü dil bazında (`tr`, `en`) tutulur. İlk sürümde personel içerikleri Türkçedir. Ziyaretçi bilgilendirmesinde İngilizce zorunludur (Faz 2).
- **Video:** yüklenen video arka plan işinde ffmpeg ile HLS'e (360p + 720p) dönüştürülür ve Garage'da (S3 uyumlu depolama) saklanır. Oynatıcı bağlantı hızına göre kaliteyi otomatik seçer; kullanıcı da elle "düşük kalite" seçebilir.
- **Dosya limitleri (parametre):** video 2 GB, PDF 50 MB, görsel 15 MB (yüklemede WebP'ye dönüştürülür, en fazla 2000 px).

### 4.3 Eğitim Planı ve Atama
- **FG-3.1** Plan sıralı modüllerden oluşur. Her modülde şu alanlar tanımlanır: tip (`theory` | `practice` | `theory_exam` | `practice_exam`), süre (dk), ön koşul (varsayılan: bir önceki modül), zorunlu/opsiyonel, geçerlilik süresi (ay; boşsa süresiz), İSG mi, **uzaktan verilebilir mi** (İSG modüllerinde yalnızca İSG uzmanı belirler).
- Modüller bir **modül kütüphanesinde** tutulur ve birden fazla planda kullanılabilir. FG-3.3'teki fark hesabı modül kimliğine göre yapılır.
- Plan, pozisyon kartıyla birlikte sürümlenir. Yeni kart sürümünün yayınlanması mevcut atamaları değiştirmez; yeni atamalar yeni sürümü kullanır.
- Planda pratik modüller opsiyonel yapılabilir. Mavi/beyaz yaka için ayrı akış yoktur; fark plandan gelir.
- **FG-3.2** İK personeli kaydedip pozisyon seçince plan otomatik atanır. İK pratik eğitmeni (planda pratik modül varsa zorunlu) ve hedef tamamlanma tarihini seçer. Hedef tarih için varsayılan: işe giriş + plan modül sürelerinden hesaplanan iş günü sayısı.
- **FG-3.3** Pozisyon değişikliği: Bölüm 3.2.
- **FG-3.4** Ön koşul tamamlanmadan modül kilitli kalır.
- Mevcut personele (ilk aktarımda) eğitim atanmaz. Periyodik eğitimleri Faz 3'te başlar.

### 4.4 Teorik Eğitim
- **FG-4.1** Kursiyer içeriği kendi hesabından (kişisel telefon dahil, bilgisayar, tablet) veya eğitim odasındaki ortak ekrandan alır.
  - **Ortak cihaz modu:** cihaz "ortak" işaretlenince (giriş ekranında seçenek veya sysadmin'in kaydettiği cihaz) 10 dk işlemsizlikte ve sınav bitince otomatik çıkış yapılır. Bu modda "beni hatırla" kapalıdır.
- **FG-4.2** Tamamlama kuralları:
  - Video: izlenen benzersiz saniyeler / toplam süre ≥ eşik (varsayılan %90). İleri sarma serbesttir ama izlenmeyen kısım sayılmaz.
  - Metin/PDF/talimat: sayfa veya son sayfa sonuna gelinmelidir.
  - Her içerik sonunda **"Okudum, anladım"** onayı alınır ve zaman damgasıyla kaydedilir.
- **FG-4.3** Ara değerlendirme (3–5 soru): **cevaplanması zorunludur, not etkisi yoktur.** Yanlış cevapta doğrusu ve açıklaması gösterilir. Cevaplar kayda geçer. Bu sorular sınav bankasından ayrıdır (`quiz` havuzu).
- **FG-4.4** Sınıf eğitimi kaydı: eğitmen, tarih, süre, yer, modül, katılımcı listesi ve ıslak imzalı katılım formunun taranmış hâli (PDF/görsel). Kayıt onaylanınca katılımcıların ilgili modülü tamamlanmış sayılır. **"Uzaktan verilemez" işaretli İSG modülleri yalnızca sınıf eğitimi kaydıyla tamamlanır.**

### 4.5 Pratik Eğitim
- **FG-5.1** Görev listesi pozisyona/pratik modüle bağlıdır (görev başına: ad, açıklama, kritik mi, sıra). Önerilen sayı pozisyon başına 10–30 görevdir. Seviyeler:
  1. `demonstrated`: usta gösterdi
  2. `supervised`: kursiyer usta gözetiminde yaptı
  3. `independent`: kursiyer tek başına yaptı
- **FG-5.2** Eğitmen her görevi tablet veya telefondan işaretler; not ve fotoğraf ekleyebilir. Her işaretleme yeni bir kayıttır (geçmiş korunur). Görevin güncel seviyesi son kayıttır. Eğitmen "tekrar" diyerek seviyeyi düşürebilir; gerekçe zorunludur.
- **FG-5.3** Tüm zorunlu görevler `independent` olunca pratik sınav açılır.

### 4.6 Sınav
- **FG-6.1** Teorik sınav: bankadan rastgele, süreli, otomatik puanlı. Kurallar Bölüm 6'da.
- **FG-6.2** Pratik sınav: değerlendirme formu üzerinden, değerlendirici puanlar. Kurallar Bölüm 6'da.

### 4.7 Yetkinlik Onayı ve Sertifika
- **FG-7.1** Teorik ve pratik sınavı geçen personel için bölüm sorumlusu "işe başlayabilir" onayı verir. Onay ekranında teorik ve pratik sonuçlar tek ekranda görünür (Ekran 9).
- **FG-7.2** Sistem QR kodlu, doğrulanabilir **PDF sertifika** ve **eğitim katılım belgesi** üretir. Belgede bulunan alanlar: eğitim konusu, süresi, tarihi, eğitimci, katılımcı imzası, onaylayan, geçerlilik tarihi, logo ve imza yetkililerinin taranmış imzaları.
  - **QR doğrulama sayfası** (herkese açık, `/verify/<token>`) şunları gösterir: **maskeli ad** (ör. "Ahmet Y***"), kapsam, veriliş ve bitiş tarihi, durum (geçerli / süresi dolmuş / iptal). TC ve sicil no gösterilmez. Token tahmin edilemez (128 bit).
  - Sertifika iptal edilebilir (gerekçe zorunlu, değiştirilemez kayıt).
- **FG-7.3** Sertifika ve İSG eğitimlerinin geçerlilik süresi vardır. Süre dolmadan tekrar eğitim otomatik atanır (Bölüm 3.3, Faz 2).
- **FG-7.4** Yetkinlik matrisi (Faz 3): personel × yetkinlik (makine/iş) tablosu, yetki bitiş tarihi, süresi dolanlar renkli gösterilir. Yetkinlik tanımları pozisyon kartının 7. ve 10. bölümleriyle ilişkilidir. Veri modeli Faz 1'de kurulur.

### 4.8 Ziyaretçi İSG
Bölüm 8 (Faz 2).

### 4.9 Raporlama ve Bildirim
Bölüm 10.

---

## 5. Pozisyon Kartı Şablonu

Her pozisyon için aynı yapıda bir kart doldurulur. Yazılım bu alanları form olarak sunar. **Boş zorunlu alan varken kart yayına gönderilemez.** Kartın 1–12. bölümleri teorik eğitimin içeriği olur, 13. bölüm eğitim planını oluşturur.

| # | Bölüm | İçerik | Zorunlu | Veri yapısı |
|---|---|---|---|---|
| 1 | Künye | Pozisyon adı, kodu, departman, bağlı olduğu amir pozisyonu, vekil pozisyonu, yaka tipi, vardiya düzeni | Evet | Yapısal alanlar |
| 2 | Amaç | Pozisyonun var olma nedeni (1–2 cümle) | Evet | Metin (en fazla 500 karakter) |
| 3 | Görev ve sorumluluklar | Madde madde görevler + sıklık (`continuous` / `daily` / `weekly` / `monthly`) | Evet | Liste |
| 4 | İş akışı | Adım adım; girdi → işlem → çıktı; varsa akış şeması görseli | Evet | Sıralı adımlar + opsiyonel görsel |
| 5 | Günlük/haftalık rutinler | Saatli rutin listesi | Evet | Liste (saat, gün(ler), açıklama) |
| 6 | Raporlama | Hangi rapor, kime, ne sıklıkla, hangi format/sistem, örnek dolu form | Evet | Liste + `form_template` içerik bağlantısı |
| 7 | Ekipman ve sistemler | Makine, el aleti, yazılım, form listesi | Evet | Liste (yetkinlik tanımlarına bağlanabilir) |
| 8 | Kritik noktalar | Sık yapılan hatalar, kalite kritik noktalar, "asla yapma" listesi | Evet | Liste (tür: hata / kalite / yasak) |
| 9 | İSG | Riskler, zorunlu KKD, talimatlar, LOTO, acil durum görevleri | Evet | Liste + İSG içerik bağlantıları |
| 10 | Yetkinlik gereksinimi | Belge, ehliyet, mesleki yeterlilik | Hayır | Liste |
| 11 | Performans göstergeleri | Değerlendirme ölçütleri | Hayır | Liste |
| 12 | İletişim | Kime, hangi durumda başvurulur | Evet | Liste (durum → pozisyon/kişi) |
| 13 | Eğitim planı | Teorik modüller, pratik görevler, sınavlar, süreler | Evet | Plan (Bölüm 4.3) |

- Kartın akışı içerikle aynıdır (Bölüm 4.2). **9. bölüm önceki sürüme göre değiştiyse (ilk sürümde her zaman) İSG uzmanı onayı gerekir.**
- Her kart sürümünde sürüm no, hazırlayan, onaylayanlar, yayın tarihi ve **son gözden geçirme tarihi** tutulur. Değişiklik yapmadan "gözden geçirdim" kaydı (kapsamdaki bölüm sorumlusu; değiştirilemez `position_card_reviews` kaydı) da son gözden geçirme tarihini günceller. Bu tarih 12 aydan eskiyse kart "içerik güncellik" raporuna düşer.
- Kart, kursiyere teorik eğitimde bölüm bölüm okunacak içerik olarak sunulur (her bölüm ayrı tamamlama adımıdır).

---

## 6. Sınav ve Değerlendirme Kuralları

Personel ancak teorik ve pratik sınavın **ikisini de** geçerse "işe başlayabilir" onayı alabilir. Aşağıdaki değerler varsayılandır. Hepsi parametredir ve **plan (pozisyon) bazında geçersiz kılınabilir**.

| Kural | Teorik sınav | Pratik sınav |
|---|---|---|
| Şekil | Faz 1: **çoktan seçmeli (tek doğru)**, **doğru/yanlış**. Faz 2: eşleştirme, görselde işaretleme | Değerlendirme formu: her kritere puan (0–N) veya Yapabildi/Yapamadı |
| Değerlendiren | Sistem, otomatik | Pratik eğitmen (1. imza) + bölüm sorumlusu (2. imza) |
| Soru/kriter sayısı | 20 soru, bankadan rastgele | Pozisyonun pratik görev listesinden türetilir (görev = kriter) |
| Süre | 30 dakika | Gerçek iş süresi (süre sınırı yok) |
| Geçme notu | 70/100 | 80/100 |
| İSG kritik | İSG kritik soru yanlışsa toplam puan ne olursa olsun kalır | Kritik görev "Yapamadı" ise sınav kalır |
| Tekrar hakkı | 3 hak. Her başarısızlıkta ilgili teorik modül tekrar açılır, 24 saat bekleme | 2 hak. Ek pratik eğitimden sonra |
| Kayıt | Denemenin soruları (sürüm), şık sırası, cevaplar, süre, IP, cihaz, sekme çıkışları, sesli okuma kullanımı, gözetmen | Form, değerlendiriciler, tarih, fotoğraf/not, imzalar |

**Ek kurallar**
- Soru başına alanlar: konu, zorluk (1–3), "İSG kritik", pozisyon/modül etiketleri. Rastgele çekimde **konular arasında dengeli dağıtım** yapılır: N soru konu sayısına bölünür, artan sorular rastgele konulara verilir, her konuda zorluk karışık seçilir.
- Plan yayınlanırken soru havuzu sınav soru sayısının 2 katından azsa uyarı verilir (kaynak doküman önerisi: pozisyon başına en az 40 soru).
- Soru ve şıklar her denemede karıştırılır. Denemede soru **sürümü** saklanır; soru sonradan düzenlenirse geçmiş deneme etkilenmez (kullanılmış soru düzenlenince yeni sürüm oluşur).
- İSG kritik veya `is_ohs` sorular İSG uzmanı onayıyla aktifleşir. Diğer sorular bölüm sorumlusu kaydedince aktiftir.
- **Kopya önlemi:** sekmeden/uygulamadan çıkış (`visibilitychange`, `blur`) zaman damgasıyla kaydedilir ve sonuç ekranında değerlendiriciye gösterilir. Sınavı otomatik bitirmez.
- **Gözetmen kodu:** gözetmen (trainer, section_manager, ohs_specialist, hr) kendi ekranında 6 haneli, süreli (varsayılan 2 saat) bir oturum kodu üretir. Kursiyer sınavı bu kodla başlatır. Gözetmen zorunluluğu plan bazında açılıp kapatılır (varsayılan: açık). Denemede gözetmen kimliği saklanır.
- **Sesli okuma:** tarayıcının Web Speech API'si ile yapılır (veri dışarı çıkmaz). Soru ve şıklar sesli okunabilir. Kullanıldıysa denemede işaretlenir. Cihazda Türkçe ses yoksa kullanıcıya uyarı gösterilir. Eğitim odası bilgisayarlarına Türkçe ses paketi kurulmalıdır (kurulum kılavuzu).
- **Süre dolunca** verilen cevaplarla otomatik teslim edilir. Bağlantı koparsa süre sunucuda işlemeye devam eder; cevaplar her seçimde sunucuya kaydedilir.
- **Kalınca (karar #63):** sınavın ön koşulu olan en yakın teorik modüller "tekrar gerekli" olur ve aynı sabit sürümlerle yeni bir turda yeniden açılır; adımlar yeniden "okudum, anladım" ile onaylanır (ara değerlendirme tekrarlanmaz). Yeni deneme için hem bekleme süresi dolmalı hem bu modüller tamamlanmalıdır.
- **Gözetmen kodu denemeleri (karar #62):** kod, geçerlilik süresi boyunca her sınav için kullanılabilir; gözetmen sınava giren kişi olamaz. Kursiyer başına `proctor.code_max_failures` hatalı koddan sonra `proctor.code_lock_min` dakika kilit.
- **Tüm haklarda başarısızlık:** atama `awaiting_decision` olur (Bölüm 3.1; karar ekranı 1.7).
- Ek hak tanınırsa gerekçe ve tanıyan kişi kaydedilir; hak sayacı yeni bir `attempt_grant` kaydıyla artar.

---

## 7. Değiştirilemezlik ve Denetim

- **Değiştirilemez kayıtlar:** teslim edilmiş sınav denemeleri ve cevapları, pratik görev işaretlemeleri, pratik sınav sonuçları, imzalar, onaylar/retler, işe başlama kararları, sertifikalar, sınıf eğitimi kayıtları (onaydan sonra), KVKK onayları, ziyaretçi onayları.
  - Bu tablolarda `UPDATE`/`DELETE`, veritabanı trigger'ıyla reddedilir. Tek istisna izinli durum geçişleridir (ör. denemenin `in_progress → submitted` olması); trigger bunları sütun bazında kontrol eder.
  - **Düzeltme:** yeni bir `corrections` kaydı açılır (hedef kayıt, gerekçe, yapan, yeni değer). Raporlar düzeltilmiş değeri, denetim ekranı ise her ikisini gösterir.
- **Denetim kaydı (`audit_log`):** tüm iş tablolarında genel bir trigger INSERT/UPDATE/DELETE için kim, ne zaman, tablo, kayıt kimliği, eski ve yeni değeri yazar. Uygulama her transaction başında `set_config('app.actor_id', ...)` ve `app.request_id` ayarlar. Hassas alanlar (TC, şifre özeti) denetim kaydına maskeli yazılır.
  - TC kimlik numarasının tam hâlinin görüntülenmesi ayrıca uygulama seviyesinde loglanır.
  - `audit_log` uygulama veritabanı kullanıcısı için yalnızca INSERT ve SELECT yetkilidir (UPDATE ve DELETE yetkisi verilmez).
- **İmza:** giriş yapmış kullanıcının kimliği + zaman damgası + IP + cihaz bilgisi, imzalanan kaydın içerik özeti (SHA-256) ile birlikte saklanır. Pratik sınavda kursiyer ve iki değerlendirici, ziyaretçi onayında ise ziyaretçi ekrana parmakla imza da çizer; imza PNG olarak saklanır. Nitelikli e-imza kullanılmaz.

---

## 8. Ziyaretçi İSG Modülü (Faz 2)

Tesise giren her ziyaretçi, girişten önce kısa İSG bilgilendirmesini izleyip kuralları onaylamadan ziyaretçi kartı alamaz.

### 8.1 Ziyaretçi Tipleri (parametre olarak yönetilir)
| Tip | Örnek | İçerik | Süre (öneri) | Kontrol sorusu | Geçerlilik |
|---|---|---|---|---|---|
| `office` – Ofis ziyaretçisi | Müşteri, tedarikçi toplantısı | Acil durum, toplanma alanı, ofis dışına refakatsiz girmeme | 2–3 dk | Yok, onay yeterli | Ziyaret günü |
| `site` – Saha ziyaretçisi | Müşteri denetimi, fabrika turu | Yukarıdakiler + yaya yolları, KKD, fotoğraf yasağı, forklift trafiği | 5 dk | 3 soru (hepsi doğru olmalı, sınırsız tekrar) | Ziyaret günü |
| `contractor` – Taşeron / servis | Bakım, montaj, temizlik firması çalışanı | Saha içeriği + çalışma izni, LOTO, sıcak çalışma, yüksekte çalışma, atık | 15–20 dk | 10 soru, geçme notu 80 | 1 yıl (geçerliyken yeniden sorulmaz) |
| `intern` – Stajyer / geçici | Okul stajyeri, kısa süreli çalışan | Personel genel İSG eğitiminin kısaltılmışı | Pozisyona göre | Teorik sınav | Staj süresi |

- **Stajyer**, ziyaretçi akışıyla değil **personel** olarak (istihdam tipi `intern`, bitiş tarihi = staj bitişi) kaydedilir ve kısaltılmış planı alır. Bilgilendirme ekranında yalnızca tip seçeneği olarak görünür.
- İçerik her tip için **Türkçe ve İngilizce** zorunludur (FG-8.2). Ziyaretçi dil seçer.

### 8.2 Akış
1. **Ön kayıt:** ev sahibi personel veya güvenlik ziyaretçiyi girer (ad, firma, telefon, e-posta, tip, ev sahibi, tarih). E-posta varsa bilgilendirme bağlantısı e-postayla gider. **SMS yoktur.** E-posta yoksa ziyaretçi bilgilendirmeyi kapıdaki tabletten yapar.
2. Ön kayıt yoksa ziyaretçi kapıdaki tablet veya QR (kendi telefonu) ile kendini kaydeder.
3. **Bilgilendirme:** video/kartlar izlenir; atlama yapılamaz (video için %100, kartlarda her kartta en az bekleme süresi).
4. **Kontrol soruları** (tipe göre).
5. **Kurallar ve KVKK aydınlatma metni onayı:** onay kutusu + parmakla imza + zaman damgası.
6. **Kapı:** güvenlik ekranda "bilgilendirme tamam" durumunu görür, kimliği kontrol eder, ziyaretçi kart no'sunu ve verilen KKD'yi girer → giriş saati.
7. Ev sahibine "ziyaretçiniz geldi" bildirimi gider (uygulama içi + push + e-posta).
8. **Çıkış:** güvenlik çıkış saatini işaretler; kart iadesi işaretlenir.

### 8.3 Ek Gereksinimler
- **FG-8.1 Tesis içindekiler / tahliye yoklaması:** anlık liste (ziyaretçi + taşeron). Telefondan açılır; "toplanma alanında" işaretlenir. Son liste cihazda önbellekte tutulur ve bağlantı yoksa okunabilir. İşaretleme bağlantı gerektirir; kâğıt yedeği için PDF çıktısı alınabilir. Personelin tesis içi bilgisi PDKS/İK entegrasyonuyla Faz 3'te eklenir.
- **FG-8.2** İçerik en az TR + EN.
- **FG-8.3 Taşeron firma kartı:** unvan, vergi no, sorumlu kişi, iletişim, sözleşme bitişi, çalışanların eğitim durumu ve geçerlilik tarihleri.
- **FG-8.4 Kara liste / giriş yasağı:** kişi (kimlik no özeti ile eşleşir), gerekçe, koyan kişi, tarih, bitiş (opsiyonel). Kaldırma da gerekçeli kayıttır. Yalnızca ohs_specialist ve security koyabilir.
- **FG-8.5** Ziyaretçi verisi saklama süresi sonunda otomatik anonimleştirilir (Bölüm 12.3).
- **Kimlik eşleştirme:** taşeron çalışanının yeniden girişte tanınması için kimlik no (TC/pasaport) şifreli saklanır. Eşleştirme, anahtarlı özet (HMAC) ile yapılır. Ekranda maskeli gösterilir.
- **Kiosk modu:** `/kiosk` rotası. Sysadmin'in kaydettiği tablette cihaz token'ıyla açılır; tam ekran ve sabitlenmiş tarayıcı kullanılır (Android ekran sabitleme / kiosk tarayıcı); her ziyaretçiden sonra oturum sıfırlanır.

---

## 9. Ekranlar

Kursiyer ve pratik eğitmen ekranları telefon ve tablette rahat kullanılmalıdır (min 48px dokunma alanı, büyük butonlar, görsel ağırlık). Yönetim ekranları masaüstü önceliklidir ama mobilde de çalışır.

| # | Ekran | Kullanan | Cihaz | Temel işlev | Rota | Faz |
|---|---|---|---|---|---|---|
| 1 | Giriş | Tümü | Tümü | Sicil no + şifre, "ortak cihaz" seçeneği, ilk girişte şifre değiştirme | `/login` | 1 |
| 2 | Kursiyer ana sayfa | Kursiyer | Telefon, PC | "Sıradaki adımın", ilerleme çubuğu, kalan süre, sertifikalarım, okuma görevleri | `/learn` | 1 |
| 3 | İçerik görüntüleme | Kursiyer | Tümü | Video/PDF/metin, ilerleme takibi, "okudum, anladım", ara değerlendirme | `/learn/[assignmentId]/[moduleId]` | 1 |
| 4 | Teorik sınav | Kursiyer | PC, tablet, telefon | Gözetmen kodu, süre sayacı, soru gezinme, sesli okuma, sonuç | `/exam/[attemptId]` | 1 |
| 5 | Pratik görevlerim | Kursiyer | Telefon | Görev listesi, seviye durumu | `/learn/practice` | 1 |
| 6 | Eğitmen paneli | Eğitmen | Tablet, telefon | Kursiyerlerim, işaretlenmeyi bekleyen görevler, gözetmen kodu, sınıf eğitimi kaydı | `/trainer` | 1 |
| 7 | Pratik değerlendirme formu | Eğitmen, b. sorumlusu | Tablet | Kriter bazlı puan, not, fotoğraf, imza | `/trainer/evaluations/[id]` | 1 |
| 8 | Bölüm paneli | B. sorumlusu | PC | Ekibin ilerlemesi, hedef tarihi geçenler, onay bekleyenler (içerik + personel) | `/manage` | 1 |
| 9 | İşe başlama onayı | B. sorumlusu | PC | Teorik + pratik sonuçlar tek ekranda, onay/ret | `/manage/readiness/[assignmentId]` | 1 |
| 10 | Organizasyon yapısı | İK, sysadmin | PC | Departman/bölüm/pozisyon ağacı | `/admin/org` | 1 |
| 11 | Pozisyon kartı editörü | B. sorumlusu | PC | Bölüm 5 formu, sürüm geçmişi, karşılaştırma, onaya gönder | `/manage/positions/[id]/card` | 1 |
| 12 | İçerik kütüphanesi | İçerik sahipleri | PC | Yükle, etiketle, sürümle, ara, onay kuyruğu | `/manage/library` | 1 |
| 13 | Eğitim planı tasarımcısı | İK, b. sorumlusu | PC | Modülleri sürükle-bırak sırala, ön koşul, süre, sınav parametreleri | `/manage/positions/[id]/plan` | 1 |
| 14 | Soru bankası | İSG, b. sorumlusu (İK okur) | PC | Soru ekle, etiketle, Excel'den içe aktar, onay | `/manage/questions` | 1 |
| 15 | Personel listesi ve atama | İK | PC | Excel içe aktarma, pozisyon ata, plan başlat, şifre sıfırla, karar bekleyenler | `/admin/people` | 1 |
| 16 | Yetkinlik matrisi | Yöneticiler | PC | Personel × yetkinlik, süresi dolanlar renkli | `/reports/competency` | 3 |
| 17 | Ziyaretçi kayıt | Güvenlik, ev sahibi | PC, tablet | Ön kayıt, giriş-çıkış, kart no, KKD | `/security/visits`, `/visits` (ev sahibi) | 2 |
| 18 | Ziyaretçi bilgilendirme | Ziyaretçi | Kapı tableti, telefon | Dil seçimi, video, sorular, onay/imza | `/kiosk`, `/v/[token]` | 2 |
| 19 | Tesis içindekiler / tahliye yoklaması | Güvenlik, İSG | Telefon | Anlık liste, "toplanma alanında" | `/security/evacuation` | 2 |
| 20 | Raporlar ve ayarlar | İK, İSG, BT | PC | Bölüm 10 raporları, parametreler, roller, denetim kaydı | `/reports`, `/admin/settings` | 1 (temel) |

Ek ekranlar: eğitimi bekleyenler (`/admin/people/waiting`), ekip ilerlemesi (`/manage/team`), sınıf eğitimi kayıtları (`/manage/classroom`), okuma görevi (`/learn/reread/[taskId]`), ortak cihazlar (`/admin/devices`), pozisyon listesi ve kart özeti (`/manage/positions`, `/manage/positions/[id]`, sürüm karşılaştırma `/manage/positions/[id]/compare`), modül kütüphanesi (`/manage/modules`), içerik sürüm karşılaştırma (`/manage/library/[id]/compare`), herkese açık sertifika doğrulama (`/verify/[token]`, Faz 1), sertifika şablonu / imza yetkilileri (`/admin/certificates`), şifremi unuttum ve yeni şifre (`/forgot-password`, `/reset-password/[token]`), rapor (`/reports/[kind]`), denetim kaydı (`/admin/audit`), profil ve şifre değiştirme, bildirim merkezi, KVKK aydınlatma onayı (ilk girişte).

**Navigasyon:** tek uygulama kabuğu kullanılır; menü kullanıcının rollerine göre oluşur. Mobilde alt sekme bar'ı, masaüstünde yan menü olur. Birden fazla rolü olan kullanıcı tüm yetkili bölümleri görür.

---

## 10. Raporlar ve Bildirimler

### 10.1 Raporlar
Tüm raporlar ekranda filtrelenebilir ve **Excel (xlsx) / PDF** olarak dışa aktarılabilir. İSG raporları denetimde doğrudan sunulacak formattadır. Her dışa aktarma denetim kaydına yazılır.

| Rapor | Kime | İçerik | Faz |
|---|---|---|---|
| Eğitim ilerleme | İK, b. sorumlusu | Personel bazında atanan / tamamlanan / hedef tarihi geçen modüller | 1 |
| Sınav sonuçları | İK, b. sorumlusu | Deneme sayısı, puan, en çok yanlış yapılan sorular (içerik iyileştirme) | 1 |
| İSG eğitim kayıt defteri | İSG | Personel, eğitim konusu, tarih, süre, eğitmen, geçerlilik, yöntem (uzaktan / yüz yüze); yasal kayıt formatında. Kişi başı yıllık İSG saati ve tehlike sınıfına göre asgari saat karşılaştırması | 1 |
| İşe başlama süresi | İK, yönetim | İşe girişten "işe başlayabilir" onayına kadar geçen gün, pozisyon bazında | 1 |
| Süresi dolacak eğitim/sertifika | İSG, İK | Önümüzdeki 30/60/90 gün | 2 |
| Ziyaretçi kayıt defteri | Güvenlik, İSG | Tarih aralığında ziyaretçiler, firma, ev sahibi, giriş/çıkış, bilgilendirme onayı | 2 |
| Taşeron uygunluk | İSG, satın alma* | Firma bazında eğitimi geçerli/geçersiz çalışan sayısı | 2 |
| İçerik güncellik | B. sorumluları | Son gözden geçirmesi 12 aydan eski pozisyon kartları | 2 |
| Yetkinlik matrisi | Yöneticiler | Personel × makine/iş, yetki durumu | 3 |

\* "Satın alma" ayrı bir rol değildir. Bu rapor, İSG veya İK tarafından dışa aktarılarak paylaşılır.

### 10.2 Bildirimler
Kanallar: **uygulama içi** (her zaman), **web push** (PWA, Faz 2) ve **e-posta** (Microsoft Graph; kullanıcının e-postası varsa). **SMS yoktur.** Her olay türü için hangi kanalların kullanılacağı sysadmin parametresidir. Kullanıcı push bildirimlerini kapatabilir; zorunlu olaylarda uygulama içi bildirim her zaman gider.

| Alıcı | Olay | Faz |
|---|---|---|
| Kursiyer | Yeni modül atandı, sınav hakkı açıldı, sınav sonucu, sertifika hazır | 1 |
| Kursiyer | Tekrar eğitimi zamanı geldi, okuma görevi | 2 |
| Pratik eğitmen | Yeni kursiyer atandı | 1 |
| Pratik eğitmen | 3 gündür işaretlenmeyen görev var (parametre) | 2 |
| Bölüm sorumlusu | İşe başlama onayı bekleyen personel, onay bekleyen içerik, pratik sınav 2. imza | 1 |
| Bölüm sorumlusu | Hedef tarihi geçen eğitim | 2 |
| İK + b. sorumlusu (+ İSG) | Tüm haklarda başarısız personel | 1 |
| İSG uzmanı | Onay bekleyen İSG içeriği/sorusu | 1 |
| İSG uzmanı | Süresi dolan İSG eğitimi, kara listeye alınan kişi | 2 |
| Ev sahibi | Ziyaretçiniz geldi / bilgilendirmeyi tamamladı | 2 |
| Yönetici (b. sorumlusu) | Haftalık özet e-postası: ekibinin durumu (Pazartesi 08:00) | 2 |

---

## 11. Teknik Mimari

### 11.1 Stack
| Katman | Seçim |
|---|---|
| Uygulama | **Next.js 16** (App Router, Server Components, Server Actions, `proxy.ts`), TypeScript strict, React 19 |
| UI | Tailwind CSS 4, shadcn/ui (`base-nova`), lucide ikonlar, vaul (mobil bottom sheet) |
| Veritabanı | **PostgreSQL 17**, **Drizzle ORM** + drizzle-kit migration |
| Kimlik doğrulama | **Better Auth** (username eklentisi = sicil no, scrypt şifre özeti, veritabanı oturumları) |
| Dosya depolama | **Garage** (S3 uyumlu, tek düğüm, private bucket, süreli imzalı URL). MinIO artık hazır imaj dağıtmadığı için tercih edilmedi |
| Arka plan işleri | **pg-boss** (Postgres tabanlı kuyruk + zamanlanmış işler), ayrı `worker` süreci |
| Video | ffmpeg (worker konteynerinde) → HLS 360p/720p, oynatıcı: hls.js |
| PDF | `@react-pdf/renderer` (sertifika, katılım belgesi, raporlar), QR: `qrcode` |
| Excel | `exceljs` (içe/dışa aktarma) |
| E-posta | Microsoft Graph API (`Mail.Send`, uygulama izni) |
| PWA | Serwist (yalnızca uygulama kabuğu ve statik varlık önbelleği; çevrimdışı yazma yok), Web Push (VAPID, Faz 2) |
| Sesli okuma | Web Speech API (tarayıcı) |
| Doğrulama | Zod (tüm Server Action ve Route Handler girdileri) |
| i18n | next-intl (`tr` varsayılan, `en`; URL'de `tr` öneki yok) |
| Test | Vitest (birim + entegrasyon, gerçek Postgres konteyneri), Playwright (mobil + masaüstü) |
| Barındırma | Türkiye'de Linux VM, Docker Compose: `app`, `worker`, `postgres`, `garage`, `caddy` (HTTPS, Let's Encrypt) |
| Gözlemlenebilirlik | Yapılandırılmış JSON loglar (pino), iş hatası alarmı (uygulama içi bildirim). Self-hosted hata takibi (GlitchTip) pilot sonrası (karar #104) |

### 11.2 Mimari
```
┌─────────────────────────────── Tarayıcı / PWA ───────────────────────────────┐
│  Kursiyer · Eğitmen (telefon/tablet) · Yönetim (PC) · Kiosk tablet (Faz 2)   │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │ HTTPS (Caddy)
┌──────────────────────────────────▼───────────────────────────────────────────┐
│ app (Next.js)                                                                │
│  proxy.ts: oturum varlığı, i18n, şifre değiştirme zorunluluğu yönlendirmesi  │
│  Server Components / Server Actions → src/server/services (iş kuralları)     │
│    → src/server/authz (rol + kapsam kontrolü)  → Drizzle → PostgreSQL        │
│  Route Handlers: /api/auth/*, /api/media/*, /api/verify/*, /api/kiosk/*      │
└───────────────┬───────────────────────────────┬──────────────────────────────┘
                │                               │
┌───────────────▼──────────────┐   ┌────────────▼──────────────┐   ┌──────────┐
│ PostgreSQL 17                 │   │ worker (pg-boss)           │──▶│ MS Graph │
│  iş tabloları + audit trigger │◀──│  video dönüştürme (ffmpeg) │   │ (e-posta)│
│  değiştirilemezlik trigger'ı  │   │  PDF üretimi, bildirimler  │   └──────────┘
│  pg-boss şeması               │   │  süre dolumu, anonimleştir │
└───────────────────────────────┘   └────────────┬──────────────┘
                                                 │
                                    ┌────────────▼──────────────┐
                                    │ Garage (medya, belgeler,  │
                                    │ imzalar, taranmış formlar)│
                                    └───────────────────────────┘
```

### 11.3 Yetkilendirme
- Postgres RLS **kullanılmaz**. Yetki tek bir katmanda toplanır: `src/server/authz`.
  - `requireUser()`, `requireRole(...)`, `can(user, action, resource)`.
  - Kapsam filtreleri sorgu yardımcıları olarak yazılır: `scopedPersonnel(user)`, `scopedPositions(user)`.
- **Veri erişimi yalnızca `src/server/services` üzerinden yapılır.** Bileşenler ve Server Action'lar doğrudan Drizzle sorgusu yazmaz. Her servis fonksiyonu ilk iş olarak yetki kontrolü yapar.
- `proxy.ts` yalnızca **iyimser** kontrol yapar (oturum çerezi var mı, şifre değişikliği zorunlu mu). Asıl yetki kontrolü sunucu tarafındaki servislerdedir.
- Durum geçişleri (içerik yayını, sınav teslimi, onaylar, atama durumları) yalnızca servis fonksiyonlarıyla ve tanımlı durum makineleriyle (`src/server/state/`) yapılır.
- Entegrasyon testleri her rol için "göremez/yapamaz" senaryolarını kapsar (Bölüm 13.2).

### 11.4 Kimlik Doğrulama ve Oturum
- Giriş: **sicil no + şifre.** Açık kayıt yoktur; hesapları yalnızca İK (veya sysadmin) açar.
- Şifre politikası (parametre): en az 8 karakter, yaygın şifre listesi kontrolü. Yalnızca rakamdan oluşan şifreye izin verilir (düşük okuryazarlık için), ama 8 haneden kısa olamaz.
- 5 hatalı denemeden sonra 15 dk kilit (`auth.lockout_*`); aynı IP'den 15 dk içinde 20 başarısız deneme sonrası geçici engel (`auth.ip_*`). Tüm denemeler değiştirilemez `login_attempts` tablosuna yazılır (sonuç: başarılı, bilinmeyen sicil, yanlış şifre, kilitli, pasif, IP sınırı). Yanlış şifre ve bilinmeyen sicil kullanıcıya aynı genel mesajla bildirilir.
- İlk girişte ve İK sıfırlamasından sonra şifre değiştirmek zorunludur.
- Şifre sıfırlama: İK geçici şifre üretir (Faz 1). E-postası olan kullanıcı e-posta bağlantısıyla kendi sıfırlayabilir (Faz 1). **SMS yoktur.**
- Oturum: kişisel cihazda 30 gün (kayan süre), ortak cihazda 10 dk işlemsizlik. Pasif personelin tüm oturumları sonlandırılır.
  - Süre, oturumun `last_seen_at` alanıyla sunucuda uygulanır (`session.*` parametreleri). Better Auth'un kendi yenilemesi kapalıdır; çerezin mutlak üst sınırı 1 yıldır.
  - Şifre değişince diğer tüm oturumlar kapanır; mevcut cihazın ortak cihaz bilgisi korunur.
- **Better Auth'un HTTP rotası (`/api/auth`) açılmaz.** Giriş, çıkış ve şifre değiştirme Server Action → `src/server/services/auth.ts` üzerinden yapılır; kilit ve IP sınırı böylece atlatılamaz. Better Auth'un kendi hız sınırlayıcısı ve telemetrisi kapalıdır.
- Better Auth her hesap için e-posta istediğinden hesap e-postası sicil no'dan üretilen geçersiz bir adrestir (`<sicil>@personel.invalid`); kişinin gerçek e-postası `personnel` tablosundadır.
- Faz 3: Microsoft 365 (Entra ID) ile tek oturum; sicil no ↔ M365 hesabı eşleştirmesi.

### 11.5 Dosyalar ve Medya
- Tüm dosyalar Garage'daki private bucket'ta (`akademi-private`, önekler: `media/`, `documents/`, `signatures/` …) tutulur, istemciye 5 dk geçerli imzalı URL verilir (`/api/media/<id>/<file|download|image|thumb|poster>` yetki kontrolünden sonra yönlendirir). HLS için `/api/media/<id>/hls/*.m3u8` her istekte yetki kontrolü yapıp oynatma listesini imzalı segment URL'leriyle yeniden yazar. **İstisna:** segment URL'leri max(1 saat, video süresi × 2) geçerlidir; aksi halde uzun videolarda oynatma ortasında süre dolar.
- Tarayıcıya verilen imzalı URL'ler `S3_PUBLIC_ENDPOINT` adresini kullanır (boşsa `S3_ENDPOINT`); bucket CORS'u yalnızca `APP_URL`'e izin verir.
- Yükleme: istemciden doğrudan Garage'a imzalı PUT (çok parçalı yükleme). Yükleme tamamlanınca worker işi tetiklenir (video dönüştürme, görsel küçültme, PDF sayfa sayısı).
- Görsellerde EXIF konum verisi silinir.

### 11.6 Kod Düzeni
```
src/
├─ app/
│  ├─ [locale]/
│  │  ├─ (public)/login, verify/[token], v/[token] (ziyaretçi, F2), kiosk (F2)
│  │  └─ (app)/                         # oturum gerekli, rol bazlı menü
│  │     ├─ learn/ , [assignmentId]/[moduleId], practice
│  │     ├─ exam/[attemptId]
│  │     ├─ trainer/ , evaluations/[id], classroom
│  │     ├─ manage/ , library, questions, positions/[id]/card|plan, readiness/[assignmentId]
│  │     ├─ admin/ , org, people, roles, settings, audit, devices
│  │     ├─ security/ visits, evacuation (F2)
│  │     ├─ reports/
│  │     └─ profile, notifications
│  ├─ api/ (auth, media, verify, kiosk, cron-health)
│  ├─ manifest.ts
│  └─ sw.ts                              # Serwist
├─ features/<alan>/ (components/, actions.ts, schemas.ts)   # ui + server action ince katman
├─ server/
│  ├─ db/ (schema/*.ts, client.ts, migrations/ → drizzle/)
│  ├─ auth/ (better-auth yapılandırması)
│  ├─ authz/ (roller, kapsam, can())
│  ├─ services/<alan>.ts                # iş kuralları, transaction, audit actor
│  ├─ state/                            # durum makineleri
│  ├─ jobs/ (pg-boss iş tanımları)
│  ├─ storage/ (S3 istemcisi — Garage)
│  ├─ mail/ (Graph istemcisi)
│  └─ crypto/ (TC şifreleme, HMAC)
├─ components/ (ui/, app-shell/, mobile/)
├─ lib/ (utils, dates — Europe/Istanbul)
└─ worker/index.ts                      # pg-boss worker giriş noktası
messages/ (tr.json, en.json)
drizzle/ (SQL migration dosyaları + elle yazılmış trigger migration'ları)
docker/ (compose.yml, compose.prod.yml, Caddyfile, worker.Dockerfile, app.Dockerfile)
tests/ (unit/, integration/, e2e/)
docs/ (SPEC.md, source/, runbooks/)
```

---

## 12. Veri Modeli

Tablo ve sütun adları İngilizce `snake_case`. Tüm zaman alanları `timestamptz` tipindedir; tarih hesapları `settings.timezone` (varsayılan `Europe/Istanbul`) ile yapılır. Birincil anahtarlar `uuid` (v7). Aşağıdaki liste mantıksal modeldir; kesin sütunlar Drizzle şemasında tanımlanır.

### 12.1 Varlıklar
**Organizasyon ve kişiler**
- `org_units`: id, parent_id, kind (`department`|`section`), name, code (unique, büyük harf ASCII), responsible_user_id, is_active — iki seviye: departmanın üst düğümü yok, bölümün üst düğümü bir departman (veritabanı kısıtı); aynı üst düğümde ad benzersiz
- `positions`: id, org_unit_id, name, code (unique), supervisor_position_id, deputy_position_id, collar_type (`blue`|`white`), shift_pattern, status (`active`|`passive`)
- `users` (Better Auth: `user`, `session`, `account`, `verification`)
- `personnel`: user_id (PK), sicil_no (unique, değiştirilemez), full_name, national_id_enc (AES-256-GCM, `v<anahtar sürümü>:<base64>`), national_id_hmac (unique), national_id_masked, phone, email, position_id (boş olabilir: pozisyonsuz personele eğitim atanamaz), employment_type (`employee`|`intern`), hire_date, end_date (ayrılanda zorunlu), status (`active`|`passive`|`terminated`), source (`excel`|`manual`|`hr_sync`), training_required (yeni işe giren → 1.4'te plan atanır), must_change_password, anonymized_at (saklama süresi dolunca; karar #120)
- `user_roles`: user_id, role, granted_by, granted_at
- `role_scopes`: user_id, role (yalnızca `section_manager`, veritabanı kısıtı), org_unit_id
- `data_access_log`: id, at, actor_id, subject_user_id, field (ör. `national_id`), request_id — **değiştirilemez** (tam TC görüntüleme kaydı)
- `login_attempts`: id, at, sicil_input, user_id, ip, user_agent, result — **değiştirilemez** (güvenlik kaydı)
- `devices`: id, kind (`shared_pc`|`kiosk`), name, token_hash, registered_by, revoked_at

**İçerik**
- `contents`: id, type, title, owner_org_unit_id (null = ortak), is_ohs, is_common, common_target (`all`|`blue`|`white`), current_published_version_id, archived_at
- `content_versions`: id, content_id, version, status (`draft`|`section_review`|`ohs_review`|`published`|`rejected`|`superseded`), body (jsonb; tipine göre), change_note, require_reread, created_by, submitted_at, published_at
- `content_version_locales`: content_version_id, locale, title, body, media_asset_ids
- `media_assets`: id, bucket, object_key, mime, size, kind, status (`pending_upload`|`uploaded`|`processing`|`ready`|`failed`|`purged`), hls_manifest_key, duration_sec, width, height, created_by
- `tags`, `tag_types`, `content_tags`
- `approvals`: id, subject_type (`content_version`|`position_card_version`|`question_version`|`classroom_session`), subject_id, step (`section`|`ohs`), decision (`approved`|`rejected`|`auto_self`), comment, decided_by, decided_at — **değiştirilemez**

**Pozisyon kartı ve plan**
- `position_card_versions`: id, position_id, version, status (içerikle aynı), sections (jsonb, 2–12; Zod şemalı; yayında 1. bölüm künye kopyası eklenir), ohs_section_changed, change_note, created_by, submitted_by/at, published_at (kilit)
- `position_card_reviews`: card_version_id, note, reviewed_by, reviewed_at — **değiştirilemez** ("gözden geçirdim" kayıtları; son gözden geçirme = max(yayın, son kayıt))
- `modules`: id, kind (`theory`|`practice`|`theory_exam`|`practice_exam`), title, description, duration_min, is_ohs, remote_allowed, validity_months, owner_org_unit_id (null = ortak), common_target, common_sort_order, card_position_id (doluysa pozisyonun "Pozisyon kartı" modülü), archived_at — sürümsüz (karar #45)
- `module_contents`: module_id, content_id, sort_order (yayındaki sürüm atama anında sabitlenir)
- `quiz_questions`: id, module_id, sort_order, type (`single_choice`|`true_false`), stem, options, correct_index, explanation, archived_at — ara değerlendirme soruları modüle bağlıdır (karar #53); listeden çıkan soru arşivlenir
- `practice_tasks`: id, module_id, title, description, is_critical, sort_order, competency_id
- `training_plans`: id, card_version_id (1:1, kart sürümüyle birlikte sürümlenir), overrides (jsonb; plan bazında parametreler, ör. `videoWatchRatio`)
- `plan_modules`: plan_id, module_id, sort_order, is_required, prerequisite_module_ids (yalnızca plandaki önceki modüller), settings (jsonb; sınav modülünde soru sayısı, süre, geçme notu, hak, bekleme, gözetmen — boş alan = genel parametre). Ayrı `exam_configs` tablosu yerine sınav ayarları plan modülünde tutulur; böylece ayar değişikliği de kart onayından geçer. Konu/pozisyon filtresi 1.5'te eklenir.
- Yayınlanmış kartın planı ve plan modülleri trigger ile değiştirilemez. Ortak modüller plana yazılmaz; atama anında yaka tipine göre eklenir (karar #46).

**Atama ve ilerleme**
- `assignments`: id, user_id, position_id, card_version_id, plan_id, reason (`new_hire`|`position_change`|`recertification`|`extra_training`), trainer_user_id, start_date, target_date, status (`active`|`awaiting_readiness`|`awaiting_decision`|`completed`|`cancelled`), cancel_reason, cancelled_at/by, created_by — kişi başına tek açık atama (kısmi benzersiz indeks)
- `assignment_modules`: id, assignment_id, module_id, sort_order, is_common, modül ayarlarının kopyası (kind, title, duration_min, is_ohs, remote_allowed, validity_months, settings), is_required, prerequisite_module_ids (ortak modüller sıralı; ilk plan modülü zorunlu ortakları da bekler), pinned_task_ids (pratik), status (`locked`|`available`|`in_progress`|`completed`|`review_required`|`waived`), round (sınavda kalınca artar), unlocked_at, started_at, completed_at, completed_via (`online`|`classroom`|`carried_over`), carried_from_id, expires_at
- `assignment_items` (SPEC'teki content_progress): assignment_module_id, round, sort_order, kind (`content`|`card_section`), content_id + content_version_id (atama anında yayındaki sürüm) veya card_version_id + section_key, started_at, watched_ranges (izlenen aralıklar, saniye), progress_ratio, reached_end_at, acknowledged_at — "okudum, anladım" sonrası **değiştirilemez**
- `quiz_responses`: assignment_module_id, quiz_question_id, snapshot (soru, şıklar, doğru şık, açıklama — o anki metin), answer_index, is_correct, answered_at — **değiştirilemez**
- `reread_tasks`: user_id, content_id, content_version_id, due_date, acknowledged_at — onaydan sonra **değiştirilemez**
- `classroom_sessions`: id, module_id, trainer_user_id, session_date, duration_min, location, scanned_form_asset_id, notes, status (`draft`|`submitted`|`approved`|`rejected`), recorded_by, submitted_at, approved_at (kilit) — onay/ret `approvals` tablosunda
- `classroom_attendees`: session_id, user_id — onaylanınca **değiştirilemez**

**Sınav**
- `questions`: id, owner_org_unit_id, is_ohs, current_version_id, archived_at
- `question_versions`: id, question_id, version, type (`single_choice`|`true_false`; `matching`*|`hotspot`* Faz 2), stem, media_asset_id, options (jsonb, metin dizisi), correct_index, explanation, topic, difficulty (1–3), is_ohs_critical, status (`ohs_review`|`active`|`rejected`|`retired`), created_by — sınavda kullanılmış sürümün yalnızca durumu değişebilir, silinemez (trigger). Onay/ret `approvals` tablosunda
- `question_modules`: question_id, module_id (en az bir teorik modül; karar #59)
- `quiz_questions`: ara değerlendirme soruları (aynı yapı, ayrı havuz)
- `proctor_sessions`: id, proctor_user_id, code_hash (HMAC), location, created_at, expires_at, revoked_at
- `proctor_code_failures`: user_id, at — hatalı kod denemeleri (kilit sayacı) — **değiştirilemez**
- `exam_attempts`: id, assignment_module_id, attempt_no, proctor_session_id, proctor_user_id, question_count, duration_min, pass_score (deneme anındaki kurallar), started_at, deadline_at, submitted_at, submit_reason (`user`|`timeout`), score, passed, fail_reason (`score`|`ohs_critical`), ip, user_agent, tts_used, tab_leave_count — **teslimden sonra değiştirilemez**
- `exam_attempt_items`: attempt_id, sort_order, question_version_id, option_order (gösterilen sıra → asıl şık), answer_index (asıl şık), is_correct, answered_at — teslimden sonra **değiştirilemez**
- `exam_attempt_events`: attempt_id, kind (`tab_hidden`|`tab_visible`|`blur`|`reconnect`), at
- `attempt_grants`: assignment_module_id, extra_attempts, reason, granted_by, granted_at

**Pratik**
- `practice_marks`: id, assignment_module_id, practice_task_id, level (`demonstrated`|`supervised`|`independent`), direction (`up`|`down`), note (düşürmede gerekçe), photo_asset_ids, source (`trainer`|`exam_fail`|`readiness`), exam_result_id, marked_by, marked_at — **değiştirilemez**; görevin güncel seviyesi son kayıttır
- `practical_exam_results`: id, assignment_module_id, attempt_no, status (`draft`|`awaiting_second_signature`|`final`|`returned`), criteria (jsonb: görev kimliği, başlık kopyası, kritik mi, `pass`|`fail`, not), pass_score, score, passed, fail_reason (`score`|`critical`), photo_asset_ids, note, evaluator_id, trainee_signature_id, trainer_signature_id, submitted_at (1. imza: değerlendirme kilitlenir), manager_user_id, manager_signature_id, return_reason, finalized_at (kilit) — taslak silinebilir; 1. imzadan sonra yalnızca 2. imza/geri gönderme alanları değişir (trigger)
- `signatures`: id, signer_user_id (Faz 2: visitor_id), captured_by (imzanın alındığı oturum), subject_type, subject_id, role (`trainee`|`trainer`|`manager`), subject_hash (kanonik JSON'un SHA-256'sı), image_asset_id (PNG, `signatures/`), signed_at, ip, user_agent — **değiştirilemez**

**Onay, sertifika, yetkinlik**
- `readiness_decisions`: assignment_id, decision (`approved`|`rejected`), comment, reopen_module_ids (atama modülleri), decided_by, decided_at — **değiştirilemez**
- `decision_records` (tüm haklar bitince): assignment_id, decision (`extra_attempt`|`extra_training`|`end_process`), reason, exam_module_id, extra_attempts, reopen_module_ids, decided_by, decided_at — **değiştirilemez**; ek haklar ayrıca `attempt_grants`'a yazılır
- `certificates`: id, serial_no (belge no `JA-YYYY-000123`), user_id, kind (`position_competency`|`attendance`), assignment_id, assignment_module_id (katılım belgesi), position_id, title, snapshot (jsonb: ad, sicil, pozisyon, birim, kapsam, modüller, puanlar, onaylayan, imza yetkilileri — düzenlendiği anda dondurulur), issued_at, expires_at (boşsa süresiz), verify_token (128 bit), pdf_asset_id, approved_by, issued_by (boşsa sistem), status (`valid`|`revoked`; "süresi dolmuş" tarihten hesaplanır), revoked_reason, revoked_by, revoked_at (kilit) — yalnızca PDF bağlantısı (bir kez) ve iptal alanları yazılabilir; silinemez
- `competencies`: id, name, kind (`machine`|`task`), org_unit_id, archived_at (Faz 1'de yalnızca tablo; ekran Faz 3)
- `competency_grants`: user_id, competency_id, certificate_id, valid_until — **değiştirilemez**

**Ziyaretçi (Faz 2)**
- Ziyaretçi tipleri tablo değil, `visitor.types` parametresidir (karar #126): tip başına açık mı, soru sayısı, geçme notu, kart başına en az süre, geçerlilik (0 = ziyaret günü)
- `visitor_briefings`: id, visitor_type, version, published_at (kilit), published_by, created_by — tip başına tek taslak; yayınlanan **değiştirilemez**
- `visitor_briefing_cards`: briefing_id, sort_order, title_tr, body_tr, title_en, body_en, media_asset_id — paket yayınlanınca **değiştirilemez**
- `visitor_briefing_questions`: briefing_id, sort_order, stem_tr, stem_en, options_tr, options_en, correct_index — paket yayınlanınca **değiştirilemez**
- `contractor_companies`: name, tax_no (benzersiz), responsible_name, phone, email, contract_end, archived_at, created_by
- `visitors`: id, full_name, company_name, contractor_company_id, phone, email, id_kind (`tc`|`passport`), id_country, national_id_enc, national_id_hmac (benzersiz), national_id_masked, anonymized_at
- `visits`: id, visitor_id, visitor_type, host_user_id, planned_date, status (`planned`|`briefed`|`checked_in`|`checked_out`|`cancelled`), note, cancel_reason, cancelled_at/by, created_by — 2.3'te bilgilendirme/kapı alanları (token_hash, briefing_id, quiz_score, consent_id, signature_id, badge_no, ppe_issued, checked_in/out) eklenir
- `contractor_clearances`: visitor_id, valid_until, visit_id
- `blacklist_entries`: national_id_hmac, national_id_masked, full_name_snapshot, reason, created_by, created_at, ends_at, anonymized_at, lifted_by, lifted_reason, lifted_at
- `evacuation_rollcalls`, `evacuation_marks`

**Ortak**
- `settings`: key, value (jsonb), updated_by, change_note, updated_at. Tüm parametreler Bölüm 14'teki anahtarlarla tutulur ve Zod ile doğrulanır.
- `legal_texts`: kind (`kvkk_personnel`|`kvkk_visitor`|`visitor_rules`), locale, version, title, body, published_at — yayınlanınca değiştirilemez; aynı anda tek taslak
- `consents`: subject (user_id | visitor_id), legal_text_id, accepted_at, ip, user_agent
- `notifications`: user_id, kind (olay türü), subject_key (konu; aynı konu için okunmamış tek bildirim), params (jsonb; metin gösterimde mesaj dosyasından üretilir), link (uygulama içi yol), read_at
- `email_outbox`: notification_id, kind, to_address, subject, body_text, body_html, status (`pending`|`sent`|`failed`|`skipped`), attempts, last_error, next_attempt_at, sent_at — adres ve gövde denetim kaydına maskeli yazılır
- `password_reset_tokens`: user_id, token_hash (SHA-256; token saklanmaz), expires_at, used_at, ip
- `notification_prefs`, `push_subscriptions` (F2)
- `import_batches` (dosya, mod: `existing_staff`|`new_hires`, durum, sayılar), `import_rows` (normalleştirilmiş satır; TC yalnızca korumalı hâliyle; onaylanınca değiştirilemez). Onaylanmamış aktarımların satırları 24 saat sonra silinir (worker işi `imports.cleanup`)
- `corrections`: target_table, target_id, field, old_value, new_value, reason, created_by, created_at
- `report_exports`: actor_id, report (`training`|`exams`|`ohs`|`onboarding`), format (`xlsx`|`pdf`), filters (jsonb), row_count, at — **değiştirilemez** (her rapor dışa aktarması)
- `audit_log`: id, at, actor_id, request_id, table_name, record_id, action, old_data, new_data — **append-only**

\* Faz 2

### 12.2 Veritabanı Kuralları
- Genel `audit_trigger()` tüm iş tablolarına bağlanır (migration yardımcısıyla).
- `prevent_mutation()` trigger'ı değiştirilemez tablolara bağlanır. İzinli durum geçişleri trigger içinde beyaz liste olarak tanımlanır.
- Uygulama, en az yetkili bir veritabanı kullanıcısıyla (`akademi_app`) bağlanır. Migration'lar ayrı bir kullanıcıyla (`akademi_owner`) çalışır.
- Silme yerine arşivleme kullanılır (`archived_at`, `status`). Kişisel veri silme/anonimleştirme yalnızca saklama süresi işleriyle yapılır.

### 12.3 Saklama ve İmha (parametre, hukuk teyidi gerekli)
| Veri | Süre | Süre sonunda |
|---|---|---|
| Personel eğitim, sınav, imza, onay, sertifika kayıtları | İş ilişkisi bitişi + 15 yıl | Anonimleştirme (ad → "Anonim #id", TC/telefon/e-posta silinir) |
| Ziyaretçi kayıtları (ofis/saha) | Ziyaret tarihinden itibaren 2 yıl | Otomatik anonimleştirme (FG-8.5) |
| Taşeron çalışanı eğitim/giriş kayıtları | Son geçerlilik bitişinden itibaren 2 yıl | Otomatik anonimleştirme |
| Kara liste | Kaldırılana kadar + 2 yıl | Anonimleştirme |
| Sınav IP/cihaz bilgisi | Deneme kaydıyla aynı | — |
| Denetim kaydı | 15 yıl | Silme |
| Yedekler | Günlük 30 gün, aylık 12 ay | Döngüsel silme |

---

## 13. Fonksiyonel Olmayan Gereksinimler

### 13.1 Genel
| Alan | Gereksinim |
|---|---|
| Performans | 50 eşzamanlı kullanıcıda sayfa açılışı < 3 sn (p95). Sınav cevap kaydı < 500 ms (p95) |
| Uyumluluk | Android Chrome 100+, iOS Safari 16.4+, Samsung Internet, masaüstü Chrome/Edge (son 2 sürüm) |
| Erişilebilirlik | WCAG 2.1 AA, min 48px dokunma alanı, büyük yazı seçeneği, sesli okuma, ikon + metin birlikte |
| Zayıf bağlantı | HLS uyarlanabilir video + elle düşük kalite seçeneği. Uygulama kabuğu önbellekte; ilk yükleme JS < 250 KB gzip |
| Güvenlik | HTTPS (HSTS), CSP, rol bazlı yetki (Bölüm 11.3), tüm değişiklikler denetim kaydında, private depolama + imzalı URL, şifre politikası + kilit, gizli anahtarlar `.env` dosyasında (repo dışı), bağımlılık güvenlik taraması CI'da |
| Yedekleme | Günlük `pg_dump` + Garage bucket aynalama (S3 senkronu). Yedekler ayrı bir depolamada (Türkiye) ve şifreli tutulur. **Üç ayda bir geri dönüş testi** (runbook: `docs/runbooks/restore.md`) |
| Barındırma | Veriler Türkiye'de. Yurt dışı servis kullanılmaz (tek istisna: kurumun M365 kiracısı, yalnızca e-posta) |
| Dağıtım | Docker image'ları CI'da üretilir (GHCR). Sunucuda `docker compose pull && up` (`docker/compose.prod.yml`, runbook: `docs/runbooks/deploy.md`). Migration'lar dağıtım adımında `migrate` servisiyle otomatik çalışır. Staging → production |
| CI | GitHub Actions: bağımlılık taraması, lint, typecheck, unit + entegrasyon testleri (Postgres servisiyle), migration kontrolü, build, worker derlemesi, Playwright, imaj derleme |

### 13.2 Test Gereksinimleri
- **Kaynak doküman kuralı:** Bölüm 4'teki her FG maddesi için en az bir test senaryosu yazılır. Testler `FG-x.y` etiketiyle adlandırılır.
- **Yetki entegrasyon testleri (zorunlu):**
  - Kursiyer soru bankasını ve başkasının sonuçlarını göremez
  - Eğitmen soru bankasını göremez, atanmamış kursiyeri göremez/işaretleyemez
  - Bölüm sorumlusu kapsam dışı personelin sonucunu göremez
  - İK soru değiştiremez
  - Güvenlik personel eğitim verisini göremez
  - Kimse kendi kaydını değerlendiremez veya onaylayamaz
- **Değiştirilemezlik testleri:** teslim edilmiş deneme, imza, onay, işaretleme ve sertifika satırlarında UPDATE/DELETE reddedilir. `audit_log` uygulama kullanıcısıyla güncellenemez.
- **Birim testleri:** soru çekimi (konu dengesi), puanlama (İSG kritik kuralı), hak/bekleme hesabı, ön koşul kilidi, FG-3.3 modül farkı, video izleme oranı hesabı, Excel doğrulama.
- **Playwright (mobil + masaüstü):** İK Excel aktarır → plan atanır → kursiyer teorik içerikleri tamamlar → gözetmen koduyla sınava girer, kalır, 24 saat sonra (saat simülasyonu) geçer → eğitmen pratik görevleri işaretler → pratik sınav iki imza → bölüm sorumlusu onay → sertifika PDF → QR doğrulama sayfası.
- Kabul: her rol için en az bir gerçek kullanıcıyla kullanılabilirlik testi, yedekten geri dönüş testi, kullanıcı ve yönetici kılavuzu teslimi.

### 13.3 Mevzuat (son kontrolü İSG uzmanı ve hukuk danışmanı yapar)
- **6331 sayılı İSG Kanunu ve Çalışanların İSG Eğitimlerinin Usul ve Esasları Hakkında Yönetmelik:** yeni personel işe başlamadan önce İSG eğitimi alır.
  - Tehlike sınıfı, asgari eğitim saati ve tekrar periyodu **parametredir.** Tehlike sınıfını İSG uzmanı ayarlar; ayarlanana kadar "tehlikeli" varsayılır ve yönetim ekranında uyarı gösterilir.
  - Varsayılan tablo: az tehlikeli 8 saat / 3 yıl, tehlikeli 12 saat / 2 yıl, çok tehlikeli 16 saat / 1 yıl.
- Uzaktan verilebilecek ve yüz yüze verilmesi gereken konular: her modülde `remote_allowed` alanı tutulur ve İSG uzmanı belirler. Yüz yüze modüller yalnızca sınıf eğitimi kaydıyla tamamlanır.
- Eğitim belgesinde zorunlu alanlar sertifika şablonundadır (FG-7.2).
- **KVKK:** personel ve ziyaretçi aydınlatma metni (sürümlü, ilk girişte/bilgilendirmede onay), saklama ve imha süreleri (Bölüm 12.3), TC maskeleme ve şifreleme, yetkiye göre görünürlük, kişisel veri dışa aktarma talebi için İK ekranından "kişi verisi dışa aktar" işlemi.

---

## 14. Parametreler (varsayılanlar)

Tüm parametreler `settings` tablosundadır; değişiklikler denetim kaydına yazılır. "Plan" sütunu, parametrenin eğitim planı bazında geçersiz kılınabildiğini gösterir.

| Anahtar | Varsayılan | Plan | Yöneten |
|---|---|---|---|
| `org.timezone` | Europe/Istanbul | — | sysadmin |
| `ohs.hazard_class` | null (→ tehlikeli kabul) | — | ohs_specialist |
| `ohs.hours_by_class` | {low: 8, medium: 12, high: 16} | — | ohs_specialist |
| `ohs.renewal_years_by_class` | {low: 3, medium: 2, high: 1} | — | ohs_specialist |
| `theory.video_watch_ratio` | 0.90 | ✅ | sysadmin |
| `exam.theory.question_count` | 20 | ✅ | sysadmin |
| `exam.theory.duration_min` | 30 | ✅ | sysadmin |
| `exam.theory.pass_score` | 70 | ✅ | sysadmin |
| `exam.theory.max_attempts` | 3 | ✅ | sysadmin |
| `exam.theory.cooldown_hours` | 24 | ✅ | sysadmin |
| `exam.theory.proctor_required` | true | ✅ | sysadmin |
| `exam.practical.pass_score` | 80 | ✅ | sysadmin |
| `exam.practical.max_attempts` | 2 | ✅ | sysadmin |
| `exam.question_pool_min_ratio` | 2.0 | — | sysadmin |
| `proctor.code_ttl_min` | 120 | — | sysadmin |
| `proctor.code_max_failures` / `proctor.code_lock_min` | 5 / 15 | — | sysadmin |
| `certificate.signatories` | [] (en fazla 3: ad, unvan, taranmış imza) | — | İK, sysadmin |
| `verify.ip_max_requests` / `verify.ip_window_min` | 60 / 1 | — | sysadmin |
| `decision.extra_attempts_default` | 1 | — | sysadmin |
| `notify.email_events` | sınav sonucu ve sistem alarmı dışındaki bütün olaylar | — | sysadmin |
| `notify.retention_days` | 180 | — | sysadmin |
| `mail.max_attempts` | 5 | — | sysadmin |
| `auth.reset_link_minutes` / `auth.reset_max_per_hour` | 60 / 3 | — | sysadmin |
| `reports.max_rows` | 10000 | — | sysadmin |
| `session.shared_idle_min` | 10 | — | sysadmin |
| `session.personal_days` | 30 | — | sysadmin |
| `auth.password_min_length` | 8 | — | sysadmin |
| `auth.lockout_attempts` / `auth.lockout_min` | 5 / 15 | — | sysadmin |
| `auth.ip_max_failures` / `auth.ip_window_min` | 20 / 15 | — | sysadmin |
| `recert.lead_days` | 30 | — | sysadmin |
| `reread.due_days` | 14 | — | sysadmin |
| `assignment.daily_training_minutes` | 420 | — | sysadmin |
| `trainer.unmarked_alert_days` | 3 | — | sysadmin |
| `content.review_max_age_months` | 12 | — | sysadmin |
| `upload.max_video_mb` / `pdf_mb` / `image_mb` | 2048 / 50 / 15 | — | sysadmin |
| `visitor.types` | Bölüm 8.1 tablosu | — | ohs_specialist |
| `retention.*` | Bölüm 12.3 tablosu | — | sysadmin (hukuk onayıyla) |
| `notify.email_events` | Bölüm 10.2 (karar #119; push 2.6'da) | — | sysadmin |

---

## 15. Entegrasyonlar

| Sistem | Yön | Ne aktarılır | Faz |
|---|---|---|---|
| Excel | İK → Akademi | Personel, pozisyon, işe giriş tarihi | 1 |
| Microsoft 365 (Graph) | Akademi → kullanıcı | E-posta bildirimleri (`Mail.Send`) | 1 |
| Microsoft 365 (Entra ID) | Kullanıcı → Akademi | Kurumsal hesapla tek oturum (OIDC) | 3 |
| JAPAR İK uygulaması | İK → Akademi | Personel, pozisyon, işe giriş/çıkış (otomatik). Teknoloji ve bağlantı yöntemi Faz 3'te belirlenecek. Aktarım sözleşmesi Excel sütunlarıyla aynı alanlar + çıkış tarihi; günlük senkron + değişiklikte tetikleme | 3 |
| Kartlı geçiş / turnike | Akademi → geçiş sistemi | Eğitimi geçersiz personelin/taşeronun girişini engelleme (`GET /api/access/eligibility/{kartNo}` + değişiklik webhook'u) | 3 |
| OSGB | Dışa aktarım | İSG eğitim kayıtları (xlsx/CSV) | 3 |
| ~~SMS sağlayıcı~~ | — | **Kullanılmayacak** (maliyet). Ziyaretçi bağlantısı e-posta veya QR/kiosk ile; şifre sıfırlama İK veya e-posta ile | — |

---

## 16. Fazlama ve Kabul Kriterleri

### 16.1 Fazlar
| Faz | Kapsam | Pilot | Kabul kriteri |
|---|---|---|---|
| **Faz 1 — Yeni personel MVP** | Organizasyon/pozisyon, pozisyon kartı, içerik kütüphanesi (video HLS dahil), eğitim planı, teorik eğitim (sınıf eğitimi dahil), teorik sınav (ÇS + D/Y, gözetmen kodu, sesli okuma), pratik görev ve değerlendirme, işe başlama onayı, PDF sertifika + QR doğrulama, Excel'den personel aktarımı, temel raporlar (eğitim ilerleme, sınav sonuçları, İSG kayıt defteri, işe başlama süresi), uygulama içi + e-posta bildirimleri, kurulabilir PWA kabuğu | 1 bölüm, 2–3 pozisyon (**pilot bölüm henüz seçilmedi**) | Pilot bölüme giren 5 yeni personel kağıt kullanmadan teorik → pratik → sınav → onay akışını tamamlar; İSG uzmanı eğitim kayıt raporunu denetime yeterli bulur |
| **Faz 2 — Ziyaretçi ve yaygınlaştırma** | Ziyaretçi İSG modülü (4 tip), kapı tableti/kiosk, tahliye yoklama listesi, taşeron firma kartı, kara liste, tüm bölümlerin pozisyon kartları, süresi dolan eğitim takibi ve otomatik tekrar eğitimi, tam bildirim seti + web push, haftalık özet, İngilizce içerik, eşleştirme ve görselde işaretleme soru tipleri, kalan raporlar | Tüm tesis | Bir hafta boyunca tüm ziyaretçiler sistem üzerinden girer; tahliye tatbikatında yoklama listesi telefondan alınır |
| **Faz 3 — Entegrasyon ve olgunlaşma** | JAPAR İK otomatik aktarım, M365 ile tek oturum, turnike entegrasyonu, yetkinlik matrisi, gelişmiş raporlar, mevcut personelin periyodik eğitimleri, OSGB dışa aktarım | Tüm tesis | İK'da açılan personel aynı gün Akademi'de eğitim planıyla görünür; eğitimi geçersiz taşeron turnikeden geçemez |

### 16.2 Faz 1 İş Paketleri (sırayla, bir seferde bir paket)
| Paket | Kapsam |
|---|---|
| **1.0 Teknik temel** | Docker Compose (postgres, garage), Drizzle kurulumu, audit + değiştirilemezlik trigger altyapısı, Better Auth (sicil no + şifre, şifre değiştirme zorunluluğu, kilit), authz katmanı, uygulama kabuğu (rol bazlı menü, alt sekme/yan menü), next-intl, `settings` + parametre şeması, PWA kabuğu, CI, seed altyapısı |
| **1.1 Organizasyon ve personel** | Org ağacı, pozisyonlar, roller ve kapsamlar, personel CRUD, Excel aktarımı, geçici şifre PDF'i, TC şifreleme, KVKK aydınlatma onayı |
| **1.2 İçerik kütüphanesi** | İçerik tipleri, sürümleme, onay akışı, etiket/arama, Garage'a imzalı yükleme, worker + video HLS + görsel işleme |
| **1.3 Pozisyon kartı ve plan** | Kart editörü (13 bölüm, zorunlu alan kontrolü, sürüm karşılaştırma), modül kütüphanesi, ortak modüller, plan tasarımcısı, sınav yapılandırması |
| **1.4 Atama ve teorik eğitim** | Otomatik atama, ön koşul kilidi, içerik görüntüleme ve ilerleme takibi, ara değerlendirme, sınıf eğitimi kaydı, ortak cihaz modu, okuma görevleri |
| **1.5 Soru bankası ve teorik sınav** | Soru bankası (Excel içe aktarma dahil), İSG soru onayı, gözetmen kodu, sınav motoru (çekim, karıştırma, süre, otomatik kayıt, puanlama), hak/bekleme, sesli okuma, sekme olayları |
| **1.6 Pratik eğitim ve sınav** | Görev listeleri, eğitmen paneli, işaretleme (not/foto), pratik sınav formu, imzalar (çizim), iki imza akışı |
| **1.7 Onay ve sertifika** | İşe başlama onayı/ret, karar bekleyen akışı, sertifika ve katılım belgesi PDF, QR doğrulama sayfası, sertifika iptali |
| **1.8a Bildirim ve e-posta** | Uygulama içi bildirim, Graph e-posta (outbox + worker), bildirim merkezi, e-postayla şifre sıfırlama |
| **1.8b Raporlar ve denetim** | Faz 1 raporları (xlsx/PDF), denetim kaydı ekranı, KVKK kişi verisi dışa aktarma |
| **1.8c Yayına hazırlık ve pilot** | Üretim Docker imajları (app, worker, caddy), yedekleme/geri dönüş runbook'u ve betikleri, seed içerik, kullanıcı ve yönetici kılavuzu, pilot |

### 16.4 Faz 2 İş Paketleri (sırayla, bir seferde bir paket)
| Paket | Kapsam |
|---|---|
| **2.1 Ayarlar ve saklama** | Parametreler ekranı (`/admin/settings`), olay × kanal ayarı, saklama süresi dolan personelin anonimleştirilmesi, eski denetim kaydının silinmesi |
| **2.2 Ziyaretçi temeli** | Ziyaretçi tipleri, tip × dil bilgilendirme içeriği ve kontrol soruları, taşeron firma kartı, ziyaretçi/ziyaret kayıtları, kara liste, ziyaretçi KVKK ve kurallar metni, ön kayıt (`/security/visits`) |
| **2.3 Ziyaretçi bilgilendirme ve kapı** | E-posta bağlantısı (`/v/[token]`), kapı tableti (`/kiosk`), atlanamayan bilgilendirme, kontrol soruları, onay + imza, giriş/çıkış, kart ve KKD, ev sahibine bildirim, taşeron geçerliliği |
| **2.4 Tahliye ve ziyaretçi raporları** | `/security/evacuation` (bağlantısız okunabilir liste, PDF), ziyaretçi kayıt defteri, taşeron uygunluk raporu |
| **2.5 Tekrar eğitimi ve bildirimler** | Otomatik tekrar eğitimi ataması, süresi dolacak eğitimler raporu, Faz 2 bildirimleri, haftalık özet, içerik güncellik raporu |
| **2.6 Web push** | VAPID, push abonelikleri, kullanıcı tercihi, service worker |
| **2.7 İngilizce içerik ve yeni soru tipleri** | İçerik sürümünde dil (TR/EN), arayüzün İngilizce metinleri, eşleştirme ve görselde işaretleme soruları; Faz 2 yayını ve kılavuzlar |

"Tüm bölümlerin pozisyon kartları" içerik girişidir; kod paketi değildir (pilot kontrol listesinde izlenir).

### 16.3 Genel Kabul (her faz)
- İlgili her FG maddesi için test senaryosu yazılmış ve geçmiş olmalı.
- Her rol için en az bir gerçek kullanıcıyla kullanılabilirlik testi yapılmış olmalı.
- Denetim kaydı, yedekleme ve geri dönüş test edilmiş olmalı.
- Kullanıcı kılavuzu ve yönetici kılavuzu teslim edilmeli.

---

## 17. Alınan Kararlar

| # | Konu | Karar |
|---|---|---|
| 1 | Barındırma | Türkiye'de bulut sunucu (Linux VM + Docker Compose). Sağlayıcı henüz seçilmedi; mimari sağlayıcıdan bağımsız |
| 2 | Backend | Next.js + PostgreSQL + Drizzle + Better Auth + Garage (S3) + pg-boss. Supabase ve Vercel kullanılmaz |
| 3 | Cihaz | Kişisel telefon + şirket cihazları. Sınav için gözetmen kodu (plan bazında) |
| 4 | Giriş | Sicil no + şifre. Şifre sıfırlama İK veya e-posta ile. M365 tek oturum Faz 3 |
| 5 | Uygulama tipi | Mobil uyumlu web + kurulabilir PWA. Çevrimdışı yazma yok. Kiosk ekranı Faz 2 |
| 6 | Mevcut personel | Hepsi içe aktarılır, eğitim atanmaz. Periyodik eğitimler Faz 3 |
| 7 | Bölüm sorumlusu kapsamı | Org ağacında bir veya çok düğüm, alt düğümler dahil |
| 8 | İçerik onayı | Hazırlayan bölüm sorumlusuysa 1. adım geçilmiş sayılır. İSG içeriğinde İSG onayı her zaman gerekir |
| 9 | Mavi/beyaz yaka | Aynı akış. Fark eğitim planından gelir (pratik modüller opsiyonel olabilir) |
| 10 | İmza | Girişli onay + zaman damgası. Pratik sınav ve ziyaretçi onayında çizim imza da alınır. Nitelikli e-imza yok |
| 11 | Video | Kendi sunucumuzda ffmpeg → HLS 360p/720p |
| 12 | Sesli okuma | Tarayıcı Web Speech API |
| 13 | Soru tipleri | Faz 1: çoktan seçmeli + doğru/yanlış. Faz 2: eşleştirme + görselde işaretleme |
| 14 | Sınav parametreleri | Kaynak doküman varsayılanları; global parametre + plan bazında geçersiz kılma |
| 15 | Gözetmen | Gözetmenin ürettiği 6 haneli süreli kod |
| 16 | Ara değerlendirme | Cevaplanması zorunlu, not etkisi yok, doğru cevap ve açıklama gösterilir |
| 17 | Ortak ekran | Kişisel giriş + 10 dk işlemsizlikte otomatik çıkış |
| 18 | Tehlike sınıfı | İSG uzmanı belirleyecek; o zamana kadar "tehlikeli" varsayılır |
| 19 | TC kimlik | Şifreli tam + maskeli gösterim. Tamını İK görür; her görüntüleme loglanır |
| 20 | Ziyaretçi verisi saklama | 2 yıl sonra otomatik anonimleştirme (parametre) |
| 21 | Ziyaretçi modülü | Faz 2 |
| 22 | E-posta | Microsoft Graph API |
| 23 | JAPAR İK | Kendi geliştirdiğimiz uygulama. Bağlantı teknolojisi Faz 3'te belirlenecek; Faz 1–2'de Excel |
| 24 | Pilot | Bölüm henüz seçilmedi. Seed verisi "Üretim → Pres Hattı → Pres Operatörü" örneğiyle hazırlanır |
| 25 | SMS | Hiçbir fazda kullanılmayacak (maliyet) |
| 26 | QR doğrulama | Herkese açık sayfa: maskeli ad + kapsam + geçerlilik + durum |
| 27 | Dosya depolama | Garage (S3 uyumlu). MinIO topluluk imajları artık dağıtılmıyor (iş paketi 1.0'da karar verildi) |
| 28 | Yaka tipi | Pozisyonda tutulur. Excel'deki yaka tipi pozisyonunkiyle uyuşmazsa satır hatalıdır (iş paketi 1.1) |
| 29 | Yeni giriş / mevcut personel | Aktarım sihirbazında seçilir ve kişi bazında `training_required` alanına yazılır; elle kayıtta onay kutusudur. Mevcut kişinin değeri yeniden aktarımla değişmez |
| 30 | Rol atama | Yalnızca sistem yöneticisi. Kişi kendi sysadmin rolünü kaldıramaz; son aktif sysadmin'in rolü kaldırılamaz |
| 31 | Org ağacı derinliği | İki seviye: departman → bölüm; pozisyon ikisinden birine bağlı |
| 32 | KVKK metni yönetimi | İK. Yeni sürüm yayınlanınca herkes bir sonraki girişte yeniden onaylar; giriş sırası: şifre değiştirme → KVKK onayı → uygulama |
| 33 | Pozisyonsuz personel | İzinli (ör. BT), ekranda uyarı gösterilir; Excel aktarımında pozisyon zorunlu |
| 34 | Geçici şifre | 8 haneli rastgele rakam (politikadan geçer). Saklanmaz; yalnızca oluşturma/sıfırlama/aktarım anında ekranda ve PDF fişte (A4'te 8 fiş) bir kez verilir |
| 35 | Excel eşleştirme | Departman ad/kod, pozisyon ad (departman ve bölümlerinde) veya kodla; büyük/küçük harf ve Türkçe karakter farkı yok sayılır. Aynı adda iki pozisyon varsa kod istenir. En fazla 2 MB / 5.000 satır |
| 36 | Zengin metin düzenleyici | TipTap; yalnızca kalın, italik, H2/H3, listeler, alıntı. Gövde JSON saklanır, HTML enjekte edilmeden React ile gösterilir (iş paketi 1.2) |
| 37 | Etiket ekleme | Taslak hazırlayabilen herkes 4 sabit türe (makine, bölüm, risk, vardiya) yeni etiket ekleyebilir |
| 38 | Kütüphane görünürlüğü | İK ve İSG uzmanı tümünü; bölüm sorumlusu kapsamını + ortak içeriği; eğitmen kendi birimini (pozisyonunun birimi ve departmanı) + ortak içeriği görür. Sistem yöneticisi kütüphaneyi görmez; personel içeriği yalnızca atama üzerinden görür (1.4) |
| 39 | Taslak yetkisi | Bölüm sorumlusu kapsamında, eğitmen kendi biriminde, İK ortak içerikte, İSG uzmanı her İSG içeriğinde taslak hazırlar |
| 40 | Arşiv | İçeriği onaylayabilen arşivler (birim içeriğinde kapsamdaki bölüm sorumlusu, ortakta İK, İSG içeriğinde ayrıca İSG uzmanı). Arşivden geri alma yok |
| 41 | PDF gösterimi | Kursiyer ekranında pdf.js ile sayfa içinde (1.4); 1.2'de sayfa sayısı saklanır, yönetim ekranında yeni sekmede açılır |
| 42 | Künye (kart 1. bölüm) | Pozisyondan salt okunur gösterilir (İK `/admin/org`'dan değiştirir); yayın anında kart sürümüne kopyalanır (iş paketi 1.3) |
| 43 | Kart/plan taslak yetkisi | Bölüm sorumlusu (kapsam) ve eğitmen (kendi birimi) tüm kartı; İSG uzmanı yalnızca 9. bölümü ve plandaki İSG modüllerini düzenler. İK ve İSG uzmanı tüm kartları okur. Kart onayı: 1. adım kapsamdaki bölüm sorumlusu; İSG uzmanı kartı tek başına yayınlayamaz |
| 44 | Plan değişikliği | Plan kartın 13. bölümüdür; değişiklik yeni kart sürümü açar ve aynı onaydan geçer. Mevcut atamalar etkilenmez |
| 45 | Modül sürümü | Modüller sürümsüz; ayar, içerik listesi ve görevler serbestçe düzenlenir, yeni atamalara yansır (atama anında sabitlenir — 1.4). Kullanılmış görev silinmez, arşivlenir |
| 46 | Ortak modüller | Sahibi olmayan modüller yaka tipine göre her planın başına otomatik eklenir (tasarımcıda kilitli görünür, plana yazılmaz). Sırayı İK (İSG modüllerinde İSG uzmanı) `common_sort_order` ile belirler |
| 47 | Kart modülü | Her pozisyonun kaldırılamayan bir "Pozisyon kartı" teorik modülü vardır; planda ortak modüllerden sonra ilk sıradadır. 1.4'te kart bölüm bölüm okunur |
| 48 | Sürükle-bırak | `@dnd-kit` (klavye destekli); yukarı/aşağı butonları da vardır |
| 49 | Atama başlatma | Personel kaydedilince/aktarılınca atama otomatik oluşur (pozisyonun yayındaki kartı varsa). İK eğitmen ve hedef tarihi sonradan seçer; pratik modüller eğitmen seçilene kadar kilitli. Kartı yayında olmayan pozisyondaki kişi "Eğitimi bekleyenler"de kalır, kart yayınlanınca atanır (iş paketi 1.4) |
| 50 | Hedef tarih varsayılanı | Başlangıç (işe giriş, geçmişte ise bugün) + toplam modül süresi / `assignment.daily_training_minutes` (420 dk) iş günü; hafta sonu hariç, resmî tatiller Faz 2 |
| 51 | Ortak modül sırası | Zorunlu ortak modüller sırayla tamamlanır; ilk pozisyon modülü (kart) ortaklar bitince açılır |
| 52 | İsteğe bağlı modül | Kursiyer görür ve alabilir; atamanın tamamlanmasını engellemez. Başka modülün ön koşuluysa onu kilitler |
| 53 | Ara değerlendirme | Teorik modülü düzenleyen yazar: 0 ya da 3–5 soru (tek doğru / doğru-yanlış, açıklamalı). Onaya gitmez. Cevap, sorunun o anki metniyle saklanır |
| 54 | Tamamlama kuralları | Video: izlenen benzersiz saniye ≥ eşik (ileri sarma sayılmaz, süre dışı aralık kırpılır). PDF: son sayfa (pdf.js). Metin/talimat/galeri/kontrol listesi/kart bölümü: sayfa sonu. Form şablonu: dosyayı açma. Ardından "Okudum, anladım" |
| 55 | Sınıf eğitimi onayı | Kaydı eğitmen, bölüm sorumlusu, İSG uzmanı veya İK tutar; onay İSG modülünde İSG uzmanı, diğerlerinde kapsamdaki bölüm sorumlusu (ortak modülde İK). Kaydı tutan ve eğitimi veren onaylayamaz. Atamasında modül olmayan katılımcı da kayda geçer |
| 56 | Elle eğitim başlatma | İK eğitimi gerekmeyen personel için de başlatabilir (gerekçe `extra_training`); otomatik atama yalnızca yeni girişlere |
| 57 | Yönetici görünümü | 1.4'te bölüm sorumlusu (kapsamı) ve İK için ekip ilerleme listesi; ayrıntılı rapor ve dışa aktarma 1.8 |
| 58 | Soru sahipliği | Soru bir birime (kapsamdaki bölüm sorumlusu düzenler) ya da ortak İSG sorusu olarak İSG uzmanına aittir. İSG uzmanı birimlerin İSG sorularını da düzenler. İK yalnızca okur; eğitmen soru bankasını görmez |
| 59 | Soru havuzu | Her soru en az bir teorik modüle bağlanır. Sınav havuzu, atamada sınavdan önce gelen teorik modüllerin (ortak modüller dahil) etkin sorularıdır. Havuz < soru sayısı × `exam.question_pool_min_ratio` ise plan tasarımcısında uyarı (engellemez); havuz < soru sayısı ise sınav başlamaz |
| 60 | Konu | Serbest metin; mevcut konular öneri olarak gösterilir. Çekim konulara dengeli dağıtılır |
| 61 | Soru sürümü ve onay | Sınavda kullanılmamış soru yerinde düzenlenir; kullanılmış soru düzenlenince yeni sürüm açılır. İSG ve "İSG kritik" sorular İSG uzmanı onayıyla etkinleşir (onaya kadar önceki etkin sürüm kullanılır); İSG uzmanının kendi sorusu doğrudan etkindir. Kimse kendi sorusunu onaylamaz |
| 62 | Gözetmen kodu | Kod geçerlilik süresince her sınav için geçerlidir; denemeye gözetmen kimliği yazılır; gözetmen sınava giren kişi olamaz. Kursiyer başına 5 hatalı koddan sonra 15 dk kilit (parametre) |
| 63 | Kalınan sınav | İlgili teorik modüller "tekrar gerekli" olur; adımlar aynı sabit sürümlerle yeni turda yeniden açılır ve "okudum, anladım" yeniden istenir (ara değerlendirme tekrarlanmaz). Yeni deneme için bekleme süresi ve tekrar modülleri birlikte gerekir. Haklar bitince atama `awaiting_decision` (karar ekranı 1.7) |
| 64 | Excel'den soru | Sütunlar: Soru, Tip, A–E, Doğru, Konu, Zorluk, İSG kritik, Modül, Açıklama. Modül adları seçilen birimde büyük/küçük harf ve Türkçe karakterden bağımsız eşleşir. Önce önizleme, sonra aktarım |
| 65 | Sınav sonrası görünürlük | Kursiyer puan, sonuç ve konu özetini görür; sorular ve doğru cevaplar gösterilmez. Eğitmen, bölüm sorumlusu ve İK ayrıca sekme çıkışlarını, sesli okuma kullanımını ve gözetmeni görür |
| 66 | Pratik değerlendiren | Atamada seçilen eğitmen ve kişiyi kapsamında tutan bölüm sorumlusu görevleri işaretler ve pratik sınavın 1. imzasını atar; 2. imzayı kapsamdaki bölüm sorumlusu atar. 1. imzayı atan 2. imzayı atamaz; kimse kendi kaydını işaretleyemez. Bölüm sorumlusu değerlendirmeyi eğitmen paneli (`/trainer`) üzerinden yapar |
| 67 | Seviye sırası | Her işaretleme bir üst seviyeye geçirir (gösterdi → gözetiminde yaptı → tek başına yaptı); atlama yok, aynı gün art arda girilebilir. Düşürme herhangi bir alt seviyeye, gerekçeyle |
| 68 | Zorunlu görevler | Faz 1'de pratik modülün bütün görevleri zorunludur; hepsi "tek başına yaptı" olunca modül tamamlanır ve pratik sınav açılır (FG-5.3) |
| 69 | Sınav kriterleri | Atamada sınavdan önce gelen pratik modüllerin sabit görevleri; başlıklar forma kopyalanır |
| 70 | Pratik puanı | Her kriter Yapabildi/Yapamadı + isteğe bağlı not. Puan = yapabildi / toplam × 100, geçme notu `exam.practical.pass_score`. Kritik görev "Yapamadı" ise puandan bağımsız kalır. 0–N puan ölçeği Faz 2 |
| 71 | Form ve imza akışı | Form sunucuda taslak olarak kaydedilir. Kursiyer değerlendirenin cihazında imzalar (imza kursiyer adına, alındığı oturum ayrıca yazılır). Değerlendiren imzalayınca kriterler kilitlenir. Bölüm sorumlusu imzalayıp kesinleştirir ya da gerekçeyle geri gönderir; geri gönderilen deneme hak saymaz, yeni form gerekir |
| 72 | Pratik sınavda kalma | "Yapamadı" görevleri sistem kaydıyla "gözetiminde yapar"a düşer, ilgili pratik modüller "tekrar gerekli" olur, sınav kilitlenir. Görevler yeniden "tek başına" olunca yeni hak açılır. Haklar (`exam.practical.max_attempts`) bitince atama `awaiting_decision` |
| 73 | Pratik fotoğrafları | Mevcut görsel yükleme kullanılır (işaretleme ve form başına en fazla 6). Fotoğraf ve imza görsellerini kursiyer, eğitmeni, kapsamdaki bölüm sorumlusu ve İK görür |
| 74 | İşe başlama onayı | Kişiyi kapsamında tutan bölüm sorumlusu verir; kimse kendi atamasına karar veremez. Onayla atama `completed` olur ve pozisyon yetkinlik sertifikası düzenlenir |
| 75 | Retle tekrar açma | Gerekçe zorunlu; atamadaki tamamlanmış modüllerden seçilenler açılır: teorik → yeni tur; pratik → bütün görevler "gözetiminde yaptı"ya düşer (sistem işaretlemesi, kaynak `readiness`); sınav → yeniden açılır, hakkı kalmadıysa gerekçeli +1 hak. Atama yeniden `active` |
| 76 | Haklar bitince karar | İK veya kapsamdaki bölüm sorumlusu, gerekçeyle: ek hak (kalınan sınava +N, varsayılan `decision.extra_attempts_default`), ek eğitim (seçilen modüller açılır + kalınan sınava +1 hak), süreci sonlandır (atama `cancelled`; personel kaydı değişmez) |
| 77 | Belge türleri | Pozisyon yetkinlik sertifikası onayla otomatik. Katılım belgesi: İSG modülü tamamlanınca otomatik (sistem düzenler); diğer modüller için İK veya kapsamdaki bölüm sorumlusu isteğe bağlı düzenler. Aynı modüle geçerli belge varsa yenisi düzenlenmez |
| 78 | Geçerlilik | Pozisyon sertifikası atamadaki geçerlilik süreli modüllerin en erken bitişine kadar; yoksa süresiz. Katılım belgesi modülün bitişine kadar. "Süresi dolmuş" saklanmaz, tarihten hesaplanır |
| 79 | Belge şablonu | Logo, Geist yazı tipi, belge no, kişi/pozisyon/birim, modül tablosu (konu, süre, tarih, yöntem, eğitimci), puanlar, onaylayan, geçerlilik, imza yetkilileri (`certificate.signatories`, İK yönetir) ve QR. İçerik düzenlendiği anda dondurulur; PDF worker'da üretilir (`certificate.render`) |
| 80 | Doğrulama sayfası | Giriş istemez; maskeli ad ("Ahmet Y***"), belge türü, kapsam, belge no, tarihler, durum. TC ve sicil no gösterilmez. Token 128 bit. IP başına hız sınırı (`verify.ip_*`) |
| 81 | İptal | İK, gerekçe zorunlu; iptal kaydı değiştirilemez. Kimse kendi belgesini iptal edemez |
| 82 | Yetkinlik tabloları | `competencies` ve `competency_grants` Faz 1'de kurulur; ekran ve kullanım Faz 3 |
| 83 | 1.8 bölünmesi | 1.8 üç alt pakete bölündü: 1.8a bildirim ve e-posta, 1.8b raporlar ve denetim, 1.8c yayına hazırlık ve pilot |
| 84 | Bildirim olayları | Kursiyer: eğitim açıldı, teorik sınav açıldı, sınav sonucu, belge hazır. Eğitmen: yeni kursiyer, pratik sınav başlatılabilir. Bölüm sorumlusu: onay bekleyen içerik/kart, pratik sınav 2. imza, işe başlama onayı. İK + kapsamdaki sorumlu (+ İSG modülünde İSG uzmanı): tüm haklarda başarısız. İSG uzmanı: onay bekleyen İSG içeriği/kartı/sorusu. Sistem yöneticisi: e-posta hatası |
| 85 | Kanal | Uygulama içi bildirim her zaman yazılır; e-posta `notify.email_events` türlerinde ve kişinin e-postası varsa gider. Varsayılan: sınav sonucu ve sistem alarmı yalnızca uygulama içi |
| 86 | E-posta içeriği | Puan, sonuç veya kişisel ayrıntı içermez; olay türüne göre genel başlık + uygulama bağlantısı |
| 87 | Gönderim | Bildirim olayla aynı transaction'da yazılır; e-posta `email_outbox` üzerinden worker ile (dakikada bir) gönderilir, üstel beklemeyle `mail.max_attempts` kez denenir; kalıcı hatada sistem yöneticisine uygulama içi alarm. Geliştirme/testte `MAIL_TRANSPORT=log` (gönderilmez, konu loga yazılır); canlı ortamda `graph` |
| 88 | E-postayla şifre sıfırlama | Girişte "Şifremi unuttum" → sicil no. E-postası kayıtlı aktif personele tek kullanımlık, `auth.reset_link_minutes` geçerli bağlantı; ekran mesajı her durumda aynı; sicil ve IP başına saatlik sınır; sıfırlanınca bütün oturumlar kapanır. E-postası olmayan İK'ya başvurur |
| 89 | Bildirim görünürlüğü | Bildirimi yalnızca alıcısı görür ve açar; bağlantı uygulama içi yoldur, yetki gidilen ekranda yeniden kontrol edilir |
| 90 | Tekrar ve saklama | Aynı kişiye aynı konu için okunmamış tek bildirim; yeni olay mevcut bildirimi tazeler (e-posta tekrar gitmez). Konu kapanınca (onay, ret, karar, 2. imza) bekleyen bildirimler herkes için okundu sayılır. Bildirimler `notify.retention_days` sonra silinir |
| 91 | Rapor görünürlüğü | Eğitim ilerleme ve sınav sonuçları: İK (tümü) ve bölüm sorumlusu (kapsamı). İSG kayıt defteri: İSG uzmanı (tüm personel) ve İK. İşe başlama süresi: İK. Güvenlik personel raporlarını görmez; sistem yöneticisi denetim kaydını görür |
| 92 | Rapor filtreleri | Tarih aralığı, birim (org düğümü ve alt bölümleri), pozisyon. Varsayılan son 90 gün; İSG defterinde içinde bulunulan takvim yılı. Günler Europe/Istanbul'a göre |
| 93 | En çok yanlış yapılan sorular | Soru metni yalnızca soru bankasını görebilene ve görebildiği sorular için; kişi adı yer almaz (soru bazında sorulma, yanlış ve oran) |
| 94 | Yıllık İSG saati | Dönemde tamamlanan İSG modüllerinin süresi; yöntem uzaktan / yüz yüze; devreden modüller ilk tamamlandığı dönemde sayılır. Asgari saat `ohs.hours_by_class`; tehlike sınıfı ayarlanmamışsa "tehlikeli" kabul edilir ve rapor uyarır |
| 95 | İşe başlama süresi | Yalnızca yeni girişler; işe giriş tarihinden (yoksa atama başlangıcından) işe başlama onayına takvim günü. Pozisyon başına kişi, ortalama, ortanca, en az, en çok |
| 96 | Dışa aktarma | İstek anında Excel (sayfa başına tablo + bilgi sayfası) ya da yatay A4 PDF. Satır sınırı `reports.max_rows`; aşılırsa filtre daraltılması istenir. Ekranda ilk 50 satır önizlenir |
| 97 | Dışa aktarma kaydı | Her dışa aktarma değiştirilemez `report_exports` kaydına yazılır (kim, rapor, filtreler, satır, biçim) |
| 98 | Denetim ekranı | Sistem yöneticisi, salt okunur; tablo, kayıt, işlemi yapan ve tarih filtresi; yalnızca değişen alanlar eski → yeni. Maskeli alanlar maskeli görünür |
| 99 | KVKK kişi verisi dışa aktarma | İK, kişi sayfasından Excel: kimlik ve iletişim (TC maskeli), roller, eğitimler, sınav özetleri (soru/cevap yok), belgeler, KVKK onayları. Her dışa aktarma `data_access_log`'a yazılır; İK kendi verisini bu yolla indiremez |
| 100 | Üretim imajları | Tek `docker/Dockerfile`: `app` hedefi (Next standalone, yalnızca Docker derlemesinde `NEXT_OUTPUT=standalone`) ve `worker` hedefi (ffmpeg). Worker esbuild ile tek ESM dosyasına derlenir (`dist/worker.mjs`; tsx @react-pdf'i yükleyemiyor). Tek seferlik `migrate` servisi depo düzenini ve migration'ları worker imajıyla çalıştırır; app ve worker onun başarısını bekler |
| 101 | Dosya alan adı | Garage, Caddy üzerinden ayrı alt alan adında (`FILES_DOMAIN`) yayınlanır; imzalı URL'ler bu adrese üretilir |
| 102 | İmaj deposu | İmajlar CI'da derlenir; `main`'e gönderimde GHCR'ye `latest` ve commit etiketiyle itilir (yalnızca kod, kişisel veri yok). Geri alma = önceki commit etiketi |
| 103 | Yedekleme | `backup` servisi her gece 02:30: `pg_dump` (custom) → `age` ile şifreli; dosya deposu rclone crypt ile şifreli artımlı kopya. Günlük 30 gün, aylık 12 ay. İsteğe bağlı `BACKUP_REMOTE` (Türkiye) uzak kopya. Açma anahtarları sunucuda değil kasada |
| 104 | Hata takibi | GlitchTip pilot sonrasına ertelendi. Pilotta pino JSON loglar, Docker log döndürme (10 × 20 MB) ve uygulama içi e-posta hatası alarmı |
| 105 | Güvenlik başlıkları | Caddy ekler: HSTS, nosniff, Referrer-Policy, X-Frame-Options DENY, Permissions-Policy, CSP (`script/style 'self' 'unsafe-inline'`, görsel/medya/bağlantı/çerçeve için `FILES_DOMAIN`; nonce yok). CI'da `npm audit --omit=dev` yüksek/kritik bulguda başarısız olur; düzeltmesi olmayan incelenmiş istisnalar gerekçesiyle `audit-allowlist.json`'da |
| 106 | Kılavuzlar | Markdown, `docs/guides/` (kullanıcı ve yönetici), Türkçe, "siz" hitabı; ekran görüntüleri pilotta gerçek veriyle eklenir |
| 107 | Üretim seed | Üretimde yalnızca sistem yöneticisi; demo kullanıcılar yalnızca `SEED_DEMO_PASSWORD` tanımlıysa. Pilot hazırlığı `docs/pilot/pilot-kontrol-listesi.md` (Bölüm 18) |
| 108 | Geri dönüş testi | İlk test yerelde üretim compose ile yapıldı ve `docs/runbooks/restore.md`'ye yazıldı; sonraki test sunucu ortamında |
| 109 | Faz 2 paket sırası | 2.1 ayarlar ve saklama → 2.2 ziyaretçi temeli → 2.3 bilgilendirme ve kapı → 2.4 tahliye ve raporlar → 2.5 tekrar eğitimi ve bildirimler → 2.6 web push → 2.7 İngilizce içerik ve yeni soru tipleri (Bölüm 16.4). Ziyaretçi verisi gelmeden saklama işi hazır olur |
| 110 | Web push içeriği | Push yalnızca "Yeni bildiriminiz var" + uygulama içi bağlantı taşır; kişisel veya içerik bilgisi gönderilmez (push servisleri yurt dışında) |
| 111 | Ziyaretçi kimlik no | Ön kayıtta isteğe bağlı; güvenlik kapıda her tip için girer ve kara liste kontrolü o anda yapılır. Personeldeki gibi şifreli + HMAC + maskeli saklanır |
| 112 | QR ile kendi kaydı | Kapıdaki sabit QR ziyaretçinin telefonunda bilgilendirmeyi açar; IP başına hız sınırı. Giriş her zaman güvenliğin onayıyla |
| 113 | Tekrar eğitimi kapsamı | Faz 2'de yalnızca Akademi'de tamamlanmış ve geçerlilik süresi olan modüller. Açık ataması olan kişide tekrar eğitimi o atama kapanınca açılır; İK'ya bildirim gider |
| 114 | Personel anonimleştirmesi (ilke) | İş ilişkisi bitişi + `retention.personnel_years_after_exit` dolunca kişi verisi silinir; değiştirilemez kayıtların kendisi kalır. Sertifika snapshot'ındaki ad hukuk teyidine kadar dokunulmaz |
| 115 | Tahliye listesi cihazda | Yalnızca son liste tarayıcıda (IndexedDB); çıkışta silinir, 24 saatten eski liste gösterilmez; yalnızca güvenlik ve İSG |
| 116 | Görselde işaretleme | Doğru bölge dikdörtgen veya daire; dokunulan nokta bölgedeyse doğru |
| 117 | Parametreler ekranı | `/admin/settings` (Sistem → Parametreler; sysadmin ve İSG uzmanı). Herkes yalnızca yönettiği (`managedBy`) parametreleri görür. İmza yetkilileri kendi ekranında; `org.timezone` salt okunur. Değer kayıttaki Zod şemasıyla doğrulanır; varsayılana dönülebilir |
| 118 | Değişiklik gerekçesi | `settings.change_note`; `retention.*` için en az 10 karakter zorunlu, diğerlerinde isteğe bağlı. Gerekçe denetim kaydına da yazılır |
| 119 | Bildirim kanalları | `notify.channels.<olay>` yerine `notify.email_events` listesi; ekranda olay × kanal (uygulama içi her zaman). Push için 2.6'da `notify.push_events` |
| 120 | Anonimleştirme kapsamı | Ad "Anonim #XXXXXXXX", sicil "ANON-XXXXXXXX"; TC, telefon, e-posta silinir; oturum, şifre, rol ve kapsamlar silinir; bildirim, e-posta kuyruğu ve şifre sıfırlama kayıtları silinir; giriş denemesi, sınav denemesi, KVKK onayı ve imzadaki IP/cihaz silinir; Excel aktarım satırının verisi silinir |
| 121 | Değiştirilemez kayıtlara dokunma | Tek yol `app_anonymize_people(uuid[])` ve `app_purge_audit(timestamptz)` (SECURITY DEFINER). `prevent_mutation()` yalnızca `app.retention_job` açıkken ve işlem tablo sahibi rolüyle yapılıyorsa izin verir; uygulama rolünün kendi UPDATE'i yine JA001 |
| 122 | Denetim kaydında kişi verisi | Anonimleştirmede kişinin denetim satırlarındaki ad, sicil, telefon, e-posta, kullanıcı adı ve IP/cihaz değerleri maskelenir. `retention.audit_years`'tan eski satırlar her gece silinir; son bir yılın kaydı hiçbir koşulda silinemez |
| 123 | İmza ve fotoğraflar | Anonimleştirilen kişinin imza görselleri depodan silinir (`media_assets.status = purged`, `/api/media` 404); imza kaydı ve özeti kalır. Pratik görev fotoğrafları kalır |
| 124 | Sertifika snapshot'ı | Anonimleştirmede sertifikaların donmuş bilgisine dokunulmaz; doğrulama sayfası maskeli adı gösterir. Hukuk teyidi pilot kontrol listesinde |
| 125 | Saklama işi izleme | `retention.run` her gece 03:45 (İstanbul); bir gecede en çok 200 kişi ve 500 imza görseli. Anonimleştirilen kişi sayısı loglanır, 0'dan büyükse sistem yöneticisine `retention_completed` bildirimi |
| 126 | Ziyaretçi tipleri | Tablo yerine `visitor.types` parametresi (İSG uzmanı, Parametreler ekranında tablo): açık mı, soru sayısı, geçme notu, kart başına en az süre, geçerlilik yılı (0 = ziyaret günü). Varsayılan: ofis onay yeterli; saha 3 soru, 100; taşeron 10 soru, 80, 1 yıl. Stajyer ziyaretçi tipi değildir |
| 127 | Bilgilendirme paketi | İçerik kütüphanesi kullanılmaz; tip başına sürümlü paket: kartlar (başlık, metin, isteğe bağlı görsel/video) + kontrol soruları, her metin TR + EN. İSG uzmanı taslak hazırlar ve tek adımda yayınlar; yeni taslak güncel yayının kopyasıdır. TR/EN eksiksiz ve soru sayısı yeterli olmadan yayınlanmaz; yayınlanan sürüm değiştirilemez (trigger) |
| 128 | Kim yönetir | Paketler ve ziyaretçi kuralları metni İSG uzmanı (`legal.visitor_rules`); ziyaretçi KVKK metni İK; taşeron firmalar ve kara liste İSG uzmanı + güvenlik. Ziyaretçi metinleri TR + EN aynı sürümle birlikte yayınlanır |
| 129 | Güvenlik bölümü | `/security` güvenlik ve İSG uzmanına açık (ziyaretler, taşeronlar, kara liste, paketler). Ön kaydı başkası adına yalnızca güvenlik açar ve kimlik no yalnızca güvenlik girer/görür; İSG tüm ziyaretleri görür. Güvenlik eğitim verisi görmez |
| 130 | Ev sahibi ön kaydı | Her personel "Ziyaretçilerim" (`/visits`, profil sayfasından) ile kendini ev sahibi olarak kaydeder, yalnızca kendi ziyaretlerini görür; başkasının ziyareti 404. Taşeron tipinde etkin firma zorunlu, firma adı firma kartından gelir |
| 131 | Kara liste görünürlüğü | Kimlik no özetiyle (HMAC) eşleşir; ekleme kimlik no ve en az 10 karakter gerekçe ister, aynı kişi için tek geçerli kayıt. Ziyaret listesinde yalnızca güvenlik/İSG'ye işaretli; ev sahibine gösterilmez. Kayıt değiştirilemez; kaldırma gerekçeli ve bir kez. Güvenlik eklediğinde İSG uzmanına bildirim (`blacklist_added`) |
| 132 | Ziyaretçi kimliği | TC (algoritma kontrollü) ya da pasaport (ISO ülke kodu + numara; özet girdisi `P:<ülke>:<no>`). Aynı kimlik = aynı ziyaretçi (taşeron yeniden tanınır, ad/iletişim güncellenir); kimlik yoksa her ziyaret yeni ziyaretçi. Adla eşleştirme yok |
| 133 | Ziyaret düzeltme | Ön kayıt bilgileri yalnızca `planned` durumunda değişir; ev sahibi değiştirilmez. Kimlik girilirse ziyaret aynı kimlikli mevcut ziyaretçiye bağlanır |
| 134 | Ziyaretçi saklama | Son ziyaret tarihi + `retention.visitor_years`; taşeron ziyareti olan kişide `retention.contractor_years`. Kara liste kaldırılmasından + `retention.blacklist_years_after_lift`. `app_anonymize_visitors` / `app_anonymize_blacklist` kişi verisini ve denetim kaydındaki karşılığını siler; içerideki ziyaretçiye dokunulmaz. Kaldırılmadan süresi dolan kara liste kaydı şimdilik anonimleştirilmez |
| 135 | Ziyaret durumları | planned → briefed → checked_in → checked_out; iptal yalnızca girişten önce ve gerekçeyle (`state/visits.ts`). Ara geçişler ve girişten sonra değiştirilemezlik 2.3'te |

### 17.1 Bu Dokümanda Yapılan Varsayımlar (onaya sunulur)
Kaynak dokümanda açıkça yer almayan ama tasarımı tamamlamak için gereken kararlar:
1. "Kursiyer" ayrı bir rol değildir; aktif eğitim ataması olan her personel kursiyer ekranlarını görür.
2. Kimse kendi sınavını, görevini veya işe başlamasını değerlendiremez/onaylayamaz (Bölüm 2.4).
3. Teorik sınav sonrasında kursiyere doğru cevaplar gösterilmez; yalnızca puan ve konu özeti gösterilir.
4. Teorik sınavda kalınca "ilgili teorik modül" = sınavın ön koşulu olan teorik modüllerdir.
5. Pratik sınavda kalınca yetersiz kriterlerin görevleri "gözetiminde yapar" seviyesine düşer.
6. Ortak (İSG dışı) içeriklerin sahibi İK, İSG içeriklerinin sahibi İSG uzmanıdır.
7. Pozisyon kartında 9. bölüm (İSG) değiştiyse kart İSG onayına gider.
8. Stajyer, ziyaretçi değil `intern` istihdam tipli personeldir.
9. Tahliye listesi Faz 2'de yalnızca ziyaretçi ve taşeronları içerir; personel PDKS entegrasyonuyla Faz 3'te eklenir.
10. Hata takibi self-hosted GlitchTip ile yapılır (veri Türkiye'de kalır). Pilot sonrasına ertelendi (karar #104).
11. Personel eğitim kayıtlarının saklama süresi iş ilişkisi bitişi + 15 yıl olarak varsayıldı (**hukuk teyidi gerekli**).

---

## 18. JAPAR'ın Hazırlaması Gereken İçerikler
| İçerik | Sorumlu | Not |
|---|---|---|
| Organizasyon şeması ve pozisyon listesi | İK | JAPAR İK'daki departman/pozisyon listesiyle aynı olmalı |
| Her pozisyon için doldurulmuş pozisyon kartı | Bölüm sorumluları | Önce pilot pozisyonlar |
| Pratik görev listeleri ve değerlendirme formları | Ustalar + bölüm sorumluları | Pozisyon başına 10–30 görev |
| Risk değerlendirmesi, İSG talimatları, acil durum planı | İSG uzmanı | Mevcut dokümanlar içeriğe dönüştürülür |
| Tehlike sınıfı ve İSG eğitim süre/periyotları | İSG uzmanı | Parametre olarak girilecek |
| Soru bankası | İSG + bölüm sorumluları | Pozisyon başına en az 40 soru (20'lik sınavın 2 katı) |
| Ziyaretçi bilgilendirme videosu/kartları (TR + EN) | İSG + kurumsal iletişim | 4 ziyaretçi tipi için (Faz 2) |
| Tesis haritası, toplanma alanları, yaya yolları | İSG | Ziyaretçi ve genel eğitimde kullanılır |
| KVKK aydınlatma metinleri (personel, ziyaretçi) | Hukuk / KVKK sorumlusu | |
| Sertifika ve katılım belgesi şablonu | İK + İSG | Logo, imza yetkilileri, taranmış imzalar |
| Logonun vektörel (SVG) ve şeffaf arka planlı (PNG) hâli | Kurumsal iletişim | PWA ikonları, karanlık mod ve PDF'ler için. Şu an yalnızca JPG var (`public/brand/japar-academy-logo.jpg`) |
| Pilot bölüm ve pozisyonların seçimi | Yönetim | Faz 1 pilotundan önce |
| Türkiye'deki bulut sağlayıcısının seçimi | BT | Faz 1 sonunda staging'e geçmeden önce |
| M365 uygulama kaydı (Graph `Mail.Send`) ve gönderen adres | BT | İş paketi 1.8'den önce |
