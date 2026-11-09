# JAPAR Akademi — Yönetici Kılavuzu

Bu kılavuz **İK**, **bölüm sorumlusu**, **İSG uzmanı** ve **sistem yöneticisi** içindir. Kursiyer ve eğitmen ekranları için *Kullanıcı Kılavuzu*'na bakın.
Bir kişi birden çok role sahip olabilir; menü rollerinize göre oluşur. Kimse kendi kaydını onaylayamaz veya değerlendiremez.

**Silme**: eklediğiniz kayıtların (departman, bölüm, pozisyon, personel, modül, içerik, soru, etiket, yetkinlik, sınıf eğitimi kaydı, firma, ziyaretçi ön kaydı, ortak cihaz, hukuki metin taslağı) yanında ya da sayfasında **Sil** düğmesi vardır. Kayda bağlı başka kayıtlar varsa pencere bunları sayar (ör. "1 bölüm", "2 personel") ve **önce onları silmenizi** ister. Bağı yoksa "Silmek istediğinize emin misiniz?" sorulur; **Evet, sil** ile silinir. Geçmiş eğitim, sınav, onay ya da sertifika kayıtlarında kullanılmış bir kayıt silinemez; pencerede **Arşivle** / **Pasife al** düğmesi çıkar: kayıt listelerden kalkar, geçmiş kayıtlar korunur. Arşivdeki ve pasif kayıtları listelerin üstündeki **Arşivdekileri göster** / **Pasifleri göster** ile görebilirsiniz.

---

## 1. İnsan kaynakları (İK)

### Organizasyon ve personel
- **Sistem → Organizasyon yapısı**: departman, bölüm ve pozisyonları tanımlayın. Pozisyonun yaka tipi ortak eğitimleri belirler.
- **Sistem → Personel**:
  - **Ekle**: tek kişi; yeni işe girenler için "eğitim gerekli" işaretlenir. Davet kanalında varsayılan **Şimdi davet etme**'dir (daveti sonra **Davetler** ekranından gönderirsiniz); isterseniz hemen gönderebilirsiniz: **E-posta** (bağlantı kişiye gider; e-posta gönderimi açıkken), **WhatsApp** (kaydettikten sonra **WhatsApp'ta gönder**'e basın; mesaj kendi telefonunuzda yazılmış hâlde açılır, siz gönderirsiniz — telefon numarası gerekir) ya da **Basılı kağıt** (QR + 8 haneli kod; PDF'i yazdırıp elden verin). Kişi şifresini kendisi belirler; siz şifre görmezsiniz. Davet 72 saat geçerlidir.
  - **Excel'den aktar**: şablonu indirin, doldurun, yükleyin. Önce önizleme gösterilir; onaylayınca hesaplar açılır ama davet gönderilmez. Sonuç ekranındaki **Bunlara davet gönder** sizi Davetler ekranına, yalnızca bu aktarımın kişileriyle götürür.
  - **Davetler** (Personel → Davetler): hesabını etkinleştirmemiş herkes burada. Süzün, kişileri seçin (**Tümünü seç**), kanalı seçin ve **Davet oluştur**'a basın. **Akıllı** kanal: e-postası olana e-posta (e-posta gönderimi açıkken), telefonu olana WhatsApp, ikisi de olmayana basılı kağıt. Basılı kağıtlar tek PDF olarak bir kez iner (sunucuda saklanmaz). WhatsApp davetleri için bir **gönderim listesi** açılır: sırayla **WhatsApp'ta gönder** → WhatsApp'ta Gönder → sayfaya dönün; satır "Gönderildi" olur. Liste yarıda kalırsa Davetler ekranındaki **Son davet grupları**'ndan tekrar açıp devam edersiniz. Bir seferde en fazla 200 kişi (parametre).
  - TC kimlik no maskeli görünür; tamamını yalnızca İK görür ve her görüntüleme kayda geçer.
  - **Kişiyi sil** (kişi sayfasının altında): bölüm, kişiye hangi yolun uygulanacağını baştan yazar. Kişinin geçmiş kaydı yoksa (yanlış ya da iki kez açılmış kayıt) **Kişiyi sil** ile hemen silersiniz; işten ayrıldı olarak işaretlemeniz gerekmez. Eğitimi başlamış, KVKK onayı ya da başka kaydı olan kişide bu düğme yoktur; bölüm iki adımı gösterir: önce **İşten ayrıldı olarak işaretle**yin, sonra üst yönetici kişisel verilerini **Kişisel verileri kalıcı olarak sil** ile siler.
  - **Profil fotoğrafı** (kişi sayfası): kişi açık rıza verdiyse fotoğrafını siz de yükleyip kaldırabilirsiniz; rızası yoksa fotoğraf eklenemez. Kişi telefonunu kendi profilinden değiştirir; e-postayı yalnızca siz değiştirirsiniz (şifre sıfırlama bu adrese gider).
  - Personel yalnızca sistem içinden (ekran ve Excel) yönetilir; İK uygulamasından otomatik aktarım yoktur.
  - **Hesap ve şifre sıfırlama**: kişi sayfasında, kişi bilgilerinin hemen altında hesabın durumu görünür (etkin / davet bekliyor / davet kullanılamıyor). Şifresini unutan kişi için büyük **Şifreyi sıfırla** düğmesi → kanal (e-posta, WhatsApp, basılı kağıt) → **Bağlantıyı oluştur** → onay. Kişinin eski şifresi hemen geçersiz olur, açık oturumları kapanır; kişi gelen bağlantıyla (ya da kağıttaki kodla) yeni şifresini belirler. Hesabını hiç etkinleştirmemiş kişide aynı yerde **Davet gönder** vardır. Sistem yöneticisinin şifresini yalnızca sistem yöneticisi ya da üst yönetici, üst yöneticininkini yalnızca üst yönetici sıfırlayabilir; İK bu kişilerde düğme yerine açıklama görür (Davetler ekranında da listelenmezler). Geçici şifre verilmez.

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

### Periyodik eğitimler (eski personel)
- **Yönetim → Periyodik eğitimler**: eski personelin süreli teorik eğitimleri (ör. yıllık İSG). Her kişide modül başına durum: *Tarih yok*, *Son: … · açılış: …*, *Eğitimde*.
- **Son eğitim tarihi**: kişileri seçin, modülü ve kağıt kayıttaki son eğitim tarihini girip **Tarihi kaydet**. Çok kişi için **Şablonu indir** → "Son eğitim tarihi" sütununu doldurun → yükleyin → önizleme → kaydet. İSG uzmanı yalnızca İSG modüllerine tarih girer. Yanlış tarih yeni tarih girilerek düzeltilir.
- Tarihi girilen kişiye eğitim, bitişe 30 gün kala (Parametreler → Tekrar eğitimi ön süresi) gece kendiliğinden açılır.
- Tarihi bilinmeyenleri seçip **Şimdi başlat** ile hemen eğitime alın.
- Periyodik eğitimde pratik ve işe başlama onayı yoktur; modüller bitince tamamlanır.

### Çalışma programları
- **Yönetim → Çalışma programları**: pozisyonlar birim birim listelenir; her pozisyonda kişi sayısı, programlar ve programını kendine göre değiştiren sayısı görünür.
- Pozisyonu açın → **Yeni program**: program adı (ör. Gündüz, Gece; tek programda "Genel"), tür (**Günlük**: seçilen günlerde aynı akış; **Haftalık**: her satırda gün seçilir), vardiya başlangıcı ve satırlar (saat, başlık, isteğe bağlı not). Gece yarısını geçen vardiyada başlangıcı girin (ör. 22:00): bu saatten önceki satırlar ertesi sabaha sayılır.
- Vardiyalı pozisyonda her vardiya için ayrı program açın; personel kendi vardiyasını seçer. Sayfada her programı seçen sayısı ve henüz vardiya seçmeyenler görünür.
- Onay adımı yoktur: kaydedince program hemen geçerli olur. Akışı değiştirirseniz programı kendine göre değiştirmiş kişilere bildirim gider; yeni programa geçer ya da kendi programlarını korurlar. Türü (günlük/haftalık) değiştirirseniz kişilerin kendi programları silinir.
- **Programını değiştirenler**: kişiye dokununca pozisyon programına göre farkı görürsünüz (salt okunur). "Güncellemeden sonra henüz karar vermedi" etiketi, güncellemeden sonra seçim yapmayanları gösterir.
- **Programı kaldır**: seçenlerin vardiya seçimi ve kendine göre değiştirenlerin programı silinir; bu kişilere bildirim gider.
- Program yalnızca yol gösterir; uyulup uyulmadığı izlenmez. Pozisyonu değişen kişinin eski pozisyondaki seçimi ve kendi programı silinir; kişi verisi dışa aktarmasında "Çalışma programım" sayfası yer alır.

### Raporlar ve KVKK
- **Raporlar**: eğitim ilerleme, sınav sonuçları, İSG eğitim kayıt defteri, işe başlama süresi, süresi dolacak eğitim ve sertifikalar (İSG + İK; 30/60/90 gün ya da süresi dolmuş), içerik güncellik (bölüm sorumlusu + İK). Filtreleyin, önizleyin, Excel/PDF indirin; her indirme kayda geçer. İK, İSG eğitim kayıt defterindeki **OSGB dosyası**nı tam TC kimlik numarasıyla indirir; her indirmede dosyadaki kişiler için kişisel veri erişim kaydı tutulur.
- **Raporlar → Yönetim özeti**: eğitim ve İSG durumunun tek sayfalık özeti. Eğitimi süren, onay bekleyen ve hedef tarihi geçen kişiler; dönemde işe başlama onayı ve ortalama süre, tamamlanan modül, teorik sınavda ilk denemede geçme oranı; İSG eğitimi süresi dolmuş ve 30/60/90 gün içinde dolacak kişiler; son 12 ayın grafiği (altında tablo görünümü). Dönem (bu ay, geçen ay, son 90 gün, bu yıl ya da tarih) ve birim seçin; bir göstergeye dokununca ilgili rapor açılır. Excel indirilebilir, indirme kayda geçer. Yalnızca sayılar yer alır, kişi adı yoktur. Eski personel için girilen son eğitim tarihleri İSG geçerliliğinde ve süresi dolacaklar raporunda da sayılır.
- **Aylık özet e-postası**: her ayın 1'i 08:00'de önceki ayın özeti İK ve üst yöneticilere uygulama içi bildirim olarak, e-postası kayıtlı olana e-postayla da gelir. Yalnızca sayılar ve özete bağlantı içerir. Gönderim günü, saati ve açma/kapama Sistem → Parametreler → Raporlar'dadır (sistem yöneticisi).
- **Tekrar eğitimi** otomatik açılır: süreli modülün bitişine `recert.lead_days` (varsayılan 30) gün kala kişiye yalnızca o modüller ve bağlı sınavlar atanır. Kişinin açık eğitimi varsa o bitince açılır (size bildirim gelir). Pratik modül varsa kişinin eğitimine eğitmen seçin. İptal ettiğiniz tekrar eğitimi yeniden açılmaz. Bitince bölüm sorumlusu onaylar ve yeni sertifika düzenlenir.
- **Bildirimler (Faz 2):** hedef tarihi geçen eğitim (bölüm sorumlusuna bir kez), işaretlenmeyen pratik görev (eğitmene), süresi dolan İSG eğitimleri (İSG'ye günlük özet), Pazartesi 08:00 haftalık ekip özeti (bölüm sorumlusuna; e-postada yalnızca sayılar).
- **Kişi verisini dışa aktar** (kişi sayfası): KVKK kapsamındaki talepler için kişinin verilerini Excel olarak verir (TC maskeli). Kendi verinizi bu yolla indiremezsiniz.
- **Aydınlatma metinleri** (Sistem → Aydınlatma metinleri ve kurallar): personel KVKK metni, personel açık rıza metni ve ziyaretçi KVKK metni. Hepsi Türkçe + İngilizce birlikte yayınlanır (bağlayıcı metin Türkçedir). Yeni sürümde personel bir sonraki girişte metni yeniden okuyup **Okudum, bilgilendirildim** ile okuduğunu belirtir; ziyaretçi bilgilendirmede onaylar. Personel metni kendi dilinde görür.
- **Örnek metinle başla**: personel KVKK metni, personel açık rıza metni (yalnızca profil fotoğrafı) ve ziyaretçi KVKK metni için hazır örnek vardır. Düğme Türkçe ve İngilizce taslağı birlikte açar; saklama süreleri o anki parametrelerden yazılır. Kurum bilgileri (unvan, adres, MERSİS no, KEP adresi, başvuru e-postası, yurt dışına aktarım dayanağı) **[[...]]** ile işaretli boş alan olarak gelir. **Düzenle** ile bu alanları doldurun; liste ve form kalan alanları gösterir, **[[...]]** kaldıkça **Yayınla** görünmez. Yayınlamadan önce metni hukuk/KVKK sorumlusuna onaylatın.
  - Kurum bilgileri gelmeden sistemi denemek için **Örnek olarak yayınla** kullanılabilir: metin doldurulmamış alanlarıyla yayınlanır, personel ve ziyaretçi metnin üstünde "Örnek metin" uyarısını, alanları sarı işaretli görür; listede "Örnek metin" etiketi çıkar. Gerçek kullanımdan önce alanları doldurup yeni sürüm yayınlayın.
  - Örnek metinler güncellendiyse taslaktaki **Örnek metinle yeniden başla** taslağı güncel örnekle değiştirir (yaptığınız değişiklikler silinir; yayınlanmış sürümler değişmez). Metinde "1. Başlık" biçimindeki ilk satır başlık, "• " ile başlayan satırlar madde olarak gösterilir.
- **Açık rıza**: aydınlatma metninden ayrı ve isteğe bağlıdır. Yayınlanınca personele bir sonraki girişte ayrı bir bölümde **veriyorum / vermiyorum** seçimiyle sorulur (seçim zorunlu, hiçbiri önceden seçili değil); vermeyen kişi sistemi kullanır, yalnızca profil fotoğrafı eklenemez. Personel kararını profilinden değiştirebilir; geri alınca fotoğrafı silinir. Bütün kararlar tarih, IP ve tarayıcı bilgisiyle saklanır ve kişi verisi dışa aktarmasında ayrı sayfada yer alır. Metin yayınlanmadan profil fotoğrafı özelliği kapalı kalır.

---

## 2. Bölüm sorumlusu

Yalnızca kapsamınızdaki birimlerin personelini ve içeriklerini görürsünüz.

### İçerik kütüphanesi
- **Yönetim → İçerik kütüphanesi**: metin, PDF, video, galeri, talimat, kontrol listesi, form şablonu.
- Taslak → **Onaya gönder**. Kendi biriminizin içeriğini gönderirken bölüm onayı sizden geçer; İSG içerikleri ayrıca İSG uzmanı onayına gider.
- Yayındaki içeriği değiştirmek için **Yeni sürüm başlat**. "Tekrar oku ve onayla" seçilirse önceki sürümü okuyan herkese okuma görevi açılır.
- **İngilizce sürüm (isteğe bağlı):** editörde **İngilizce sürüm ekle** Türkçenin kopyasını açar. Metinleri çevirin; isterseniz video, PDF ya da görselleri İngilizcesiyle değiştirin. İki dil aynı sürümle onaya gider; onaycı ikisini aynı sayfada görür. İngilizce kullanan personel İngilizcesi olmayan içeriği Türkçe görür.

### Pozisyon kartı ve eğitim planı
- **Yönetim → Pozisyon kartları ve planlar**: 13 bölümlük kartı doldurun, **Plan** sekmesinde modülleri sürükleyerek sıralayın, sınav ayarlarını yapın.
- Plan tasarımcısı her teorik sınav için **soru havuzunu** gösterir; havuz soru sayısının iki katından azsa uyarır.
- Kart onaylanıp yayımlanınca bekleyen yeni girişlere plan otomatik atanır.

### Soru bankası
- **Yönetim → Soru bankası**: soru ekleyin ya da Excel'den aktarın. Her soru en az bir teorik modüle bağlanır; konu ve zorluk girilir. Soru tipleri:
  - **Çoktan seçmeli** (2–5 şık) ve **Doğru/Yanlış**.
  - **Eşleştirme:** 3–6 çift yazın (sol ↔ sağ). Sınavda sağ sütun karışık gelir; bütün çiftler doğruysa soru doğru sayılır. Excel'de Tip "Eşleştirme", A–F hücrelerine `sol = sağ`.
  - **Görselde işaretleme:** görsel yükleyin, hazır olunca doğru bölgeyi görselin üzerinde sürükleyerek çizin (dikdörtgen veya daire; birden çok bölge olabilir). Kursiyerin dokunduğu nokta bölgelerden birindeyse doğru sayılır. Yalnızca ekrandan girilir.
- **İngilizce metin (isteğe bağlı):** soru formundaki "İngilizce metin" bölümüne soruyu ve şıkları (eşleştirmede çiftleri) aynı sırayla yazın; doğru cevap aynıdır. Doğru/yanlışta şıklar kendiliğinden "True / False" olur, işaretlemede yalnızca metin çevrilir. Excel'de "(EN)" ile biten sütunlar isteğe bağlıdır.
- "İSG kritik" sorular İSG uzmanı onayıyla etkinleşir. Sınavda kullanılmış soru düzenlenince yeni sürüm açılır.

### Onaylar ve değerlendirme
- **Onay bekleyenler**: içerik ve kart onayları, **2. imzanızı bekleyen pratik sınavlar**, **işe başlama onayı bekleyenler**, karar bekleyenler.
- **Pratik sınav 2. imza**: formu inceleyin → imzalayın (sonuç kesinleşir) ya da gerekçeyle **Geri gönder** (deneme hak saymaz).
- **İşe başlama onayı**: teorik ve pratik sonuçlar tek ekranda. **İşe başlayabilir** → atama tamamlanır, sertifika düzenlenir. **Reddet** → gerekçe + tekrar açılacak modüller.
- **Pratik değerlendirme** kartından eğitmen paneline geçip kapsamınızdaki kursiyerlerin görevlerini siz de işaretleyebilirsiniz.

### Yetkinlikler
- **Yönetim → Yetkinlikler**: makine ya da iş yetkinliği tanımlayın (ad, tür, birim, geçerlilik ayı). İSG uzmanı bütün birimler ve ortak yetkinlikler için tanımlar.
- **Modül kütüphanesi → pratik modül → görevler**: bir görevi yetkinliğe bağlayın. Kişi o görevi "tek başına" tamamlayıp işe başlama onayı alınca yetkinlik kendiliğinden verilir.
- **Raporlar → Yetkinlik matrisi**: birim seçin; yeşil geçerli, sarı süresi yaklaşıyor, kırmızı dolmuş. Hücreye dokunup geçmişi görün. Mevcut personele gerekçeyle **Yetkinlik ver**, gerekirse gerekçeyle **Geri al** (kendinize veremezsiniz). Excel indirilebilir.
- Süresi yaklaşan yetkinlik için size bildirim gelir (varsayılan 30 gün kala); yenilemek için yeniden verin.

### Ekip ve raporlar
- **Ekip ilerlemesi**: kapsamınızdaki eğitimler, hedef tarihi geçenler, sınav denemeleri.
- **Raporlar**: eğitim ilerleme ve sınav sonuçları (kapsamınızla sınırlı).
- **Raporlar → Yönetim özeti**: kapsamınızdaki birimlerin göstergeleri ve son 12 ayın grafiği; Excel indirilebilir.

---

## 3. İSG uzmanı

- İSG içeriklerini, kartların İSG bölümünü ve **İSG/İSG kritik soruları** onaylarsınız (Onay bekleyenler).
- Modüllerde **"Uzaktan verilebilir mi"** ayarını belirlersiniz; uzaktan verilemeyen modüller yalnızca sınıf eğitimi kaydıyla tamamlanır.
- İSG modüllerinde **İSG konu grubunu** (genel, sağlık, teknik, diğer) seçersiniz; OSGB dosyasında ayrı sütun olarak çıkar.
- **Tehlike sınıfı**, yıllık İSG eğitim saatleri ve yenileme süreleri **Sistem → Parametreler**'dedir; tehlike sınıfı ayarlanana kadar "tehlikeli" kabul edilir ve raporda uyarı görünür.
- **Raporlar → Ziyaretçi kayıt defteri** (güvenlik + İSG) ve **Taşeron uygunluk** (İSG + İK): Excel/PDF; satın alma ile taşeron raporunu siz paylaşırsınız.
- **Raporlar → İSG eğitim kayıt defteri**: bütün personelin İSG eğitimleri, yöntem (uzaktan/yüz yüze), geçerlilik ve kişi başı yıllık saat — denetimde sunulabilir biçimde Excel/PDF.
- Aynı sayfadaki **OSGB dosyası** bölümünden dönemin İSG eğitim kayıtlarını OSGB'ye gönderilecek biçimde Excel ya da CSV olarak indirin. Eski personel için girilen son eğitim tarihleri de "Girilen tarih" kaynağıyla dosyadadır. TC kimlik no sütunu sizin dosyanızda boştur; tam TC'li dosyayı İK indirir.
- İSG modülünü tamamlayan herkes için **katılım belgesi** kendiliğinden düzenlenir.
- **Raporlar → Yönetim özeti**: bütün tesisin İSG göstergeleri; eğitimi süresi dolmuş ve 30/60/90 gün içinde dolacak kişiler, dönemde tamamlanan İSG eğitimi, İSG sınavlarında ilk denemede geçme oranı ve son 12 ay. Göstergeye dokununca süresi dolacaklar raporu açılır.
- **Güvenlik → Bilgilendirme paketleri**: her ziyaretçi tipi için kartlar ve kontrol soruları (Türkçe + İngilizce). Taslağı kaydedin, eksiksizse **Yayınla**. Yayınlanan sürüm değişmez; değişiklik için yeni sürüm hazırlayın.
- **Ziyaretçi tipleri** (soru sayısı, geçme notu, geçerlilik) Sistem → Parametreler'dedir. **Ziyaretçi kuralları** metni Sistem → Aydınlatma metinleri'ndedir.
- **Güvenlik → Taşeron firmalar** ve **Kara liste**: güvenlik görevlisiyle birlikte yönetirsiniz; kara listeye eklenen her kişi için bildirim alırsınız.

---

## 4. Güvenlik görevlisi

- **Güvenlik → Ziyaretler**: bugünden itibaren planlı ziyaretler; tarih ve durumla süzün. **Ziyaretçi kaydet** ile herhangi bir personel adına (ev sahibi sicil no) ön kayıt açın; kimlik no'yu (TC ya da pasaport) yalnızca siz girersiniz. Aynı kimlik no ile gelen kişi tanınır.
- Kara listedeki kişinin ziyareti kırmızı işaretle görünür; içeri almadan önce İSG uzmanıyla görüşün.
- **Taşeron firmalar**: firma kartı (unvan, vergi no, sözleşme bitişi). Taşeron ziyaretçide firma seçimi zorunludur.
- **Kara liste**: kimlik no ve gerekçeyle ekleyin; kaldırma da gerekçelidir. Kayıtlar değiştirilemez. Gerekçeye suç, ceza ya da sağlık bilgisi yazmayın (özel nitelikli veri).
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

- **Roller ve kapsam**: Sistem → Personel → kişi → **Roller**. Bölüm sorumlusunun hangi departman/bölümleri yönettiği de burada seçilir. İK ve sistem yöneticisi rollerinde kişinin e-postası kayıtlı ve başka kimsede olmamalıdır (bu roller e-postayla da giriş yapar).
- **Üst yönetici**: geliştirici ve kurum yöneticisi içindir; her ekranı görür ve her işlemi yapar. Bu rolü yalnızca bir üst yönetici verebilir; son üst yönetici kaldırılamaz. İSG onayı, pratik sınav imzası ve işe başlama kararı gibi işlemleri ilgili rolü olmadan yaparsanız ekranda uyarı çıkar ve işlem ayrıca kaydedilir. Kendi kaydınızı onaylayamazsınız; iki adımlı onayın iki adımını birden veremezsiniz.
- **Sistem → Ortak cihazlar**: eğitim odası bilgisayarlarını ("Ortak bilgisayar"; girişte "oturumum açık kalsın" seçilse de kısa oturum) ve kapıdaki ziyaretçi tabletini ("Kapı tableti"; `/kiosk` yalnızca bu cihazda açılır) kayıt yapılacak cihazın tarayıcısından tanımlayın. Tableti ekran sabitleme / kiosk tarayıcı modunda kullanın.
- **Sistem → Denetim kaydı**: kim, ne zaman, hangi kaydı değiştirdi; eski ve yeni değerler (hassas alanlar maskeli). Salt okunur.
- **Sistem → Giriş kayıtları**: bütün giriş ve hesap etkinleştirme denemeleri (zaman, kişi, IP, tarayıcı, sonuç). Sicil no, ad ya da IP ile ve "başarısız olanların hepsi" ile süzün; üstteki sayılar saldırı ya da kilit dalgasını bir bakışta gösterir. Excel indirilebilir (her indirme kayda geçer). Bilinmeyen kullanıcı denemelerinde yazılan metnin yalnızca ilk 3 karakteri görünür. Kayıtlar varsayılan olarak 1 yıl saklanır (Parametreler → Saklama süreleri → Giriş kayıtları; en az 30 gün).
- **Sistem → Parametreler**: sınav, eğitim, giriş, bildirim (hangi olayların e-postayla, hangilerinin telefona push olarak da gideceği; push yeniden deneme sayısı ve bekleme süresi), dosya ve saklama süresi ayarları. **Değiştir** → yeni değer → **Kaydet**; **Varsayılana dön** ile ilk değere dönülür. Her değişiklik denetim kaydına yazılır. Saklama sürelerinde gerekçe zorunludur (hukuk onayının tarihi ve dayanağı). Plan bazındaki sınav ayarları plan tasarımcısında değiştirilir; saat dilimi ekrandan değiştirilemez.
- **Kişisel verileri kalıcı olarak sil** (yalnızca üst yönetici): KVKK silme talebi gibi durumlarda geçmiş kaydı olan kişinin verisini saklama süresini beklemeden siler (geçmiş kaydı olmayan kişi **Kişiyi sil** ile tamamen silinir). Kişi önce **İşten ayrıldı olarak işaretle** ile ayrılmış olmalıdır. Kişi sayfasının altındaki **Kişiyi sil** bölümünde, 2. adımdaki **Kişisel verileri kalıcı olarak sil** → açılan pencerede silinecekleri ve kalacakları okuyun, **Silme gerekçesi** yazın (ör. "KVKK silme talebi, başvuru 06.11.2026"; kişinin adını yazmayın) ve istenen cümleyi ("Ad Soyad silmeyi onaylıyorum") aynen yazın; **Kalıcı olarak sil** ancak o zaman açılır. Ad, sicil, TC, telefon, e-posta, şifre, fotoğraf ve imza görselleri silinir; eğitim, sınav ve sertifika kayıtları isimsiz olarak saklanır. İşlem geri alınamaz; silinen kişi giriş yapamaz. Silme bitince kişi listesine dönersiniz ("Kişi silindi."); silinen kişi artık hiçbir listede, aramada ve kişi bazlı raporda görünmez.
- **Saklama süreleri**: iş ilişkisi biten personelin verisi süre dolunca her gece anonimleştirilir (ad, sicil, TC, telefon, e-posta silinir; eğitim ve sınav kayıtları isimsiz kalır, kişi listelerde ve raporlarda görünmez). Anonimleştirme geri alınamaz; olduğunda size bildirim gelir.
- **Sistem → E-posta durumu**: e-postaların hangi servisle gittiği (Resend), açık mı, gönderen adres, bugün gönderilen / günlük sınır, bekleyen, son 7 günde gönderilen ve gönderilemeyen e-postalar ve son hatalar (adresler maskeli; her hatada ne yapılacağı yazar). **Deneme e-postası gönder** ile ayarları hemen deneyebilirsiniz. Günlük sınır ve bağlantılara ayrılan pay **Parametreler → Bildirim**'dedir; sınır dolunca kalanlar ertesi güne bekler, önce şifre sıfırlama, ziyaretçi ve davet bağlantıları gider.
- **E-posta hatası** bildirimi ("Bazı e-postalar gönderilemedi") gelirse bildirime dokunun: E-posta durumu ekranı açılır. Kurulum ve sorun giderme: `docs/runbooks/email-resend.md`.
- Kurulum, güncelleme, yedekleme ve geri dönüş: `docs/runbooks/deploy.md` ve `docs/runbooks/restore.md`.
