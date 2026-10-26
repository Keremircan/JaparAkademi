"use client";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { approveVersionAction, rejectVersionAction } from "../actions";

/** Onay/ret paneli. Ret gerekçesi zorunludur (FG-2.3). */
export function ApprovalPanel({ versionId, step }: { versionId: string; step: "section" | "ohs" }) {
  const t = useTranslations("content.approval");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (kind: "approve" | "reject") => {
    setError(null);
    if (kind === "reject" && comment.trim().length < 3) return setError("reject_comment_required");
    if (kind === "approve" && !window.confirm(t("approveConfirm"))) return;
    startTransition(async () => {
      const r = kind === "approve" ? await approveVersionAction(versionId, comment) : await rejectVersionAction(versionId, comment);
      if (!r.ok) setError(r.error);
    });
  };

  return (
    <section aria-labelledby="approval-heading" className="flex flex-col gap-4 rounded-2xl border-2 border-primary/40 p-5">
      <h2 id="approval-heading" className="text-lg font-semibold">
        {t(step === "ohs" ? "headingOhs" : "headingSection")}
      </h2>
      <Field id="approval-comment" label={t("comment")} hint={t("commentHint")}>
        <Textarea id="approval-comment" rows={3} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} aria-describedby="approval-comment-hint" />
      </Field>
      <FormError error={error} />
      <div className="flex flex-wrap gap-3">
        <Button type="button" size="lg" disabled={pending} onClick={() => run("approve")}>
          <Check aria-hidden="true" />
          {t("approve")}
        </Button>
        <Button type="button" size="lg" variant="destructive" disabled={pending} onClick={() => run("reject")}>
          <X aria-hidden="true" />
          {t("reject")}
        </Button>
      </div>
    </section>
  );
}
