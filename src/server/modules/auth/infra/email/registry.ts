import { getLogger } from "@/server/platform/logger";
import type { EmailSender } from "../../application/ports";
import { createConsoleEmailSender } from "./console-email-sender";

const globalForEmail = globalThis as typeof globalThis & { __aheadlyEmailSender?: EmailSender };

/**
 * Console adapter only (docs/19 Phase 5): no domain exists yet to send real mail from, so a Resend
 * adapter has nothing to authenticate as. Swapping it in later is a one-line change here.
 */
export function getEmailSender(): EmailSender {
  globalForEmail.__aheadlyEmailSender ??= createConsoleEmailSender(getLogger());
  return globalForEmail.__aheadlyEmailSender;
}
