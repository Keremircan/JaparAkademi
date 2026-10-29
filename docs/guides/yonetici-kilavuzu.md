# JAPAR Akademi — Yönetici Kılavuzu

Bu kılavuz **İK**, **bölüm sorumlusu**, **İSG uzmanı** ve **sistem yöneticisi** içindir. Kursiyer ve eğitmen ekranları için *Kullanıcı Kılavuzu*'na bakın.
Bir kişi birden çok role sahip olabilir; menü rollerinize göre oluşur. Kimse kendi kaydını onaylayamaz veya değerlendiremez.

---

## 1. İnsan kaynakları (İK)

### Organizasyon ve personel
- **Sistem → Organizasyon yapısı**: departman, bölüm ve pozisyonları tanımlayın. Pozisyonun yaka tipi ortak eğitimleri belirler.
- **Sistem → Personel**:
  - **Ekle**: tek kişi; yeni işe girenler için "eğitim gerekli" işaretlenir.
  - **Excel'den aktar**: şablonu indirin, doldurun, yükleyin. Önce önizleme gösterilir; onaylayınca hesaplar açılır ve geçici şifre fişleri (PDF) bir kez indirilir — fişler sunucuda saklanmaz.
  - TC kimlik no maskeli görünür; tamamını yalnızca İK görür ve her görüntüleme kayda geçer.
  - **Şifre sıfırla**: geçici şifre fişi üretir; kişi ilk girişte değiştirir.

### Eğitim ataması
- Yeni giren personel pozisyonun yayındaki planına otomatik atanır. Kişi sayfasından **pratik eğitmeni** ve **hedef tarihi** seçin; eğitmen seçilmeden pratik modüller açılmaz.
- Eğitimi gerekmeyen personele de elle eğitim başlatabilirsiniz.
- **Eğitimi bekleyenler**: pozisyonunun kartı henüz yayımlanmamış kişiler.

### Karar bekleyenler (tüm haklar kullanıldı)
**Onay bekleyenler** sayfasında listelenir. Kişiyi açın ve gerekçeyle birini seçin:
- **Ek hak tanı** (seçilen sınava ek deneme),
- **Ek eğitim ata** (seçilen modüller tekrar açılır, kalınan sınava 1 hak),
- **Süreci sonlandır** (eğitim ataması kapanır; personel kaydı değişmez).
Sistem kimseyi otomatik reddetmez; karar sizindir ve değiştirilemez.

### Sertifikalar
- Kişi sayfasındaki **Sertifikalar ve belgeler** listesinden indirin; gerekirse gerekçeyle **İptal et** (geri alınamaz; doğrulama sayfası "iptal edildi" gösterir).
- **Sistem → Sertifika şablonu**: belgelerde görünen imza yetkilileri (en fazla 3; ad, unvan, taranmış imza). Değişiklik yalnızca yeni belgelere yansır.

### Raporlar ve KVKK
- **Raporlar**: eğitim ilerleme, sınav sonuçları, İSG eğitim kayıt defteri, işe başlama süresi, süresi dolacak eğitim ve sertifikalar (İSG + İK; 30/60/90 gün ya da süresi dolmuş), içerik güncellik (bölüm sorumlusu + İK). Filtreleyin, önizleyin, Excel/PDF indirin; her indirme kayda geçer.
- **Tekrar eğitimi** otomatik açılır: süreli modülün bitişine `recert.lead_days` (varsayılan 30) gün kala kişiye yalnızca o modüller ve bağlı sınavlar atanır. Kişinin açık eğitimi varsa o bitince açılır (size bildirim gelir). Pratik modül varsa kişinin eğitimine eğitmen seçin. İptal ettiğiniz tekrar eğitimi yeniden açılmaz. Bitince bölüm sorumlusu onaylar ve yeni sertifika düzenlenir.
- **Bildirimler (Faz 2):** hedef tarihi geçen eğitim (bölüm sorumlusuna bir kez), işaretlenmeyen pratik görev (eğitmene), süresi dolan İSG eğitimleri (İSG'ye günlük özet), Pazartesi 08:00 haftalık ekip özeti (bölüm sorumlusuna; e-postada yalnızca sayılar).
- **Kişi verisini dışa aktar** (kişi sayfası): KVKK kapsamındaki talepler için kişinin verilerini Excel olarak verir (TC maskeli). Kendi verinizi bu yolla indiremezsiniz.
- **Aydınlatma metinleri** (Sistem → Aydınlatma metinleri ve kurallar): personel KVKK metni (yeni sürümde bütün kullanıcılar yeniden onaylar) ve ziyaretçi KVKK metni (Türkçe + İngilizce birlikte yayınlanır).

---

## 2. Bölüm sorumlusu

Yalnızca kapsamınızdaki birimlerin personelini ve içeriklerini görürsünüz.

### İçerik kütüphanesi
- **Yönetim → İçerik kütüphanesi**: metin, PDF, video, galeri, talimat, kontrol listesi, form şablonu.
- Taslak → **Onaya gönder**. Kendi biriminizin içeriğini gönderirken bölüm onayı sizden geçer; İSG içerikleri ayrıca İSG uzmanı onayına gider.
- Yayındaki içeriği değiştirmek için **Yeni sürüm başlat**. "Tekrar oku ve onayla" seçilirse önceki sürümü okuyan herkese okuma görevi açılır.

### Pozisyon kartı ve eğitim planı
- **Yönetim → Pozisyon kartları ve planlar**: 13 bölümlük kartı doldurun, **Plan** sekmesinde modülleri sürükleyerek sıralayın, sınav ayarlarını yapın.
- Plan tasarımcısı her teorik sınav için **soru havuzunu** gösterir; havuz soru sayısının iki katından azsa uyarır.
- Kart onaylanıp yayımlanınca bekleyen yeni girişlere plan otomatik atanır.

### Soru bankası
- **Yönetim → Soru bankası**: soru ekleyin ya da Excel'den aktarın. Her soru en az bir teorik modüle bağlanır; konu ve zorluk girilir.
- "İSG kritik" sorular İSG uzmanı onayıyla etkinleşir. Sınavda kullanılmış soru düzenlenince yeni sürüm açılır.

### Onaylar ve değerlendirme
- **Onay bekleyenler**: içerik ve kart onayları, **2. imzanızı bekleyen pratik sınavlar**, **işe başlama onayı bekleyenler**, karar bekleyenler.
- **Pratik sınav 2. imza**: formu inceleyin → imzalayın (sonuç kesinleşir) ya da gerekçeyle **Geri gönder** (deneme hak saymaz).
- **İşe başlama onayı**: teorik ve pratik sonuçlar tek ekranda. **İşe başlayabilir** → atama tamamlanır, sertifika düzenlenir. **Reddet** → gerekçe + tekrar açılacak modüller.
- **Pratik değerlendirme** kartından eğitmen paneline geçip kapsamınızdaki kursiyerlerin görevlerini siz de işaretleyebilirsiniz.

### Ekip ve raporlar
- **Ekip ilerlemesi**: kapsamınızdaki eğitimler, hedef tarihi geçenler, sınav denemeleri.
- **Raporlar**: eğitim ilerleme ve sınav sonuçları (kapsamınızla sınırlı).

---

## 3. İSG uzmanı

- İSG içeriklerini, kartların İSG bölümünü ve **İSG/İSG kritik soruları** onaylarsınız (Onay bekleyenler).
- Modüllerde **"Uzaktan verilebilir mi"** ayarını belirlersiniz; uzaktan verilemeyen modüller yalnızca sınıf eğitimi kaydıyla tamamlanır.
- **Tehlike sınıfı**, yıllık İSG eğitim saatleri ve yenileme süreleri **Sistem → Parametreler**'dedir; tehlike sınıfı ayarlanana kadar "tehlikeli" kabul edilir ve raporda uyarı görünür.
- **Raporlar → Ziyaretçi kayıt defteri** (güvenlik + İSG) ve **Taşeron uygunluk** (İSG + İK): Excel/PDF; satın alma ile taşeron raporunu siz paylaşırsınız.
- **Raporlar → İSG eğitim kayıt defteri**: bütün personelin İSG eğitimleri, yöntem (uzaktan/yüz yüze), geçerlilik ve kişi başı yıllık saat — denetimde sunulabilir biçimde Excel/PDF.
- İSG modülünü tamamlayan herkes için **katılım belgesi** kendiliğinden düzenlenir.
- **Güvenlik → Bilgilendirme paketleri**: her ziyaretçi tipi için kartlar ve kontrol soruları (Türkçe + İngilizce). Taslağı kaydedin, eksiksizse **Yayınla**. Yayınlanan sürüm değişmez; değişiklik için yeni sürüm hazırlayın.
- **Ziyaretçi tipleri** (soru sayısı, geçme notu, geçerlilik) Sistem → Parametreler'dedir. **Ziyaretçi kuralları** metni Sistem → Aydınlatma metinleri'ndedir.
- **Güvenlik → Taşeron firmalar** ve **Kara liste**: güvenlik görevlisiyle birlikte yönetirsiniz; kara listeye eklenen her kişi için bildirim alırsınız.

---

## 4. Güvenlik görevlisi

- **Güvenlik → Ziyaretler**: bugünden itibaren planlı ziyaretler; tarih ve durumla süzün. **Ziyaretçi kaydet** ile herhangi bir personel adına (ev sahibi sicil no) ön kayıt açın; kimlik no'yu (TC ya da pasaport) yalnızca siz girersiniz. Aynı kimlik no ile gelen kişi tanınır.
- Kara listedeki kişinin ziyareti kırmızı işaretle görünür; içeri almadan önce İSG uzmanıyla görüşün.
- **Taşeron firmalar**: firma kartı (unvan, vergi no, sözleşme bitişi). Taşeron ziyaretçide firma seçimi zorunludur.
- **Kara liste**: kimlik no ve gerekçeyle ekleyin; kaldırma da gerekçelidir. Kayıtlar değiştirilemez.
- **Ziyaretçi bilgilendirmesi**: ön kayıtta e-posta varsa ziyaretçiye bilgilendirme bağlantısı kendiliğinden gider (Türkçe + İngilizce). Ziyaret ayrıntısında **ziyaret kodu** ve bilgilendirme durumu görünür; gerekirse **Bilgilendirme bağlantısını yeniden gönder**.
- **Kapı tableti**: ziyaretçi kodunu yazar ya da "Ön kaydım yok" ile kendini kaydeder; bilgilendirmeyi bitirince kodu size söyler. Kapıdaki QR kodu ziyaretçinin kendi telefonunda aynı kaydı açar (`/visit`).
- Kendi kaydında ev sahibi ziyaretçinin yazdığı addır ("ziyaretçinin yazdığı"); girişte gerçek ev sahibini siz atarsınız.
- **Güvenlik → Kapı**: bugünün ziyaretleri ve şu an içeride olanlar. Ziyaretçinin söylediği 6 haneli kodu ya da adını arayın.
  - **Giriş yap**: kart no'yu yazın, verdiğiniz KKD'yi işaretleyin. Kimliği kayıtlı değilse TC ya da pasaportu, kendi kaydıysa ev sahibinin sicil no'sunu girin. Bilgilendirmeyi tamamlamamış ziyaretçi içeri alınamaz.
  - Kişi kara listedeyse sistem girişi reddeder ve İSG uzmanına bildirir; içeri almayın.
  - **Çıkış yap**: kartın iade edilip edilmediğini işaretleyin. Girişten sonra kayıt değiştirilemez.
  - Geçerli bilgilendirmesi olan taşeron çalışanının geçerlilik bitişi satırda görünür; bu kişiler yalnızca kuralları onaylayıp imzalar.
  - Gün sonunda çıkışı yapılmamış ziyaretçiler "İçeride" listesinde kalır; çıkışı siz işaretlersiniz.
- **Güvenlik → Tahliye yoklaması** (güvenlik ve İSG, telefonda): şu an içeride olan ziyaretçi ve taşeronlar. **Yoklama başlat** (tatbikat ya da gerçek) → toplanma alanına gelenleri **Toplanma alanında** ile işaretleyin (yanlışsa **Geri al**). Sonradan girenler için **Listeyi yenile**. Bitince **Yoklamayı bitir**; eksikler kayıtta kalır.
  - Liste bu ekranı her açtığınızda telefona kaydedilir; bağlantı kesilirse uygulamanın çevrimdışı sayfasında okunabilir (24 saat). İşaretleme için bağlantı gerekir.
  - Kağıt yedeği için **İçeridekiler (PDF)** ya da **Yoklama sonucu (PDF)**.
  - Personel bu listede yoktur (Faz 3).

---

## 5. Sistem yöneticisi

- **Roller ve kapsam**: Sistem → Personel → kişi → **Roller**. Bölüm sorumlusunun hangi departman/bölümleri yönettiği de burada seçilir.
- **Sistem → Ortak cihazlar**: eğitim odası bilgisayarlarını ("Ortak bilgisayar"; girişte ortak mod) ve kapıdaki ziyaretçi tabletini ("Kapı tableti"; `/kiosk` yalnızca bu cihazda açılır) kayıt yapılacak cihazın tarayıcısından tanımlayın. Tableti ekran sabitleme / kiosk tarayıcı modunda kullanın.
- **Sistem → Denetim kaydı**: kim, ne zaman, hangi kaydı değiştirdi; eski ve yeni değerler (hassas alanlar maskeli). Salt okunur.
- **Sistem → Parametreler**: sınav, eğitim, giriş, bildirim (hangi olayların e-postayla, hangilerinin telefona push olarak da gideceği; push yeniden deneme sayısı ve bekleme süresi), dosya ve saklama süresi ayarları. **Değiştir** → yeni değer → **Kaydet**; **Varsayılana dön** ile ilk değere dönülür. Her değişiklik denetim kaydına yazılır. Saklama sürelerinde gerekçe zorunludur (hukuk onayının tarihi ve dayanağı). Plan bazındaki sınav ayarları plan tasarımcısında değiştirilir; saat dilimi ekrandan değiştirilemez.
- **Saklama süreleri**: iş ilişkisi biten personelin verisi süre dolunca her gece anonimleştirilir (ad, sicil, TC, telefon, e-posta silinir; eğitim ve sınav kayıtları kalır). Anonimleştirme geri alınamaz; olduğunda size bildirim gelir.
- **E-posta hatası** bildirimi gelirse e-posta ayarlarını (M365 uygulama kaydı) ve sunucu loglarını kontrol edin.
- Kurulum, güncelleme, yedekleme ve geri dönüş: `docs/runbooks/deploy.md` ve `docs/runbooks/restore.md`.
