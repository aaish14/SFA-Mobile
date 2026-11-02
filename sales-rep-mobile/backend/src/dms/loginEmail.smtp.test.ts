import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer, type TLSSocket } from "node:tls";
import { mkdtempSync, readFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import nodemailer from "nodemailer";
import express from "express";
import request from "supertest";
import { createGmailCodeSender, sendDmsLoginCode } from "./loginEmail.js";
import { createDmsRouter } from "./router.js";

// Real SMTP over a local TLS socket, with synthetic credentials and a temporary test CA.
// This never connects to Gmail or sends mail to real recipients.
describe("DMS Gmail sender over SMTP", () => {
  let folder: string, cert: Buffer, key: Buffer;
  const settings = { user: "sender@gmail.com", password: "abcdefghijklmnop" };
  const cleanup: Array<() => Promise<void>> = [];
  beforeAll(() => {
    folder = mkdtempSync(join(tmpdir(), "dms-smtp-test-"));
    const openssl = process.platform === "win32" ? "C:/Program Files/Git/usr/bin/openssl.exe" : "openssl";
    execFileSync(openssl, ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
      "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost",
      "-keyout", join(folder, "key.pem"), "-out", join(folder, "cert.pem")], { stdio: "ignore", windowsHide: true });
    cert = readFileSync(join(folder, "cert.pem")); key = readFileSync(join(folder, "key.pem"));
  });
  afterEach(async () => { while (cleanup.length) await cleanup.pop()!(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  afterAll(() => {
    if (!folder) return;
    // Remove only the two exact files created by this test; no recursive filesystem operation.
    unlinkSync(join(folder, "key.pem")); unlinkSync(join(folder, "cert.pem")); rmdirSync(folder);
  });
  async function fixture(mode: "accept" | "auth-failure" | "recipient-failure" = "accept") {
    const messages: string[] = [], sockets = new Set<TLSSocket>();
    const server = createServer({ cert, key }, socket => {
      sockets.add(socket); socket.on("close", () => sockets.delete(socket));
      socket.on("error", () => {}); socket.setEncoding("utf8");
      socket.write("220 localhost SMTP test\r\n");
      let buffer = "", inData = false, message: string[] = [];
      socket.on("data", chunk => {
        buffer += chunk;
        while (buffer.includes("\r\n")) {
          const end = buffer.indexOf("\r\n"), line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          if (inData) {
            if (line === ".") { messages.push(message.join("\r\n")); message = []; inData = false; socket.write("250 queued\r\n"); }
            else message.push(line);
          } else if (line.startsWith("EHLO")) socket.write("250-localhost\r\n250 AUTH PLAIN\r\n");
          else if (line.startsWith("AUTH")) socket.write(mode === "auth-failure" ? "535 Authentication rejected\r\n" : "235 Authenticated\r\n");
          else if (line.startsWith("RCPT")) socket.write(mode === "recipient-failure" ? "550 Recipient rejected\r\n" : "250 OK\r\n");
          else if (line === "DATA") { inData = true; socket.write("354 End with dot\r\n"); }
          else if (line === "QUIT") socket.end("221 Bye\r\n");
          else socket.write("250 OK\r\n");
        }
      });
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    cleanup.push(async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>(resolve => server.close(() => resolve()));
    });
    const address = server.address() as { port: number };
    const sender = createGmailCodeSender(settings, options => {
      expect(options.host).toBe("smtp.gmail.com"); expect(options.port).toBe(465);
      expect(options.secure).toBe(true); expect(options.tls?.rejectUnauthorized).toBe(true);
      // Only the test trusts its generated CA; production retains normal certificate validation.
      return nodemailer.createTransport({ ...options, host: "127.0.0.1", port: address.port,
        tls: { ca: cert, servername: "localhost", rejectUnauthorized: true } });
    });
    const api = express(); api.use(express.json());
    api.use("/api/dms", createDmsRouter({
      records: async () => [{ Id: "a0T000000000001AAA", Name: "Fixture distributor", Active__c: true }],
      command: async () => { throw new Error("Unused in email test"); }, sendCode: sender,
    }));
    return { api, messages };
  }
  it("sends the code through SMTP and verifies it once without another email", async () => {
    const audit = vi.spyOn(console, "info").mockImplementation(() => {});
    const { api, messages } = await fixture(), email = "test@example.invalid";
    const sent = await request(api).post("/api/dms/auth/request-code").send({ email });
    expect(sent.status).toBe(200); expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("Subject: Your DMS distributor sign-in code");
    const code = messages[0].match(/code is (\d{6})/)![1];
    expect(JSON.stringify(sent.body)).not.toContain(code);
    expect(messages[0]).toMatch(/Subject: Your DMS distributor sign-in code \[\d{4}-/);
    expect(audit).toHaveBeenCalledWith("DMS_LOGIN_EMAIL_ACCEPTED", expect.stringContaining('"provider":"gmail"'));
    const auditText = JSON.stringify(audit.mock.calls);
    expect(auditText).not.toContain(code); expect(auditText).not.toContain(email);
    expect(auditText).not.toContain(settings.password);
    const verify = () => request(api).post("/api/dms/auth/verify-code").send({ email, code });
    expect((await verify()).status).toBe(200); expect((await verify()).status).toBe(401);
    expect(messages).toHaveLength(1);
  });
  it.each(["auth-failure", "recipient-failure"] as const)("does not create a challenge for %s", async mode => {
    const { api, messages } = await fixture(mode), email = "test@example.invalid";
    const sent = await request(api).post("/api/dms/auth/request-code").send({ email });
    expect(sent.status).toBe(503); expect(sent.body.errorCode).toBe("EMAIL_FAILED");
    expect(messages).toHaveLength(0);
    expect((await request(api).post("/api/dms/auth/verify-code").send({ email, code: "123456" })).status).toBe(401);
  });
  it("never silently falls back to Salesforce when the selected Gmail settings are invalid", async () => {
    vi.stubEnv("DMS_MAIL_PROVIDER", "gmail"); vi.stubEnv("DMS_GMAIL_USER", settings.user);
    vi.stubEnv("DMS_GMAIL_APP_PASSWORD", "invalid"); const fallback = vi.fn();
    await expect(sendDmsLoginCode("test@example.invalid", "123456", fallback)).rejects.toThrow("not configured correctly");
    expect(fallback).not.toHaveBeenCalled();
  });
});
