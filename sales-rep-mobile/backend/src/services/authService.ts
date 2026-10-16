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

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function timeWindow(now = Date.now()) {
  return Math.floor(now / (env.AUTH_CODE_TTL_MINUTES * 60_000));
}

function codeForWindow(email: string, window: number) {
  const digest = createHmac("sha256", env.JWT_SECRET)
    .update(`${normalizeEmail(email)}:${window}`)
    .digest();
  return String((digest.readUInt32BE(0) % 900000) + 100000);
}

export function findMockEmployee(email: string) {
  const normalized = normalizeEmail(email);
  return mockEmployees.find((item) => item.email === normalized);
}

export function createLoginCode(email: string) {
  return codeForWindow(email, timeWindow());
}

export function verifyLoginCode(email: string, code: string) {
  if (!/^\d{6}$/.test(code)) return false;
  const supplied = Buffer.from(code);
  const window = timeWindow();
  return [window, window - 1].some((candidateWindow) => {
    const expected = Buffer.from(codeForWindow(email, candidateWindow));
    return timingSafeEqual(supplied, expected);
  });
}
