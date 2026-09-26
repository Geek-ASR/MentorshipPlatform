"use client";

import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { brand } from "@/config/brand";
import { Alert } from "@/ui/alert";
import { api, ApiError, errorMessage } from "@/ui/api";
import { Button } from "@/ui/button";
import { Checkbox, Field, Input } from "@/ui/input";
import { PasswordInput } from "@/ui/password-input";
import { AuthHeader, AuthSwitch } from "../auth-ui";

type Errors = Partial<
  Record<"displayName" | "email" | "password" | "birthYear" | "consent", string>
>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Google sign-up skips the credential fields: Google supplies the name and verified email. */
function validate(
  values: { displayName: string; email: string; password: string; birthYear: string },
  consent: boolean,
  minPasswordLength: number,
  { credentials = true }: { credentials?: boolean } = {},
): Errors {
  const errors: Errors = {};
  if (credentials) {
    if (!values.displayName.trim()) errors.displayName = "Enter your name.";
    if (!EMAIL_PATTERN.test(values.email.trim())) errors.email = "Enter a valid email address.";
    if (values.password.length < minPasswordLength)
      errors.password = `Use at least ${minPasswordLength} characters.`;
  }
  if (!/^\d{4}$/.test(values.birthYear.trim())) errors.birthYear = "Enter a four-digit year.";
  if (!consent) errors.consent = "Please agree to the Terms and Privacy Policy to continue.";
  return errors;
}

export function SignUpForm({
  termsVersion,
  privacyVersion,
  minPasswordLength,
  googleEnabled,
}: {
  termsVersion: string;
  privacyVersion: string;
  minPasswordLength: number;
  googleEnabled: boolean;
}) {
  const params = useSearchParams();
  const asMentor = params.get("intent") === "mentor";
  const googleFirst = googleEnabled && params.get("method") === "google";

  const [values, setValues] = useState({ displayName: "", email: "", password: "", birthYear: "" });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const set = (key: keyof typeof values) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const found = validate(values, consent, minPasswordLength);
    setErrors(found);
    setFormError(null);
    const firstInvalid = Object.keys(found)[0];
    if (firstInvalid) {
      document.getElementById(firstInvalid)?.focus();
      return;
    }
    setSubmitting(true);
    try {
      await api("/api/v1/auth/sign-up", {
        method: "POST",
        body: {
          displayName: values.displayName.trim(),
          email: values.email.trim(),
          password: values.password,
          birthYear: Number(values.birthYear),
          termsVersion,
          privacyVersion,
        },
      });
      setSentTo(values.email.trim());
    } catch (err) {
      if (err instanceof ApiError && err.errors.length > 0) {
        setErrors(err.fieldErrors() as Errors);
        setFormError("Some details need another look.");
      } else {
        setFormError(errorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  function continueWithGoogle() {
    const found = validate(values, consent, minPasswordLength, { credentials: false });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const query = new URLSearchParams({
      birthYear: values.birthYear.trim(),
      termsVersion,
      privacyVersion,
    });
    // A full-page navigation on purpose: the start route answers with a redirect to Google, which
    // client-side routing can't follow.
    window.location.assign(
      new URL(`/api/v1/auth/google/start?${query.toString()}`, window.location.origin),
    );
  }

  if (sentTo) {
    return (
      <div>
        <AuthHeader
          icon={<MailCheck aria-hidden="true" />}
          title="Check your inbox"
          description={
            <>
              We sent a confirmation link to <strong className="text-ink">{sentTo}</strong>. Open it
              to verify your email and finish setting up your account.
            </>
          }
        />
        <Alert tone="info" title="Didn't get it?">
          It can take a minute. Check your spam folder too. The link works for 24 hours; if it
          expires, sign in and we&apos;ll offer to send a new one.
        </Alert>
        <Button asChild size="lg" variant="secondary" className="mt-8 w-full">
          <Link href="/sign-in">Go to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <AuthHeader
        title={asMentor ? "Mentor with us" : "Create your account"}
        description={
          asMentor
            ? "Start with a free account. Next, you'll tell us about your studies and work — we review every mentor before they're listed."
            : "Free to join. Book mentors, join free events and save the people you'd like to learn from."
        }
      />
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {formError ? (
          <Alert tone="danger" live>
            {formError}
          </Alert>
        ) : null}
        {googleFirst ? null : (
          <>
            <Field label="Full name" htmlFor="displayName" error={errors.displayName}>
              <Input
                id="displayName"
                name="name"
                autoComplete="name"
                required
                value={values.displayName}
                onChange={set("displayName")}
              />
            </Field>
            <Field label="Email" htmlFor="email" error={errors.email}>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={values.email}
                onChange={set("email")}
              />
            </Field>
            <Field
              label="Password"
              htmlFor="password"
              error={errors.password}
              hint={`At least ${minPasswordLength} characters. A short phrase is easy to remember and hard to guess.`}
            >
              <PasswordInput
                id="password"
                name="new-password"
                autoComplete="new-password"
                required
                value={values.password}
                onChange={set("password")}
              />
            </Field>
          </>
        )}
        <Field
          label="Year of birth"
          htmlFor="birthYear"
          error={errors.birthYear}
          hint="Used only to confirm you're old enough to use the service."
        >
          <Input
            id="birthYear"
            name="bday-year"
            inputMode="numeric"
            autoComplete="bday-year"
            maxLength={4}
            required
            value={values.birthYear}
            onChange={set("birthYear")}
            className="max-w-40 tabular"
          />
        </Field>
        <div>
          <label htmlFor="consent" className="flex items-start gap-3 text-sm text-ink">
            <Checkbox
              id="consent"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              aria-invalid={errors.consent ? true : undefined}
              aria-describedby={errors.consent ? "consent-error" : undefined}
            />
            <span>
              I agree to the{" "}
              <Link
                href="/legal/terms"
                target="_blank"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                Terms of Service
              </Link>{" "}
              and have read the{" "}
              <Link
                href="/legal/privacy"
                target="_blank"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          {errors.consent ? (
            <p id="consent-error" className="mt-1.5 pl-7 text-sm text-danger">
              {errors.consent}
            </p>
          ) : null}
        </div>
        {googleFirst ? (
          <Button type="button" size="lg" className="w-full" onClick={continueWithGoogle}>
            Continue with Google
          </Button>
        ) : (
          <Button type="submit" size="lg" className="w-full" loading={submitting}>
            Create account
          </Button>
        )}
        {googleEnabled && !googleFirst ? (
          <>
            <div className="flex items-center gap-3 text-xs text-ink-muted">
              <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
            </div>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="w-full"
              onClick={continueWithGoogle}
            >
              Continue with Google
            </Button>
          </>
        ) : null}
        {googleFirst ? (
          <p className="text-center text-xs text-ink-muted">
            Already have an account with Google? You&apos;ll be signed straight in.
          </p>
        ) : null}
      </form>
      <AuthSwitch prompt={`Already on ${brand.name}?`} href="/sign-in" label="Sign in" />
    </>
  );
}
