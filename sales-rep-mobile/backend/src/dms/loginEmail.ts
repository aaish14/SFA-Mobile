import nodemailer from "nodemailer";
import { createHash } from "node:crypto";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import { DmsUpstreamError } from "./transport.js";

type GmailSettings = { user: string; password: string };
type MailClient = Pick<ReturnType<typeof nodemailer.createTransport>, "sendMail" | "close">;
type MailFactory = (options: SMTPTransport.Options) => MailClient;

/** Use Google's authenticated SMTP service; credentials never reach the portal or logs. */
export function createGmailCodeSender(
  settings: GmailSettings,
  factory: MailFactory = options => nodemailer.createTransport(options),
) {
  const user = settings.user.trim().toLowerCase();
  const password = settings.password.replace(/\s/g, "");
  if (!/^[a-z0-9._%+-]+@(?:gmail|googlemail)\.com$/.test(user) || !/^[a-z]{16}$/i.test(password))
    throw new DmsUpstreamError(503, "The Gmail sender is not configured correctly.");
  return async (email: string, code: string): Promise<void> => {
    const client = factory({
      host: "smtp.gmail.com", port: 465, secure: true,
      auth: { user, pass: password },
      tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
      logger: false, debug: false,
    });
    try {
      const requestedAt = new Date().toISOString();
      const result = await client.sendMail({
        from: { name: "DMS Distributor Portal", address: user },
        to: [{ address: email, name: "" }],
        // Give each request its own subject so a new code is not hidden in an older Gmail thread.
        subject: `Your DMS distributor sign-in code [${requestedAt}]`,
        text: `Your one-use DMS sign-in code is ${code}. It expires in 10 minutes. Requested at ${requestedAt}. Ignore this message if you did not request it.`,
        disableFileAccess: true, disableUrlAccess: true,
      });
      const accepted = (result.accepted || []).map((value: string | { address: string }) =>
        (typeof value === "string" ? value : value.address).toLowerCase());
      if (!accepted.includes(email.toLowerCase()) || result.rejected?.length)
        throw new Error("Recipient not accepted");
      // Acceptance is not inbox delivery. Keep an audit without logging a code, address or credentials.
      console.info("DMS_LOGIN_EMAIL_ACCEPTED", JSON.stringify({
        provider: "gmail", requestedAt,
        recipientHash: createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 12),
      }));
    } catch (error) {
      // SMTP errors can contain an address or message. Log only a known error category.
      const code = String((error as { code?: string })?.code || "EMAIL_REJECTED");
      const category = ["EAUTH", "ECONNECTION", "ETIMEDOUT", "ESOCKET", "EENVELOPE"].includes(code)
        ? code : "EMAIL_REJECTED";
      console.warn("DMS_LOGIN_EMAIL_REJECTED", JSON.stringify({ provider: "gmail", category }));
      throw new DmsUpstreamError(502, "The email service could not accept the sign-in email.");
    } finally {
      client.close();
    }
  };
}

/** Choose one sender per request. A Gmail failure must never silently send a second code elsewhere. */
export async function sendDmsLoginCode(
  email: string, code: string, salesforceSender: (email: string, code: string) => Promise<void>,
): Promise<void> {
  const provider = process.env.DMS_MAIL_PROVIDER || "salesforce";
  if (provider === "gmail") {
    return createGmailCodeSender({
      user: process.env.DMS_GMAIL_USER || "",
      password: process.env.DMS_GMAIL_APP_PASSWORD || "",
    })(email, code);
  }
  if (provider !== "salesforce")
    throw new DmsUpstreamError(503, "The sign-in email provider is not configured correctly.");
  return salesforceSender(email, code);
}
