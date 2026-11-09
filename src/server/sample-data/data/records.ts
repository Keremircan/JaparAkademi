import type { ModuleKey } from "./questions";

/**
 * Örnek kişiler, modüller, yetkinlikler, ziyaretçi kayıtları ve sistem öğeleri (karar #296).
 * Kişi adlarında "(Örnek)" bulunur; giriş yapamazlar (şifreleri kimseye verilmez, davet gönderilmez).
 */

export const SAMPLE_POSITION_CODE = "MAK-DROPLAST-PRES";

export type PersonKey = "trainer" | "manager" | "ohs" | "security" | "learner" | "per1" | "per2" | "per3";

export const PEOPLE: Record<PersonKey, { sicilNo: string; fullName: string; hireDate: string; inPosition: boolean }> = {
  trainer: { sicilNo: "ORNEK-EGT", fullName: "Murat Aydın (Örnek)", hireDate: "2016-09-12", inPosition: false },
  manager: { sicilNo: "ORNEK-BSR", fullName: "Selin Kaya (Örnek)", hireDate: "2014-02-03", inPosition: false },
  ohs: { sicilNo: "ORNEK-ISG", fullName: "Deniz Arslan (Örnek)", hireDate: "2019-05-20", inPosition: false },
  security: { sicilNo: "ORNEK-GUV", fullName: "Hakan Demir (Örnek)", hireDate: "2020-10-01", inPosition: false },
  learner: { sicilNo: "ORNEK-KUR", fullName: "Emre Yıldız (Örnek)", hireDate: "", inPosition: true },
  per1: { sicilNo: "ORNEK-PER1", fullName: "Burak Çelik (Örnek)", hireDate: "2019-03-04", inPosition: true },
  per2: { sicilNo: "ORNEK-PER2", fullName: "Ayşe Koç (Örnek)", hireDate: "2021-06-14", inPosition: true },
  per3: { sicilNo: "ORNEK-PER3", fullName: "Mehmet Öztürk (Örnek)", hireDate: "2022-11-07", inPosition: true },
};

export type ModuleSpec = {
  key: ModuleKey | "practice" | "exam" | "practicalExam";
  kind: "theory" | "practice" | "theory_exam" | "practice_exam";
  title: string;
  description: string;
  durationMin: number;
  isOhs: boolean;
  remoteAllowed: boolean;
  validityMonths: number | null;
  ohsTopic: "general" | "health" | "technical" | "other" | null;
};

export const MODULES: ModuleSpec[] = [
  {
    key: "pressSafety",
    kind: "theory",
    title: "Duroplast Pres Hattında Güvenli Çalışma",
    description: "Pres hattının tehlikeleri, vardiya başı kontroller, güvenli çalışma kuralları ve kilitleme-etiketleme.",
    durationMin: 90,
    isOhs: false,
    remoteAllowed: true,
    validityMonths: null,
    ohsTopic: null,
  },
  {
    key: "ohsBasics",
    kind: "theory",
    title: "Temel İSG ve KKD",
    description: "Çalışanın hak ve yükümlülükleri, kişisel koruyucu donanımlar ve standartları, ramak kala bildirimi.",
    durationMin: 60,
    isOhs: true,
    remoteAllowed: true,
    validityMonths: 24,
    ohsTopic: "general",
  },
  {
    key: "fire",
    kind: "theory",
    title: "Yangın Güvenliği ve Tahliye",
    description: "Yangının önlenmesi, söndürücü seçimi ve kullanımı, alarm ve tahliye. Uygulamalı söndürmeyle sınıf eğitimi olarak verilir.",
    durationMin: 45,
    isOhs: true,
    remoteAllowed: false,
    validityMonths: 12,
    ohsTopic: "technical",
  },
  {
    key: "practice",
    kind: "practice",
    title: "Duroplast Pres Uygulamalı Eğitimi",
    description: "Eğitmen gözetiminde vardiya başı testleri, doz hazırlama, güvenli çevrim, kilitleme-etiketleme ve kalıp değişimine yardım.",
    durationMin: 480,
    isOhs: false,
    remoteAllowed: false,
    validityMonths: null,
    ohsTopic: null,
  },
  {
    key: "exam",
    kind: "theory_exam",
    title: "Droplast/Pres İşçisi Teorik Sınavı",
    description: "Pres güvenliği, temel İSG ve yangın konularından gözetmenli sınav.",
    durationMin: 20,
    isOhs: false,
    remoteAllowed: true,
    validityMonths: null,
    ohsTopic: null,
  },
  {
    key: "practicalExam",
    kind: "practice_exam",
    title: "Droplast/Pres İşçisi Pratik Sınavı",
    description: "Kursiyer, değerlendirenin gözetiminde bütün görevleri bağımsız uygular; kritik görevlerin hepsi geçilmelidir.",
    durationMin: 60,
    isOhs: false,
    remoteAllowed: false,
    validityMonths: null,
    ohsTopic: null,
  },
];

/** Teorik modüllerin içerikleri (sıra önemli). */
export const MODULE_CONTENTS: Record<ModuleKey, ("pressRules" | "isgPdf" | "shiftVideo" | "ppeGallery" | "loto" | "checklist" | "nearMiss" | "fire")[]> = {
  pressSafety: ["pressRules", "shiftVideo", "checklist", "loto"],
  ohsBasics: ["isgPdf", "ppeGallery", "nearMiss"],
  fire: ["fire"],
};

/** Plan ayarları (plan sabitlenir; genel parametrenin yerine geçer). */
export const EXAM_SETTINGS = { questionCount: 10, durationMin: 20, passScore: 70, maxAttempts: 3, cooldownHours: 24, proctorRequired: true };
export const PRACTICAL_SETTINGS = { passScore: 80, maxAttempts: 2 };

export type CompetencyKey = "press" | "moldChange" | "forklift" | "loto";

export const COMPETENCIES: Record<CompetencyKey, { name: string; kind: "machine" | "task"; description: string; validityMonths: number }> = {
  press: {
    name: "Duroplast pres kullanımı",
    kind: "machine",
    description: "Presi güvenlik testleriyle hazırlamak, ürün föyüne göre ayarlamak ve güvenli çevrimle üretim yapmak.",
    validityMonths: 24,
  },
  moldChange: {
    name: "Kalıp değiştirme ve ayar",
    kind: "task",
    description: "Bakım ekibiyle birlikte, kilitleme ve etiketleme altında kalıp söküp takmak ve ilk ürün ayarını yapmak.",
    validityMonths: 24,
  },
  forklift: {
    name: "Forklift kullanımı",
    kind: "machine",
    description: "Operatör belgesi olan çalışanın işyerindeki güzergâh, yük ve yaya kurallarına göre forklift kullanması.",
    validityMonths: 12,
  },
  loto: {
    name: "Kilitleme ve etiketleme (LOTO)",
    kind: "task",
    description: "Enerji kaynaklarını ayırmak, kişisel kilit ve etiket takmak, birikmiş enerjiyi boşaltıp sıfır enerjiyi doğrulamak.",
    validityMonths: 12,
  },
};

export const PRACTICE_TASKS: { title: string; description: string; isCritical: boolean; competency: CompetencyKey }[] = [
  {
    title: "Vardiya başı güvenlik testleri",
    description: "Kontrol listesini doldurur; acil durdurma, ışık perdesi ve iki el kumandasını test eder, uygunsuzlukta presi çalıştırmaz.",
    isCritical: true,
    competency: "press",
  },
  {
    title: "Doz hazırlama ve kalıp doldurma",
    description: "Ürün föyündeki miktarı hassas terazide tartar ve kalıp gözlerine eşit dağıtır; dökülen tozu vakumla toplar.",
    isCritical: false,
    competency: "press",
  },
  {
    title: "Güvenli pres çevrimi ve ürün alma",
    description: "Çevrimi iki el kumandasıyla başlatır, kürlenme süresine uyar, ürünü maşayla alır ve çapağını temizler.",
    isCritical: true,
    competency: "press",
  },
  {
    title: "Kilitleme ve etiketleme uygulaması",
    description: "Sıkışma senaryosunda enerji kaynaklarını ayırır, kilidini ve etiketini takar, basıncı boşaltır ve sıfır enerjiyi doğrular.",
    isCritical: true,
    competency: "loto",
  },
  {
    title: "Kalıp değişiminde yardım",
    description: "Bakım ekibiyle LOTO altında kalıp değişimine yardım eder, ilk ürünü ölçtürüp onaylatır.",
    isCritical: false,
    competency: "moldChange",
  },
];

/** Pratik eğitim işaretleme notları (gösterdi → gözetimde → bağımsız). */
export const PRACTICE_NOTES = {
  demonstrated: "Eğitmen adımları tek tek gösterdi; kursiyer soruları yanıtlandı.",
  supervised: "Kursiyer eğitmen gözetiminde uyguladı; küçük düzeltmeler yapıldı.",
  independent: "Kursiyer görevi yardım almadan, doğru sırayla ve güvenli şekilde uyguladı.",
};

export const PRACTICAL_EXAM = {
  criterionNote: "Görev eksiksiz ve güvenli uygulandı.",
  note: "Bütün kritik görevler bağımsız ve doğru uygulandı. Kilitleme-etiketlemede sıfır enerji doğrulaması atlanmadı.",
};

export const READINESS_COMMENT =
  "Teorik ve pratik sınavları başarıyla tamamladı; vardiya başı testlerini ve kilitleme-etiketlemeyi bağımsız uyguluyor. İşe başlaması uygundur.";

export const MANUAL_GRANT = {
  person: "per1" as PersonKey,
  competency: "forklift" as CompetencyKey,
  reason: "Forklift operatör belgesi görüldü; işyeri güzergâhı ve yük kurallarına göre uygulamalı değerlendirme yapıldı.",
};

export const PRIOR = {
  screen: { person: "per1" as PersonKey, module: "ohsBasics" as ModuleKey, monthsAgo: 23, note: "Sistem öncesi temel İSG eğitimi; katılım formu personel dosyasında." },
  excel: { person: "per2" as PersonKey, module: "fire" as ModuleKey, monthsAgo: 11, note: "Sistem öncesi yangın ve tahliye eğitimi (Excel ile aktarıldı)." },
};

export const CLASSROOM = {
  location: "Eğitim salonu",
  durationMin: 45,
  notes: "Uygulamalı söndürme: karbondioksitli ve kuru kimyevi tozlu söndürücüyle başlangıç yangınına müdahale. Tahliye güzergâhı ve toplanma alanı yerinde gösterildi.",
};

export const PROCTOR_LOCATION = "Eğitim salonu, 2 numaralı bilgisayar";

export const WORK_SCHEDULE = {
  name: "Gündüz vardiyası akışı",
  kind: "daily" as const,
  days: [1, 2, 3, 4, 5],
  startTime: "07:00",
  items: [
    { weekday: null, time: "07:00", title: "Vardiya devri ve kontrol listesi", note: "Önceki vardiyanın notlarını okuyun; güvenlik testlerini yapın." },
    { weekday: null, time: "07:20", title: "İlk ürün onayı", note: "İlk parçayı ölçüp vardiya amirine onaylatın." },
    { weekday: null, time: "09:30", title: "Kısa mola", note: null },
    { weekday: null, time: "11:30", title: "Kalıp temizliği ve ara kontrol", note: "Ayırıcıyı yenileyin, zemindeki tozu toplayın." },
    { weekday: null, time: "12:00", title: "Öğle arası", note: null },
    { weekday: null, time: "14:30", title: "Kısa mola", note: null },
    { weekday: null, time: "15:30", title: "Vardiya sonu temizliği ve devir notu", note: "Üretim formunu kapatın." },
  ],
  /** Kursiyerin kendi kopyasına eklediği madde. */
  personalItem: { weekday: null, time: "13:00", title: "Eğitmenle günlük değerlendirme", note: "İlk iki hafta boyunca." },
};

export const SIGNATORY = { name: "Zeynep Er (Örnek)", title: "Fabrika Müdürü" };
export const PPE_ITEM = "Toz maskesi (FFP2)";
export const DEVICE_NAME = "Örnek Kiosk – Ziyaretçi Girişi";

export const COMPANY = { name: "Örnek Endüstriyel Bakım Ltd. Şti.", responsibleName: "Kemal Şahin (Örnek)" };

export const BLACKLIST = {
  fullName: "Can Yılmaz (Örnek)",
  idCountry: "XX",
  idNumber: "ORNEK00001",
  reason: "Örnek kayıt: iş izni olmadan sıcak iş yapıldığı için tesise girişi bir yıl süreyle durduruldu.",
};

export const VISITOR = {
  fullName: "Ali Vural (Örnek)",
  idCountry: "XX",
  idNumber: "ORNEK00002",
  note: "Pres hattı hidrolik ünitesinin periyodik bakımı.",
  badgeNo: "Y-014",
};

/** Yüklenici bilgilendirme paketi (TR + EN). */
export const BRIEFING = {
  cards: [
    {
      titleTr: "Tesise giriş",
      bodyTr:
        "Tesise yalnızca güvenlikten aldığınız yaka kartıyla girersiniz. Kartı görünür taşıyın ve başkasına vermeyin. Çalışma alanınız ve yetkili kişiniz girişte size bildirilir; bu alanın dışına izinsiz geçmeyin.",
      titleEn: "Entering the site",
      bodyEn:
        "You enter the site only with the badge issued by security. Wear it visibly and never lend it to anyone. Your work area and responsible person are given to you at the gate; do not go outside this area without permission.",
    },
    {
      titleTr: "İş izni",
      bodyTr:
        "Sıcak iş (kaynak, kesme, taşlama), yüksekte çalışma, kapalı alana giriş ve elektrik işleri yazılı iş izni olmadan başlamaz. İzin formu iş yerinde bulunur. Koşullar değişirse iş durur ve izin yenilenir.",
      titleEn: "Permit to work",
      bodyEn:
        "Hot work (welding, cutting, grinding), work at height, confined space entry and electrical work never start without a written permit. The permit stays at the job site. If conditions change, work stops and the permit is renewed.",
    },
    {
      titleTr: "Kişisel koruyucu donanım",
      bodyTr:
        "Üretim alanında güvenlik ayakkabısı, reflektörlü yelek ve göz koruyucu zorunludur. İşaretli gürültülü alanlarda kulak koruyucu, üstünüzde çalışma varsa baret takın. Eksik donanımı güvenlikten alabilirsiniz.",
      titleEn: "Personal protective equipment",
      bodyEn:
        "Safety shoes, a high-visibility vest and eye protection are mandatory in production areas. Wear hearing protection in marked noisy areas and a hard hat when work is going on above you. Security can give you any missing equipment.",
    },
    {
      titleTr: "Makineler ve enerji",
      bodyTr:
        "Çalışan makinelere, preslere ve elektrik panolarına dokunmayın. Bakım ya da onarım yapacaksanız makine sorumlusuyla birlikte enerji kaynaklarını ayırıp kendi kilidinizi ve etiketinizi takın. Kilidinizi yalnızca siz sökersiniz.",
      titleEn: "Machines and energy",
      bodyEn:
        "Do not touch running machines, presses or electrical panels. Before maintenance or repair, isolate the energy sources together with the person responsible for the machine and apply your own lock and tag. Only you remove your lock.",
    },
    {
      titleTr: "Araç trafiği ve forklift",
      bodyTr:
        "İşaretli yaya yollarını kullanın. Forkliftin arkasından ve yükün altından geçmeyin; sürücüyle göz teması kurmadan yaklaşmayın. Araçla girdiyseniz tesis içindeki hız ve yön işaretlerine uyun.",
      titleEn: "Vehicles and forklifts",
      bodyEn:
        "Use the marked pedestrian walkways. Never walk behind a forklift or under a load, and do not approach without eye contact with the driver. If you drive in, follow the speed and direction signs on site.",
    },
    {
      titleTr: "Acil durum",
      bodyTr:
        "Alarm duyduğunuzda işi güvenli şekilde durdurun ve yeşil kaçış işaretlerini izleyerek toplanma alanına gidin. Asansör kullanmayın. Toplanma alanında yetkilinize kendinizi bildirin. Kaza ya da yaralanmada hemen haber verin; acil çağrı numarası 112'dir.",
      titleEn: "Emergencies",
      bodyEn:
        "When you hear the alarm, stop work safely and follow the green exit signs to the assembly point. Do not use lifts. Report to your responsible person at the assembly point. Report any accident or injury at once; the emergency number is 112.",
    },
    {
      titleTr: "Düzen, atık ve genel kurallar",
      bodyTr:
        "Sigara yalnızca işaretli alanda içilir. Atıkları ayrılmış kaplara atın; kimyasal ve yağlı atıkları yetkiliye teslim edin. Tesiste izinsiz fotoğraf ve video çekilmez. Alkol ya da uyuşturucu etkisinde çalışmak yasaktır.",
      titleEn: "Housekeeping, waste and general rules",
      bodyEn:
        "Smoking is allowed only in the marked area. Put waste in the separate bins; hand chemical and oily waste to the responsible person. No photos or videos without permission. Working under the influence of alcohol or drugs is prohibited.",
    },
  ],
  questions: [
    {
      stemTr: "Sıcak iş (kaynak, kesme, taşlama) ne zaman başlayabilir?",
      stemEn: "When may hot work (welding, cutting, grinding) start?",
      optionsTr: ["Vardiya amiri sözlü izin verince", "Yazılı iş izni alındıktan sonra", "Yakında söndürücü varsa hemen"],
      optionsEn: ["When the shift supervisor gives verbal permission", "After a written permit to work is issued", "At once if an extinguisher is nearby"],
      correctIndex: 1,
    },
    {
      stemTr: "Kilitleme ve etiketlemede kişisel kilidi kim söker?",
      stemEn: "In lockout/tagout, who removes a personal lock?",
      optionsTr: ["Kilidi takan kişi", "Güvenlik görevlisi", "Makinenin operatörü"],
      optionsEn: ["The person who applied it", "The security officer", "The machine operator"],
      correctIndex: 0,
    },
    {
      stemTr: "Üretim alanında hangi donanım her zaman zorunludur?",
      stemEn: "Which equipment is always mandatory in production areas?",
      optionsTr: ["Yalnızca eldiven", "Kısa süreli girişte hiçbiri", "Güvenlik ayakkabısı, reflektörlü yelek ve göz koruyucu"],
      optionsEn: ["Gloves only", "None for a short visit", "Safety shoes, high-visibility vest and eye protection"],
      correctIndex: 2,
    },
    {
      stemTr: "Alarm duyduğunuzda ne yaparsınız?",
      stemEn: "What do you do when you hear the alarm?",
      optionsTr: ["İşimi bitirip çıkarım", "İşi güvenli şekilde durdurup toplanma alanına giderim", "Asansörle en hızlı şekilde inerim"],
      optionsEn: ["Finish my job and then leave", "Stop work safely and go to the assembly point", "Take the lift down as fast as possible"],
      correctIndex: 1,
    },
    {
      stemTr: "Forklift yaklaşırken ne yapmalısınız?",
      stemEn: "What should you do when a forklift approaches?",
      optionsTr: ["Sürücüyle göz teması kurup yaya yolunda beklerim", "Yükün altından hızla geçerim", "Arkasından takip ederim"],
      optionsEn: ["Make eye contact with the driver and wait on the walkway", "Pass quickly under the load", "Follow behind it"],
      correctIndex: 0,
    },
    {
      stemTr: "Tesiste fotoğraf ya da video çekmek için ne gerekir?",
      stemEn: "What do you need to take photos or videos on site?",
      optionsTr: ["İzin gerekmez", "Telefonun sessizde olması", "Yetkili kişinin izni"],
      optionsEn: ["No permission is needed", "Having the phone on silent", "Permission from the responsible person"],
      correctIndex: 2,
    },
    {
      stemTr: "Çalışma alanınızın dışına geçmeniz gerekirse ne yaparsınız?",
      stemEn: "What do you do if you need to go outside your work area?",
      optionsTr: ["Yetkili kişime haber verip izin alırım", "Yaka kartım olduğu için her yere girerim", "Kimseye haber vermem gerekmez"],
      optionsEn: ["Tell my responsible person and get permission", "Go anywhere because I have a badge", "I do not need to tell anyone"],
      correctIndex: 0,
    },
    {
      stemTr: "Yağlı ve kimyasal atıklar ne yapılır?",
      stemEn: "What is done with oily and chemical waste?",
      optionsTr: ["Genel çöp kutusuna atılır", "Yetkiliye teslim edilir", "Lavaboya dökülür"],
      optionsEn: ["Put in the general bin", "Handed to the responsible person", "Poured down the sink"],
      correctIndex: 1,
    },
    {
      stemTr: "Biri yaralandığında ilk ne yapılır?",
      stemEn: "What is done first when someone is injured?",
      optionsTr: ["İş bitince bildirilir", "Kimseye söylenmez", "Yetkiliye hemen haber verilir, gerekirse 112 aranır"],
      optionsEn: ["Report it when the job is finished", "Tell nobody", "Inform the responsible person at once and call 112 if needed"],
      correctIndex: 2,
    },
    {
      stemTr: "Çalışan bir makinenin koruyucusunu kim açabilir?",
      stemEn: "Who may open the guard of a running machine?",
      optionsTr: ["Kimse; makine durdurulup enerjisi kilitlenmeden açılmaz", "Deneyimli yüklenici çalışanı", "Kısa bir kontrol için herkes"],
      optionsEn: ["Nobody; it is not opened until the machine is stopped and locked out", "An experienced contractor", "Anyone, for a quick check"],
      correctIndex: 0,
    },
  ],
};

/** Ziyaretçi ve yüklenici kuralları taslağı (YAYINLANMAZ; İSG uzmanı gözden geçirip yayınlar). */
export const VISITOR_RULES = {
  tr: {
    title: "Ziyaretçi ve Yüklenici Kuralları",
    body: [
      "1. Giriş ve kimlik",
      "• Tesise güvenlikte kaydınız yapılıp yaka kartınız verildikten sonra girersiniz.",
      "• Yaka kartınızı görünür taşıyın ve çıkışta güvenliğe teslim edin.",
      "• Ev sahibiniz ya da yetkili kişiniz olmadan üretim alanına girmeyin.",
      "",
      "2. Güvenlik",
      "• Size verilen kişisel koruyucu donanımı tesis içinde sürekli kullanın.",
      "• İşaretli yaya yollarını kullanın; makinelere, panolara ve malzemelere dokunmayın.",
      "• Yetkili kişinin izni olmadan fotoğraf ve video çekmeyin.",
      "",
      "3. Acil durum",
      "• Alarm duyduğunuzda yetkili kişinizi izleyerek toplanma alanına gidin ve kendinizi bildirin.",
      "• Kaza, yaralanma ya da tehlikeli bir durum gördüğünüzde hemen haber verin.",
      "",
      "4. Yükleniciler için ek kurallar",
      "• Sıcak iş, yüksekte çalışma, kapalı alana giriş ve elektrik işleri yazılı iş izniyle yapılır.",
      "• Bakım ve onarımda enerji kaynakları ayrılıp kilitlenir; kilidi yalnızca takan kişi söker.",
      "• İş bitince alanı temiz bırakın ve atıkları yetkiliye teslim edin.",
      "",
      "Bu kurallara uyulmadığında ziyaret ya da çalışma yetkili kişi tarafından durdurulabilir.",
    ].join("\n"),
  },
  en: {
    title: "Visitor and Contractor Rules",
    body: [
      "1. Entry and identification",
      "• You enter the site after security has registered you and issued your badge.",
      "• Wear your badge visibly and return it to security when you leave.",
      "• Do not enter production areas without your host or responsible person.",
      "",
      "2. Safety",
      "• Use the personal protective equipment you are given at all times on site.",
      "• Use the marked walkways; do not touch machines, panels or materials.",
      "• Do not take photos or videos without permission from the responsible person.",
      "",
      "3. Emergencies",
      "• When you hear the alarm, follow your responsible person to the assembly point and report there.",
      "• Report any accident, injury or dangerous situation at once.",
      "",
      "4. Additional rules for contractors",
      "• Hot work, work at height, confined space entry and electrical work require a written permit.",
      "• For maintenance and repair, energy sources are isolated and locked; only the person who applied a lock removes it.",
      "• Leave the area clean when the job is done and hand waste to the responsible person.",
      "",
      "If these rules are not followed, the responsible person may stop the visit or the work.",
    ].join("\n"),
  },
};

/** Video slaytları (her biri birkaç saniye; TR ve EN ayrı video). */
export const VIDEO_SLIDES = {
  tr: [
    "Vardiya Başında Pres Hazırlığı",
    "1. KKD: göz koruyucu, ısıya dayanıklı eldiven, güvenlik ayakkabısı",
    "2. Koruyucular yerinde ve hasarsız mı?",
    "3. Işık perdesi ve iki el kumandası testi",
    "4. Acil durdurma: bas, durdu mu?",
    "5. Kalıp sıcaklığı ve hidrolik kaçak kontrolü",
    "6. İlk ürünü ölçtür ve onaylat",
  ],
  en: [
    "Preparing the Press at Shift Start",
    "1. PPE: eye protection, heat-resistant gloves, safety shoes",
    "2. Are the guards in place and undamaged?",
    "3. Test the light curtain and two-hand control",
    "4. Emergency stop: press it, did it stop?",
    "5. Check mould temperature and hydraulic leaks",
    "6. Have the first part measured and approved",
  ],
};
