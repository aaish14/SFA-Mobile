import { randomInt, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

export type DistributorIdentity = {
  id: string;
  email: string;
  displayName: string;
  distributorName: string;
  beatId?: string;
  beatName?: string;
};

export const mockDistributors: DistributorIdentity[] = [
  {
    id: "mock-edge-distributor",
    email: "edge@sfa.demo",
    displayName: "Edge Distributor",
    distributorName: "Edge Communications",
    beatId: "beat-1",
    beatName: "Lakeside Market Beat",
  },
  {
    id: "mock-express-distributor",
    email: "express@sfa.demo",
    displayName: "Express Distributor",
    distributorName: "Express Logistics and Transport",
    beatId: "beat-1",
    beatName: "Lakeside Market Beat",
  },
];

type LoginChallenge = {
  salt: Buffer;
  hash: Buffer;
  expiresAt: number;
  attempts: number;
};

const challenges = new Map<string, LoginChallenge>();

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashCode(code: string, salt: Buffer) {
  return scryptSync(code, salt, 32);
}

export function findMockDistributor(email: string) {
  const normalized = normalizeEmail(email);
  return mockDistributors.find((item) => item.email === normalized);
}

export function createLoginCode(email: string) {
  const code = String(randomInt(100000, 1000000));
  const salt = randomBytes(16);
  challenges.set(normalizeEmail(email), {
    salt,
    hash: hashCode(code, salt),
    expiresAt: Date.now() + env.AUTH_CODE_TTL_MINUTES * 60_000,
    attempts: 0,
  });
  return code;
}

export function verifyLoginCode(email: string, code: string) {
  const key = normalizeEmail(email);
  const challenge = challenges.get(key);
  if (!challenge || challenge.expiresAt < Date.now()) {
    challenges.delete(key);
    return false;
  }
  challenge.attempts += 1;
  if (challenge.attempts > env.AUTH_CODE_MAX_ATTEMPTS) {
    challenges.delete(key);
    return false;
  }
  const supplied = hashCode(code, challenge.salt);
  const valid = timingSafeEqual(supplied, challenge.hash);
  if (valid) challenges.delete(key);
  return valid;
}
