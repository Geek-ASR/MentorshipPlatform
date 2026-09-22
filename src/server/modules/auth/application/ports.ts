/** Outbound ports the auth module depends on (ports & adapters, docs/04 §4). */

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type EmailSender = {
  send(message: EmailMessage): Promise<void>;
};

/** Returns true when the password appears in a known breach corpus. Must fail open (return false). */
export type BreachedPasswordChecker = (password: string) => Promise<boolean>;

export const alwaysCleanPasswordChecker: BreachedPasswordChecker = async () => false;
