import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { salesforce } from "../salesforce/SalesforceService.js";

export function emailDeliveryIsConfigured() {
  const smtpIsConfigured = Boolean(
    env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD && env.EMAIL_FROM,
  );
  return smtpIsConfigured || !env.USE_MOCK_DATA;
}

async function sendEmail(
  recipient: string,
  subject: string,
  text: string,
  html: string,
) {
  const smtpIsConfigured = Boolean(
    env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD && env.EMAIL_FROM,
  );

  if (smtpIsConfigured) {
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    });

    await transport.sendMail({
      from: env.EMAIL_FROM,
      to: recipient,
      subject,
      text,
      html,
    });
    return;
  }

  if (env.USE_MOCK_DATA) {
    throw new Error("Email delivery has not been configured on the server");
  }

  await salesforce.invokeStandardAction("emailSimple", [
    {
      recipientAddresses: [recipient],
      emailSubject: subject,
      emailBody: html,
      sendRichBody: true,
      senderType: "CurrentUser",
    },
  ]);
}

export async function sendDistributorLoginCode(
  recipient: string,
  distributorName: string,
  code: string,
) {
  await sendEmail(
    recipient,
    "Your SFA Mobile sign-in code",
    `Hello ${distributorName},\n\nYour SFA Mobile sign-in code is ${code}. It expires in ${env.AUTH_CODE_TTL_MINUTES} minutes.\n\nIf you did not request this code, you can ignore this email.`,
    `<p>Hello ${distributorName},</p><p>Your SFA Mobile sign-in code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>This code expires in ${env.AUTH_CODE_TTL_MINUTES} minutes. If you did not request it, you can ignore this email.</p>`,
  );
}

export async function sendDistributorInvitation(
  recipient: string,
  distributorName: string,
) {
  const link = env.APP_PUBLIC_URL;
  await sendEmail(
    recipient,
    "Your SFA Mobile application link",
    `Hello ${distributorName},\n\nOpen the SFA Mobile application: ${link}\n\nEnter this email address to receive your secure sign-in code.`,
    `<p>Hello ${distributorName},</p><p>Your SFA Mobile application is ready.</p><p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#1677c8;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Open SFA Mobile</a></p><p>Enter <strong>${recipient}</strong> on the login page to receive your secure sign-in code.</p>`,
  );
}

export async function sendRetailerOrderSummary(
  recipient: string,
  outletName: string,
  items: Array<{ productName: string; quantity: number; amount: number }>,
  totalAmount: number,
  schemes: string[],
) {
  const itemText = items
    .map((item) => `${item.productName} - Qty ${item.quantity} - ₹${Number(item.amount).toFixed(2)}`)
    .join("\n");
  const itemRows = items
    .map((item) => `<tr><td>${item.productName}</td><td>${item.quantity}</td><td>₹${Number(item.amount).toFixed(2)}</td></tr>`)
    .join("");
  const schemeText = schemes.length ? schemes.join(", ") : "No active product scheme";
  await sendEmail(
    recipient,
    `SFA order confirmation - ${outletName}`,
    `Hello ${outletName},\n\nYour order has been booked.\n${itemText}\n\nTotal: ₹${Number(totalAmount).toFixed(2)}\nAvailable schemes: ${schemeText}`,
    `<p>Hello ${outletName},</p><p>Your order has been booked successfully.</p><table cellpadding="7" cellspacing="0" border="1"><tr><th>Product</th><th>Quantity</th><th>Amount</th></tr>${itemRows}</table><p><strong>Total: ₹${Number(totalAmount).toFixed(2)}</strong></p><p><strong>Available schemes:</strong> ${schemeText}</p>`,
  );
}
