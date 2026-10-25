import type { Role } from "./roles";

/**
 * İşlemi yapan taraf. Her servis fonksiyonu bir aktör alır; denetim kaydına bu aktör yazılır.
 * - user  : giriş yapmış kullanıcı
 * - system: seed, worker işleri gibi kullanıcı dışı işlemler (actor_id boş, request_id "system:<ad>")
 */
export type UserActor = {
  kind: "user";
  userId: string;
  roles: readonly Role[];
};

export type SystemActor = {
  kind: "system";
  name: string;
};

export type Actor = UserActor | SystemActor;

export function systemActor(name: string): SystemActor {
  return { kind: "system", name };
}
