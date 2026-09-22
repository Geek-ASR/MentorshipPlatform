import type { FieldError } from "@/server/platform/errors";

export type PasswordPolicyContext = {
  minLength: number;
  maxLength: number;
  /** Brand name, email local part, display name — checked case-insensitively (docs/07 §4). */
  contextBlocklist: string[];
};

/** Pure password policy check. Breach checking (HIBP) is a separate, network-dependent step. */
export function checkPasswordPolicy(
  password: string,
  context: PasswordPolicyContext,
): FieldError[] {
  const errors: FieldError[] = [];
  if (password.length < context.minLength) {
    errors.push({
      path: "password",
      code: "too_small",
      message: `Password must be at least ${context.minLength} characters.`,
    });
  }
  if (password.length > context.maxLength) {
    errors.push({
      path: "password",
      code: "too_big",
      message: `Password must be at most ${context.maxLength} characters.`,
    });
  }
  const lowerPassword = password.toLowerCase();
  for (const term of context.contextBlocklist) {
    const normalized = term.trim().toLowerCase();
    if (normalized.length >= 3 && lowerPassword.includes(normalized)) {
      errors.push({
        path: "password",
        code: "context_match",
        message: "Password must not contain your name or email.",
      });
      break;
    }
  }
  return errors;
}
