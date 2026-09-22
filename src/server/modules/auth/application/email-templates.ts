import { brand } from "@/config/brand";
import type { EmailMessage } from "./ports";

function link(appBaseUrl: string, path: string, token: string): string {
  return `${appBaseUrl}${path}?token=${encodeURIComponent(token)}`;
}

export function verifyEmailMessage(to: string, appBaseUrl: string, token: string): EmailMessage {
  return {
    to,
    subject: `Verify your email for ${brand.name}`,
    text: `Welcome to ${brand.name}. Confirm your email address to finish creating your account:\n\n${link(appBaseUrl, "/verify-email", token)}\n\nThis link expires in 24 hours. If you didn't request this, you can ignore it.`,
  };
}

export function attemptedSignUpMessage(to: string, appBaseUrl: string): EmailMessage {
  return {
    to,
    subject: `Someone tried to create a ${brand.name} account with your email`,
    text: `A sign-up attempt used this email address, which already has a ${brand.name} account. If this was you, sign in instead:\n\n${appBaseUrl}/sign-in\n\nIf it wasn't you, no action is needed — your account is unaffected.`,
  };
}

export function passwordResetMessage(to: string, appBaseUrl: string, token: string): EmailMessage {
  return {
    to,
    subject: `Reset your ${brand.name} password`,
    text: `We received a request to reset your password:\n\n${link(appBaseUrl, "/reset-password", token)}\n\nThis link expires in 30 minutes and can be used once. If you didn't request this, you can ignore it — your password won't change.`,
  };
}

export function passwordResetCompletedMessage(to: string): EmailMessage {
  return {
    to,
    subject: `Your ${brand.name} password was reset`,
    text: `Your password was just reset and all devices were signed out. If this wasn't you, contact ${brand.securityEmail} immediately.`,
  };
}

export function emailChangeConfirmMessage(
  to: string,
  appBaseUrl: string,
  token: string,
): EmailMessage {
  return {
    to,
    subject: `Confirm your new email for ${brand.name}`,
    text: `Confirm this address is yours to finish changing your ${brand.name} account email:\n\n${link(appBaseUrl, "/confirm-email-change", token)}\n\nThis link expires in 24 hours.`,
  };
}

export function emailChangeRevertMessage(
  to: string,
  appBaseUrl: string,
  token: string,
): EmailMessage {
  return {
    to,
    subject: `Your ${brand.name} email address changed`,
    text: `Your account email was just changed. If this wasn't you, undo it and sign out every device:\n\n${link(appBaseUrl, "/undo-email-change", token)}\n\nThis link works for 7 days.`,
  };
}

export function mfaEnabledMessage(to: string): EmailMessage {
  return {
    to,
    subject: `Two-factor authentication turned on`,
    text: `Two-factor authentication was just turned on for your ${brand.name} account. If this wasn't you, contact ${brand.securityEmail} immediately.`,
  };
}

export function googleTookOwnershipMessage(to: string): EmailMessage {
  return {
    to,
    subject: `Your ${brand.name} account is now linked to Google`,
    text: `Your account had an unverified password sign-in method, which was replaced after someone verified this email address by signing in with Google. If this wasn't you, contact ${brand.securityEmail} immediately.`,
  };
}

export function mfaDisabledMessage(to: string): EmailMessage {
  return {
    to,
    subject: `Two-factor authentication turned off`,
    text: `Two-factor authentication was just turned off for your ${brand.name} account. If this wasn't you, contact ${brand.securityEmail} immediately.`,
  };
}
