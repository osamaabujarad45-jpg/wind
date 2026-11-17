import { isValidPhone, normalizeEmail, type Vehicle } from './model';

export type AuthField = 'name' | 'email' | 'phone' | 'password' | 'plate' | 'code' | 'consent';
export type AuthProblem = {
  field: AuthField;
  code: 'invalid_input' | 'invalid_email' | 'invalid_phone' | 'invalid_plate' | 'weak_password' | 'wrong_email_code' | 'consent_required';
};

export type AuthForm = {
  mode: 'in' | 'up';
  name: string;
  email: string;
  phone: string;
  password: string;
  consent: boolean;
  role: 'customer' | 'driver';
  vehicle: Vehicle;
  plate: string;
};

/** Return the first visible problem so the owning field can show it and receive keyboard focus. */
export function authProblem(form: AuthForm, external = false): AuthProblem | null {
  if (form.mode === 'in') {
    if (external) return null;
    if (!form.phone.trim()) return { field: 'phone', code: 'invalid_input' };
    if (!form.password) return { field: 'password', code: 'invalid_input' };
    return null;
  }
  if (!form.name.trim()) return { field: 'name', code: 'invalid_input' };
  if (!normalizeEmail(form.email)) return { field: 'email', code: 'invalid_email' };
  if (!isValidPhone(form.phone)) return { field: 'phone', code: 'invalid_phone' };
  if (form.role === 'driver' && form.vehicle !== 'bicycle' && form.plate.trim().length < 2) return { field: 'plate', code: 'invalid_plate' };
  if (!external && (form.password.length < 12 || form.password.length > 100)) return { field: 'password', code: 'weak_password' };
  if (!form.consent) return { field: 'consent', code: 'consent_required' };
  return null;
}
