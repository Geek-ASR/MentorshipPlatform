import type { Logger } from "pino";
import type { EmailMessage, EmailSender } from "../../application/ports";

/**
 * Dev/test adapter (docs/00 §16, docs/19 Phase 5): logs instead of sending. Swap for a Resend
 * adapter once a domain exists — same `EmailSender` port, no caller changes.
 */
export function createConsoleEmailSender(logger: Logger): EmailSender {
  return {
    async send(message: EmailMessage): Promise<void> {
      logger.info(
        { event: "email.sent", to: message.to, subject: message.subject },
        "email (console adapter)",
      );
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console -- deliberate dev-only visibility for the email body
        console.log(
          `\n----- email to ${message.to} -----\n${message.subject}\n\n${message.text}\n`,
        );
      }
    },
  };
}
