import type { HotspotRegion, MatchingPair } from "@/lib/questions";
import { panelEstopRegion, siteAssemblyRegion } from "./layout";

/**
 * Örnek soru bankası (karar #296): dört soru tipinin hepsi, TR + EN. Bir kısmı ekrandan (servisle), bir kısmı
 * Excel aktarımıyla eklenir. Kaynaklar `scripts/sample-data/KAYNAKLAR.md`.
 */

export type ModuleKey = "pressSafety" | "ohsBasics" | "fire";

type Base = {
  key: string;
  module: ModuleKey;
  topic: string;
  difficulty: 1 | 2 | 3;
  isOhsCritical: boolean;
  explanation: string;
  en: { stem: string; options?: string[]; pairs?: MatchingPair[]; explanation: string };
};

export type QuestionSpec =
  | (Base & { type: "single_choice"; stem: string; options: string[]; correctIndex: number })
  | (Base & { type: "true_false"; stem: string; correct: boolean })
  | (Base & { type: "matching"; stem: string; pairs: MatchingPair[] })
  | (Base & { type: "hotspot"; stem: string; image: "pressPanel" | "sitePlan"; regions: HotspotRegion[] });

const pairs = (...xs: [string, string][]): MatchingPair[] => xs.map(([left, right]) => ({ left, right }));

/** Ekrandan eklenen sorular. */
export const QUESTIONS: QuestionSpec[] = [
  // ---- Duroplast pres hattında güvenli çalışma ----
  {
    key: "q-mold-reach",
    module: "pressSafety",
    type: "single_choice",
    topic: "Pres güvenliği",
    difficulty: 1,
    isOhsCritical: true,
    stem: "Elinizi ya da bir aleti kalıp alanına ne zaman uzatabilirsiniz?",
    options: ["Pres tamamen açık ve durmuşken", "Tabla yavaşça kapanırken", "Işık perdesi devredeyken her zaman", "Kalıp soğuduysa pres çalışırken de"],
    correctIndex: 0,
    explanation: "Presin kapanma kuvveti çok yüksektir. Tabla hareket ederken yapılan hiçbir müdahale güvenli değildir.",
    en: {
      stem: "When may you reach into the mould area with your hand or a tool?",
      options: ["Only when the press is fully open and stopped", "While the platen is closing slowly", "Any time the light curtain is active", "Even while the press runs, if the mould has cooled"],
      explanation: "The closing force of the press is very high. No intervention is safe while the platen moves.",
    },
  },
  {
    key: "q-two-hand-bridge",
    module: "pressSafety",
    type: "true_false",
    topic: "Pres güvenliği",
    difficulty: 1,
    isOhsCritical: true,
    stem: "İş hızlansın diye iki el kumandasının bir butonu bantla basılı tutulabilir.",
    correct: false,
    explanation: "Güvenlik donanımını köprülemek, çıkarmak ya da etkisiz bırakmak yasaktır (6331 sayılı Kanun md. 19). İki el kumandası, eller tehlike bölgesinin dışındayken çevrimin başlamasını sağlar.",
    en: {
      stem: "To work faster, one button of the two-hand control may be held down with tape.",
      explanation: "Bridging, removing or defeating a safety device is prohibited (Law No. 6331, Art. 19). The two-hand control ensures the cycle starts only while both hands are outside the danger zone.",
    },
  },
  {
    key: "q-light-curtain-test",
    module: "pressSafety",
    type: "single_choice",
    topic: "Vardiya başı kontrol",
    difficulty: 2,
    isOhsCritical: false,
    stem: "Işık perdesinin vardiya başı testi nasıl yapılır?",
    options: ["Test çubuğu perdeden geçirilir, tabla durmalıdır", "Perdenin önünde bir süre beklenir", "Perdenin kablosu sökülüp yeniden takılır", "Test gerekmez, perde kendini denetler"],
    correctIndex: 0,
    explanation: "Üreticinin verdiği test çubuğu perdenin farklı noktalarından geçirilir. Her geçişte tabla hareketi durmalıdır; durmuyorsa pres çalıştırılmaz.",
    en: {
      stem: "How is the light curtain tested at the start of the shift?",
      options: ["The test rod is passed through the curtain; the platen must stop", "You stand in front of the curtain for a while", "The curtain cable is unplugged and plugged back in", "No test is needed; the curtain checks itself"],
      explanation: "The manufacturer's test rod is passed through different points of the curtain. The platen must stop each time; if it does not, the press is not used.",
    },
  },
  {
    key: "q-mold-temp",
    module: "pressSafety",
    type: "single_choice",
    topic: "Toz ve sıcak yüzey",
    difficulty: 2,
    isOhsCritical: false,
    stem: "Duroplast preslerde kalıp yüzeyleri üretim sırasında genellikle hangi sıcaklık aralığındadır?",
    options: ["40–60 °C", "80–100 °C", "140–170 °C", "250–300 °C"],
    correctIndex: 2,
    explanation: "Termoset kalıplama tozları genellikle 140–170 °C'deki kalıpta kürlenir. Bu sıcaklık ciddi temas yanığına yol açar; ısıya dayanıklı eldiven ve maşa kullanılır.",
    en: {
      stem: "In thermoset presses, what temperature range are mould surfaces usually at during production?",
      options: ["40–60 °C", "80–100 °C", "140–170 °C", "250–300 °C"],
      explanation: "Thermoset moulding compounds usually cure in a mould at 140–170 °C. This causes serious contact burns; heat-resistant gloves and tongs are used.",
    },
  },
  {
    key: "q-oil-injection",
    module: "pressSafety",
    type: "single_choice",
    topic: "Pres güvenliği",
    difficulty: 2,
    isOhsCritical: true,
    stem: "Hidrolik hortumdan çıkan ince bir yağ jeti elinize isabet etti ve küçük bir delik görüyorsunuz. Ne yapmalısınız?",
    options: [
      "Yarayı yıkayıp işe devam ederim",
      "Bant yapıştırır, vardiya sonunda bakarım",
      "Hemen bildirir ve hekime giderim; yağ deri altına girmiş olabilir",
      "Bölgeyi basınçlı havayla temizlerim",
    ],
    correctIndex: 2,
    explanation: "Yüksek basınçlı yağ deriden içeri girebilir. Dışarıdan küçük görünen bu yaralanma acil tedavi gerektirir.",
    en: {
      stem: "A fine jet of oil from a hydraulic hose hit your hand and you see a small puncture. What should you do?",
      options: [
        "Wash the wound and keep working",
        "Put a plaster on it and check it at the end of the shift",
        "Report it at once and see a doctor; oil may have entered under the skin",
        "Clean the area with compressed air",
      ],
      explanation: "High-pressure oil can penetrate the skin. Although it looks small from the outside, this injury needs urgent treatment.",
    },
  },
  {
    key: "q-hazard-measure",
    module: "pressSafety",
    type: "matching",
    topic: "Pres güvenliği",
    difficulty: 2,
    isOhsCritical: false,
    stem: "Pres hattındaki tehlikeleri uygun önlemle eşleştirin.",
    pairs: pairs(
      ["Ezilme", "Işık perdesi ve iki el kumandası"],
      ["Yanık", "Isıya dayanıklı eldiven ve maşa"],
      ["Toz soluma", "FFP2 maske ve havalandırma"],
      ["Gürültü", "Kulak koruyucu"],
    ),
    explanation: "Önce tehlike kaynağında ve makine üzerinde önlem alınır; kişisel koruyucu donanım kalan riske karşı kullanılır.",
    en: {
      stem: "Match the hazards on the press line with the right measure.",
      pairs: pairs(
        ["Crushing", "Light curtain and two-hand control"],
        ["Burns", "Heat-resistant gloves and tongs"],
        ["Inhaling dust", "FFP2 mask and ventilation"],
        ["Noise", "Hearing protection"],
      ),
      explanation: "Measures are taken first at the source and on the machine; personal protective equipment covers the remaining risk.",
    },
  },
  {
    key: "q-estop-hotspot",
    module: "pressSafety",
    type: "hotspot",
    topic: "Pres güvenliği",
    difficulty: 1,
    isOhsCritical: true,
    stem: "Pres kumanda panosunda acil durdurma butonunu işaretleyin.",
    image: "pressPanel",
    regions: [panelEstopRegion()],
    explanation: "Acil durdurma butonu sarı zemin üzerinde kırmızı, mantar başlıdır. Basıldığında kilitlenir; geri çevrilmeden pres yeniden çalışmaz.",
    en: {
      stem: "Mark the emergency stop button on the press control panel.",
      explanation: "The emergency stop is a red mushroom-head button on a yellow background. It latches when pressed; the press does not restart until it is reset.",
    },
  },
  {
    key: "q-air-clothes",
    module: "pressSafety",
    type: "true_false",
    topic: "Toz ve sıcak yüzey",
    difficulty: 1,
    isOhsCritical: false,
    stem: "İş kıyafetinizdeki tozu basınçlı hava tabancasıyla temizleyebilirsiniz.",
    correct: false,
    explanation: "Basınçlı hava gözü ve deriyi yaralayabilir, tozu da havaya karıştırır. Kıyafet fırça ya da vakumla temizlenir.",
    en: {
      stem: "You may clean dust off your work clothes with a compressed air gun.",
      explanation: "Compressed air can injure the eyes and skin and spreads the dust into the air. Clothes are cleaned with a brush or vacuum.",
    },
  },
  {
    key: "q-jam",
    module: "pressSafety",
    type: "single_choice",
    topic: "Kilitleme ve etiketleme",
    difficulty: 2,
    isOhsCritical: true,
    stem: "Kalıpta ürün sıkıştı. Doğru davranış hangisidir?",
    options: [
      "Pres çalışırken maşayla çekerim",
      "Çevrimi durdurur, amire haber veririm; kalıp arasına girmek gerekirse kilitleme ve etiketleme yapılır",
      "Işık perdesini kapatıp elle çıkarırım",
      "Bir sonraki çevrimde kendiliğinden çıkmasını beklerim",
    ],
    correctIndex: 1,
    explanation: "Sıkışma gidermek, kalıp arasına girmeyi gerektiren bir iştir. Enerji kaynakları ayrılıp kilitlenmeden bu iş yapılmaz.",
    en: {
      stem: "A part has jammed in the mould. What is the right action?",
      options: [
        "Pull it out with tongs while the press runs",
        "Stop the cycle and tell the supervisor; if the mould area must be entered, lockout/tagout is applied",
        "Switch off the light curtain and remove it by hand",
        "Wait for it to come out by itself in the next cycle",
      ],
      explanation: "Clearing a jam means entering the mould area. It is not done until the energy sources are isolated and locked.",
    },
  },
  {
    key: "q-loto-remove",
    module: "pressSafety",
    type: "single_choice",
    topic: "Kilitleme ve etiketleme",
    difficulty: 1,
    isOhsCritical: true,
    stem: "Kilitleme ve etiketlemede kişisel kilidi kim söker?",
    options: ["Vardiya amiri", "Kilidi takan kişi", "Bakım şefi", "Makineyi ilk çalıştıracak operatör"],
    correctIndex: 1,
    explanation: "Her çalışan kendi kilidini takar ve yalnızca kendisi söker. Böylece kimse içeride çalışan birinin haberi olmadan makineyi enerjilendiremez.",
    en: {
      stem: "In lockout/tagout, who removes a personal lock?",
      options: ["The shift supervisor", "The person who applied it", "The maintenance manager", "The operator who will start the machine first"],
      explanation: "Each worker applies their own lock and only they remove it, so nobody can re-energise the machine without the knowledge of someone working inside.",
    },
  },
  {
    key: "q-loto-order",
    module: "pressSafety",
    type: "matching",
    topic: "Kilitleme ve etiketleme",
    difficulty: 3,
    isOhsCritical: false,
    stem: "Kilitleme ve etiketleme adımlarını sırasıyla eşleştirin.",
    pairs: pairs(
      ["1. adım", "Haber ver, enerji kaynaklarını belirle"],
      ["2. adım", "Presi normal yoldan durdur"],
      ["3. adım", "Enerjiyi ayır, kilidini ve etiketini tak"],
      ["4. adım", "Birikmiş enerjiyi boşalt"],
      ["5. adım", "Sıfır enerjiyi doğrula"],
    ),
    explanation: "Sıra önemlidir: enerji ayrılmadan kilit takılamaz, birikmiş enerji boşaltılmadan doğrulama anlamlı olmaz.",
    en: {
      stem: "Match the lockout/tagout steps to their order.",
      pairs: pairs(
        ["Step 1", "Inform and identify energy sources"],
        ["Step 2", "Shut the press down normally"],
        ["Step 3", "Isolate energy, apply lock and tag"],
        ["Step 4", "Release stored energy"],
        ["Step 5", "Verify zero energy"],
      ),
      explanation: "The order matters: you cannot lock before isolating, and verification means nothing until stored energy is released.",
    },
  },
  {
    key: "q-estop-isolation",
    module: "pressSafety",
    type: "true_false",
    topic: "Kilitleme ve etiketleme",
    difficulty: 2,
    isOhsCritical: true,
    stem: "Acil durdurma butonuna basmak, bakım için yeterli bir enerji ayırma yöntemidir.",
    correct: false,
    explanation: "Acil durdurma hareketi keser ama enerjiyi ayırmaz ve kilitlenemez. Bakımda ana şalter, hidrolik ve pnömatik kaynaklar ayrılıp kilitlenir.",
    en: {
      stem: "Pressing the emergency stop is a sufficient energy isolation method for maintenance.",
      explanation: "The emergency stop halts motion but does not isolate energy and cannot be locked. For maintenance the main switch, hydraulic and pneumatic sources are isolated and locked.",
    },
  },
  {
    key: "q-zero-energy",
    module: "pressSafety",
    type: "single_choice",
    topic: "Kilitleme ve etiketleme",
    difficulty: 2,
    isOhsCritical: false,
    stem: "Sıfır enerji doğrulaması nasıl yapılır?",
    options: [
      "Kilidin takılı olduğuna bakılır",
      "Çevre boşken pres çalıştırılmaya çalışılır; hiçbir hareket olmamalıdır",
      "Elektrik panosunun ışığına bakılır",
      "Operatöre sorulur",
    ],
    correctIndex: 1,
    explanation: "Doğrulama, makinenin gerçekten çalışmadığını görmektir. Denemeden sonra kumanda yeniden kapalı konuma getirilir.",
    en: {
      stem: "How is zero energy verified?",
      options: [
        "By checking that the lock is in place",
        "With the area clear, try to start the press; nothing must move",
        "By looking at the light on the electrical panel",
        "By asking the operator",
      ],
      explanation: "Verification means seeing that the machine really does not run. After the test the controls are returned to off.",
    },
  },

  // ---- Temel İSG ve KKD ----
  {
    key: "q-imminent-danger",
    module: "ohsBasics",
    type: "single_choice",
    topic: "Hak ve yükümlülükler",
    difficulty: 2,
    isOhsCritical: false,
    stem: "Ciddi ve yakın bir tehlikeyle karşılaşan çalışan ne yapabilir?",
    options: [
      "Hiçbir şey; karar yalnızca işverenindir",
      "Durumu bildirip tehlike giderilene kadar çalışmaktan kaçınabilir",
      "Kimseye söylemeden işe devam etmelidir",
      "Yalnızca vardiya sonunda bildirebilir",
    ],
    correctIndex: 1,
    explanation: "6331 sayılı Kanun md. 13 bu hakkı tanır. Tehlike önlenemiyorsa çalışan tehlikeli bölgeyi terk edip güvenli bir yere gider; bu nedenle hakları kısıtlanamaz.",
    en: {
      stem: "What may an employee facing serious and imminent danger do?",
      options: [
        "Nothing; only the employer decides",
        "Report it and refrain from working until the danger is removed",
        "Keep working without telling anyone",
        "Report it only at the end of the shift",
      ],
      explanation: "Law No. 6331, Art. 13 grants this right. If the danger cannot be prevented, the employee leaves the danger zone for a safe place and their rights cannot be restricted for doing so.",
    },
  },
  {
    key: "q-ppe-standards",
    module: "ohsBasics",
    type: "matching",
    topic: "Kişisel koruyucu donanım",
    difficulty: 3,
    isOhsCritical: false,
    stem: "Kişisel koruyucu donanımı ilgili standardıyla eşleştirin.",
    pairs: pairs(
      ["Göz koruyucu", "EN 166"],
      ["Isıya dayanıklı eldiven", "EN 407"],
      ["Kulak koruyucu", "EN 352"],
      ["Toz maskesi (FFP2)", "EN 149"],
      ["Güvenlik ayakkabısı", "EN ISO 20345"],
    ),
    explanation: "KKD üzerindeki CE işareti ve standart numarası, donanımın hangi riske karşı denendiğini gösterir. Satın alma ve dağıtımda bu işaretler kontrol edilir.",
    en: {
      stem: "Match each item of personal protective equipment with its standard.",
      pairs: pairs(
        ["Eye protection", "EN 166"],
        ["Heat-resistant gloves", "EN 407"],
        ["Hearing protection", "EN 352"],
        ["Dust mask (FFP2)", "EN 149"],
        ["Safety shoes", "EN ISO 20345"],
      ),
      explanation: "The CE mark and standard number on PPE show which risk it has been tested against. These markings are checked when buying and issuing it.",
    },
  },
  {
    key: "q-noise-limit",
    module: "ohsBasics",
    type: "single_choice",
    topic: "Gürültü",
    difficulty: 2,
    isOhsCritical: false,
    stem: "Gürültü Yönetmeliği'ne göre kulak koruyucu hangi maruziyet değerinden itibaren takılmak zorundadır?",
    options: ["70 dB(A)", "80 dB(A)", "85 dB(A)", "100 dB(A)"],
    correctIndex: 2,
    explanation: "80 dB(A) en düşük eylem değeridir: kulak koruyucu verilir. 85 dB(A) en yüksek eylem değeridir: takılması zorunludur. 87 dB(A) ise aşılmaması gereken sınır değerdir.",
    en: {
      stem: "Under the Turkish Noise Regulation, from which exposure value is wearing hearing protection mandatory?",
      options: ["70 dB(A)", "80 dB(A)", "85 dB(A)", "100 dB(A)"],
      explanation: "80 dB(A) is the lower action value: hearing protection is provided. 85 dB(A) is the upper action value: wearing it is mandatory. 87 dB(A) is the limit value that must not be exceeded.",
    },
  },
  {
    key: "q-mask-replace",
    module: "ohsBasics",
    type: "true_false",
    topic: "Kişisel koruyucu donanım",
    difficulty: 1,
    isOhsCritical: false,
    stem: "Nemlenen ya da hasar gören toz maskesi değiştirilmelidir.",
    correct: true,
    explanation: "Nemlenen filtre zor nefes aldırır, hasarlı maske ise kenarından toz kaçırır. İkisi de koruma sağlamaz.",
    en: {
      stem: "A dust mask that has become damp or damaged must be replaced.",
      explanation: "A damp filter makes breathing hard and a damaged mask leaks dust at the edges. Neither protects you.",
    },
  },
  {
    key: "q-near-miss",
    module: "ohsBasics",
    type: "single_choice",
    topic: "Ramak kala",
    difficulty: 1,
    isOhsCritical: false,
    stem: "Ramak kala olay hangisidir?",
    options: [
      "Yaralanmaya yol açan iş kazası",
      "Zarar verebilecekken kimse yaralanmadan ve hasar oluşmadan atlatılan olay",
      "Meslek hastalığı",
      "Yangın tatbikatı",
    ],
    correctIndex: 1,
    explanation: "Ramak kala olaylar bir sonraki kazanın habercisidir. Bildirildiğinde kök neden bulunur ve kalıcı önlem alınır.",
    en: {
      stem: "Which of the following is a near miss?",
      options: [
        "An occupational accident causing injury",
        "An event that could have caused harm but ended without injury or damage",
        "An occupational disease",
        "A fire drill",
      ],
      explanation: "Near misses are warnings of the next accident. Once reported, the root cause is found and a permanent measure is taken.",
    },
  },
  {
    key: "q-ppe-last",
    module: "ohsBasics",
    type: "true_false",
    topic: "Kişisel koruyucu donanım",
    difficulty: 2,
    isOhsCritical: false,
    stem: "Kişisel koruyucu donanım, tehlike kaynağında alınacak önlemlerin yerine ilk tercih edilen çözümdür.",
    correct: false,
    explanation: "KKD son çaredir. Önce tehlike kaynağında ve toplu koruma önlemleri alınır; KKD bunlarla önlenemeyen ya da yeterince azaltılamayan riske karşı kullanılır.",
    en: {
      stem: "Personal protective equipment is the first choice instead of measures at the source of the hazard.",
      explanation: "PPE is the last resort. Measures at the source and collective protection come first; PPE is used against risks they cannot prevent or reduce enough.",
    },
  },
  {
    key: "q-clothing",
    module: "ohsBasics",
    type: "single_choice",
    topic: "Kişisel koruyucu donanım",
    difficulty: 1,
    isOhsCritical: false,
    stem: "Makine başında iş kıyafeti için hangisi doğrudur?",
    options: [
      "Bol ve rahat kıyafet tercih edilir",
      "Kollar bilekte kapanır; takı ve sarkan kordon takılmaz",
      "Soğuk havada atkı takılabilir",
      "Kısa kravat sorun oluşturmaz",
    ],
    correctIndex: 1,
    explanation: "Dönen ve kapanan makine parçaları sarkan kumaşı, takıyı ve kordonu kapabilir.",
    en: {
      stem: "Which is correct for work clothing at a machine?",
      options: [
        "Loose, comfortable clothing is preferred",
        "Cuffs closed at the wrist; no jewellery or loose cords",
        "A scarf may be worn in cold weather",
        "A short tie is not a problem",
      ],
      explanation: "Rotating and closing machine parts can catch loose fabric, jewellery and cords.",
    },
  },
  {
    key: "q-signs",
    module: "ohsBasics",
    type: "matching",
    topic: "Güvenlik işaretleri",
    difficulty: 1,
    isOhsCritical: false,
    stem: "Güvenlik işaretinin biçimini ve rengini anlamıyla eşleştirin.",
    pairs: pairs(
      ["Kırmızı çerçeveli, çapraz çizgili daire", "Yasak"],
      ["Mavi daire", "Zorunluluk"],
      ["Sarı üçgen", "Uyarı"],
      ["Yeşil kare ya da dikdörtgen", "Acil kaçış ve ilk yardım"],
    ),
    explanation: "Sağlık ve Güvenlik İşaretleri Yönetmeliği'ne göre biçim ve renk, işaretin türünü uzaktan anlatır.",
    en: {
      stem: "Match the shape and colour of a safety sign with its meaning.",
      pairs: pairs(
        ["Red-bordered circle with a diagonal bar", "Prohibition"],
        ["Blue circle", "Mandatory action"],
        ["Yellow triangle", "Warning"],
        ["Green square or rectangle", "Emergency escape and first aid"],
      ),
      explanation: "Under the safety signs regulation, the shape and colour tell the type of sign from a distance.",
    },
  },
  {
    key: "q-duties",
    module: "ohsBasics",
    type: "single_choice",
    topic: "Hak ve yükümlülükler",
    difficulty: 1,
    isOhsCritical: false,
    stem: "Çalışanın iş sağlığı ve güvenliği yükümlülükleri için hangisi doğrudur?",
    options: [
      "İş hızlansın diye makine koruyucusunu çıkarabilir",
      "Kendisine verilen KKD'yi doğru kullanır ve korur",
      "Arızayı yalnızca kendi işini etkiliyorsa bildirir",
      "Eğitimlere katılmak isteğe bağlıdır",
    ],
    correctIndex: 1,
    explanation: "6331 sayılı Kanun md. 19'a göre çalışan, aldığı eğitime ve talimatlara uygun davranır; makineyi, KKD'yi ve güvenlik donanımını doğru kullanır, tehlikeyi hemen bildirir.",
    en: {
      stem: "Which is correct about an employee's occupational health and safety duties?",
      options: [
        "They may remove a machine guard to work faster",
        "They use and look after the PPE given to them correctly",
        "They report a fault only if it affects their own work",
        "Attending training is optional",
      ],
      explanation: "Under Law No. 6331, Art. 19, employees follow their training and instructions, use machines, PPE and safety devices correctly, and report hazards at once.",
    },
  },

  // ---- Yangın güvenliği ve tahliye ----
  {
    key: "q-fire-triangle",
    module: "fire",
    type: "single_choice",
    topic: "Yangın bilgisi",
    difficulty: 1,
    isOhsCritical: false,
    stem: "Yanma üçgenini oluşturan üç unsur hangisidir?",
    options: ["Yakıt, ısı, oksijen", "Su, hava, toprak", "Yakıt, azot, ışık", "Duman, alev, kıvılcım"],
    correctIndex: 0,
    explanation: "Üç unsurdan biri ortadan kaldırıldığında yangın söner: soğutma ısıyı, örtme oksijeni, yakıtın uzaklaştırılması yakıtı keser.",
    en: {
      stem: "Which three elements make up the fire triangle?",
      options: ["Fuel, heat, oxygen", "Water, air, earth", "Fuel, nitrogen, light", "Smoke, flame, spark"],
      explanation: "Removing any one element puts the fire out: cooling removes heat, smothering removes oxygen, and removing fuel starves it.",
    },
  },
  {
    key: "q-electrical-fire",
    module: "fire",
    type: "single_choice",
    topic: "Söndürücü kullanımı",
    difficulty: 2,
    isOhsCritical: true,
    stem: "Gerilim altındaki bir elektrik panosunda yangın çıktı. Hangisi yapılmamalıdır?",
    options: ["Elektriği kesmek", "Karbondioksitli söndürücü kullanmak", "Su sıkmak", "Yangın alarmını çalıştırmak"],
    correctIndex: 2,
    explanation: "Su elektriği iletir; müdahale eden kişi elektrik çarpmasına maruz kalır. Önce elektrik kesilir, karbondioksitli ya da uygun kuru kimyevi tozlu söndürücü kullanılır.",
    en: {
      stem: "A fire has broken out in a live electrical panel. Which must NOT be done?",
      options: ["Cutting the power", "Using a CO₂ extinguisher", "Spraying water", "Raising the fire alarm"],
      explanation: "Water conducts electricity and the person responding can be electrocuted. Cut the power first and use a CO₂ or suitable dry powder extinguisher.",
    },
  },
  {
    key: "q-fire-classes",
    module: "fire",
    type: "matching",
    topic: "Yangın bilgisi",
    difficulty: 2,
    isOhsCritical: false,
    stem: "Yangın sınıfını yanan maddeyle eşleştirin.",
    pairs: pairs(
      ["A sınıfı", "Kağıt, ahşap, plastik gibi katılar"],
      ["B sınıfı", "Hidrolik yağ, solvent gibi sıvılar"],
      ["C sınıfı", "Yanıcı gazlar"],
      ["D sınıfı", "Yanıcı metaller"],
      ["F sınıfı", "Yemeklik yağlar"],
    ),
    explanation: "Söndürücünün etiketindeki harfler hangi sınıf yangında kullanılabileceğini gösterir.",
    en: {
      stem: "Match each fire class with the burning material.",
      pairs: pairs(
        ["Class A", "Solids such as paper, wood, plastic"],
        ["Class B", "Liquids such as hydraulic oil, solvents"],
        ["Class C", "Flammable gases"],
        ["Class D", "Combustible metals"],
        ["Class F", "Cooking oils"],
      ),
      explanation: "The letters on the extinguisher label show which fire classes it can be used on.",
    },
  },
  {
    key: "q-aim-base",
    module: "fire",
    type: "single_choice",
    topic: "Söndürücü kullanımı",
    difficulty: 1,
    isOhsCritical: false,
    stem: "Yangın söndürücünün hortumu nereye yöneltilir?",
    options: ["Alevin tepesine", "Dumanın içine", "Alevin dibine", "Tavana"],
    correctIndex: 2,
    explanation: "Yanan madde alevin dibindedir. Söndürücü madde oraya, süpürür gibi sağa sola hareketle verilir.",
    en: {
      stem: "Where do you aim the extinguisher hose?",
      options: ["At the top of the flames", "Into the smoke", "At the base of the flames", "At the ceiling"],
      explanation: "The burning material is at the base of the flames. Apply the agent there with a sweeping motion.",
    },
  },
  {
    key: "q-lift",
    module: "fire",
    type: "true_false",
    topic: "Tahliye",
    difficulty: 1,
    isOhsCritical: true,
    stem: "Yangın tahliyesi sırasında asansör kullanılabilir.",
    correct: false,
    explanation: "Elektrik kesilebilir, asansör boşluğu duman bacası gibi davranabilir. Tahliyede merdiven kullanılır.",
    en: {
      stem: "Lifts may be used during a fire evacuation.",
      explanation: "The power may fail and the lift shaft can act like a chimney for smoke. Use the stairs to evacuate.",
    },
  },
  {
    key: "q-assembly-hotspot",
    module: "fire",
    type: "hotspot",
    topic: "Tahliye",
    difficulty: 1,
    isOhsCritical: true,
    stem: "Saha planında tahliyede gidilecek toplanma alanını işaretleyin.",
    image: "sitePlan",
    regions: [siteAssemblyRegion()],
    explanation: "Toplanma alanı, yeşil zemin üzerinde içe bakan oklarla gösterilir. Binadan ve araç yolundan uzak, güvenli bir açık alandır.",
    en: {
      stem: "Mark the assembly point to go to during an evacuation on the site plan.",
      explanation: "The assembly point is shown by inward-pointing arrows on a green background. It is a safe open area away from the building and vehicle routes.",
    },
  },
  {
    key: "q-assembly-duty",
    module: "fire",
    type: "single_choice",
    topic: "Tahliye",
    difficulty: 1,
    isOhsCritical: false,
    stem: "Toplanma alanına vardığınızda ne yapmalısınız?",
    options: [
      "Hemen eve giderim",
      "Sayım yapan ekibe kendimi bildirir, sayım bitene kadar ayrılmam",
      "Eşyalarımı almak için binaya dönerim",
      "Aracımı otoparktan çıkarırım",
    ],
    correctIndex: 1,
    explanation: "Sayıma katılmayan kişi içeride kalmış sayılır ve kurtarma ekibi onu aramak için gereksiz yere tehlikeye girer.",
    en: {
      stem: "What should you do when you reach the assembly point?",
      options: [
        "Go home straight away",
        "Report to the team doing the head count and stay until it is complete",
        "Go back into the building for my belongings",
        "Drive my car out of the car park",
      ],
      explanation: "Anyone missing from the head count is assumed to be inside, and rescuers put themselves at risk looking for them.",
    },
  },
  {
    key: "q-drill",
    module: "fire",
    type: "single_choice",
    topic: "Tahliye",
    difficulty: 2,
    isOhsCritical: false,
    stem: "İşyerlerinde Acil Durumlar Hakkında Yönetmelik'e göre tatbikat en az ne sıklıkla yapılır?",
    options: ["Ayda bir", "Yılda bir", "Beş yılda bir", "Yalnızca bir yangından sonra"],
    correctIndex: 1,
    explanation: "Tatbikat en az yılda bir yapılır ve sonuçları kayıt altına alınır; planın aksayan yönleri düzeltilir.",
    en: {
      stem: "Under the Regulation on Emergencies at Workplaces, how often must a drill be held at least?",
      options: ["Once a month", "Once a year", "Once every five years", "Only after a fire"],
      explanation: "A drill is held at least once a year and its results are recorded; weak points of the plan are corrected.",
    },
  },
];

/** Excel aktarımıyla eklenen sorular (soru Excel'i sütunlarıyla). Modül sütunu, modül adlarıyla doldurulur. */
export type ImportRow = {
  type: "Çoktan seçmeli" | "Doğru/Yanlış" | "Eşleştirme";
  stem: string;
  cells: string[];
  correct: string;
  topic: string;
  difficulty: 1 | 2 | 3;
  critical: boolean;
  modules: ModuleKey[];
  explanation: string;
  en: { stem: string; cells: string[]; explanation: string };
};

export const IMPORT_ROWS: ImportRow[] = [
  {
    type: "Doğru/Yanlış",
    stem: "Vardiya başı kontrol listesinde uygun olmayan bir madde varsa pres çalıştırılmaz ve durum vardiya amirine bildirilir.",
    cells: [],
    correct: "Doğru",
    topic: "Vardiya başı kontrol",
    difficulty: 1,
    critical: false,
    modules: ["pressSafety"],
    explanation: "Kontrol listesi, arızalı güvenlik donanımıyla çalışmayı önlemek içindir.",
    en: {
      stem: "If any item on the start-of-shift checklist is not OK, the press is not run and the shift supervisor is informed.",
      cells: [],
      explanation: "The checklist exists to prevent working with faulty safety devices.",
    },
  },
  {
    type: "Çoktan seçmeli",
    stem: "Zemine dökülen kalıplama tozu nasıl temizlenir?",
    cells: ["Basınçlı havayla savrularak", "Süpürge ya da vakumla toplanarak", "Bol suyla yıkanarak", "Vardiya sonuna bırakılarak"],
    correct: "B",
    topic: "5S ve düzen",
    difficulty: 1,
    critical: false,
    modules: ["pressSafety"],
    explanation: "Savrulan toz solunur ve başka yüzeylere yayılır; dökülen toz zemini de kaygan yapar.",
    en: {
      stem: "How is moulding powder spilled on the floor cleaned up?",
      cells: ["By blowing it away with compressed air", "By collecting it with a brush or vacuum", "By washing it with plenty of water", "By leaving it until the end of the shift"],
      explanation: "Blown dust is inhaled and spreads to other surfaces; spilled powder also makes the floor slippery.",
    },
  },
  {
    type: "Çoktan seçmeli",
    stem: "5S'in \"Ayıkla\" adımı ne anlama gelir?",
    cells: ["Aletleri gölge panoya yerleştirmek", "Alanı temizlemek", "Alanda işe ait olmayan malzemeyi çıkarmak", "Kuralları yazılı hale getirmek"],
    correct: "C",
    topic: "5S ve düzen",
    difficulty: 1,
    critical: false,
    modules: ["pressSafety"],
    explanation: "Ayıkla adımında yalnızca o işte gereken malzeme alanda kalır; gerisi kaldırılır.",
    en: {
      stem: "What does the \"Sort\" step of 5S mean?",
      cells: ["Placing tools on the shadow board", "Cleaning the area", "Removing material that does not belong to the job", "Writing down the rules"],
      explanation: "In the Sort step, only what the job needs stays in the area; everything else is removed.",
    },
  },
  {
    type: "Eşleştirme",
    stem: "5S adımlarını anlamlarıyla eşleştirin.",
    cells: [
      "Ayıkla = Gereksiz malzemeyi alandan çıkar",
      "Düzenle = Her şeyin belli bir yeri olsun",
      "Temizle = Alanı ve ekipmanı temiz tut",
      "Standartlaştır = Kuralları yaz ve görünür kıl",
      "Sürdür = Alışkanlık haline getir ve denetle",
    ],
    correct: "",
    topic: "5S ve düzen",
    difficulty: 2,
    critical: false,
    modules: ["pressSafety"],
    explanation: "5S düzenli, temiz ve güvenli bir iş alanı için sırayla uygulanan beş adımdır.",
    en: {
      stem: "Match the 5S steps with their meaning.",
      cells: [
        "Sort = Remove unneeded material",
        "Set in order = A place for everything",
        "Shine = Keep the area and equipment clean",
        "Standardise = Write the rules and make them visible",
        "Sustain = Make it a habit and audit it",
      ],
      explanation: "5S is five steps applied in order for a tidy, clean and safe work area.",
    },
  },
  {
    type: "Çoktan seçmeli",
    stem: "Duroplast kalıplamada kürlenme sırasında hangi buhara karşı havalandırma açık tutulur?",
    cells: ["Formaldehit içeren buhar", "Klor gazı", "Ozon", "Doğal gaz"],
    correct: "A",
    topic: "Toz ve sıcak yüzey",
    difficulty: 2,
    critical: false,
    modules: ["pressSafety"],
    explanation: "Fenolik ve melamin esaslı kalıplama tozları kürlenirken formaldehit içeren buhar çıkarabilir; yerel havalandırma çalışır durumda tutulur.",
    en: {
      stem: "During curing in thermoset moulding, ventilation is kept running against which vapour?",
      cells: ["Vapour containing formaldehyde", "Chlorine gas", "Ozone", "Natural gas"],
      explanation: "Phenolic and melamine moulding compounds can release vapour containing formaldehyde while curing; local exhaust ventilation is kept running.",
    },
  },
  {
    type: "Doğru/Yanlış",
    stem: "Kalıptan yeni çıkan ürün ve çapak sıcak olabilir; maşa ya da pensle alınmalıdır.",
    cells: [],
    correct: "Doğru",
    topic: "Toz ve sıcak yüzey",
    difficulty: 1,
    critical: false,
    modules: ["pressSafety"],
    explanation: "Ürün kalıp sıcaklığına yakın çıkar; çıplak elle tutmak yanığa yol açar.",
    en: {
      stem: "Freshly moulded parts and flash can be hot and must be removed with tongs or pliers.",
      cells: [],
      explanation: "Parts come out close to mould temperature; handling them with bare hands causes burns.",
    },
  },
  {
    type: "Çoktan seçmeli",
    stem: "İki el kumandası nasıl çalışmalıdır?",
    cells: [
      "Butonlardan birine basmak yeterlidir",
      "İki buton birlikte basılmadan çevrim başlamaz, biri bırakılınca hareket durur",
      "Butonlara sırayla basılır",
      "Butonlar yalnızca ayar modunda kullanılır",
    ],
    correct: "B",
    topic: "Pres güvenliği",
    difficulty: 1,
    critical: true,
    modules: ["pressSafety"],
    explanation: "İki el kumandası iki elin de tehlike bölgesinin dışında olmasını sağlar. Butonlar kısa sürede birlikte basılmazsa çevrim başlamaz.",
    en: {
      stem: "How must the two-hand control work?",
      cells: [
        "Pressing either button is enough",
        "The cycle does not start unless both buttons are pressed together, and motion stops when one is released",
        "The buttons are pressed one after the other",
        "The buttons are used only in setting mode",
      ],
      explanation: "The two-hand control keeps both hands outside the danger zone. If the buttons are not pressed together within a short time, the cycle does not start.",
    },
  },
  {
    type: "Doğru/Yanlış",
    stem: "Çalışan, ciddi ve yakın bir tehlikeyi bildirdikten sonra tehlike giderilene kadar çalışmaktan kaçınabilir.",
    cells: [],
    correct: "Doğru",
    topic: "Hak ve yükümlülükler",
    difficulty: 2,
    critical: false,
    modules: ["pressSafety", "ohsBasics"],
    explanation: "6331 sayılı Kanun md. 13: bu hakkı kullanan çalışanın ücreti ve diğer hakları saklıdır.",
    en: {
      stem: "After reporting a serious and imminent danger, an employee may refrain from working until it is removed.",
      cells: [],
      explanation: "Law No. 6331, Art. 13: an employee using this right keeps their wages and other rights.",
    },
  },
];

/** Teorik modülün ara değerlendirmesi (yalnızca Türkçe; 3–5 soru). */
export const QUIZ = [
  {
    type: "single_choice" as const,
    stem: "Vardiya başında acil durdurma butonunu denediniz ama pres durmadı. Ne yaparsınız?",
    options: ["Dikkatli çalışırım", "Presi çalıştırmam, vardiya amirine bildiririm", "Butonu söküp temizlerim", "Bir sonraki vardiyaya not bırakırım"],
    correctIndex: 1,
    explanation: "Güvenlik donanımı çalışmayan pres kullanılmaz.",
  },
  {
    type: "true_false" as const,
    stem: "Basınçlı hava yalnızca kalıp temizliği için kullanılır.",
    options: ["Doğru", "Yanlış"],
    correctIndex: 0,
    explanation: "Kişiye, kıyafete ya da zemindeki toza tutulmaz.",
  },
  {
    type: "single_choice" as const,
    stem: "Hangi iş kilitleme ve etiketleme yapılmadan başlamaz?",
    options: ["Kontrol listesini doldurmak", "Kalıp değiştirmek", "Ürünü kutulamak", "Doz tartmak"],
    correctIndex: 1,
    explanation: "Kalıp arasına girmeyi gerektiren her iş enerji ayrılıp kilitlendikten sonra yapılır.",
  },
];

/** Sınavdan sonra açılan yeni soru sürümü (düzenleme akışını göstermek için). */
export const QUESTION_REVISION = {
  key: "q-noise-limit",
  explanation:
    "80 dB(A) en düşük eylem değeridir: kulak koruyucu verilir. 85 dB(A) en yüksek eylem değeridir: takılması zorunludur. 87 dB(A) sınır değerdir; kulak koruyucunun sağladığı azaltma hesaba katıldığında bile aşılmamalıdır.",
  enExplanation:
    "80 dB(A) is the lower action value: hearing protection is provided. 85 dB(A) is the upper action value: wearing it is mandatory. 87 dB(A) is the limit value; it must not be exceeded even after taking the protection into account.",
};
