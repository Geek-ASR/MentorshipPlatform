import { z } from "zod";
import { defineJob } from "@/server/platform/outbox/outbox";
import { getEmailSender } from "../infra/email/registry";

const emailPayloadSchema = z.object({
  to: z.email(),
  subject: z.string().min(1).max(200),
  text: z.string().min(1).max(20_000),
});

/** Delivers auth emails (verification, reset, notices) via the transactional outbox. */
export const sendAuthEmail = defineJob({
  type: "auth.send_email",
  schema: emailPayloadSchema,
  maxAttempts: 6,
  async handle(payload) {
    await getEmailSender().send(payload);
  },
});

export const authJobs = [sendAuthEmail];
