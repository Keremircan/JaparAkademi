import { z } from "zod";

/** Tarayıcının PushSubscription.toJSON() çıktısı (yalnızca gerekli alanlar). */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(2048),
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{80,100}=*$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{16,32}=*$/),
  }),
});

export const pushEndpointSchema = z.url().max(2048);
