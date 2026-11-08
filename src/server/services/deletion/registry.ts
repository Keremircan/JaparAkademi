import type { DeleteKind } from "@/lib/deletion";
import { classroomSessionDeletion } from "../classroom";
import { competencyDeletion } from "../competencies";
import { contentDeletion, tagDeletion } from "../content";
import { deviceDeletion } from "../devices";
import { legalDraftDeletion } from "../legal";
import { moduleDeletion } from "../modules";
import { orgUnitDeletion, positionDeletion } from "../org";
import { personDeletion } from "../person-deletion";
import { questionDeletion } from "../questions";
import { companyDeletion } from "../visitors/companies";
import { visitDeletion } from "../visitors/visits";
import type { Deletable } from "./core";

/** Tanımın kayıt tipi akış içinde kullanılmaz (yükle → denetle → sil aynı değeri dolaştırır). */
const entry = <R>(def: Deletable<R>) => def as unknown as Deletable<unknown>;

/** Silinebilen kayıt türleri ve tanımları (iş paketi 3.14). */
export const REGISTRY: { [K in DeleteKind]: Deletable<unknown> } = {
  org_unit: entry(orgUnitDeletion),
  position: entry(positionDeletion),
  person: entry(personDeletion),
  module: entry(moduleDeletion),
  content: entry(contentDeletion),
  question: entry(questionDeletion),
  tag: entry(tagDeletion),
  competency: entry(competencyDeletion),
  classroom_session: entry(classroomSessionDeletion),
  company: entry(companyDeletion),
  visit: entry(visitDeletion),
  device: entry(deviceDeletion),
  legal_draft: entry(legalDraftDeletion),
};
