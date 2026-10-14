// Test-mode helpers shared by the email dialogs (Email epic). In test mode
// every email goes only to a tester address typed when sending; remembering
// the last one saves retyping it. localStorage may be unavailable (private
// mode etc.), so every access is guarded.

const TESTER_KEY = 'big.emailTester';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string | null | undefined): boolean {
  return EMAIL_RE.test(String(value || '').trim());
}

export function recallTester(): string {
  try {
    return localStorage.getItem(TESTER_KEY) || '';
  } catch {
    return '';
  }
}

export function rememberTester(value: string) {
  try {
    localStorage.setItem(TESTER_KEY, value.trim());
  } catch {
    // not available — nothing to remember
  }
}
