# Pilot kontrol listesi

Faz 1 pilotuna geçmeden önce tamamlanacaklar (SPEC 16.3 genel kabul, Bölüm 18 JAPAR'ın hazırlayacakları).
Her satırda sorumlu ve durum doldurulur.

## 1. Kararlar ve sözleşmeler

| # | İş | Sorumlu | Durum |
|---|---|---|---|
| 1.1 | Pilot bölüm ve pozisyonların seçimi | Yönetim | ☐ |
| 1.2 | Sunucu: Hostinger VPS, Almanya (karar #174) ✓; yedek için ikinci depolama seçimi | BT | ☐ |
| 1.2a | Yurt dışına aktarım için KVKK md. 9 dayanağı (ör. Hostinger ile standart sözleşme + Kurum'a bildirim) ve aydınlatma metinlerinde yurt dışı aktarım bilgisi — gerçek veri girilmeden önce | Hukuk / KVKK sorumlusu | ☐ |
| 1.2b | `owner` (üst yönetici) hesabı olan geliştirici için kurumla gizlilik / veri işleme taahhüdü (tüm personel verisine erişim; karar #192) | Hukuk / KVKK sorumlusu | ☐ |
| 1.2c | WhatsApp ile davet: bağlantı ve kişinin adı İK'nın cihazından WhatsApp (Meta) üzerinden gider (karar #188). Aydınlatma metninde belirtilmesi ya da bu kanalın kullanılmaması kararı | Hukuk / KVKK sorumlusu | ☐ |
| 1.2d | İlk üst yönetici sunucuda tanımlandı (`grant-owner.ts`); kurum yöneticisine uygulamadan üst yönetici rolü verildi | BT | ☐ |
| 1.3 | Alan adları: `APP_DOMAIN`, `FILES_DOMAIN` | BT | ☐ |
| 1.4 | M365 uygulama kaydı (Graph `Mail.Send`, uygulama izni) ve gönderen posta kutusu | BT | ☐ |
| 1.5 | KVKK aydınlatma metni (personel) — hukuk onayı | Hukuk / KVKK sorumlusu | ☐ |
| 1.6 | Saklama sürelerinin hukuk teyidi (SPEC 12.3, iş ilişkisi bitişi + 15 yıl varsayımı); onaylanan süreler Sistem → Parametreler'e gerekçesiyle girilir | Hukuk | ☐ |
| 1.7 | Anonimleştirilen personelin sertifikalarındaki ad bilgisinin saklanması (karar #124) — hukuk teyidi | Hukuk / KVKK sorumlusu | ☐ |
| 1.8 | Ziyaretçi KVKK metni ve ziyaretçi kuralları (TR + EN) — hukuk onayı, Faz 2 öncesi | Hukuk / İSG | ☐ |

## 2. Teknik kurulum (`docs/runbooks/deploy.md`)

| # | İş | Sorumlu | Durum |
|---|---|---|---|
| 2.1 | Sunucu, Docker, DNS kayıtları, 80/443 açık | BT | ☐ |
| 2.2 | `docker/.env.production` dolduruldu; gizli değerlerin kopyası kasada (TC anahtarları, `BETTER_AUTH_SECRET`, `BACKUP_FILES_PASSWORD`, age gizli anahtarı) | BT | ☐ |
| 2.3 | Stack ayakta, `/api/health` olumlu, HTTPS ve güvenlik başlıkları doğru | BT | ☐ |
| 2.4 | İlk sistem yöneticisi açıldı, şifresi değiştirildi | BT | ☐ |
| 2.5 | `MAIL_TRANSPORT=graph` ile deneme e-postası alındı (ör. şifremi unuttum) | BT | ☐ |
| 2.6 | Gece yedeği çalıştı; `BACKUP_REMOTE` uzak kopyası doğrulandı | BT | ☐ |
| 2.7 | **Sunucuda geri dönüş testi** yapıldı, `restore.md` tablosuna yazıldı | BT | ☐ |
| 2.8 | Ortak cihazlar (eğitim odası bilgisayarları) tanımlandı | Sistem yöneticisi | ☐ |
| 2.9 | Eğitim odası bilgisayarlarına Türkçe ses paketi kuruldu (sesli okuma) | BT | ☐ |
| 2.10 | Kapı tableti "Kapı tableti" olarak kaydedildi, ekran sabitleme açık; kapıya `/visit` QR afişi asıldı | Sistem yöneticisi + güvenlik | ☐ |
| 2.11 | Ziyaretçi bilgilendirme paketleri (TR + EN) ve ziyaretçi metinleri yayında; bir deneme ziyaretiyle uçtan uca denendi (ön kayıt → bilgilendirme → kapıda giriş → çıkış) | İSG + İK + güvenlik | ☐ |
| 2.12 | Ziyaretçiye verilen KKD listesi (Parametreler) ve kart numaraları kapıyla uyumlu | İSG + güvenlik | ☐ |
| 2.13 | Tahliye tatbikatında yoklama listesi telefondan alındı (Faz 2 kabul kriteri); bağlantısız okuma ve PDF yedeği denendi | İSG + güvenlik | ☐ |
| 2.14 | Süreli modüllerin geçerlilik süreleri (ör. İSG 12 ay) ve `recert.lead_days` İSG ile teyit edildi; ilk gece çalışmasında açılan tekrar eğitimleri "Süresi dolacak" raporuyla kontrol edildi. `notify.email_events` yeni Faz 2 bildirimleriyle güncellendi | İSG + İK + sysadmin | ☐ |
| 2.15 | Web push: Android Chrome'da ve iPhone'da (ana ekrana eklenmiş uygulama) profilden bildirim açıldı; bir bildirim telefona "Yeni bildiriminiz var" olarak geldi, dokununca ilgili ekran açıldı; çıkış yapınca push durdu | BT + bir kursiyer | ☐ |

## 3. Veri ve içerik (SPEC Bölüm 18)

| # | İş | Sorumlu | Durum |
|---|---|---|---|
| 3.1 | Organizasyon şeması ve pozisyon listesi girildi (İK listesiyle aynı) | İK | ☐ |
| 3.2 | Tehlike sınıfı ve İSG eğitim süre/periyotları ayarlandı (Sistem → Parametreler) | İSG uzmanı | ☐ |
| 3.3 | Rol atamaları ve bölüm sorumlusu kapsamları | Sistem yöneticisi | ☐ |
| 3.4 | Pilot pozisyonların kartları dolduruldu ve onaylandı | Bölüm sorumluları + İSG | ☐ |
| 3.5 | Ortak İSG modülleri ve içerikleri (risk değerlendirmesi, talimatlar, acil durum planı) | İSG uzmanı | ☐ |
| 3.6 | Pozisyon modülleri ve içerikleri (video, PDF, talimat) yüklendi | Bölüm sorumluları | ☐ |
| 3.7 | Pratik görev listeleri (pozisyon başına 10–30) | Ustalar + bölüm sorumluları | ☐ |
| 3.8 | Soru bankası: pozisyon başına en az 40 soru; plan tasarımcısında havuz uyarısı yok | İSG + bölüm sorumluları | ☐ |
| 3.9 | Sertifika şablonu: imza yetkilileri ve taranmış imzalar | İK + İSG | ☐ |
| 3.10 | Logonun vektörel (SVG) ve şeffaf PNG hâli (şu an JPG'den türetilmiş PNG kullanılıyor) | Kurumsal iletişim | ☐ |
| 3.11 | Pilot personelin Excel ile aktarımı; Davetler ekranından toplu davet (WhatsApp / basılı) gönderildi ve hesaplar etkinleştirildi (kararlar #185, #198–201) | İK | ☐ |
| 3.12 | Pratik eğitmen ve hedef tarihler atandı | İK | ☐ |

## 4. Kabul (SPEC 16.3)

| # | İş | Sorumlu | Durum |
|---|---|---|---|
| 4.1 | Her rol için en az bir gerçek kullanıcıyla kullanılabilirlik testi (kursiyer telefonda, eğitmen tablette dahil) | Proje ekibi | ☐ |
| 4.2 | Bir kursiyerin uçtan uca akışı: teorik → sınav (gözetmen kodu) → pratik → pratik sınav (iki imza) → işe başlama onayı → sertifika → QR doğrulama | Proje ekibi | ☐ |
| 4.3 | Kullanıcı ve yönetici kılavuzu dağıtıldı (`docs/guides/`), ekran görüntüleri gerçek veriyle eklendi | Proje ekibi | ☐ |
| 4.4 | Denetim kaydı ekranı ve rapor dışa aktarmaları kontrol edildi | İK + sistem yöneticisi | ☐ |
| 4.5 | Geri dönüş testi (2.7) başarılı | BT | ☐ |

## 5. Pilot süresince (haftalık)

- Hedef tarihi geçen eğitimler ve karar bekleyenler (Onay bekleyenler sayfası)
- E-posta hatası bildirimi var mı; `docker compose logs worker` hata var mı
- Son gece yedeğinin tarihi ve boyutu; disk doluluğu
- Kullanıcı geri bildirimleri (ayrı bir listeye)

## 6. Bilinen eksikler (pilot sonrası)

- Hata takibi (GlitchTip) kurulmadı; pilotta JSON loglar ve e-posta hatası alarmı kullanılıyor (karar #104).
- Kılavuzlarda ekran görüntüsü yok; uygulama içi "Yardım" bağlantısı Faz 2.
- Faz 2 kapsamı: web push, zamanlanmış hatırlatmalar, ziyaretçi modülü, süresi dolan eğitimler için otomatik tekrar ataması.
