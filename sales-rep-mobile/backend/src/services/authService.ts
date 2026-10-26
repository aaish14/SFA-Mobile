import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

export type EmployeeIdentity = {
  id: string;
  email: string;
  displayName: string;
  employeeName: string;
  salesforceUserId?: string;
  beatId?: string;
  beatName?: string;
};

export const mockEmployees: EmployeeIdentity[] = [
  {
    id: "mock-edge-employee",
    email: "edge@sfa.demo",
    displayName: "Demo Employee",
    employeeName: "Demo Employee",
    salesforceUserId: "mock-user-edge",
    beatId: "beat-1",
    beatName: "Lakeside Market Beat",
  },
  {
    id: "mock-express-employee",
    email: "express@sfa.demo",
    displayName: "Second Employee",
    employeeName: "Second Employee",
    salesforceUserId: "mock-user-express",
    beatId: "beat-1",
    beatName: "Lakeside Market Beat",
  },
];

/**
 * Trim and lowercase an email before lookup or code derivation.
 */
function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * Calculate the current sign-in-code time bucket using the configured expiry interval.
 */
function timeWindow(now = Date.now()) {
  return Math.floor(now / (env.AUTH_CODE_TTL_MINUTES * 60_000));
}

/**
 * Derive a six-digit employee code from the normalized email, time bucket and server secret.
 * Codes in the same bucket are intentionally repeatable.
 */
function codeForWindow(email: string, window: number) {
  const digest = createHmac("sha256", env.JWT_SECRET)
    .update(`${normalizeEmail(email)}:${window}`)
    .digest();
  return String((digest.readUInt32BE(0) % 900000) + 100000);
}

/**
 * Find a normalized email in the local mock-employee fixture; this does not query Salesforce.
 */
export function findMockEmployee(email: string) {
  const normalized = normalizeEmail(email);
  return mockEmployees.find((item) => item.email === normalized);
}

/**
 * Generate the employee code for the current time window; delivery is handled separately.
 */
export function createLoginCode(email: string) {
  return codeForWindow(email, timeWindow());
}

/**
 * Require six digits and compare the supplied code against the current and previous windows
 * using timing-safe equality.
 */
export function verifyLoginCode(email: string, code: string) {
  if (!/^\d{6}$/.test(code)) return false;
  const supplied = Buffer.from(code);
  const window = timeWindow();
  return [window, window - 1].some((candidateWindow) => {
    const expected = Buffer.from(codeForWindow(email, candidateWindow));
    return timingSafeEqual(supplied, expected);
  });
}
