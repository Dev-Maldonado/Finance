"use client";
import { CheckCircle2, AlertCircle } from "lucide-react";

export type WealthFeedback = { kind: "success" | "error"; message: string; detail?: string };

export function WealthRegistrationFeedback({ feedback }: { feedback: WealthFeedback | null }) {
  if (!feedback) return null;
  const Icon = feedback.kind === "success" ? CheckCircle2 : AlertCircle;
  return <div className={`wealth-registration-feedback ${feedback.kind}`} role={feedback.kind === "success" ? "status" : "alert"}>
    <Icon size={19} aria-hidden="true" />
    <div><strong>{feedback.message}</strong>{feedback.detail && <p>{feedback.detail}</p>}</div>
  </div>;
}
