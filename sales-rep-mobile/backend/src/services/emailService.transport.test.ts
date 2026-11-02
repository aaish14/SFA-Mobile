import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Socket } from "node:net";
import { env } from "../config/env.js";
import { salesforce } from "../salesforce/SalesforceService.js";
import { sendEmployeeLoginCode } from "./emailService.js";

// Real local SMTP traffic using synthetic credentials, with no external emails.
describe("SFA login email transport", () => {
  const original = { ...env };
  const cleanup: Array<() => Promise<void>> = [];
  afterEach(async () => {
    Object.assign(env, original);
    salesforce.clearCachedSession();
    while (cleanup.length) await cleanup.pop()!();
  });

  async function smtpFixture(rejectRecipient = false) {
    const messages: string[] = [], sockets = new Set<Socket>();
    const server = createServer(socket => {
      sockets.add(socket); socket.on("close", () => sockets.delete(socket));
      socket.on("error", () => {}); socket.setEncoding("utf8");
      socket.write("220 localhost SMTP fixture\r\n");
      let buffer = "", inData = false, message: string[] = [];
      socket.on("data", chunk => {
        buffer += chunk;
        while (buffer.includes("\r\n")) {
          const end = buffer.indexOf("\r\n"), line = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (inData) {
            if (line === ".") {
              messages.push(message.join("\r\n")); message = []; inData = false;
              socket.write("250 queued\r\n");
            } else message.push(line);
          } else if (line.startsWith("EHLO")) socket.write("250-localhost\r\n250 AUTH PLAIN\r\n");
          else if (line.startsWith("AUTH")) socket.write("235 Authenticated\r\n");
          else if (line.startsWith("RCPT")) socket.write(rejectRecipient ? "550 Rejected\r\n" : "250 OK\r\n");
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
    Object.assign(env, {
      SMTP_HOST: "127.0.0.1", SMTP_PORT: (server.address() as { port: number }).port,
      SMTP_SECURE: false, SMTP_USER: "fixture", SMTP_PASSWORD: "synthetic-only",
      EMAIL_FROM: "sender@example.invalid", USE_MOCK_DATA: true,
    });
    return messages;
  }

  it("delivers one correctly addressed login email through SMTP", async () => {
    const messages = await smtpFixture();
    await sendEmployeeLoginCode("test@example.invalid", "Fixture employee", "123456");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("To: test@example.invalid");
    expect(messages[0]).toContain("Subject: Your SFA Mobile sign-in code [");
    expect(messages[0]).toContain("123456");
    expect(messages[0]).not.toContain("synthetic-only");
  });

  it("does not report delivery when SMTP rejects the recipient", async () => {
    const messages = await smtpFixture(true);
    await expect(sendEmployeeLoginCode("test@example.invalid", "Fixture", "123456")).rejects.toThrow();
    expect(messages).toHaveLength(0);
  });

  it.skipIf(!process.env.DMS_SIMULATION_URL)("uses the org's described recipient field over real HTTP", async () => {
    Object.assign(env, { SMTP_HOST: undefined, SMTP_USER: undefined, SMTP_PASSWORD: undefined,
      EMAIL_FROM: undefined, USE_MOCK_DATA: false });
    // Inject only a synthetic session. The real Salesforce HTTP client still runs.
    (salesforce as any).token = { accessToken: "synthetic-session",
      instanceUrl: process.env.DMS_SIMULATION_URL, expiresAt: Date.now() + 600000 };
    await sendEmployeeLoginCode("test@example.invalid", "Fixture", "123456");
    const mailbox = await (await fetch(`${process.env.DMS_SIMULATION_URL}/test/mailbox`)).json();
    expect(mailbox.at(-1)).toMatchObject({ email: "test@example.invalid", code: "123456", via: "emailSimple" });
    await expect(sendEmployeeLoginCode("unconfirmed@example.invalid", "Fixture", "123456"))
      .rejects.toThrow("Salesforce did not accept");
  });
});
