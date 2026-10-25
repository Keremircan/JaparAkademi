import { describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";
import { checkStorage, signedGetUrl, signedPutUrl } from "@/server/storage/client";

describe("Depolama (Garage, S3 uyumlu)", () => {
  it("bucket erişilebilir", async () => {
    expect(await checkStorage()).toBe(true);
  });

  it("imzalı URL ile yükleme ve okuma çalışır; imzasız erişim reddedilir", async () => {
    const key = `test/${uuidv7()}.txt`;
    const putUrl = await signedPutUrl(key, "text/plain");
    const put = await fetch(putUrl, { method: "PUT", body: "merhaba", headers: { "Content-Type": "text/plain" } });
    expect(put.ok).toBe(true);

    const getUrl = await signedGetUrl(key);
    const got = await fetch(getUrl);
    expect(await got.text()).toBe("merhaba");

    const unsigned = await fetch(getUrl.split("?")[0]!);
    expect(unsigned.ok).toBe(false);
  });
});
