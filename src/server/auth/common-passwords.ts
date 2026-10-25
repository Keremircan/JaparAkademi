/**
 * Yaygın şifreler (küçük harf). Dış servise sorgu atılmaz; liste yerel tutulur.
 * Ardışık ve tekrarlı diziler (12345678, 11111111) password-policy.ts'te ayrıca yakalanır.
 */
const LIST = [
  // Uluslararası yaygın şifreler
  "password", "password1", "password12", "password123", "passw0rd", "p@ssw0rd", "p@ssword",
  "12345678", "123456789", "1234567890", "87654321", "11223344", "12341234", "12121212",
  "1q2w3e4r", "1q2w3e4r5t", "1qaz2wsx", "qwerty12", "qwerty123", "qwertyui", "qwerty1234",
  "asdf1234", "zaq12wsx", "abc12345", "abcd1234", "a1b2c3d4", "aa123456", "admin123",
  "administrator", "iloveyou", "sunshine", "princess", "football", "baseball", "superman",
  "starwars", "welcome1", "welcome123", "letmein1", "trustno1", "dragon12", "monkey12",
  "master12", "shadow12", "michael1", "computer", "internet", "whatever", "changeme",
  "default1", "test1234", "testtest", "guest123", "user1234", "login123", "secret12",
  "samsung1", "google12", "freedom1", "liverpool", "chelsea1", "arsenal1", "manchester",
  "barcelona", "realmadrid", "pokemon1", "batman12", "jordan23", "michelle", "jennifer",
  "11111111", "00000000", "88888888", "99999999", "12344321", "147258369", "123123123",
  "123qweasd", "qweasdzxc", "1234qwer", "qwer1234", "q1w2e3r4", "q1w2e3r4t5", "zxcvbnm1",
  "19801980", "19901990", "20002000", "20202020", "20242024", "20252025", "20262026",
  // Türkçe yaygın şifreler
  "sifre123", "şifre123", "sifre1234", "şifre1234", "sifresifre", "parola123", "parola1234",
  "parolam1", "sifrem12", "şifrem12", "galatasaray", "galatasaray1", "fenerbahce", "fenerbahçe",
  "fenerbahce1", "besiktas", "beşiktaş", "besiktas1", "trabzonspor", "cimbom1905", "cimbom123",
  "fener1907", "bjk19031903", "gs19051905", "fb19071907", "ts19671967", "türkiye1", "turkiye1",
  "turkiye123", "türkiye123", "istanbul", "istanbul34", "istanbul1", "ankara06", "ankara123",
  "izmir035", "izmir1234", "bursa016", "kocaeli41", "konya042", "kayseri38", "mustafa1",
  "mehmet12", "mehmet123", "ahmet123", "ahmet1234", "ayse1234", "ayşe1234", "fatma123",
  "ali12345", "veli1234", "hasan123", "huseyin1", "hüseyin1", "murat123", "emre1234",
  "zeynep12", "elif1234", "merve123", "seni seviyorum", "seniseviyorum", "askim123",
  "aşkım123", "annem123", "babam123", "allah123", "kartal1903", "aslan1905", "kanarya1907",
  "atatürk1", "ataturk1", "ataturk1881", "atatürk1881", "japar123", "japar1234", "japar2026",
  "japarakademi", "akademi1", "akademi123", "fabrika1", "fabrika123", "personel", "personel1",
  "personel123", "calisan1", "çalışan1", "isci1234", "işçi1234", "deneme12", "deneme123",
  "deneme1234", "merhaba1", "merhaba123", "hosgeldin", "hoşgeldin", "yasasin1", "kelebek1",
];

export const COMMON_PASSWORDS: ReadonlySet<string> = new Set(
  LIST.map((p) => p.toLocaleLowerCase("tr-TR")),
);
