/** The access-token command does not promise an instanceUrl; read org metadata separately. */
export async function loadCliSession(
  run: (command: string[]) => Promise<any>,
  configuredUrl?: string,
) {
  const auth = await run(["org", "auth", "show-access-token"]);
  const org = auth?.instanceUrl || configuredUrl ? null : await run(["org", "display"]);
  const instanceUrl = auth?.instanceUrl || configuredUrl || org?.instanceUrl;
  let url: URL;
  try {
    url = new URL(instanceUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
      throw new Error();
  } catch {
    throw new Error(
      "Salesforce instance URL is missing or invalid. Reconnect the configured Salesforce org.",
    );
  }
  if (typeof auth?.accessToken !== "string" || !auth.accessToken.trim())
    throw new Error(
      "Salesforce CLI returned no access token. Reconnect the configured Salesforce org.",
    );
  return { accessToken: auth.accessToken, instanceUrl: url.origin };
}
