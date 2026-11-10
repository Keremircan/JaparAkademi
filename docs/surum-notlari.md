# Sürüm notları

## Aynı sunucuda başka site (karar #298)

Japar Akademi'nin Caddy'si aynı sunucudaki başka bir web uygulamasını da yayınlayabilir (ilk örnek: Em3Task,
`gorev.japarakademi.io`). Uygulamada değişiklik yoktur; yalnızca sunucu ayarı değişir.

- Caddy, repo dışındaki `/opt/caddy-sites/*.caddy` dosyalarını içe aktarır; klasör boşsa hiçbir şey değişmez.
- Sabit adlı `edge` ağı açılır ve Japar'dan yalnızca Caddy bağlanır. Diğer uygulama Japar'ın veritabanına, dosya
  deposuna ve yedeğine erişemez.

### Güncelleme

1. Her zamanki güncelleme (`docs/runbooks/deploy.md`). Bu sürümde `$C up -d` Caddy'yi yeniden oluşturur; siteler
   birkaç saniye kesilir.
2. Kontrol (yalnızca okur): `docker network inspect edge --format '{{range .Containers}}{{.Name}} {{end}}'` çıktısında
   yalnızca Japar'ın caddy kapsayıcısı görünür.
3. Diğer siteyi eklemek için `docs/runbooks/deploy.md` → **7. Aynı sunucuda başka site**.

## Örnek veri paketi (kararlar #296–297)

Canlı sitede eğitim ve tanıtım için her eklenebilir kayıttan en az bir örnek, tek komutla yüklenir ve tek komutla
temizlenir. Örnekler Droplast/Pres İşçisi pozisyonu üzerine kurulur: içerik kütüphanesi (7 içerik türü, Türkçe +
İngilizce), modüller, soru bankası (4 soru tipi), pozisyon kartı ve eğitim planı, bir kursiyerin QR kodlu sertifikaya
kadar bütün eğitimi, yetkinlikler, periyodik eğitim, çalışma programı, ziyaretçi kayıtları ve birkaç sistem ayarı.
İçerikler resmî mevzuat ve kurum kaynaklarından derlenmiştir (`scripts/sample-data/KAYNAKLAR.md`).

- Örnek kişilerin sicili `ORNEK-…`, adlarının sonunda "(Örnek)"; giriş yapamazlar, davet gönderilmez.
- Yükleme sırasında gerçek kişilere bildirim ve e-posta gitmez; gece işleri örnek kişileri atlar (karar #297).
- Mevcut departman, bölüm, pozisyon ve personel değişmez. Yasal metinler yayınlanmaz.
- Temizlik örnek olarak işaretli kayıtları (değiştirilemez olanlar dahil) siler; gerçek kayıtlar değiştirilemez kalır
  (karar #296). Sonradan gerçek bir kayda bağlanan örnek silinmez, raporlanır.

### Güncelleme

1. Her zamanki güncelleme; veritabanı değişiklikleri `0063`–`0064` kendiliğinden uygulanır (`docs/runbooks/deploy.md`).
2. Örnek veriyi yüklemek isterseniz `docs/runbooks/sample-data.md`: önce `--check` ile ön kontrol, sonra yükleme.

## Faz 3 — Olgunlaşma

Faz 3'ün kod kapsamı tamamlandı (SPEC 16.5). Kabul kriteri: tesisin bütün personeli sistemde tanımlı ve periyodik eğitimleri sistemden izleniyor; İSG uzmanı OSGB dosyasını sistemden alıyor (pilot kontrol listesi 4.9–4.10).

| Paket | Ne geldi |
|---|---|
| 3.1 Yetkinlik matrisi | Yetkinlik tanımları (makine / görev, geçerlilik süresi), işe başlama onayında otomatik verme, bölüm sorumlusunun gerekçeyle elle verme ve geri alma, matris ve Excel'i, süre dolmadan uyarı, profilde "Yetkinliklerim" |
| 3.2 Periyodik eğitimler | Eski personelin sistem dışında aldığı son eğitim tarihleri (ekrandan ve Excel'den), süresi gelince gece kendiliğinden açılan eğitim, "Şimdi başlat" |
| 3.3 OSGB dışa aktarım | İSG eğitim kayıt defterinde OSGB Excel ve CSV dosyası; İSG modüllerinde konu grubu. Tam TC yalnızca İK'nın dosyasında yer alır ve her indirme kayda geçer |
| 3.4 Profil ve açık rıza | Ayrıntılı profil (birim, pozisyon, e-posta; telefonu kişi kendisi değiştirir), profil fotoğrafı yalnızca açık rızayla, rızayı profilden verme ve geri alma |
| 3.5 Gelişmiş raporlar | Yönetim özeti: göstergeler, son 12 ayın eğilimi (grafik ve tablo), Excel; İK ve üst yöneticiye aylık özet e-postası |
| 3.6 Kompakt arayüz | Bilgisayarda daha sık yerleşim; telefonda 48 px dokunma alanı korunur; profilde "Yazı boyutu: Normal / Büyük" |
| 3.7 Şifre sıfırlama ve e-posta | Kişi sayfasında "Şifreyi sıfırla" / "Davet gönder"; e-posta Resend ile (yedek Microsoft 365), günlük gönderim sınırı, Sistem → E-posta durumu ve deneme e-postası |
| 3.8 KVKK metinleri ve profil | "Örnek metinle başla": personel ve ziyaretçi aydınlatma metni, profil fotoğrafı açık rıza metni (TR + EN); onay düğmesi "Okudum, bilgilendirildim" |
| 3.9 Çalışma programı | Pozisyon ve vardiya başına günlük / haftalık çalışma akışı; menüde "Programım", ana sayfada "Bugünün akışı"; kişinin kendi kopyası ve güncellemede "Yeni programa geç / Kendi programımı koru" |
| 3.11 Form uyarıları | Hata mesajı Kaydet düğmesinin hemen üstünde; ekranda değilse sayfa mesaja kayar; hata dönünce yazılanlar silinmez |
| 3.12 Koyu / açık mod | Profil → Görünüm: Sistem / Açık / Koyu |
| 3.13 KVKK uyumu | Güncellenmiş örnek metinler ve "Örnek olarak yayınla"; giriş gerektirmeyen "Gizlilik ve çerezler" sayfası; girişte "Bu cihazda oturumum açık kalsın" (varsayılan kapalı); açık rızada "veriyorum / vermiyorum" seçimi zorunlu |
| 3.14 Silme | Eklenebilen kayıtlarda **Sil**; bağlı kayıt varsa "Önce onları silin", geçmişte kullanılmış kayıt için arşivleme / pasife alma; arşivli ve pasif kayıtlar listelerde gizli |
| 3.10 Faz 3 kapanışı | Bildirim listelerine sonradan eklenen türler (karar #295), Faz 3 ekranlarının uçtan uca testleri, belgeler |

### Paketler dışında gelenler

- **Giriş kayıtları:** Sistem → Giriş kayıtları; başarılı ve başarısız girişler, Excel. Kayıtlar gece saklama işinde silinir (son 30 gün korunur).
- **Kişiyi kalıcı silme (kararlar #264–268):** yalnızca üst yönetici, yalnızca işten ayrılmış kişiyi siler. Onay penceresinde uyarı ve onay cümlesi vardır; işlem geri alınamaz. Kişinin kişisel verileri silinir, eğitim kayıtları anonim kalır.
- **Kişi sayfasında tek "Kişiyi sil" bölümü (karar #290):** sistemi hiç kullanmamış kişiyi İK doğrudan siler; geçmişi olan kişi için önce "İşten ayrıldı", sonra üst yöneticinin "Kişisel verileri kalıcı olarak sil" düğmesi.
- **Vardiya türleri (karar #291):** pozisyonun vardiya düzeni listeden işaretlenir (bir ya da birden çok). Liste Sistem → Parametreler'dedir; İK de düzenleyebilir.
- **Yeni kayıt formları her açılışta boş (karar #292):** "Pozisyon ekle" gibi bağlantılar doğru birimi seçili getirir; önceki kaydın yazıları kalmaz.
- **Organizasyon ekranı (kararlar #293–294):** her departman kendi renginde bir kart; bölümler içeride girintili, pozisyonlar en altta. Departman ve bölümler kapalı başlar, adına tıklanınca açılır; "Tümünü aç / Tümünü kapat".
- **Excel'den personel aktarımı:** başlıklar harf büyüklüğü, Türkçe harf, boşluk ve noktalamadan bağımsız tanınır; "TC.Kimlik No", "Cep Tel", "GSM" gibi yaygın adlar da kabul edilir.
- **"Şifremi unuttum":** sicil no boş bırakılınca "Lütfen sicil no giriniz." uyarısı.
- **Geliştirme (karar #289):** testler geliştirme veritabanına ve dosya deposuna yazmaz; kendi veritabanlarını ve depolarını her çalıştırmada boşaltır.

### Güncelleme

1. GitHub → Actions'ta `main`'deki son **CI** çalışmasının (Docker imajları) bitmesini bekleyin (`docs/runbooks/deploy.md` → Güncelleme).
2. Sunucuda her zamanki güncelleme; bekleyen veritabanı değişiklikleri (`0043`–`0062`) kendiliğinden uygulanır:

```bash
cd /opt/japar-akademi && git pull && dc pull && dc up -d
```

3. Yedek imajı 3.13'te değişti; sunucuda bir kez `dc up -d --build backup` çalıştırın.
4. Kurum bilgileri gelene kadar: Sistem → Aydınlatma metinleri ve kurallar → **Örnek metinle yeniden başla** → **Örnek olarak yayınla** (personel aydınlatma, açık rıza, ziyaretçi metinleri). Gerçek kullanımdan önce `[[...]]` alanları doldurulup normal **Yayınla** ile yeni sürüm çıkarılır (pilot 1.5a).
5. Bildirim listeleri Parametreler'den daha önce kaydedildiyse "yetkinlik süresi yaklaşıyor" e-posta ve telefon listesine, "aylık özet" telefon listesine eklenir (karar #295). İstemiyorsanız Sistem → Parametreler → Bildirim ve e-posta'dan kaldırın.
6. Telefona bildirim (web push) sunucuda hâlâ kapalıysa (`PUSH_TRANSPORT=log`) `docs/runbooks/deploy.md` → Web push adımlarıyla açın ve pilot 2.15'teki denemeyi yapın.

## Faz 2 — Ziyaretçi ve yaygınlaştırma

Faz 2'nin kod kapsamı tamamlandı (SPEC 16.4). Kabul kriteri: bir hafta boyunca bütün ziyaretçiler sistem üzerinden girer; tahliye tatbikatında yoklama listesi telefondan alınır (pilot kontrol listesi 4.6–4.7).

| Paket | Ne geldi |
|---|---|
| 2.1 Ayarlar ve saklama | Parametreler ekranı (`/admin/settings`), olay × kanal ayarı, saklama süresi dolan kişilerin gece anonimleştirilmesi |
| 2.2 Ziyaretçi temeli | Ziyaretçi tipleri, TR/EN bilgilendirme paketleri ve soruları, taşeron firma kartı, kara liste, ziyaretçi KVKK ve kurallar metni, ön kayıt |
| 2.3a Ziyaretçi bilgilendirme | E-posta bağlantısı, kapı tableti, QR ile kendi kaydı; atlanamayan kartlar, kontrol soruları, imza |
| 2.3b Kapı | Bugünün ziyaretleri, kimlik kontrolü, kart ve KKD, giriş/çıkış, kara liste engeli, "ziyaretçiniz geldi" bildirimi |
| 2.4 Tahliye | Bağlantısız okunabilen tahliye listesi ve yoklama, PDF; ziyaretçi kayıt defteri ve taşeron uygunluk raporları |
| 2.5 Tekrar eğitimi | Süresi dolacak eğitimlerin otomatik yeniden ataması, hatırlatmalar, haftalık ekip özeti, içerik güncellik raporu |
| 2.6 Web push | Telefona/bilgisayara "Yeni bildiriminiz var" bildirimi (içerik taşımaz) |
| 2.6b Davet | Geçici şifre yerine davet: e-posta, WhatsApp paylaş, QR + kodlu kağıt; yönetici e-postayla girişi; üst yönetici (`owner`) rolü |
| 2.6c Toplu davet | Davetler ekranı: personeli önce ekleyip sonra toplu davet; WhatsApp gönderim listesi, toplu basılı kağıt |
| 2.7a Yeni soru tipleri | Eşleştirme ve görselde işaretleme soruları |
| 2.7b İngilizce | Aşağıda |

### 2.7b İngilizce (kararlar #207–214)

- **Dil tercihi:** Profil → Dil / Language. Giriş, etkinleştirme ve şifre sıfırlama ekranlarında Türkçe / English seçimi. Uygulama her girişte kişinin diliyle açılır.
- **Personel ekranları İngilizce:** giriş, etkinleştirme, profil, eğitimlerim, sınav, pratik görünümü, sertifikalarım listesi, bildirimler, KVKK onayı. Yönetim ekranları Türkçe kalır.
- **İçerik:** editörde isteğe bağlı İngilizce sürüm (Türkçenin kopyasıyla açılır; medya değiştirilebilir). İki dil aynı sürümle onaylanır. İngilizcesi olmayan içerik Türkçe gösterilir.
- **Sınav soruları:** isteğe bağlı İngilizce metin ve şıklar; doğru cevap aynı. Excel şablonunda "(EN)" sütunları.
- **KVKK:** personel aydınlatma metni TR + EN birlikte yayınlanır; kişi kendi dilindeki metni onaylar.
- **Bildirimler:** e-posta, push ve şifre sıfırlama e-postası alıcının dilinde.
- **Sesli okuma:** metnin dilinde.
- **Bütün arayüz İngilizce (karar #217):** İngilizce seçen kişi yönetim, İK, güvenlik, eğitmen ve rapor ekranlarını da İngilizce görür; Excel/PDF çıktıları indiren kişinin dilindedir. Sertifikalar ve davet mesajları Türkçe kalır.
- **Düzeltme:** Excel'den eşleştirme sorusu aktarımında çiftler kaydedilmiyordu (aktarım veritabanı kuralına takılıyordu); düzeltildi.

### Güncelleme

Sunucuda her zamanki güncelleme yeterlidir; veritabanı değişikliği (`0042`) kendiliğinden uygulanır:

```bash
cd /opt/japar-akademi && git pull && dc pull && dc up -d
```

Bundan sonra personel KVKK metninin yeni sürümleri **Türkçe ve İngilizce birlikte** yayınlanır. Şu an yayındaki Türkçe metin geçerliliğini korur; İngilizce kullanan personel onu Türkçe görür.
