/**
 * Droplast/Pres İşçisi pozisyon kartı (örnek, karar #296). Bölüm şeması `services/positions/card-schema.ts`.
 * Kart metni yalnızca Türkçedir (kart bölümleri tek dillidir).
 */

export type CardRefs = { nearMissId: string; pressRulesId: string; lotoId: string; isgPdfId: string; ppeGalleryId: string; diagramAssetId: string };

export function cardSections(r: CardRefs) {
  return {
    purpose:
      "Duroplast (termoset) kalıplama tozunu sıcak preste şekillendirerek ürün föyüne uygun, hatasız parça üretmek; bunu yaparken pres güvenlik donanımını, kişisel koruyucu donanımı ve kilitleme-etiketleme kurallarını eksiksiz uygulamak.",
    duties: [
      { text: "Vardiya başı kontrol listesini doldurmak; acil durdurma, ışık perdesi ve iki el kumandasını test etmek.", frequency: "daily" },
      { text: "Kalıplama tozunu ürün föyündeki miktarda tartıp kalıba eşit dağıtmak.", frequency: "continuous" },
      { text: "Pres çevrimini iki el kumandasıyla başlatmak; ön sıkıştırma, gaz alma ve kürlenme sürelerine uymak.", frequency: "continuous" },
      { text: "Ürünü kalıptan maşayla almak, çapağını temizlemek ve gözle kontrol etmek.", frequency: "continuous" },
      { text: "Kalıbı basınçlı havayla temizlemek ve kalıp ayırıcıyı föydeki aralıkla uygulamak.", frequency: "continuous" },
      { text: "Uygun olmayan ürünü ayırıp kırmızı etiketle işaretlemek ve üretim formuna işlemek.", frequency: "daily" },
      { text: "Hidrolik ve pnömatik bağlantıları gözle kontrol edip kaçakları bakım ekibine bildirmek.", frequency: "weekly" },
      { text: "Çalışma alanını 5S'e göre düzenlemek; vardiya sonunda presin çevresini temizlemek.", frequency: "daily" },
    ],
    workflow: {
      steps: [
        { input: "İş emri ve ürün föyü", process: "Kalıp sıcaklığı, basınç ve çevrim süreleri föyle karşılaştırılır; güvenlik testleri yapılır.", output: "Üretime hazır pres" },
        { input: "Kalıplama tozu", process: "Doz hassas terazide tartılır ve kalıp gözlerine eşit dağıtılır.", output: "Dolu kalıp" },
        { input: "Dolu kalıp", process: "Çevrim iki el kumandasıyla başlatılır; ön sıkıştırma, gaz alma ve kürlenme tamamlanır.", output: "Kürlenmiş ürün" },
        { input: "Kürlenmiş ürün", process: "Ürün maşayla alınır, çapağı temizlenir ve gözle kontrol edilir.", output: "Uygun ya da uygun olmayan ürün" },
        { input: "Uygun ürün", process: "Ürün kutulanır, etiketlenir ve üretim formuna işlenir.", output: "Sevke hazır ürün" },
      ],
      diagramAssetId: r.diagramAssetId,
    },
    routines: [
      { time: "07:00", days: ["mon", "tue", "wed", "thu", "fri"], text: "Vardiya devri: önceki vardiyanın notlarını okuyun, kontrol listesini doldurun." },
      { time: "07:20", days: ["mon", "tue", "wed", "thu", "fri"], text: "İlk ürün onayı: ilk parçayı ölçüp vardiya amirine onaylatın." },
      { time: "11:30", days: ["mon", "tue", "wed", "thu", "fri"], text: "Ara kontrol: kalıbı temizleyin, ayırıcıyı yenileyin, zemindeki tozu toplayın." },
      { time: "14:00", days: ["fri"], text: "Haftalık 5S turu: alanı vardiya amiriyle birlikte gezin, eksikleri not edin." },
      { time: "15:30", days: ["mon", "tue", "wed", "thu", "fri"], text: "Vardiya sonu: alanı temizleyin, üretim formunu kapatın, devir notunu yazın." },
    ],
    reporting: [
      { report: "Üretim formu (adet, fire, duruş)", recipient: "Vardiya amiri", frequency: "Vardiya sonu", format: "Basılı form" },
      { report: "Uygunsuz ürün kaydı", recipient: "Kalite kontrol", frequency: "Oluştuğunda", format: "Kırmızı etiket ve form" },
      { report: "Ramak kala olay bildirimi", recipient: "Vardiya amiri ve İSG uzmanı", frequency: "Oluştuğunda", format: "Ramak kala formu", sampleContentId: r.nearMissId },
      { report: "Arıza ve kaçak bildirimi", recipient: "Bakım ekibi", frequency: "Oluştuğunda", format: "Sözlü ve arıza formu" },
    ],
    equipment: [
      { name: "Hidrolik duroplast pres (ışık perdeli, iki el kumandalı)", kind: "machine" },
      { name: "Kalıp ısıtma kontrol ünitesi", kind: "machine" },
      { name: "Hassas terazi ve doz kabı", kind: "tool" },
      { name: "Maşa, pens ve çapak bıçağı", kind: "tool" },
      { name: "Basınçlı hava tabancası", kind: "tool" },
      { name: "Vardiya başı kontrol listesi ve üretim formu", kind: "form" },
    ],
    critical: [
      { kind: "forbidden", text: "İki el kumandasını köprülemek; ışık perdesini ya da koruyucuları devre dışı bırakmak." },
      { kind: "forbidden", text: "Kilitleme ve etiketleme yapmadan kalıp arasına girmek." },
      { kind: "error", text: "Dozu föyden farklı tartmak: eksik doz boşluklu, fazla doz çapaklı ve ölçü dışı ürün verir." },
      { kind: "quality", text: "Kürlenme süresini kısaltmak: yeterince kürlenmeyen ürün kabarır ve dayanımı düşer." },
    ],
    ohs: {
      risks: [
        { text: "Kalıp kapanırken el ve kolun ezilmesi" },
        { text: "140–170 °C kalıp yüzeyi ve sıcak üründen yanık" },
        { text: "Yüksek basınçlı hidrolik yağın deriye nüfuz etmesi" },
        { text: "Kalıplama tozu ve kürlenme buharının solunması" },
        { text: "Gürültü ve basınçlı havadan göz yaralanması" },
        { text: "Dökülen toz ve yağ nedeniyle kayma" },
      ],
      ppe: [
        { text: "Göz koruyucu (EN 166)" },
        { text: "Isıya dayanıklı eldiven (EN 407); çapak bıçağı kullanılıyorsa ayrıca EN 388" },
        { text: "Güvenlik ayakkabısı (EN ISO 20345)" },
        { text: "Kulak koruyucu (EN 352); 85 dB(A) üzerinde zorunlu" },
        { text: "FFP2 toz maskesi (EN 149); toz dökme, doz hazırlama ve temizlikte" },
      ],
      instructions: [
        { text: "Duroplast Pres Hattında Güvenli Çalışma Kuralları" },
        { text: "Kilitleme ve Etiketleme (LOTO) Uygulaması" },
        { text: "Temel İSG ve KKD Talimatı" },
      ],
      loto:
        "Sıkışma giderme, kalıp değişimi, kalıp arasında temizlik ve her türlü bakımda uygulanır: elektrik, hidrolik, pnömatik ve ısıtıcı enerjisi ayrılır; herkes kendi kilidini ve etiketini takar; hidrolik basınç boşaltılır, üst tabla emniyet takozuyla desteklenir; sıfır enerji presi çalıştırmayı deneyerek doğrulanır. Kilidi yalnızca takan kişi söker.",
      emergency:
        "Tehlike anında en yakın acil durdurma butonuna basın. Yaralanmada ilk yardım ekibine ve vardiya amirine haber verin; yanığı akan serin su altında soğutun, hidrolik yağın deriye girdiğinden şüpheleniyorsanız kişiyi hemen hekime gönderin. Yangında alarmı çalıştırın, 112'yi arayın, yalnızca başlangıç yangınına uygun söndürücüyle müdahale edin ve toplanma alanına gidin.",
      contentIds: [r.pressRulesId, r.lotoId, r.isgPdfId, r.ppeGalleryId],
    },
    competencies: [
      { text: "Duroplast presi ayarlayıp güvenli çevrimle kullanmak" },
      { text: "Kilitleme ve etiketleme (LOTO) uygulamak" },
      { text: "Ürün föyünü okuyup ilk ürün onayını yaptırmak" },
      { text: "Kalıp değişiminde bakım ekibine LOTO altında yardım etmek" },
    ],
    kpis: [
      { text: "Fire oranı: vardiya başına %2'nin altında" },
      { text: "Vardiya başı kontrol listesi: her vardiyada eksiksiz" },
      { text: "Plansız duruş: vardiya başına 30 dakikanın altında" },
    ],
    contacts: [
      { situation: "Pres arızası, kaçak ya da alışılmadık ses", contact: "Bakım ekibi (vardiya amiri aracılığıyla)" },
      { situation: "Ölçü dışı ya da şüpheli ürün", contact: "Kalite kontrol" },
      { situation: "Yaralanma ya da iş kazası", contact: "İlk yardım ekibi ve vardiya amiri" },
      { situation: "Ramak kala ya da güvensiz durum", contact: "İSG uzmanı" },
      { situation: "Yangın ya da başka bir acil durum", contact: "112 ve işyeri acil durum ekibi" },
    ],
  };
}

/** Kartın ikinci sürümü: yeni performans göstergesi. */
export const CARD_V2 = {
  kpi: { text: "Ramak kala bildirimi: ayda en az bir gözlem ya da bildirim" },
  changeNote: "Ramak kala bildirimi performans göstergelerine eklendi.",
};
