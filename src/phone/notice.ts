// One-shot message for the sign-in screen. A verified number change ends the session, so the message has to outlive the profile.
// Memory only: it is never stored, and it is read once.
let pending: string | null = null;

export function setAuthNotice(text: string) { pending = text; }

export function takeAuthNotice(): string | null {
  const text = pending;
  pending = null;
  return text;
}
