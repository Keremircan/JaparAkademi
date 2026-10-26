import pino from "pino";

/** Yapılandırılmış JSON loglar. Hassas alanlar otomatik maskelenir. */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { app: "japar-akademi" },
  redact: {
    paths: ["password", "*.password", "newPassword", "currentPassword", "token", "*.token", "headers.cookie"],
    censor: "***",
  },
});
