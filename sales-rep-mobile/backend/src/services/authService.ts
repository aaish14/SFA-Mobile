import { timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

export type DistributorLogin = {
  username: string;
  password: string;
  accountName: string;
  displayName: string;
};

const mockUsers: DistributorLogin[] = [
  {
    username: "edge@sfa.demo",
    password: "demo123",
    accountName: "Edge Communications",
    displayName: "Edge Distributor",
  },
  {
    username: "express@sfa.demo",
    password: "demo123",
    accountName: "Express Logistics and Transport",
    displayName: "Express Distributor",
  },
];

function configuredUsers(): DistributorLogin[] {
  if (!env.DISTRIBUTOR_USERS_JSON) return env.USE_MOCK_DATA ? mockUsers : [];
  try {
    const value = JSON.parse(env.DISTRIBUTOR_USERS_JSON);
    return Array.isArray(value) ? value : [];
  } catch {
    throw new Error("DISTRIBUTOR_USERS_JSON must contain a valid JSON array");
  }
}

function equalSecret(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function authenticateDistributor(username: string, password: string) {
  const user = configuredUsers().find(
    (candidate) => candidate.username.toLowerCase() === username.toLowerCase(),
  );
  return user && equalSecret(user.password, password) ? user : undefined;
}
