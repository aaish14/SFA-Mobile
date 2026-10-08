import { env } from "../config/env.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type Token = { accessToken: string; instanceUrl: string; expiresAt: number };
export class SalesforceService {
  private token?: Token;
  private async authenticate() {
    if (this.token && this.token.expiresAt > Date.now() + 60000)
      return this.token;
    if (!env.SALESFORCE_CLIENT_ID || !env.SALESFORCE_CLIENT_SECRET) {
      // Local development can safely reuse the existing Salesforce CLI login.
      // The access token remains on the backend and never reaches the phone.
      const executable = process.platform === "win32" ? "cmd.exe" : "sf";
      const argumentsForCli =
        process.platform === "win32"
          ? [
              "/d",
              "/s",
              "/c",
              `sf org auth show-access-token --target-org ${env.SALESFORCE_ORG_ALIAS} --json`,
            ]
          : [
              "org",
              "auth",
              "show-access-token",
              "--target-org",
              env.SALESFORCE_ORG_ALIAS,
              "--json",
            ];
      const { stdout } = await execFileAsync(executable, argumentsForCli, {
        env: { ...process.env, SF_DISABLE_TELEMETRY: "true" },
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024,
      });
      const result = JSON.parse(stdout.slice(stdout.indexOf("{"))).result;
      this.token = {
        accessToken: result.accessToken,
        instanceUrl: result.instanceUrl || env.SALESFORCE_INSTANCE_URL!,
        expiresAt: Date.now() + 10 * 60 * 1000,
      };
      return this.token;
    }
    const usePasswordFlow = Boolean(
      env.SALESFORCE_USERNAME && env.SALESFORCE_PASSWORD,
    );
    const body = new URLSearchParams(
      usePasswordFlow
        ? {
            grant_type: "password",
            client_id: env.SALESFORCE_CLIENT_ID,
            client_secret: env.SALESFORCE_CLIENT_SECRET,
            username: env.SALESFORCE_USERNAME!,
            password: `${env.SALESFORCE_PASSWORD}${env.SALESFORCE_SECURITY_TOKEN || ""}`,
          }
        : {
            grant_type: "client_credentials",
            client_id: env.SALESFORCE_CLIENT_ID,
            client_secret: env.SALESFORCE_CLIENT_SECRET,
          },
    );
    const response = await fetch(
      `${env.SALESFORCE_LOGIN_URL}/services/oauth2/token`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      },
    );
    if (!response.ok) throw new Error("Salesforce authentication failed");
    const result: any = await response.json();
    this.token = {
      accessToken: result.access_token,
      instanceUrl: result.instance_url,
      expiresAt: Date.now() + 55 * 60 * 1000,
    };
    return this.token;
  }
  private async request(
    path: string,
    init: RequestInit = {},
    allowSessionRetry = true,
  ): Promise<any> {
    const token = await this.authenticate();
    const response = await fetch(
      `${token.instanceUrl}/services/data/v${env.SALESFORCE_API_VERSION}${path}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          "content-type": "application/json",
          ...(init.headers || {}),
        },
      },
    );
    if (response.status === 401 && allowSessionRetry) {
      this.token = undefined;
      return this.request(path, init, false);
    }
    if (!response.ok) {
      const details = await response.text();
      throw new Error(
        `Salesforce request failed (${response.status}): ${details.slice(0, 500)}`,
      );
    }
    return response.status === 204 ? null : response.json();
  }
  query(soql: string) {
    return this.request(`/query?q=${encodeURIComponent(soql)}`);
  }
  async records(soql: string) {
    const result = (await this.query(soql)) as { records: any[] };
    return result.records;
  }
  create(objectName: string, record: unknown) {
    return this.request(`/sobjects/${objectName}`, {
      method: "POST",
      body: JSON.stringify(record),
    });
  }
  update(objectName: string, id: string, record: unknown) {
    return this.request(`/sobjects/${objectName}/${id}`, {
      method: "PATCH",
      body: JSON.stringify(record),
    });
  }
  retrieve(objectName: string, id: string) {
    return this.request(`/sobjects/${objectName}/${id}`);
  }

  clearCachedSession() {
    this.token = undefined;
  }
}
export const salesforce = new SalesforceService();
