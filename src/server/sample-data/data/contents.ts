import { doc, h2, ol, p, quote, ul } from "./rich";

/**
 * Örnek içerikler (karar #296): Droplast/Pres İşçisi pozisyonu için yedi içerik türünün her biri.
 * Kaynaklar `scripts/sample-data/KAYNAKLAR.md`'dedir; metinler kendi cümlelerimizledir.
 * Medya kimlikleri yükleyicide üretilen dosyalardan gelir.
 */

export type SampleAssets = {
  isgPdfTr: string;
  isgPdfEn: string;
  videoTr: string;
  videoEn: string;
  ppe: { goggles: string; gloves: string; earmuffs: string; mask: string; shoes: string; clothing: string };
  lotoLock: string;
  lotoVerify: string;
  nearMissTr: string;
  nearMissEn: string;
};

export type ContentKey = "pressRules" | "isgPdf" | "shiftVideo" | "ppeGallery" | "loto" | "checklist" | "nearMiss" | "fire";

export type ContentSpec = {
  key: ContentKey;
  type: "text" | "pdf" | "video" | "gallery" | "instruction" | "checklist" | "form_template";
  isOhs: boolean;
  /** Etiket adları (tür anahtarı → ad). */
  tags: { type: "machine" | "section" | "risk" | "shift"; name: string }[];
  tr: { title: string; body: unknown };
  en: { title: string; body: unknown };
};

export function sampleContents(a: SampleAssets): ContentSpec[] {
  return [
    {
      key: "pressRules",
      type: "text",
      isOhs: true,
      tags: [
        { type: "machine", name: "Duroplast pres" },
        { type: "risk", name: "Ezilme" },
        { type: "risk", name: "Yanık" },
      ],
      tr: {
        title: "Duroplast Pres Hattında Güvenli Çalışma Kuralları",
        body: doc(
          p(
            "Bu kurallar, duroplast (termoset) kalıplama tozuyla çalışan sıcak preslerde görev yapan herkes için geçerlidir. Amaç ezilme, yanık, hidrolik basınç ve toz kaynaklı yaralanmaları önlemektir. Kurallar 6331 sayılı İş Sağlığı ve Güvenliği Kanunu ile İş Ekipmanlarının Kullanımında Sağlık ve Güvenlik Şartları Yönetmeliği esas alınarak hazırlanmıştır.",
          ),
          h2("Başlıca tehlikeler"),
          ul(
            [{ b: "Ezilme: " }, "Kalıp kapanırken üst tabla ile alt kalıp arasında kalan el ya da kol ağır yaralanır. Kapanma kuvveti çok yüksektir; tabla hareket ederken müdahale edilemez."],
            [{ b: "Yanık: " }, "Kalıp yüzeyleri çalışma sırasında genellikle 140–170 °C arasındadır. Kalıptan yeni çıkan ürün ve çapak da sıcaktır."],
            [{ b: "Hidrolik basınç: " }, "Patlayan hortum ya da gevşeyen bağlantı yağ püskürtür. İnce yağ jeti deriden girebilir; küçük görünen yara bile hemen hekime gösterilir."],
            [{ b: "Toz ve buhar: " }, "Kalıplama tozu solunum yolunu tahriş edebilir; kürlenme sırasında formaldehit içeren buhar çıkabilir. Havalandırma açık tutulur, toz işlerinde maske takılır."],
            [{ b: "Basınçlı hava ve gürültü: " }, "Kalıp temizliğindeki basınçlı hava göz yaralanmasına ve yüksek gürültüye yol açabilir."],
            [{ b: "Kayma: " }, "Zemine dökülen toz, granül ve yağ kaygandır."],
          ),
          h2("Vardiya başında"),
          ol(
            "Vardiya başı kontrol listesini eksiksiz doldurun. Uygun olmayan bir madde varsa presi çalıştırmayın, vardiya amirine bildirin.",
            "Işık perdesini test çubuğuyla deneyin: çubuk perdeyi kestiğinde tabla hareketi durmalıdır.",
            "İki el kumandasını deneyin: iki buton birlikte basılmadan çevrim başlamamalı, biri bırakılınca hareket durmalıdır.",
            "Acil durdurma butonuna basın: pres durmalı ve buton geri çevrilmeden yeniden çalışmamalıdır.",
            "Hidrolik hortumlarda, bağlantılarda ve zeminde yağ kaçağı olup olmadığına bakın.",
            "KKD'nizi takın: göz koruyucu, ısıya dayanıklı eldiven ve güvenlik ayakkabısı; gürültülü ve tozlu işlerde kulak koruyucu ve toz maskesi.",
          ),
          h2("Çalışma sırasında"),
          ul(
            "Elinizi, kolunuzu ya da bir aleti kalıp alanına yalnızca pres tamamen açık ve durmuşken uzatın.",
            [{ b: "İki el kumandasını bant, ağırlık ya da başka bir yolla köprülemeyin; ışık perdesini devre dışı bırakmayın. " }, "Güvenlik donanımını çıkarmak, değiştirmek veya etkisiz bırakmak yasaktır (6331 sayılı Kanun md. 19)."],
            "Ürünü ve çapağı kalıptan maşa ya da pensle alın; sıcak yüzeye çıplak elle dokunmayın.",
            "Basınçlı havayı yalnızca kalıp temizliği için kullanın. Kendinize veya bir başkasına doğru tutmayın, giysinizdeki tozu almak için kullanmayın.",
            "Dökülen tozu süpürge ya da vakumla toplayın; basınçlı havayla savurmayın.",
            "Doz kabını ve aletleri yerine bırakın; tabla üzerinde alet unutmayın.",
          ),
          h2("Sıkışma, arıza ve ayar"),
          ul(
            "Ürün kalıpta sıkışırsa ya da pres alışılmadık ses, titreşim veya sızıntı gösterirse çevrimi durdurun ve vardiya amirine haber verin.",
            "Kalıp arasına girmeyi gerektiren her iş (sıkışma giderme, kalıp değişimi, bakım) kilitleme ve etiketleme (LOTO) yapılmadan başlamaz.",
            "Bakım ve onarımı yalnızca bu iş için görevlendirilen kişiler yapar (İş Ekipmanları Yönetmeliği md. 8).",
          ),
          h2("Acil durumda"),
          ul(
            "Tehlike anında en yakın acil durdurma butonuna basın.",
            "Yaralanma varsa ilk yardım ekibine ve vardiya amirine haber verin. Yanıkta bölgeyi akan serin su altında soğutun.",
            "Ciddi ve yakın bir tehlike gördüğünüzde durumu bildirip çalışmaktan kaçınma hakkınız vardır (6331 sayılı Kanun md. 13).",
          ),
          quote("Ramak kala olayları da bildirin. Bildirim kimseyi suçlamak için değil, bir sonraki kazayı önlemek için yapılır."),
        ),
      },
      en: {
        title: "Safe Working Rules on the Thermoset Press Line",
        body: doc(
          p(
            "These rules apply to everyone working at hot presses that mould thermoset (duroplast) compound. Their purpose is to prevent crushing, burn, hydraulic pressure and dust injuries. They are based on the Turkish Occupational Health and Safety Law No. 6331 and the Regulation on Health and Safety Requirements for the Use of Work Equipment.",
          ),
          h2("Main hazards"),
          ul(
            [{ b: "Crushing: " }, "A hand or arm caught between the upper platen and the lower mould while it closes is seriously injured. The closing force is very high; nobody can intervene while the platen moves."],
            [{ b: "Burns: " }, "Mould surfaces are usually between 140 and 170 °C during production. Freshly moulded parts and flash are hot too."],
            [{ b: "Hydraulic pressure: " }, "A burst hose or loose fitting sprays oil. A fine oil jet can penetrate the skin; even a small-looking wound is shown to a doctor at once."],
            [{ b: "Dust and fumes: " }, "Moulding compound can irritate the airways, and vapour containing formaldehyde may be released while curing. Keep ventilation running and wear a mask for dusty work."],
            [{ b: "Compressed air and noise: " }, "Compressed air used for mould cleaning can injure the eyes and is loud."],
            [{ b: "Slipping: " }, "Spilled powder, granules and oil make the floor slippery."],
          ),
          h2("At the start of the shift"),
          ol(
            "Complete the start-of-shift checklist. If any item is not OK, do not run the press and tell your shift supervisor.",
            "Test the light curtain with the test rod: the platen must stop when the rod breaks the curtain.",
            "Test the two-hand control: the cycle must not start unless both buttons are pressed together, and motion must stop when one is released.",
            "Press the emergency stop: the press must stop and must not restart until the button is reset.",
            "Check hoses, fittings and the floor for hydraulic oil leaks.",
            "Put on your PPE: eye protection, heat-resistant gloves and safety shoes; hearing protection and a dust mask for noisy and dusty work.",
          ),
          h2("During production"),
          ul(
            "Reach into the mould area with your hand, arm or a tool only when the press is fully open and stopped.",
            [{ b: "Never bridge the two-hand control with tape, weights or any other means, and never bypass the light curtain. " }, "Removing, altering or defeating safety devices is prohibited (Law No. 6331, Art. 19)."],
            "Take parts and flash out of the mould with tongs or pliers; do not touch hot surfaces with bare hands.",
            "Use compressed air only to clean the mould. Never point it at yourself or others, and never use it to blow dust off your clothes.",
            "Collect spilled powder with a brush or vacuum; do not blow it around with compressed air.",
            "Put the dosing cup and tools back in their places; never leave a tool on the platen.",
          ),
          h2("Jams, faults and adjustments"),
          ul(
            "If a part jams in the mould or the press makes an unusual noise, vibrates or leaks, stop the cycle and inform your shift supervisor.",
            "Any work that requires entering the mould area (clearing jams, mould changes, maintenance) starts only after lockout/tagout (LOTO).",
            "Only persons assigned to this work carry out maintenance and repairs (Work Equipment Regulation, Art. 8).",
          ),
          h2("In an emergency"),
          ul(
            "Press the nearest emergency stop when there is danger.",
            "If someone is injured, call the first aid team and the shift supervisor. Cool a burn under cool running water.",
            "If you face serious and imminent danger, you have the right to report it and refrain from working (Law No. 6331, Art. 13).",
          ),
          quote("Report near misses too. Reporting is not about blaming anyone; it is about preventing the next accident."),
        ),
      },
    },
    {
      key: "isgPdf",
      type: "pdf",
      isOhs: true,
      tags: [{ type: "risk", name: "KKD" }],
      tr: {
        title: "Temel İSG ve KKD Talimatı",
        body: {
          assetId: a.isgPdfTr,
          description:
            "Çalışanın temel hak ve yükümlülükleri, pres hattında kullanılacak kişisel koruyucu donanımlar ve standartları, KKD'nin kontrolü, bakımı ve değişimi. Talimatı okuyup son sayfadaki özeti vardiya amirinizle birlikte gözden geçirin.",
        },
      },
      en: {
        title: "Basic OHS and PPE Instruction",
        body: {
          assetId: a.isgPdfEn,
          description:
            "Employees' basic rights and duties, the personal protective equipment used on the press line and its standards, and how PPE is checked, maintained and replaced. Read the instruction and review the summary on the last page with your shift supervisor.",
        },
      },
    },
    {
      key: "shiftVideo",
      type: "video",
      isOhs: false,
      tags: [
        { type: "machine", name: "Duroplast pres" },
        { type: "shift", name: "Vardiya başı" },
      ],
      tr: {
        title: "Vardiya Başında Pres Hazırlığı",
        body: {
          assetId: a.videoTr,
          description: "Altı adımda vardiya başı hazırlığı: KKD, koruyucular, ışık perdesi ve iki el kumandası testi, acil durdurma, kalıp sıcaklığı ve kaçak kontrolü, ilk ürün onayı.",
        },
      },
      en: {
        title: "Preparing the Press at the Start of the Shift",
        body: {
          assetId: a.videoEn,
          description: "Start-of-shift preparation in six steps: PPE, guards, light curtain and two-hand control test, emergency stop, mould temperature and leak check, first-part approval.",
        },
      },
    },
    {
      key: "ppeGallery",
      type: "gallery",
      isOhs: true,
      tags: [{ type: "risk", name: "KKD" }],
      tr: {
        title: "Pres Hattında Kullanılan Kişisel Koruyucu Donanımlar",
        body: {
          items: [
            { assetId: a.ppe.goggles, caption: "Göz koruyucu (EN 166): Kalıp temizliğindeki basınçlı hava ve çapak parçacıklarına karşı yan korumalı gözlük takılır." },
            { assetId: a.ppe.gloves, caption: "Isıya dayanıklı eldiven (EN 407): Sıcak ürün ve kalıpla temas eden işlerde kullanılır. Çapak bıçağı kullanılıyorsa kesilmeye karşı EN 388 işaretli olanı tercih edilir." },
            { assetId: a.ppe.earmuffs, caption: "Kulak koruyucu (EN 352): Gürültü 80 dB(A) eylem değerini aşınca verilir; 85 dB(A) üzerinde takılması zorunludur." },
            { assetId: a.ppe.mask, caption: "Toz maskesi FFP2 (EN 149): Toz dökme, doz hazırlama ve temizlikte tozun solunmasını önler. Nemlenen ya da hasar gören maske değiştirilir." },
            { assetId: a.ppe.shoes, caption: "Güvenlik ayakkabısı (EN ISO 20345): Koruyucu burunlu ve kaymaz tabanlıdır; kalıp ve malzeme düşmesine karşı korur." },
            { assetId: a.ppe.clothing, caption: "İş kıyafeti: Bol olmayan, kolları bilekte kapanan kıyafet giyilir. Sarkan kordon, takı ve atkı makineye kapılabilir." },
          ],
        },
      },
      en: {
        title: "Personal Protective Equipment on the Press Line",
        body: {
          items: [
            { assetId: a.ppe.goggles, caption: "Eye protection (EN 166): Wear safety glasses with side shields against compressed air and flash particles during mould cleaning." },
            { assetId: a.ppe.gloves, caption: "Heat-resistant gloves (EN 407): For work involving contact with hot parts and moulds. If a deflashing knife is used, choose gloves also marked EN 388 for cut protection." },
            { assetId: a.ppe.earmuffs, caption: "Hearing protection (EN 352): Provided when noise exceeds the 80 dB(A) action value and mandatory above 85 dB(A)." },
            { assetId: a.ppe.mask, caption: "FFP2 dust mask (EN 149): Prevents inhaling dust while pouring powder, dosing and cleaning. Replace a mask that is damp or damaged." },
            { assetId: a.ppe.shoes, caption: "Safety shoes (EN ISO 20345): Protective toecap and slip-resistant sole; protect against falling moulds and material." },
            { assetId: a.ppe.clothing, caption: "Work clothing: Close-fitting clothes with cuffs closed at the wrist. Loose cords, jewellery and scarves can be caught by the machine." },
          ],
        },
      },
    },
    {
      key: "loto",
      type: "instruction",
      isOhs: true,
      tags: [
        { type: "machine", name: "Duroplast pres" },
        { type: "risk", name: "Ezilme" },
      ],
      tr: {
        title: "Kilitleme ve Etiketleme (LOTO) Uygulaması",
        body: {
          steps: [
            { title: "Hazırlanın ve haber verin", text: "Yapılacak işi, presin bütün enerji kaynaklarını (elektrik, hidrolik, pnömatik, ısıtıcılar) ve bunların ayırma noktalarını belirleyin. Vardiya amirine ve presi kullanan operatörlere makinenin kilitleneceğini söyleyin." },
            { title: "Presi normal yoldan durdurun", text: "Çevrimi tamamlayın, tablayı açık konumda bırakın ve presi kumanda panosundan durdurun. Acil durdurma butonu bir enerji ayırma yöntemi değildir." },
            { title: "Enerji kaynaklarını ayırın", text: "Ana elektrik şalterini kapatın, hidrolik pompayı ve ısıtıcı devresini ayırın, basınçlı hava vanasını kapatın." },
            { title: "Kişisel kilidinizi ve etiketinizi takın", text: "Her ayırma noktasına kendi kilidinizi takın. Etikete adınızı, tarihi ve yapılan işi yazın. Birden çok kişi çalışıyorsa her biri kendi kilidini çoklu kilit aparatına takar.", assetId: a.lotoLock },
            { title: "Birikmiş enerjiyi boşaltın", text: "Hidrolik basıncı boşaltın ve manometrenin sıfırı gösterdiğini görün. Üst tablayı emniyet takozuyla destekleyin. Kalıbın, iş eldivenle güvenle tutulabilecek sıcaklığa inmesini bekleyin." },
            { title: "Sıfır enerjiyi doğrulayın", text: "Çevrenin boş olduğundan emin olduktan sonra presi çalıştırmayı deneyin: hiçbir hareket olmamalı. Denemeden sonra kumandayı tekrar kapalı konuma getirin.", assetId: a.lotoVerify },
            { title: "İşi yapın", text: "Yalnızca planlanan işi yapın. İş sırasında kilidin yerinde kaldığını kontrol edin." },
            { title: "Çalıştırmaya hazırlayın", text: "Aletleri ve malzemeyi alandan kaldırın, emniyet takozunu çıkarın, koruyucuları yerine takın. Herkesin tehlike bölgesinin dışında olduğunu doğrulayın." },
            { title: "Kilidi takan kişi söker", text: "Kilidinizi ve etiketinizi yalnızca siz sökersiniz. Ardından operatörlere makinenin yeniden çalışacağını haber verin ve ilk çevrimi birlikte izleyin." },
          ],
        },
      },
      en: {
        title: "Lockout/Tagout (LOTO) Procedure",
        body: {
          steps: [
            { title: "Prepare and inform", text: "Identify the job, every energy source of the press (electrical, hydraulic, pneumatic, heaters) and their isolation points. Tell the shift supervisor and the press operators that the machine will be locked out." },
            { title: "Shut the press down normally", text: "Finish the cycle, leave the platen open and stop the press from the control panel. The emergency stop is not an energy isolation method." },
            { title: "Isolate the energy sources", text: "Switch off the main electrical isolator, isolate the hydraulic pump and heater circuit, and close the compressed air valve." },
            { title: "Apply your personal lock and tag", text: "Put your own lock on every isolation point. Write your name, the date and the job on the tag. If several people work, each puts their own lock on the multi-lock hasp.", assetId: a.lotoLock },
            { title: "Release stored energy", text: "Release the hydraulic pressure and check that the gauge reads zero. Support the upper platen with a safety block. Wait until the mould has cooled enough to be held safely with work gloves." },
            { title: "Verify zero energy", text: "After making sure the area is clear, try to start the press: nothing must move. Return the controls to the off position after the test.", assetId: a.lotoVerify },
            { title: "Do the job", text: "Do only the planned job. Check that the lock stays in place throughout." },
            { title: "Prepare for restart", text: "Remove tools and material, take out the safety block and refit the guards. Confirm that everyone is outside the danger zone." },
            { title: "The person who applied the lock removes it", text: "Only you remove your lock and tag. Then tell the operators the machine will restart and watch the first cycle together." },
          ],
        },
      },
    },
    {
      key: "checklist",
      type: "checklist",
      isOhs: false,
      tags: [
        { type: "machine", name: "Duroplast pres" },
        { type: "shift", name: "Vardiya başı" },
      ],
      tr: {
        title: "Vardiya Başı Pres Kontrol Listesi ve 5S",
        body: {
          items: [
            { text: "Acil durdurma butonu çalışıyor: basınca pres duruyor, geri çevrilmeden çalışmıyor.", critical: true },
            { text: "Işık perdesi test çubuğuyla denendi; perde kesilince tabla duruyor.", critical: true },
            { text: "İki el kumandası: iki buton birlikte basılmadan çevrim başlamıyor.", critical: true },
            { text: "Sabit ve hareketli koruyucular yerinde ve hasarsız.", critical: true },
            { text: "Hidrolik hortum ve bağlantılarda kaçak yok.", critical: true },
            { text: "Kalıp sıcaklığı ürün föyündeki aralıkta.", critical: false },
            { text: "Basınçlı hava tabancası ve hortumu sağlam.", critical: false },
            { text: "Doz kabı, terazi, maşa ve pens yerinde ve temiz.", critical: false },
            { text: "Ayıkla: Alanda bu işe ait olmayan malzeme yok.", critical: false },
            { text: "Düzenle: Aletler gölge panodaki yerlerinde.", critical: false },
            { text: "Temizle: Zeminde toz, granül ve yağ yok.", critical: false },
            { text: "Önceki vardiyanın uygunsuzluk kayıtları okundu.", critical: false },
          ],
        },
      },
      en: {
        title: "Start-of-Shift Press Checklist and 5S",
        body: {
          items: [
            { text: "Emergency stop works: pressing it stops the press, which does not restart until reset.", critical: true },
            { text: "Light curtain tested with the test rod; the platen stops when the curtain is broken.", critical: true },
            { text: "Two-hand control: the cycle does not start unless both buttons are pressed together.", critical: true },
            { text: "Fixed and movable guards are in place and undamaged.", critical: true },
            { text: "No leaks on hydraulic hoses and fittings.", critical: true },
            { text: "Mould temperature is within the range on the product sheet.", critical: false },
            { text: "Compressed air gun and hose are in good condition.", critical: false },
            { text: "Dosing cup, scale, tongs and pliers are in place and clean.", critical: false },
            { text: "Sort: No material that does not belong to this job in the area.", critical: false },
            { text: "Set in order: Tools are in their places on the shadow board.", critical: false },
            { text: "Shine: No powder, granules or oil on the floor.", critical: false },
            { text: "Previous shift's nonconformity records have been read.", critical: false },
          ],
        },
      },
    },
    {
      key: "nearMiss",
      type: "form_template",
      isOhs: true,
      tags: [{ type: "risk", name: "Ramak kala" }],
      tr: {
        title: "Ramak Kala Olay Bildirim Formu",
        body: {
          assetId: a.nearMissTr,
          description:
            "Yaralanmaya ya da hasara yol açmadan atlatılan olayları bildirmek için kullanılır (6331 sayılı Kanun md. 14). Formu doldurup vardiya amirine verin; İSG uzmanı olayı inceleyip kalıcı önlemi belirler. Adınızı yazmak isteğe bağlıdır.",
        },
      },
      en: {
        title: "Near-Miss Report Form",
        body: {
          assetId: a.nearMissEn,
          description:
            "Use it to report events that ended without injury or damage (Law No. 6331, Art. 14). Fill it in and hand it to your shift supervisor; the OHS specialist investigates and decides on the permanent measure. Giving your name is optional.",
        },
      },
    },
    {
      key: "fire",
      type: "text",
      isOhs: true,
      tags: [{ type: "risk", name: "Yangın" }],
      tr: {
        title: "Yangın Güvenliği ve Acil Durum Tahliyesi",
        body: doc(
          p("Yangın için üç şey bir araya gelmelidir: yakıt, ısı ve oksijen. Bunlardan birini ortadan kaldırmak yangını önler ya da söndürür. Pres hattında kalıplama tozu, ambalaj malzemesi, hidrolik yağ ve sıcak ısıtıcılar yangın riskini artırır."),
          h2("Yangını önleme"),
          ul(
            "Toz birikmesine izin vermeyin; dökülen tozu vardiya içinde toplayın.",
            "Yağlı bezleri kapaklı metal kaba atın.",
            "Elektrik panolarının, yangın dolaplarının ve söndürücülerin önünü boş tutun.",
            "Hasarlı kablo, kızaran priz ya da yanık kokusu fark ettiğinizde amirinize bildirin.",
            "Sigara yalnızca işaretli alanda içilir.",
          ),
          h2("Söndürücü seçimi"),
          ul(
            [{ b: "A sınıfı: " }, "Katı maddeler (kağıt, karton, ahşap, plastik)."],
            [{ b: "B sınıfı: " }, "Yanıcı sıvılar (hidrolik yağ, solvent)."],
            [{ b: "C sınıfı: " }, "Yanıcı gazlar."],
            [{ b: "D sınıfı: " }, "Yanıcı metaller (magnezyum, alüminyum tozu gibi). Bunlar için özel D sınıfı toz kullanılır."],
            [{ b: "F sınıfı: " }, "Yemeklik yağ yangınları."],
            [{ b: "Elektrik yangını: " }, "Gerilim altındaki ekipmana su sıkılmaz. Elektriği kesin; karbondioksitli ya da elektrikli ekipmana uygun kuru kimyevi tozlu söndürücü kullanın."],
          ),
          h2("Söndürücünün kullanımı"),
          ol(
            "Rüzgârı ya da hava akımını arkanıza alın, kaçış yolunuzu açık bırakın.",
            "Pimi çekin.",
            "Hortumu alevin dibine yöneltin.",
            "Tetiğe basın ve süpürür gibi sağa sola hareket ettirin.",
            "Yangın büyüyorsa ya da duman yoğunlaşıyorsa müdahaleyi bırakıp tahliyeye katılın.",
          ),
          h2("Alarm ve tahliye"),
          ol(
            "Yangını görürseniz yüksek sesle haber verin, en yakın yangın alarm butonuna basın ve 112'yi arayın.",
            "Çalıştığınız makineyi acil durdurma ile durdurun.",
            "Yeşil kaçış işaretlerini izleyerek en kısa yoldan çıkın; asansör kullanmayın, eşya almak için durmayın.",
            "Toplanma alanında koruma ekibine kendinizi bildirin ve sayım bitene kadar ayrılmayın.",
            "İzin verilmeden binaya geri dönmeyin.",
          ),
          p("Acil durum ekipleri ve destek elemanları İşyerlerinde Acil Durumlar Hakkında Yönetmelik'e göre belirlenir; tahliye tatbikatı en geç yılda bir yapılır. Yeni başlayan her çalışan acil durum planı hakkında bilgilendirilir."),
        ),
      },
      en: {
        title: "Fire Safety and Emergency Evacuation",
        body: doc(
          p("A fire needs three things together: fuel, heat and oxygen. Removing any one of them prevents or extinguishes the fire. On the press line, moulding powder, packaging, hydraulic oil and hot heaters increase the fire risk."),
          h2("Preventing fire"),
          ul(
            "Do not let dust build up; collect spilled powder during the shift.",
            "Put oily rags in a closed metal bin.",
            "Keep the space in front of electrical panels, fire cabinets and extinguishers clear.",
            "Report damaged cables, hot sockets or a burning smell to your supervisor.",
            "Smoking is allowed only in the marked area.",
          ),
          h2("Choosing an extinguisher"),
          ul(
            [{ b: "Class A: " }, "Solid materials (paper, cardboard, wood, plastic)."],
            [{ b: "Class B: " }, "Flammable liquids (hydraulic oil, solvents)."],
            [{ b: "Class C: " }, "Flammable gases."],
            [{ b: "Class D: " }, "Combustible metals (such as magnesium or aluminium powder). These need a special class D powder."],
            [{ b: "Class F: " }, "Cooking oil fires."],
            [{ b: "Electrical fire: " }, "Never spray water on live equipment. Cut the power and use a CO₂ extinguisher or a dry powder extinguisher suitable for electrical equipment."],
          ),
          h2("Using an extinguisher"),
          ol(
            "Keep the wind or air flow behind you and your escape route open.",
            "Pull the pin.",
            "Aim the hose at the base of the flames.",
            "Squeeze the handle and sweep from side to side.",
            "If the fire grows or the smoke thickens, stop and join the evacuation.",
          ),
          h2("Alarm and evacuation"),
          ol(
            "If you see a fire, shout a warning, press the nearest fire alarm button and call 112.",
            "Stop your machine with the emergency stop.",
            "Follow the green exit signs by the shortest route; do not use lifts and do not stop to collect belongings.",
            "Report to the evacuation team at the assembly point and stay until the head count is complete.",
            "Do not re-enter the building until you are told it is safe.",
          ),
          p("Emergency teams and support staff are appointed under the Regulation on Emergencies at Workplaces; an evacuation drill is held at least once a year. Every new employee is briefed on the emergency plan."),
        ),
      },
    },
  ];
}
