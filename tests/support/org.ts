import { systemActor } from "@/server/authz/actor";
import { createOrgUnit, createPosition } from "@/server/services/org";

const sys = systemActor("test");

/** Örnek ağaç: Üretim (Pres Hattı, Montaj) ve Kalite; her birinde bir pozisyon. */
export async function seedTestOrg() {
  const uretim = (await createOrgUnit(sys, { kind: "department", name: "Üretim", code: "URETIM" })).id;
  const pres = (await createOrgUnit(sys, { kind: "section", parentId: uretim, name: "Pres Hattı", code: "PRES" })).id;
  const montaj = (await createOrgUnit(sys, { kind: "section", parentId: uretim, name: "Montaj", code: "MONTAJ" })).id;
  const kalite = (await createOrgUnit(sys, { kind: "department", name: "Kalite", code: "KALITE" })).id;

  const presOp = (await createPosition(sys, { orgUnitId: pres, name: "Pres Operatörü", code: "PRES-OP", collarType: "blue" })).id;
  const montajOp = (await createPosition(sys, { orgUnitId: montaj, name: "Montaj Operatörü", code: "MONTAJ-OP", collarType: "blue" })).id;
  const kkTek = (await createPosition(sys, { orgUnitId: kalite, name: "Kalite Teknisyeni", code: "KK-TEK", collarType: "blue" })).id;
  const mudur = (await createPosition(sys, { orgUnitId: uretim, name: "Üretim Müdürü", code: "URETIM-MUDUR", collarType: "white" })).id;

  return { units: { uretim, pres, montaj, kalite }, positions: { presOp, montajOp, kkTek, mudur } };
}
