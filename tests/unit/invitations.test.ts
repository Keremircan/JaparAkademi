import { describe, expect, it } from "vitest";
import {
  accountState,
  channelProblem,
  formatInviteCode,
  isInvitationOpen,
  normalizePhone,
  parseInviteCode,
  pickChannel,
  whatsappShareUrl,
} from "@/server/state/invitations";

const now = new Date("2026-10-29T10:00:00Z");
const open = { usedAt: null, revokedAt: null, expiresAt: new Date("2026-10-30T10:00:00Z"), failedAttempts: 0 };

describe("hesaba davet kuralları (iş paketi 2.6b)", () => {
  it("karar #188: telefon +90 biçimine çevrilir; çözülemeyen numara reddedilir", () => {
    expect(normalizePhone("0532 111 22 33")).toBe("+905321112233");
    expect(normalizePhone("+90 (532) 111-22-33")).toBe("+905321112233");
    expect(normalizePhone("905321112233")).toBe("+905321112233");
    expect(normalizePhone("5321112233")).toBe("+905321112233");
    expect(normalizePhone("0212 444 55 66")).toBe("+902124445566");
    expect(normalizePhone("+49 151 2345 6789")).toBe("+4915123456789");
    expect(normalizePhone("0049 151 2345 6789")).toBe("+4915123456789");
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("+90 532 111 22")).toBeNull();
    expect(normalizePhone("0532-ABC")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });

  it("karar #188: WhatsApp paylaş bağlantısı numarayı rakam olarak, mesajı kodlanmış taşır", () => {
    const url = new URL(whatsappShareUrl("+905321112233", "Merhaba Ayşe & ekip: https://a.test/activate/x"));
    expect(url.host).toBe("wa.me");
    expect(url.pathname).toBe("/905321112233");
    expect(url.searchParams.get("text")).toBe("Merhaba Ayşe & ekip: https://a.test/activate/x");
  });

  it("basılı kod: 8 rakam, boşluk ve tire yok sayılır", () => {
    expect(formatInviteCode("48152342")).toBe("4815 2342");
    expect(parseInviteCode("4815 2342")).toBe("48152342");
    expect(parseInviteCode("4815-2342")).toBe("48152342");
    expect(parseInviteCode("4815234")).toBeNull();
    expect(parseInviteCode("4815 234a")).toBeNull();
  });

  it("karar #186: davet kullanılmamış, iptal edilmemiş, süresi dolmamış ve hakkı bitmemişse açıktır", () => {
    expect(isInvitationOpen(open, now, 5)).toBe(true);
    expect(isInvitationOpen({ ...open, usedAt: now }, now, 5)).toBe(false);
    expect(isInvitationOpen({ ...open, revokedAt: now }, now, 5)).toBe(false);
    expect(isInvitationOpen({ ...open, expiresAt: now }, now, 5)).toBe(false);
    expect(isInvitationOpen({ ...open, failedAttempts: 5 }, now, 5)).toBe(false);
  });

  it("karar #191: kanal koşulları", () => {
    const person = { email: "a@japar.test", phone: "05321112233" };
    expect(channelProblem("email", person, false)).toBe("invite_mail_disabled");
    expect(channelProblem("email", { ...person, email: null }, true)).toBe("invite_email_missing");
    expect(channelProblem("email", person, true)).toBeNull();
    expect(channelProblem("whatsapp", { ...person, phone: "123" }, true)).toBe("invite_phone_missing");
    expect(channelProblem("whatsapp", person, false)).toBeNull();
    expect(channelProblem("print", { email: null, phone: null }, false)).toBeNull();
  });

  it("hesap durumu: açık davet önceliklidir; etkinleşmemiş kişinin kapanan daveti 'kullanılamıyor' görünür", () => {
    expect(accountState({ activatedAt: null, latestInvite: open, now, maxAttempts: 5 })).toBe("invite_pending");
    expect(accountState({ activatedAt: now, latestInvite: { ...open, usedAt: now }, now, maxAttempts: 5 })).toBe("active");
    expect(accountState({ activatedAt: null, latestInvite: { ...open, failedAttempts: 5 }, now, maxAttempts: 5 })).toBe("invite_expired");
    expect(accountState({ activatedAt: null, latestInvite: null, now, maxAttempts: 5 })).toBe("not_invited");
    expect(accountState({ activatedAt: null, mustChangePassword: true, latestInvite: null, now, maxAttempts: 5 })).toBe("not_activated");
  });

  it("karar #200: toplu davette kanal seçimi", () => {
    const both = { email: "a@japar.test", phone: "05321112233" };
    const phoneOnly = { email: null, phone: "05321112233" };
    const none = { email: null, phone: null };
    expect(pickChannel("smart", both, true)).toBe("email");
    expect(pickChannel("smart", both, false)).toBe("whatsapp");
    expect(pickChannel("smart", phoneOnly, true)).toBe("whatsapp");
    expect(pickChannel("smart", none, true)).toBe("print");
    expect(pickChannel("whatsapp", none, true)).toBe("print");
    expect(pickChannel("email", phoneOnly, true)).toBe("print");
    expect(pickChannel("print", both, true)).toBe("print");
  });
});
