import { beforeEach, describe, expect, it, vi } from "vitest";

// Eylemin bağımlılıkları sahte: yalnızca girdi kontrolü ve sonucu sınanır
const requestPasswordReset = vi.fn();
const mailEnabled = vi.fn(() => true);
vi.mock("@/server/services/password-reset", () => ({ requestPasswordReset, resetPasswordWithToken: vi.fn() }));
vi.mock("@/server/mail", () => ({ mailEnabled }));
vi.mock("@/server/auth/request", () => ({ getRequestMeta: async () => ({ ip: "10.0.0.1" }) }));
vi.mock("@/server/logger", () => ({ logger: { error: vi.fn() } }));

const { requestResetAction } = await import("@/features/auth/reset-actions");

function form(sicilNo?: string): FormData {
  const data = new FormData();
  if (sicilNo !== undefined) data.set("sicilNo", sicilNo);
  return data;
}

describe("SPEC 11.4: şifremi unuttum girdisi", () => {
  beforeEach(() => {
    requestPasswordReset.mockReset();
    mailEnabled.mockReturnValue(true);
  });

  it("sicil no boşsa uyarı döner, istek yapılmaz", async () => {
    expect(await requestResetAction({}, form(""))).toEqual({ missing: true });
    expect(await requestResetAction({}, form("   "))).toEqual({ missing: true });
    expect(await requestResetAction({}, form())).toEqual({ missing: true });
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it("karar #88: dolu sicilde sonuç her zaman aynıdır (sicilin varlığı sızdırılmaz)", async () => {
    expect(await requestResetAction({ missing: true }, form(" 1234 "))).toEqual({ sent: true });
    expect(requestPasswordReset).toHaveBeenCalledWith({ sicilNo: "1234", ip: "10.0.0.1" });

    requestPasswordReset.mockRejectedValueOnce(new Error("db"));
    expect(await requestResetAction({}, form("OLMAYAN"))).toEqual({ sent: true });
  });

  it("FG-3.7 karar #263: e-posta kapalıyken istek kaydedilmez", async () => {
    mailEnabled.mockReturnValue(false);
    expect(await requestResetAction({}, form("1234"))).toEqual({ sent: true });
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });
});
