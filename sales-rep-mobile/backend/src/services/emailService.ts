import nodemailer from "nodemailer";
import { env } from "../config/env.js";

export function emailDeliveryIsConfigured() {
  return Boolean(
    env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD && env.EMAIL_FROM,
  );
}

export async function sendDistributorLoginCode(
  recipient: string,
  distributorName: string,
  code: string,
) {
  if (!emailDeliveryIsConfigured()) {
    throw new Error("Email delivery has not been configured on the server");
  }

  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  });

  await transport.sendMail({
    from: env.EMAIL_FROM,
    to: recipient,
    subject: "Your SFA Mobile sign-in code",
    text: `Hello ${distributorName},\n\nYour SFA Mobile sign-in code is ${code}. It expires in ${env.AUTH_CODE_TTL_MINUTES} minutes.\n\nIf you did not request this code, you can ignore this email.`,
    html: `<p>Hello ${distributorName},</p><p>Your SFA Mobile sign-in code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>This code expires in ${env.AUTH_CODE_TTL_MINUTES} minutes. If you did not request it, you can ignore this email.</p>`,
  });
}
