import { z } from "zod";

export const signInSchema = z.object({
  // Sicil no ya da (yönetici rollerinde) e-posta, karar #189
  sicilNo: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(128),
  sharedDevice: z.boolean(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(1).max(256),
  confirmPassword: z.string().min(1).max(256),
});

export type SignInError = "invalid_input" | "invalid_credentials" | "locked" | "inactive" | "rate_limited";

export type SignInState = {
  error?: SignInError;
  lockedUntil?: string;
  sicilNo?: string;
};

export type PasswordIssueCode =
  | "too_short"
  | "too_long"
  | "common"
  | "contains_sicil"
  | "repeated"
  | "sequential"
  | "same_as_current"
  | "mismatch"
  | "current_password_invalid";

export type ChangePasswordState = {
  issues?: PasswordIssueCode[];
  unexpected?: boolean;
};
