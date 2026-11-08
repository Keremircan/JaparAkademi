import type { LegalKind } from "./legal";

/**
 * Örnek hukuki metinler (iş paketi 3.8, karar #245). KVKK md. 10 ve Aydınlatma Tebliği'ne göre hazırlanmış
 * başlangıç taslaklarıdır; İK ve hukuk/KVKK sorumlusu gözden geçirmeden yayınlanmaz. Kurum bilgileri
 * `[[...]]` alanı olarak kalır; doldurulmadan yalnızca "örnek olarak" yayınlanır (kararlar #246, #275). Saklama
 * süreleri ve oturum süresi güncel parametrelerden yazılır. Türkçe metin bağlayıcıdır; İngilizce metin bunu belirtir.
 * 3.13 (karar #277): metinler sistemin bugünkü veri işlemesini anlatır (çalışma programı, pratik fotoğrafları,
 * WhatsApp daveti, Resend, bildirim servisleri, yedekler, geliştirici erişimi, çerezler).
 */
export const SAMPLE_KINDS = ["kvkk_personnel", "explicit_consent_personnel", "kvkk_visitor"] as const satisfies readonly LegalKind[];
export type SampleKind = (typeof SAMPLE_KINDS)[number];

export function hasSample(kind: LegalKind): kind is SampleKind {
  return (SAMPLE_KINDS as readonly LegalKind[]).includes(kind);
}

/** Metne yazılan saklama süreleri (`retention.*` parametreleri). */
export type SampleRetention = {
  personnelYears: number;
  loginDays: number;
  auditYears: number;
  visitorYears: number;
  contractorYears: number;
  blacklistYears: number;
  /** `session.personal_days`: "Bu cihazda oturumum açık kalsın" seçilince işlemsizlikle kapanma süresi. */
  sessionDays: number;
};

type SampleLocale = "tr" | "en";
type Sample = { title: string; body: string };

/** Paragraflar boş satırla, paragraf içindeki satırlar tek satır sonuyla ayrılır (LegalTextBody böyle gösterir). */
function doc(...paragraphs: (string | string[])[]): string {
  return paragraphs.map((p) => (Array.isArray(p) ? p.join("\n") : p)).join("\n\n");
}

const EN_NOTE = "This English version is provided for your information. If it differs from the Turkish text, the Turkish text prevails.";

const CONTROLLER: Record<SampleLocale, string[]> = {
  tr: [
    "1. Veri sorumlusu",
    "Unvan: [[Şirket unvanı]]",
    "Adres: [[Adres]]",
    "MERSİS no: [[MERSİS no]]",
    "KEP adresi: [[KEP adresi]]",
    "KVKK başvuruları için e-posta: [[KVKK başvuru e-postası]]",
  ],
  en: [
    "1. Data controller",
    "Company name: [[Company name]]",
    "Address: [[Address]]",
    "MERSIS no: [[MERSIS no]]",
    "Registered e-mail (KEP) address: [[KEP address]]",
    "E-mail for data protection requests: [[KVKK request e-mail]]",
  ],
};

const TRANSFER_BASIS: Record<SampleLocale, string> = {
  tr: "Yurt dışına aktarım KVKK'nın 9. maddesine uygun olarak şu dayanakla yapılır: [[Yurt dışına aktarım dayanağı]]",
  en: "Transfers abroad are made under Article 9 of the KVKK on the following basis: [[Legal basis for transfer abroad]]",
};

const BACKUPS: Record<SampleLocale, string> = {
  tr: "Yedekler şifreli tutulur: veritabanının günlük yedekleri 30 gün, aylık yedekleri 12 ay sonra silinir; Sistem'den silinen dosyalar (ör. fotoğraf, imza görseli) dosya yedeğinden en geç 30 gün sonra silinir.",
  en: "Backups are encrypted: daily database backups are deleted after 30 days and monthly ones after 12 months; files deleted from the System (for example a photo or a signature image) are deleted from the file backup within 30 days at the latest.",
};

/** Yedeğin ikinci kopyasının yeri (karar #277): kurum seçince doldurulur. */
const BACKUP_COPY: Record<SampleLocale, string> = {
  tr: "Şifreli yedeklerin ikinci kopyası şurada tutulur: [[Yedeklerin ikinci kopyasının yeri ve ülkesi]]",
  en: "A second copy of the encrypted backups is kept at: [[Location and country of the second backup copy]]",
};

/** E-posta gönderimi (kararlar #258, #277): proje sahibi Resend'i kullanmaya devam eder. */
const EMAIL_SERVICE: Record<SampleLocale, string> = {
  tr: "E-postalar Resend Inc. (ABD) e-posta gönderim hizmeti üzerinden gönderilir; bu hizmete yalnızca e-posta adresiniz ve e-postanın içeriği (ör. bildirim metni, şifre ya da hesap bağlantısı) iletilir.",
  en: "E-mails are sent through the e-mail delivery service of Resend Inc. (USA); only your e-mail address and the content of the e-mail (for example the notification text or a password or account link) are passed to this service.",
};

/**
 * Çerezler ve cihazda tutulan bilgiler (karar #278, KVKK Çerez Uygulamaları Rehberi): yalnızca zorunlu çerezler
 * kullanılır; açık rıza gerekmez, aydınlatma yapılır. "Gizlilik ve çerezler" sayfasındaki tabloyla aynı içerik.
 */
function cookies(locale: SampleLocale, n: number, sessionDays: number): string[] {
  return locale === "tr"
    ? [
        `${n}. Çerezler ve cihazınızda tutulan bilgiler`,
        "Sistem yalnızca çalışması için gerekli çerezleri kullanır; reklam, analiz ya da başka bir şirkete ait (üçüncü taraf) çerez kullanılmaz. Bu çerezler için açık rıza gerekmez:",
        `• Oturum çerezleri: girişinizi sürdürür. Girişte "Bu cihazda oturumum açık kalsın" seçeneğini işaretlemezseniz tarayıcı kapanınca silinir ve oturumunuz kısa bir süre işlem yapmadığınızda kapanır. İşaretlerseniz oturumunuz siz çıkış yapana ya da ${sessionDays} gün işlem yapmayana kadar açık kalır; çerez çıkışta, yapmazsanız en geç bir yıl sonra silinir.`,
        "• Dil ve görünüm çerezleri: seçtiğiniz dili ve açık/koyu görünümü bu cihazda bir yıl hatırlar; yalnızca seçiminizi taşır.",
        "• Ortak cihaz çerezi: yalnızca Sistem yöneticisinin eğitim odası bilgisayarı ya da kapı tableti olarak kaydettiği cihazlarda bulunur ve o cihazı tanır.",
        "Uygulama daha hızlı açılmak için yalnızca tasarım dosyalarını (kod, yazı tipi, simge) cihazınıza kaydeder; kişisel verileriniz cihazınızda saklanmaz.",
      ]
    : [
        `${n}. Cookies and information kept on your device`,
        "The System uses only the cookies it needs to work; no advertising, analytics or third-party cookies are used. These cookies do not require explicit consent:",
        `• Session cookies: keep you signed in. If you do not tick "Keep me signed in on this device" when signing in, they are deleted when the browser closes and your session ends after a short time without activity. If you tick it, your session stays open until you sign out or for ${sessionDays} days without activity; the cookie is deleted when you sign out, or otherwise after one year at the latest.`,
        "• Language and appearance cookies: remember the language and the light/dark appearance you chose on this device for one year; they carry only your choice.",
        "• Shared device cookie: exists only on devices that a System administrator has registered as a training room computer or a gate tablet, and recognises that device.",
        "To open faster, the app stores only design files (code, fonts, icons) on your device; your personal data is not stored on your device.",
      ];
}

function rights(locale: SampleLocale, n: number): string[] {
  return locale === "tr"
    ? [
        `${n}. Haklarınız`,
        "KVKK'nın 11. maddesi uyarınca JAPAR'a başvurarak:",
        "• kişisel verilerinizin işlenip işlenmediğini öğrenme,",
        "• işlenmişse buna ilişkin bilgi talep etme,",
        "• işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme,",
        "• yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme,",
        "• eksik veya yanlış işlenmişse düzeltilmesini isteme,",
        "• KVKK'nın 7. maddesindeki şartlar çerçevesinde silinmesini veya yok edilmesini isteme,",
        "• düzeltme, silme ve yok etme işlemlerinin verilerin aktarıldığı üçüncü kişilere bildirilmesini isteme,",
        "• münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonuç ortaya çıkmasına itiraz etme,",
        "• kanuna aykırı işleme nedeniyle zarara uğramanız hâlinde zararın giderilmesini talep etme",
        "haklarına sahipsiniz.",
      ]
    : [
        `${n}. Your rights`,
        "Under Article 11 of the KVKK you may apply to JAPAR to:",
        "• learn whether your personal data is processed,",
        "• request information about the processing,",
        "• learn the purpose of the processing and whether the data is used for that purpose,",
        "• know the third parties in Türkiye or abroad to whom your data is transferred,",
        "• ask for incomplete or inaccurate data to be corrected,",
        "• ask for your data to be erased or destroyed under the conditions in Article 7 of the KVKK,",
        "• ask for corrections, erasure and destruction to be notified to the third parties who received the data,",
        "• object to a result against you that arises solely from automated analysis of your data,",
        "• claim compensation if you suffer damage because of unlawful processing.",
      ];
}

function application(locale: SampleLocale, n: number, extra?: string): string[] {
  const [heading, text] =
    locale === "tr"
      ? [
          `${n}. Başvuru`,
          "Başvurunuzu Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ'e uygun olarak yazılı şekilde 1. bölümdeki adrese, kayıtlı elektronik posta (KEP) ile 1. bölümdeki KEP adresine ya da JAPAR'a daha önce bildirdiğiniz ve kayıtlarımızda bulunan e-posta adresinizden 1. bölümdeki başvuru e-posta adresine iletebilirsiniz. Başvurunuz en geç 30 gün içinde ücretsiz olarak sonuçlandırılır.",
        ]
      : [
          `${n}. How to apply`,
          "In line with the Communiqué on the Procedures and Principles of Applications to the Data Controller, you may send your application in writing to the address in section 1, by registered e-mail (KEP) to the KEP address in section 1, or from an e-mail address you have previously given to JAPAR and that is in our records to the request e-mail address in section 1. Your application is answered free of charge within 30 days at the latest.",
        ];
  return [heading, extra ? `${text} ${extra}` : text];
}

function personnelNotice(locale: SampleLocale, r: SampleRetention): Sample {
  if (locale === "tr") {
    return {
      title: "JAPAR Akademi Çalışan Aydınlatma Metni",
      body: doc(
        `Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") 10. maddesi ve Aydınlatma Yükümlülüğünün Yerine Getirilmesinde Uyulacak Usul ve Esaslar Hakkında Tebliğ uyarınca, JAPAR Akademi eğitim sistemini ("Sistem") kullanan çalışanlarımızı kişisel verilerinin nasıl işlendiği konusunda bilgilendirmek için hazırlanmıştır. Metni Sistem'e ilk girişinizden önce de İnsan Kaynakları'ndan isteyebilir ya da giriş ekranındaki "Gizlilik ve çerezler" bağlantısından okuyabilirsiniz.`,
        CONTROLLER.tr,
        [
          "2. Hangi kişisel verileriniz işlenir",
          "Sistem'de yalnızca eğitim sürecinin, çalışma düzeninin ve Sistem güvenliğinin gerektirdiği veriler işlenir:",
          "• Kimlik: ad soyad, sicil no, T.C. kimlik numarası. T.C. kimlik numaranız şifrelenerek saklanır ve ekranda maskeli gösterilir; tamamını yalnızca İnsan Kaynakları görebilir ve her görüntüleme kayıt altına alınır.",
          "• İletişim: cep telefonu numarası ve e-posta adresi.",
          "• Özlük ve organizasyon: pozisyonunuz, bağlı olduğunuz birim, çalışma türünüz (personel veya stajyer), işe giriş ve ayrılış tarihleriniz, Sistem'deki rolleriniz.",
          "• Çalışma programı: seçtiğiniz vardiya programı ve programı kendinize göre düzenlediyseniz bu kopya.",
          "• Mesleki eğitim: eğitim atamalarınız, içerik okuma ve video izleme ilerlemeniz, sınıf eğitimlerine katılımınız, ara değerlendirme ve sınav cevaplarınız ve puanlarınız, pratik eğitim ve pratik sınav kayıtlarınız (eğitmeninizin görev sırasında çektiği fotoğraflar dahil), ekranda parmakla attığınız imzalar, işe başlama onayı, sertifikalarınız, yetkinlik kayıtlarınız ve Sistem dışında aldığınız eğitimlerin tarihleri.",
          "• Hesap: hesap etkinleştirme ve şifre yenileme davetleri (gönderildiği kanal ve zaman) ve size gönderilen bildirimler.",
          "• İşlem güvenliği: giriş kayıtları (tarih, IP adresi, tarayıcı bilgisi), sınav sırasında IP ve cihaz bilgisi, onay kayıtları ve Sistem'de yapılan işlemlerin denetim kayıtları.",
          "• Tercihler: dil, yazı boyutu ve görünüm (açık/koyu) tercihiniz, bildirim tercihleriniz ve izin verdiyseniz cihazınızın bildirim aboneliği.",
          "• Görsel kayıt: profil fotoğrafı — yalnızca ayrıca açık rıza verirseniz.",
          "Sistem'de özel nitelikli kişisel veri (ör. sağlık veya biyometrik veri) işlenmez. Ekrana attığınız imza yalnızca görüntü olarak saklanır; imzanın hızı, basıncı gibi biyometrik özellikleri kaydedilmez.",
        ],
        [
          "3. Verileriniz hangi amaçlarla işlenir",
          "• Pozisyonunuza özel teorik ve pratik eğitimlerin planlanması, yürütülmesi, ölçülmesi ve belgelendirilmesi.",
          "• İş sağlığı ve güvenliği eğitimlerinin mevzuata uygun verilmesi, kayıt altına alınması, süresi dolanların yenilenmesi ve denetimlerde gösterilmesi.",
          "• İşe başlama yetkinliğinizin değerlendirilmesi ve yetkinlik kayıtlarının tutulması.",
          "• Sertifikaların düzenlenmesi ve doğrulanabilmesi.",
          "• Vardiyanıza göre günlük ve haftalık çalışma akışınızın size gösterilmesi.",
          "• Hesabınızın etkinleştirilmesi ve şifre yenileme bağlantısının size ulaştırılması.",
          "• Size uygulama içinde, e-postayla ve izin verirseniz cihaz bildirimiyle bilgi verilmesi.",
          "• Hesabınızın ve Sistem'in güvenliğinin sağlanması, yetkisiz erişimin önlenmesi ve yapılan işlemlerin denetlenebilmesi.",
          "• Yöneticilerin ve iş sağlığı ve güvenliği uzmanının eğitim durumunu raporlayabilmesi.",
        ],
        [
          "4. Hukuki sebepler",
          "Kişisel verileriniz KVKK'nın 5. maddesinin 2. fıkrasındaki şu sebeplere dayanılarak işlenir:",
          "• (a) Kanunlarda açıkça öngörülmesi ve (ç) hukuki yükümlülüğümüzü yerine getirmemiz: başta 6331 sayılı İş Sağlığı ve Güvenliği Kanunu ve Çalışanların İş Sağlığı ve Güvenliği Eğitimlerinin Usul ve Esasları Hakkında Yönetmelik olmak üzere iş mevzuatından doğan eğitim, belgelendirme ve kayıt yükümlülükleri.",
          "• (c) İş sözleşmenizin kurulması ve ifası: pozisyonunuzun gerektirdiği eğitimlerin verilmesi, işe başlama sürecinin yürütülmesi, çalışma programınızın gösterilmesi ve hesabınızın açılması.",
          "• (e) Bir hakkın tesisi, kullanılması veya korunması: eğitim ve onay kayıtlarının olası uyuşmazlıklarda delil olarak saklanması.",
          "• (f) Temel hak ve özgürlüklerinize zarar vermemek kaydıyla meşru menfaatimiz: Sistem güvenliği, giriş ve denetim kayıtları ile raporlama.",
          "Profil fotoğrafınız yalnızca açık rızanıza dayanılarak işlenir (KVKK md. 5/1). Açık rıza vermek isteğe bağlıdır; vermemeniz Sistem'i kullanmanızı etkilemez.",
        ],
        [
          "5. Verileriniz nasıl toplanır",
          "Kimlik, iletişim ve özlük bilgileriniz İnsan Kaynakları tarafından Sistem'e tek tek ya da Excel dosyasıyla girilir. Eğitim, sınav, imza ve onay kayıtları siz ve eğitmenleriniz Sistem'i kullandıkça elektronik ortamda oluşur. Giriş ve işlem kayıtları Sistem tarafından otomatik olarak tutulur. Oturumunuzu sürdürmek ve tercihlerinizi hatırlamak için yalnızca zorunlu çerezler kullanılır (10. bölüm).",
        ],
        [
          "6. Verileriniz kimlerle paylaşılır",
          "Verilerinizi yalnızca görevi gereği ihtiyaç duyan JAPAR çalışanları ve yalnızca gerektiği kadar görür: İnsan Kaynakları, eğitmeniniz, bağlı olduğunuz bölümün sorumlusu, iş sağlığı ve güvenliği uzmanı ve Sistem yöneticileri. Güvenlik görevlileri eğitim verilerinizi göremez.",
          "Sistem'in teknik bakımını ve geliştirmesini yapan yetkili kişiler (JAPAR çalışanı ya da JAPAR adına hizmet veren yazılım geliştirici) gizlilik taahhüdüyle ve yalnızca bakım için gerektiği kadar verilerinize erişebilir.",
          "İş sağlığı ve güvenliği eğitim kayıtlarınız (ad soyad, T.C. kimlik numarası, eğitim konuları, tarihleri ve süreleri) hizmet aldığımız ortak sağlık ve güvenlik birimine (OSGB) iletilebilir. Kanunen yetkili kamu kurum ve kuruluşları (ör. iş müfettişleri, yargı mercileri) talep ettiğinde bu kurumlara bilgi verilebilir.",
          "Sertifikanızdaki karekodla açılan doğrulama sayfasında yalnızca maskelenmiş adınız, sertifikanın kapsamı, tarihleri ve geçerlilik durumu görünür; T.C. kimlik ve sicil numaranız gösterilmez.",
        ],
        [
          "7. Yurt dışına aktarım",
          "• Sunucu: Sistem, JAPAR adına kiralanan ve Hostinger'ın Almanya'daki (Avrupa Birliği) veri merkezinde bulunan bir sunucuda çalışır; verileriniz bu sunucuda saklanır.",
          `• Yedek: ${BACKUP_COPY.tr}`,
          `• E-posta: ${EMAIL_SERVICE.tr}`,
          "• WhatsApp: İnsan Kaynakları hesap etkinleştirme ya da şifre yenileme bağlantınızı WhatsApp ile gönderirse, adınız ve bağlantı İnsan Kaynakları'nın cihazından WhatsApp (Meta; sunucuları yurt dışında) üzerinden telefon numaranıza iletilir. Sistem WhatsApp'a bağlanmaz ve WhatsApp'a başka veri göndermez.",
          "• Cihaz bildirimi: izin verirseniz tarayıcınızın bildirim hizmeti (Google, Apple, Mozilla ya da Microsoft) yalnızca şifreli bir bildirim kimliği taşır; bildirimin içeriği ve kişisel bilgileriniz bu hizmetlere gönderilmez.",
          TRANSFER_BASIS.tr,
        ],
        [
          "8. Saklama süreleri",
          `• Eğitim, sınav, imza, onay ve sertifika kayıtlarınız iş ilişkinizin sona ermesinden itibaren ${r.personnelYears} yıl saklanır. Süre dolunca adınız, T.C. kimlik numaranız, telefonunuz, e-postanız ve fotoğrafınız silinir; kayıtlar anonim hale getirilir.`,
          `• Giriş kayıtları ${r.loginDays} gün, denetim kayıtları ${r.auditYears} yıl saklanır ve ardından silinir.`,
          "• Profil fotoğrafınız, açık rızanızı geri aldığınızda ya da fotoğrafı kaldırdığınızda Sistem'den hemen silinir.",
          "• Çalışma programı seçiminiz ve kendi programınız, pozisyonunuz değişince ya da kayıtlarınız anonim hale getirilince silinir.",
          `• ${BACKUPS.tr}`,
        ],
        [
          "9. Otomatik değerlendirme",
          "Sınav puanlarınızı Sistem hesaplar. İşe başlama onayı, eğitim sürecinin sonlandırılması ve yetkinlik gibi sizi etkileyen kararları her zaman yetkili bir kişi verir; Sistem sizi otomatik olarak reddetmez.",
        ],
        cookies("tr", 10, r.sessionDays),
        rights("tr", 11),
        application("tr", 12, "Sistem'de tutulan verilerinizin dökümünü İnsan Kaynakları'ndan isteyebilirsiniz."),
      ),
    };
  }
  return {
    title: "JAPAR Akademi Employee Privacy Notice",
    body: doc(
      EN_NOTE,
      'This notice is prepared under Article 10 of Personal Data Protection Law No. 6698 ("KVKK") and the Communiqué on the Procedures and Principles for the Obligation to Inform, to explain how the personal data of employees who use the JAPAR Akademi training system (the "System") is processed. You can also ask Human Resources for it before you first sign in, or read it through the "Privacy and cookies" link on the sign-in screen.',
      CONTROLLER.en,
      [
        "2. What personal data is processed",
        "Only the data needed for the training process, working arrangements and the security of the System is processed:",
        "• Identity: full name, employee number, Turkish ID number. Your ID number is stored encrypted and shown masked; only Human Resources can see it in full, and every viewing is logged.",
        "• Contact: mobile phone number and e-mail address.",
        "• Employment and organisation: your position, unit, employment type (employee or intern), start and end dates, and your roles in the System.",
        "• Work schedule: the shift schedule you chose and, if you adjusted it for yourself, your copy.",
        "• Professional training: your training assignments, reading and video progress, classroom training attendance, quiz and exam answers and scores, practical training and practical exam records (including photos your trainer takes during tasks), signatures you draw on the screen, readiness approval, certificates, competency records, and the dates of trainings you completed outside the System.",
        "• Account: account activation and password renewal invitations (the channel and time they were sent) and the notifications sent to you.",
        "• Transaction security: sign-in records (date, IP address, browser), IP and device information during exams, acknowledgement records, and audit records of actions in the System.",
        "• Preferences: language, text size and appearance (light/dark), notification preferences and, if you allow it, your device's notification subscription.",
        "• Image: profile photo — only if you give separate explicit consent.",
        "No special categories of personal data (for example health or biometric data) are processed in the System. The signature you draw on the screen is stored only as an image; biometric features such as its speed or pressure are not recorded.",
      ],
      [
        "3. Purposes",
        "• Planning, delivering, assessing and documenting the theoretical and practical training for your position.",
        "• Providing occupational health and safety (OHS) training as required by law, recording it, renewing expired training and presenting the records in inspections.",
        "• Assessing your readiness to start work and keeping competency records.",
        "• Issuing certificates and making them verifiable.",
        "• Showing you your daily and weekly work schedule for your shift.",
        "• Activating your account and delivering password renewal links to you.",
        "• Informing you in the app, by e-mail and, if you allow it, by device notifications.",
        "• Keeping your account and the System secure, preventing unauthorised access and making actions auditable.",
        "• Allowing managers and the OHS specialist to report on training status.",
      ],
      [
        "4. Legal grounds",
        "Your personal data is processed on the following grounds in Article 5(2) of the KVKK:",
        "• (a) Explicitly provided for by law and (ç) compliance with our legal obligations: training, certification and record-keeping obligations under employment law, in particular Occupational Health and Safety Law No. 6331 and the Regulation on the Procedures and Principles of Employees' Occupational Health and Safety Training.",
        "• (c) The establishment and performance of your employment contract: delivering the training your position requires, running the start-of-work process, showing your work schedule and opening your account.",
        "• (e) The establishment, exercise or protection of a right: keeping training and approval records as evidence in possible disputes.",
        "• (f) Our legitimate interest, provided that it does not harm your fundamental rights and freedoms: System security, sign-in and audit records, and reporting.",
        "Your profile photo is processed only with your explicit consent (KVKK Article 5(1)). Giving explicit consent is optional; if you do not give it, you can still use the System.",
      ],
      [
        "5. How your data is collected",
        "Your identity, contact and employment details are entered into the System by Human Resources, one by one or from an Excel file. Training, exam, signature and acknowledgement records are created electronically as you and your trainers use the System. Sign-in and action records are kept automatically by the System. Only strictly necessary cookies are used to keep you signed in and remember your preferences (section 10).",
      ],
      [
        "6. Who your data is shared with",
        "Your data is seen only by JAPAR staff who need it for their work, and only as far as needed: Human Resources, your trainer, the manager of your section, the OHS specialist and System administrators. Security staff cannot see your training data.",
        "Authorised people who maintain and develop the System (a JAPAR employee or a software developer working on behalf of JAPAR) may access your data under a confidentiality undertaking, and only as far as maintenance requires.",
        "Your OHS training records (full name, Turkish ID number, training topics, dates and durations) may be sent to the joint health and safety unit (OSGB) we work with. Authorities with legal power (for example labour inspectors and courts) may receive information when they request it.",
        "The verification page opened by the QR code on your certificate shows only your masked name, the scope of the certificate, its dates and validity; your ID number and employee number are not shown.",
      ],
      [
        "7. Transfer abroad",
        "• Server: the System runs on a server rented on behalf of JAPAR in Hostinger's data centre in Germany (European Union); your data is stored on this server.",
        `• Backup: ${BACKUP_COPY.en}`,
        `• E-mail: ${EMAIL_SERVICE.en}`,
        "• WhatsApp: if Human Resources sends your account activation or password renewal link by WhatsApp, your name and the link are sent from the Human Resources device through WhatsApp (Meta; servers abroad) to your phone number. The System does not connect to WhatsApp and sends no other data to it.",
        "• Device notifications: if you allow them, your browser's push service (Google, Apple, Mozilla or Microsoft) carries only an encrypted notification ID; the content of the notification and your personal data are not sent to these services.",
        TRANSFER_BASIS.en,
      ],
      [
        "8. Retention periods",
        `• Training, exam, signature, approval and certificate records are kept for ${r.personnelYears} years after your employment ends. After that, your name, ID number, phone number, e-mail address and photo are deleted and the records are anonymised.`,
        `• Sign-in records are kept for ${r.loginDays} days and audit records for ${r.auditYears} years; then they are deleted.`,
        "• Your profile photo is deleted from the System immediately when you withdraw your explicit consent or remove the photo.",
        "• Your work schedule choice and your own schedule are deleted when your position changes or your records are anonymised.",
        `• ${BACKUPS.en}`,
      ],
      [
        "9. Automated assessment",
        "The System calculates your exam scores. Decisions that affect you, such as readiness approval, ending a training process or competency, are always made by an authorised person; the System never rejects you automatically.",
      ],
      cookies("en", 10, r.sessionDays),
      rights("en", 11),
      application("en", 12, "You can ask Human Resources for a copy of the data held about you in the System."),
    ),
  };
}

function explicitConsent(locale: SampleLocale): Sample {
  if (locale === "tr") {
    return {
      title: "Profil Fotoğrafı İçin Açık Rıza Metni",
      body: doc(
        `JAPAR Akademi'de profil fotoğrafı kullanmak isteğe bağlıdır. Bu metin, veri sorumlusu [[Şirket unvanı]] ("JAPAR") tarafından profil fotoğrafınızın işlenmesi için 6698 sayılı Kişisel Verilerin Korunması Kanunu uyarınca açık rızanızı istemek amacıyla hazırlanmıştır. Kişisel verilerinizin işlenmesine ilişkin diğer bilgiler Çalışan Aydınlatma Metni'nde yer alır.`,
        [
          "Açık rıza verirseniz:",
          "• Yüklediğiniz fotoğraf, JAPAR adına kiralanan ve Almanya'daki (Avrupa Birliği) veri merkezinde bulunan Sistem sunucusunda saklanır. Fotoğraf yüklenirken yeniden işlenir; içindeki konum ve cihaz bilgileri silinir.",
          "• Fotoğrafınız, sizi Sistem'de tanımayı kolaylaştırmak için profilinizde ve sizi görmeye yetkili kişilerin personel ekranlarında gösterilir. Fotoğrafı siz, İnsan Kaynakları, Sistem yöneticileri, bağlı olduğunuz bölümün sorumlusu ve eğitmeniniz görür.",
          "• Fotoğrafınız başka bir amaçla kullanılmaz, yüz tanıma gibi biyometrik işlemlerde kullanılmaz ve üçüncü kişilerle paylaşılmaz.",
        ],
        "Açık rıza vermek tamamen isteğe bağlıdır. Rıza vermezseniz Sistem'i aynı şekilde kullanırsınız; yalnızca profil fotoğrafı ekleyemezsiniz.",
        "Rızanızı istediğiniz zaman Profil sayfasından geri alabilirsiniz. Geri aldığınızda fotoğrafınız Sistem'den hemen, şifreli yedeklerden en geç 30 gün içinde silinir. Rızanızı geri almanız, o zamana kadar yapılan işlemlerin hukuka uygunluğunu etkilemez.",
        'Kararınızı onay ekranında "Açık rıza veriyorum" ya da "Açık rıza vermiyorum" seçeneğiyle, daha sonra Profil sayfasından bildirirsiniz. Her karar tarih, IP adresi ve tarayıcı bilgisiyle kaydedilir.',
      ),
    };
  }
  return {
    title: "Explicit Consent for Profile Photo",
    body: doc(
      EN_NOTE,
      `Using a profile photo in JAPAR Akademi is optional. In this text the data controller [[Company name]] ("JAPAR") asks for your explicit consent, under Personal Data Protection Law No. 6698, to process your profile photo. Other information about how your personal data is processed is in the Employee Privacy Notice.`,
      [
        "If you give explicit consent:",
        "• The photo you upload is stored on the System server, rented on behalf of JAPAR in a data centre in Germany (European Union). The photo is processed again when you upload it; location and device information in it is removed.",
        "• Your photo is shown on your profile and on the staff screens of people authorised to see you, to make it easier to recognise you in the System. You, Human Resources, System administrators, the manager of your section and your trainer can see it.",
        "• Your photo is not used for any other purpose, is not used for biometric processing such as face recognition, and is not shared with third parties.",
      ],
      "Giving explicit consent is entirely optional. If you do not give it, you use the System in the same way; you just cannot add a profile photo.",
      "You can withdraw your consent at any time on the Profile page. When you withdraw it, your photo is deleted from the System immediately and from the encrypted backups within 30 days at the latest. Withdrawing consent does not affect the lawfulness of processing carried out before the withdrawal.",
      'You give your decision on the consent screen with "I give explicit consent" or "I do not give explicit consent", and later on the Profile page. Every decision is recorded with the date, IP address and browser.',
    ),
  };
}

function visitorNotice(locale: SampleLocale, r: SampleRetention): Sample {
  if (locale === "tr") {
    return {
      title: "Ziyaretçi Aydınlatma Metni",
      body: doc(
        'Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") 10. maddesi ve Aydınlatma Yükümlülüğünün Yerine Getirilmesinde Uyulacak Usul ve Esaslar Hakkında Tebliğ uyarınca, tesisimize gelen ziyaretçileri ve taşeron çalışanlarını kişisel verilerinin nasıl işlendiği konusunda bilgilendirmek için hazırlanmıştır.',
        CONTROLLER.tr,
        [
          "2. Hangi kişisel verileriniz işlenir",
          "• Kimlik: ad soyad; istenmesi hâlinde T.C. kimlik numarası ya da pasaport numarası ve ülkesi. Kimlik numaranız şifrelenerek saklanır ve ekranda maskeli gösterilir.",
          "• İletişim: verirseniz telefon numaranız ve e-posta adresiniz.",
          "• Ziyaret bilgileri: firmanız, ziyaret türü, sizi davet eden çalışan, ziyaret tarihi, giriş ve çıkış saatleri, ziyaretçi kartı numarası ve size verilen kişisel koruyucu donanım.",
          "• Bilgilendirme kayıtları: izlediğiniz güvenlik bilgilendirmesinin sürümü ve dili, kısa testteki cevaplarınız ve puanınız, kural ve aydınlatma metni onaylarınız (zaman, IP adresi, tarayıcı bilgisi) ve ekranda parmakla attığınız imza.",
          "• Güvenlik kayıtları: tesise girişinizin kısıtlanması ya da reddedilmesi hâlinde buna ilişkin kayıt ve acil durum tahliye yoklaması kayıtları.",
          "• Taşeron çalışanları için: bilgilendirmenin geçerlilik süresi.",
          "Ziyaretçilerden özel nitelikli kişisel veri (ör. sağlık veya biyometrik veri) istenmez; giriş kısıtlamasının gerekçesine suç, ceza ya da sağlık bilgisi yazılmaz. Ekrana attığınız imza yalnızca görüntü olarak saklanır.",
        ],
        [
          "3. Verileriniz hangi amaçlarla işlenir",
          "• Tesise girmeden önce iş sağlığı ve güvenliği bilgilendirmesinin yapılması ve kuralları kabul ettiğinizin kayıt altına alınması.",
          "• Tesis ve kişi güvenliğinin sağlanması; giriş ve çıkışların kayıt altına alınması.",
          "• Acil bir durumda tesis içindeki kişilerin belirlenmesi ve tahliye yoklaması yapılması.",
          "• Taşeron çalışanlarının bilgilendirme geçerliliğinin takibi.",
          "• Ziyaret ve taşeron raporlarının hazırlanması.",
        ],
        [
          "4. Hukuki sebepler",
          "Kişisel verileriniz KVKK'nın 5. maddesinin 2. fıkrasındaki şu sebeplere dayanılarak işlenir:",
          "• (a) Kanunlarda açıkça öngörülmesi ve (ç) hukuki yükümlülüğümüzü yerine getirmemiz: 6331 sayılı İş Sağlığı ve Güvenliği Kanunu ve ilgili yönetmeliklerden doğan bilgilendirme, acil durum ve kayıt yükümlülükleri.",
          "• (e) Bir hakkın tesisi, kullanılması veya korunması: bilgilendirme ve onay kayıtlarının olası uyuşmazlıklarda delil olarak saklanması.",
          "• (f) Temel hak ve özgürlüklerinize zarar vermemek kaydıyla meşru menfaatimiz: tesis ve kişi güvenliğinin sağlanması.",
        ],
        [
          "5. Verileriniz nasıl toplanır",
          "Verileriniz; sizi davet eden çalışanın yaptığı ön kayıtla, telefonunuzdan ya da tesis girişindeki ekrandan girdiğiniz bilgilerle ve güvenlik görevlisinin girişte yaptığı kayıtla elektronik ortamda toplanır. Bilgilendirme ekranları çerez kullanmaz; tesis girişindeki ekranda yalnızca o cihazı tanıyan zorunlu bir çerez bulunur.",
        ],
        [
          "6. Verileriniz kimlerle paylaşılır",
          "Verilerinizi yalnızca görevi gereği ihtiyaç duyan JAPAR çalışanları görür: güvenlik görevlileri, iş sağlığı ve güvenliği uzmanı ve sizi davet eden çalışan. Sizi davet eden çalışan kimlik numaranızı ve güvenlik kayıtlarınızı göremez. Acil bir durumda bağlantı kesilse de kullanılabilmesi için tesis içindekilerin son listesi (ad, firma, ziyaret türü, sizi davet eden çalışan, kart numarası, giriş saati ve yoklama durumu) güvenlik görevlilerinin cihazında tutulur; liste en fazla 24 saat kullanılır ve görevli çıkış yapınca silinir.",
          "Sistem'in teknik bakımını yapan yetkili kişiler (JAPAR çalışanı ya da JAPAR adına hizmet veren yazılım geliştirici) gizlilik taahhüdüyle ve yalnızca bakım için gerektiği kadar verilerinize erişebilir.",
          "Kanunen yetkili kamu kurum ve kuruluşları talep ettiğinde bu kurumlara bilgi verilebilir.",
        ],
        [
          "7. Yurt dışına aktarım",
          "Sistem, JAPAR adına kiralanan ve Hostinger'ın Almanya'daki (Avrupa Birliği) veri merkezinde bulunan bir sunucuda çalışır; verileriniz bu sunucuda saklanır. E-posta adresinizi verdiyseniz ziyaret bağlantınız Resend Inc. (ABD) e-posta gönderim hizmeti üzerinden gönderilir; bu hizmete yalnızca e-posta adresiniz ve bağlantının bulunduğu e-posta iletilir.",
          BACKUP_COPY.tr,
          TRANSFER_BASIS.tr,
        ],
        [
          "8. Saklama süreleri",
          `• Ziyaret kayıtları ziyaret tarihinden itibaren ${r.visitorYears} yıl saklanır.`,
          `• Taşeron çalışanlarının bilgilendirme ve giriş kayıtları son geçerlilik bitişinden itibaren ${r.contractorYears} yıl saklanır.`,
          `• Tesise girişi kısıtlanan kişilere ilişkin kayıtlar, kısıtlama kaldırıldıktan sonra ${r.blacklistYears} yıl saklanır.`,
          `Süre dolunca adınız, kimlik numaranız, iletişim bilgileriniz ve imzanız silinir; kayıtlar anonim hale getirilir. ${BACKUPS.tr}`,
        ],
        rights("tr", 9),
        application("tr", 10),
      ),
    };
  }
  return {
    title: "Visitor Privacy Notice",
    body: doc(
      EN_NOTE,
      'This notice is prepared under Article 10 of Personal Data Protection Law No. 6698 ("KVKK") and the Communiqué on the Procedures and Principles for the Obligation to Inform, to explain how the personal data of visitors and contractor staff who come to our site is processed.',
      CONTROLLER.en,
      [
        "2. What personal data is processed",
        "• Identity: full name; when requested, Turkish ID number or passport number and country. Your ID number is stored encrypted and shown masked.",
        "• Contact: your phone number and e-mail address, if you give them.",
        "• Visit details: your company, visit type, the employee who invited you, visit date, entry and exit times, visitor badge number and the personal protective equipment given to you.",
        "• Briefing records: the version and language of the safety briefing you watched, your answers and score in the short test, your acceptance of the rules and of this notice (time, IP address, browser) and the signature you draw on the screen.",
        "• Security records: a record if your entry to the site is restricted or refused, and emergency evacuation roll-call records.",
        "• For contractor staff: how long your briefing remains valid.",
        "No special categories of personal data (for example health or biometric data) are requested from visitors; the reason for an entry restriction never contains criminal, penalty or health information. The signature you draw on the screen is stored only as an image.",
      ],
      [
        "3. Purposes",
        "• Giving you an occupational health and safety briefing before you enter the site and recording that you accepted the rules.",
        "• Keeping the site and people safe; recording entries and exits.",
        "• Identifying the people on site and taking an evacuation roll call in an emergency.",
        "• Tracking how long contractor staff briefings remain valid.",
        "• Preparing visit and contractor reports.",
      ],
      [
        "4. Legal grounds",
        "Your personal data is processed on the following grounds in Article 5(2) of the KVKK:",
        "• (a) Explicitly provided for by law and (ç) compliance with our legal obligations: briefing, emergency and record-keeping obligations under Occupational Health and Safety Law No. 6331 and related regulations.",
        "• (e) The establishment, exercise or protection of a right: keeping briefing and acceptance records as evidence in possible disputes.",
        "• (f) Our legitimate interest, provided that it does not harm your fundamental rights and freedoms: keeping the site and people safe.",
      ],
      [
        "5. How your data is collected",
        "Your data is collected electronically through the pre-registration made by the employee who invited you, the details you enter on your phone or on the screen at the site entrance, and the record made by security staff at the gate. The briefing screens do not use cookies; the screen at the site entrance has only a strictly necessary cookie that recognises that device.",
      ],
      [
        "6. Who your data is shared with",
        "Your data is seen only by JAPAR staff who need it for their work: security staff, the OHS specialist and the employee who invited you. The employee who invited you cannot see your ID number or security records. So that it can be used in an emergency even without a connection, the latest list of people on site (name, company, visit type, the employee who invited you, badge number, entry time and roll-call status) is kept on security staff devices; the list is used for at most 24 hours and is deleted when the staff member signs out.",
        "Authorised people who maintain the System (a JAPAR employee or a software developer working on behalf of JAPAR) may access your data under a confidentiality undertaking, and only as far as maintenance requires.",
        "Authorities with legal power may receive information when they request it.",
      ],
      [
        "7. Transfer abroad",
        "The System runs on a server rented on behalf of JAPAR in Hostinger's data centre in Germany (European Union); your data is stored on this server. If you gave your e-mail address, your visit link is sent through the e-mail delivery service of Resend Inc. (USA); only your e-mail address and the e-mail containing the link are passed to this service.",
        BACKUP_COPY.en,
        TRANSFER_BASIS.en,
      ],
      [
        "8. Retention periods",
        `• Visit records are kept for ${r.visitorYears} years from the visit date.`,
        `• Contractor staff briefing and entry records are kept for ${r.contractorYears} years after the last validity ends.`,
        `• Records about people whose entry to the site is restricted are kept for ${r.blacklistYears} years after the restriction is lifted.`,
        `After that, your name, ID number, contact details and signature are deleted and the records are anonymised. ${BACKUPS.en}`,
      ],
      rights("en", 9),
      application("en", 10),
    ),
  };
}

/** Bir türün örnek metni (başlık + gövde) seçilen dilde. */
export function legalSample(kind: SampleKind, locale: SampleLocale, retention: SampleRetention): Sample {
  switch (kind) {
    case "kvkk_personnel":
      return personnelNotice(locale, retention);
    case "explicit_consent_personnel":
      return explicitConsent(locale);
    case "kvkk_visitor":
      return visitorNotice(locale, retention);
  }
}
