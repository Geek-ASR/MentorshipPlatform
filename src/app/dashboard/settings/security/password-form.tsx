"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError, errorMessage } from "@/ui/api";
import { Button } from "@/ui/button";
import { Field } from "@/ui/input";
import { PasswordInput } from "@/ui/password-input";
import { isReauthCancelled, useReauth } from "@/ui/reauth";
import { useToast } from "@/ui/toast";

type Errors = { currentPassword?: string; newPassword?: string; confirm?: string };

export function PasswordForm({ email, minLength }: { email: string; minLength: number }) {
  const toast = useToast();
  const { withReauth, reauthDialog } = useReauth(email);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const found: Errors = {};
    if (!current) found.currentPassword = "Enter your current password.";
    if (next.length < minLength) found.newPassword = `Use at least ${minLength} characters.`;
    if (confirm !== next) found.confirm = "The two passwords don't match.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      await withReauth(() =>
        api("/api/v1/auth/password/change", {
          method: "POST",
          body: { currentPassword: current, newPassword: next },
        }),
      );
      setCurrent("");
      setNext("");
      setConfirm("");
      toast({
        title: "Password changed",
        description: "You're still signed in here; every other device was signed out.",
      });
    } catch (err) {
      if (isReauthCancelled(err)) return;
      if (err instanceof ApiError && err.code === "INVALID_CREDENTIALS") {
        setErrors({ currentPassword: "That isn't your current password." });
      } else if (err instanceof ApiError && err.errors.length > 0) {
        setErrors(err.fieldErrors() as Errors);
      } else {
        toast({
          title: "Couldn't change your password",
          description: errorMessage(err),
          tone: "error",
        });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {/* Lets password managers pair the new password with the right account. */}
        <input type="email" autoComplete="username" value={email} readOnly hidden />
        <Field label="Current password" htmlFor="current-password" error={errors.currentPassword}>
          <PasswordInput
            id="current-password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="New password"
            htmlFor="new-password"
            error={errors.newPassword}
            hint={`At least ${minLength} characters.`}
          >
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm-password" error={errors.confirm}>
            <PasswordInput
              id="confirm-password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit" loading={saving}>
            Change password
          </Button>
        </div>
      </form>
      {/* Outside the form: the dialog carries its own form, and forms can't nest. */}
      {reauthDialog}
    </>
  );
}
