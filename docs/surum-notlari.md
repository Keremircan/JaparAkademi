# Sürüm notları

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
