import { env, objectMap } from "../config/env.js";
import { salesforce } from "../salesforce/SalesforceService.js";
import { sendDistributorInvitation } from "../services/emailService.js";
import { escapeSoqlLiteral } from "../utils/salesforce.js";

async function main() {
  const email = String(process.argv[2] || "").trim().toLowerCase();

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error("Pass a valid distributor email address");
  }

  if (env.USE_MOCK_DATA) {
    throw new Error("Invitation emails require the live Salesforce connection");
  }

  const safeEmail = escapeSoqlLiteral(email);
  const records = await salesforce.records(
    `SELECT Id, Name, Login_Email__c, User__r.Email FROM ${objectMap.distributor} WHERE Status__c = 'Active' AND (Login_Email__c = '${safeEmail}' OR User__r.Email = '${safeEmail}') LIMIT 1`,
  );
  const distributor = records[0];

  if (!distributor) {
    throw new Error("No active distributor is linked to this email address");
  }

  if (distributor.Login_Email__c !== email) {
    await salesforce.update(objectMap.distributor, distributor.Id, {
      Login_Email__c: email,
    });
  }

  await sendDistributorInvitation(email, distributor.Name);
  console.log(`Invitation sent to ${email} for ${distributor.Name}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
