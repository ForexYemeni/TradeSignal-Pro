/**
 * Input Validation Utilities
 * Validates and sanitizes common input patterns
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitized: string;
}

/**
 * Validate and sanitize a text field
 * - Max length check
 * - Remove null bytes and control characters
 */
export function validateText(value: unknown, fieldName: string, maxLength: number = 10000): ValidationResult {
  if (typeof value !== "string") return { valid: false, error: `${fieldName} يجب أن يكون نص`, sanitized: "" };
  // Remove null bytes and dangerous control characters
  const sanitized = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
  if (sanitized.length === 0) return { valid: false, error: `${fieldName} مطلوب`, sanitized: "" };
  if (sanitized.length > maxLength) return { valid: false, error: `${fieldName} طويل جداً (الحد الأقصى ${maxLength} حرف)`, sanitized: "" };
  return { valid: true, sanitized };
}

/**
 * Validate email format
 */
export function validateEmail(value: unknown): ValidationResult {
  if (typeof value !== "string") return { valid: false, error: "البريد الإلكتروني غير صالح", sanitized: "" };
  const sanitized = value.trim().toLowerCase();
  // RFC 5322 simplified regex
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!emailRegex.test(sanitized)) return { valid: false, error: "صيغة البريد الإلكتروني غير صحيحة", sanitized: "" };
  if (sanitized.length > 254) return { valid: false, error: "البريد الإلكتروني طويل جداً", sanitized: "" };
  return { valid: true, sanitized };
}

/**
 * Validate a numeric field within bounds
 */
export function validateNumber(value: unknown, fieldName: string, min?: number, max?: number): { valid: boolean; error?: string; value: number } {
  const num = Number(value);
  if (typeof value === "string" && value.trim() === "") return { valid: false, error: `${fieldName} مطلوب`, value: 0 };
  if (!isFinite(num)) return { valid: false, error: `${fieldName} يجب أن يكون رقم`, value: 0 };
  if (min !== undefined && num < min) return { valid: false, error: `${fieldName} يجب أن يكون على الأقل ${min}`, value: 0 };
  if (max !== undefined && num > max) return { valid: false, error: `${fieldName} يجب أن لا يتجاوز ${max}`, value: 0 };
  return { valid: true, value: num };
}

/**
 * Validate a UUID string
 */
export function validateUUID(value: unknown): ValidationResult {
  if (typeof value !== "string") return { valid: false, error: "معرف غير صالح", sanitized: "" };
  const sanitized = value.trim();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(sanitized)) return { valid: false, error: "معرف غير صالح", sanitized: "" };
  return { valid: true, sanitized };
}

/**
 * Validate password — at least 6 chars
 */
export function validatePassword(value: unknown): ValidationResult {
  if (typeof value !== "string") return { valid: false, error: "كلمة المرور مطلوبة", sanitized: "" };
  if (value.length < 6) return { valid: false, error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل", sanitized: "" };
  if (value.length > 128) return { valid: false, error: "كلمة المرور طويلة جداً", sanitized: "" };
  return { valid: true, sanitized: value };
}

/**
 * Validate a valid action string (allowlist pattern)
 */
export function validateAction(value: unknown, allowed: string[]): ValidationResult {
  if (typeof value !== "string") return { valid: false, error: "إجراء غير معروف", sanitized: "" };
  const sanitized = value.trim().toLowerCase();
  if (!allowed.includes(sanitized)) return { valid: false, error: "إجراء غير معروف", sanitized: "" };
  return { valid: true, sanitized };
}
