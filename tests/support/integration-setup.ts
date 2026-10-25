import { afterAll, beforeEach } from "vitest";
import { closeDb } from "@/server/db/client";
import { closeOwner, truncateAll } from "./db";

// Her test temiz veritabanıyla başlar
beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
  await closeOwner();
});
