# E-posta kurulumu (Resend)

JAPAR Akademi e-postaları (şifremi unuttum bağlantısı, hesap daveti, ziyaretçi bağlantısı, bildirimler) **Resend**
üzerinden gönderir (iş paketi 3.7, karar #258). Bu rehber hesabın açılmasından ilk deneme e-postasına kadar olan adımları
anlatır. Microsoft 365 (Graph) yedek seçenek olarak kalır (en altta).

E-posta açılana kadar sistem e-postasız çalışır: davet ve şifre sıfırlama bağlantıları WhatsApp ya da basılı kağıtla
verilir, "Şifremi unuttum" ekranı kişiyi İK'ya yönlendirir, bildirimler uygulama içinde ve telefonda görünür.

> **Gizli değerler:** API anahtarı yalnızca sunucudaki `docker/.env.production` dosyasına yazılır ve kurumsal kasada
> saklanır. Sohbete, e-postaya, iş takibine ya da depoya yazılmaz.

## 0. Başlamadan önce

| Ne | Kim | Not |
|---|---|---|
| KVKK md. 9 dayanağı | Hukuk / KVKK sorumlusu | Resend ABD'de bir şirkettir; gönderim bölgesi İrlanda seçilse de hesap verisi ve gönderim kayıtları ABD'de tutulur. Resend'in veri işleme sözleşmesi (DPA) AB standart sözleşme maddeleri ve DPF'ye dayanır. Pilot listesi 1.4a |
| Aydınlatma metinleri | Hukuk / İK | Sistemdeki örnek metinler e-postaların Resend (ABD) üzerinden gittiğini yazar; yayındaki metinler buna göre güncellenir |
| DNS erişimi | Hostinger hesabının sahibi | `japarakademi.io` alan adının DNS'i Hostinger'dadır (ad sunucuları `dns-parking.com`); kayıtlar hPanel'den eklenir |
| Kurumsal e-posta | BT | Hesap kişisel değil, ortak bir kurumsal adresle açılır (ör. `bt@japar.com.tr`) |

**Neden alt alan adı?** Site `japarakademi.io`'dadır; gönderim için alt alan adı `mail.japarakademi.io` kullanılır
(gönderen `bildirim@mail.japarakademi.io`). Böylece otomatik e-postalar ayrı bir itibarla gider ve ileride
`japarakademi.io`'ya posta kutusu açılırsa (MX, SPF kayıtları) hiçbir kayıt çakışmaz.

## 1. Hesabı açın

1. <https://resend.com> → **Sign up**. Kurumsal adresi kullanın.
2. Hesap ayarlarından **iki adımlı doğrulamayı (2FA)** açın.
3. Ekip (team) adını "JAPAR Akademi" yapın. Bu hesabı başka bir iş için kullanmayın: günlük sayaç ve kota yalnızca
   Akademi'nin e-postalarını saymalıdır.

Ücretsiz plan: günde **100**, ayda **3.000** e-posta, 3 alan adı, 30 günlük gönderim kaydı.

## 2. Alan adını ekleyin ve doğrulatın

1. **Domains → Add Domain** → Name: `mail.japarakademi.io`.
2. **Advanced options**'ı açın:
   - **Region:** Ireland (`eu-west-1`). Varsayılan bölge başka olabilir (2026-11'de Tokyo geliyordu); mutlaka değiştirin.
   - **Custom Return-Path:** `send` (varsayılan) kalsın.
   - **Tracking Subdomain** boş, **Enable click tracking** ve **Enable open tracking** işaretsiz kalsın (bkz. 3. adım).
3. **Add domain**. Resend kayıt listesini gösterir. 2026-11-06'daki kurulumda liste şuydu:

   | Bölüm | Tür | Ad (Hostinger'a yazılan) | Değer |
   |---|---|---|---|
   | DKIM | TXT | `resend._domainkey.mail` | `p=MIGf…` (uzun ortak anahtar) |
   | SPF (Enable Sending) | CNAME | `send.mail` | `send.forge.rmta.net` |
   | SPF (Enable Sending) | CNAME | `rsend.mail` | `rsend-euw1.forge.rmta.net` |
   | DMARC (isteğe bağlı) | TXT | `_dmarc.mail` | `v=DMARC1; p=none;` |

   **Değerleri her zaman Resend ekranından birebir kopyalayın** (ekranda uzun değerlerin ortası `[…]` ile kısaltılır;
   kopyalama düğmesi tam değeri verir). Resend DMARC'ı kök ad (`_dmarc`) için önerir; biz yalnızca gönderim alt alan
   adını kapsasın diye `_dmarc.mail` kullanıyoruz.
   **"Enable receiving" altındaki MX kaydını eklemeyin:** Akademi e-posta almaz; bu kayıt gelen e-postaları da Resend'e
   yönlendirir.
4. Hostinger'da: hPanel → **Domainler** → `japarakademi.io` → **Yönet** → **DNS / Ad Sunucuları** → **DNS kayıtları**.
   Her kayıt için **Tür**, **Ad**, **Değer** (CNAME'de hedef), **TTL** (3600) girip **Kayıt Ekle**'ye basın. Hostinger
   ada alan adını kendisi ekler (`.japarakademi.io`); yalnızca tablodaki kısa adı yazın. Var olan kayıtlara (sitenin
   `A` kaydı, `www`, `dosya`, kök alan adının `MX` kaydı) dokunmayın.
5. Resend'de **I've already added the records**. Durum birkaç dakika ile birkaç saat içinde **Verified** olur.
   Kayıtların yayında olduğunu Hostinger ad sunucusuna sorarak görebilirsiniz:
   `nslookup -type=TXT resend._domainkey.mail.japarakademi.io aster.dns-parking.com`.

## 3. İzlemeyi kapatın

Açılma ve tıklama izleme kapalı olmalıdır. Tıklama izleme açıksa şifre sıfırlama ve davet bağlantıları Resend'in
izleme adresinden geçer; bu hem gizlilik hem güvenlik açısından istenmez. Alan adı eklenirken iki kutu işaretsiz
bırakılır; sonra alan adının **Configuration** sekmesinde **Enable tracking metrics → Configure** yapılmaz (izleme alt
alan adı tanımlanmadıkça izleme açılmaz).

## 4. API anahtarı oluşturun

1. **API Keys → Create API Key**.
2. Ad: `akademi-sunucu`. İzin (**Permission**): **Sending access**. Alan adı: `mail.japarakademi.io`.
3. Anahtar (`re_` ile başlar) **yalnızca bir kez** gösterilir. Doğrudan sunucudaki dosyaya yapıştırın (5. adım) ve
   kasaya koyun.

## 5. Sunucuyu ayarlayın

`docker/.env.production` dosyasında:

```bash
MAIL_TRANSPORT=resend
RESEND_API_KEY=            # 4. adımdaki anahtar
MAIL_FROM=bildirim@mail.japarakademi.io
MAIL_FROM_NAME=JAPAR Akademi
```

`MAIL_FROM` doğrulanan alan adında olmalıdır (posta kutusu açmak gerekmez; yalnızca gönderen adresidir).
Sonra uygulamayı yeniden başlatın:

```bash
C="docker compose -f docker/compose.prod.yml --env-file docker/.env.production"
$C up -d
$C logs --tail 50 worker     # "MAIL_TRANSPORT=log" uyarısı artık görünmemeli
```

Değerlerden biri eksik ya da yanlış biçimdeyse uygulama açıklayıcı bir hatayla başlamaz (`$C logs app`).

## 6. Deneyin

1. Sistem yöneticisi olarak **Sistem → E-posta durumu**.
2. "Servis: Resend", "E-posta gönderimi açık" ve gönderen adresi doğru görünmeli.
3. **Deneme e-postası gönder** → kendi adresiniz. Yeşil "servise teslim edildi" görmelisiniz; e-posta birkaç dakika
   içinde gelir (gelmezse istenmeyen e-posta klasörüne bakın).
4. E-postası kayıtlı bir hesapla giriş ekranında **Şifremi unuttum** → bağlantı gelmeli ve çalışmalı.
5. Pilot listesindeki 2.5'i işaretleyin.

Deneme başarısız olursa ekran sorunu ve yapılacağı yazar:

| Ekrandaki sorun | Olası neden | Ne yapılır |
|---|---|---|
| Kimlik doğrulama hatası | Anahtar yanlış, silinmiş ya da askıda; ayrıntıda "API anahtarında geçersiz karakter" yazıyorsa kopyalarken Türkçe harf ya da görünmez karakter girmiştir | Yeni anahtar (4. adım), `.env`'e yazın, `$C up -d` |
| Gönderim izni yok | Alan adı henüz "Verified" değil, `MAIL_FROM` başka alan adında ya da anahtar başka alan adına sınırlı | Resend → Domains durumunu ve `MAIL_FROM`'u kontrol edin |
| Gönderen adresi geçersiz | `MAIL_FROM` biçimi yanlış | Adresi düzeltin |
| E-posta reddedildi | Alıcı adresi hatalı | Kişinin e-posta adresini düzeltin |
| Gönderim kotası doldu | Günlük 100 / aylık 3.000 doldu | Bekleyenler kota sıfırlanınca kendiliğinden gider |
| Bağlantı kurulamadı | Sunucu dışarıya çıkamıyor. Parantezdeki kod nedeni söyler: `ENOTFOUND` ad çözümlenemedi (DNS), `UND_ERR_CONNECT_TIMEOUT` / `TIMEOUT` bağlantı zaman aşımı, `ECONNREFUSED` / `ECONNRESET` bağlantı reddedildi | Tek seferlikse yeniden deneyin (bekleyenler kendiliğinden yeniden denenir). Sürüyorsa sunucudan `api.resend.com:443` erişimini (güvenlik duvarı, DNS) kontrol edin |

## 7. Günlük sınır

**Sistem → Parametreler → Bildirim**:

- **Günlük e-posta sınırı** (`mail.daily_limit`): 100 (ücretsiz plan). Sayaç UTC gününe göredir; Türkiye saatiyle
  03:00'te sıfırlanır (Resend ile aynı).
- **Bağlantı e-postalarına ayrılan pay** (`mail.link_reserve`): 20. Günün son 20 e-postalık hakkı yalnızca şifre
  sıfırlama, davet ve ziyaretçi bağlantılarına ayrılır; bildirim e-postaları bu payı kullanamaz.

Sıra her zaman: şifre sıfırlama → ziyaretçi bağlantısı → hesap daveti → bildirimler. Sınır dolunca kalanlar ertesi güne
bekler; bu bir hata değildir ve alarm göndermez. Çok kişilik e-posta davetlerini birkaç güne yayın ya da WhatsApp /
basılı kanalı kullanın.

Ücretli plana (Pro: ayda 50.000, günlük sınır yok) geçilirse sınırı `0` (sınırsız) yapın.

## 8. İzleme

- **Sistem → E-posta durumu:** bugünkü sayaç, bekleyen, son 7 gün ve son hatalar (adresler maskeli).
- Kalıcı hata olursa sistem yöneticilerine "Bazı e-postalar gönderilemedi" bildirimi gelir; bildirim bu ekranı açar.
- Resend panelindeki **Emails** listesi 30 gün tutulur ve alıcı adreslerini içerir; yalnızca BT bakar.

## 9. Anahtarı yenileme

1. Resend'de yeni anahtar oluşturun (4. adım).
2. `docker/.env.production`'da `RESEND_API_KEY`'i değiştirin, `$C up -d`.
3. E-posta durumu ekranından deneme gönderin.
4. Eski anahtarı Resend'de silin; kasadaki kopyayı güncelleyin.

Anahtar sızdıysa önce eskisini silin, sonra yenisini girin (arada e-postalar bekler, kaybolmaz).

## Yedek seçenek: Microsoft 365 (Graph)

Resend kullanılamazsa kurumun Microsoft 365 kiracısıyla gönderilebilir (`MAIL_TRANSPORT=graph`):

1. Paylaşılan bir posta kutusu (ör. `akademi@japar.com.tr`) → `MAIL_FROM`.
2. Entra ID'de uygulama kaydı → **Microsoft Graph → Application permission → Mail.Send** → yönetici onayı.
3. Uygulamayı yalnızca bu posta kutusuyla sınırlayın (Exchange "RBAC for Applications" ya da Application Access Policy);
   aksi hâlde uygulama kiracıdaki her posta kutusundan gönderebilir.
4. `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET` (istemci gizli anahtarının bitiş tarihini takvime yazın).
5. Günlük sınırı Microsoft 365 sınırlarına göre yükseltin ya da `0` yapın.
