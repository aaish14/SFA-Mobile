export class DmsUpstreamError extends Error {
  /**
   * Initialize the transport error with the message and status needed by the calling API route.
   */
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Actual HTTP transport, with injectable credentials for local HTTP simulation. */
export class DmsTransport {
  /**
   * Inject the Salesforce session provider and HTTP client, allowing the same transport to run
   * against controlled test servers.
   */
  constructor(
    private session: (refresh?: boolean) => Promise<{
      instanceUrl: string;
      accessToken: string;
    }>,
    private fetchHttp: typeof fetch = fetch,
  ) {}

  /** Read-only DMS queries use the same server credentials, with bounded HTTP waits. */
  async records(query: string, version = "67.0"): Promise<any[]> {
    let path = `/services/data/v${version}/query?q=${encodeURIComponent(query)}`;
    const rows: any[] = [];
    while (path) {
      // Salesforce pagination must never redirect a bearer token to another host.
      if (!/^\/services\/data\/v[\d.]+\/query(?:\?|\/)/.test(path))
        throw new DmsUpstreamError(502, "Invalid Salesforce pagination response");
      let data: any;
      for (let attempt = 0; attempt < 2; attempt++) {
        const session = await this.session(attempt > 0);
        let response: Response;
        try {
          response = await this.fetchHttp(`${session.instanceUrl}${path}`, {
            headers: { Authorization: `Bearer ${session.accessToken}` },
            signal: AbortSignal.timeout(20_000),
          });
        } catch {
          throw new DmsUpstreamError(
            502,
            "Salesforce could not be reached. Your last saved data has not been replaced.",
          );
        }
        if (response.status === 401 && attempt === 0) continue;
        data = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(data?.records) || typeof data.done !== "boolean")
          throw new DmsUpstreamError(
            502,
            "Salesforce could not return the requested data. Check the connection and report permissions.",
          );
        break;
      }
      rows.push(...data.records);
      if (!data.done && typeof data.nextRecordsUrl !== "string")
        throw new DmsUpstreamError(502, "Incomplete Salesforce query response");
      path = data.done ? "" : data.nextRecordsUrl;
    }
    return rows;
  }

  /**
   * Use the portal's original Salesforce Send Email action without activity logging.
   * Newer orgs also enforce the daily external-email limit on this REST action.
   * Acceptance confirms submission to Salesforce, not delivery to an inbox.
   */
  async sendLoginCode(email: string, code: string, version = "67.0", allowAuthRetry = true): Promise<void> {
    const session = await this.session();
    let response: Response;
    try {
      response = await this.fetchHttp(`${session.instanceUrl}/services/data/v${version}/actions/standard/emailSimple`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: [{
          // Name verified against this org's emailSimple action describe response.
          emailAddressesArray: [email],
          emailSubject: "Your DMS distributor sign-in code",
          emailBody: `Your one-use DMS sign-in code is ${code}. It expires in 10 minutes. Ignore this message if you did not request it.`,
          sendRichBody: false,
          senderType: "CurrentUser",
        }] }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new DmsUpstreamError(502, "Salesforce could not accept the sign-in email.");
    }
    if (response.status === 401 && allowAuthRetry) {
      await this.session(true);
      return this.sendLoginCode(email, code, version, false);
    }
    const results = await response.json().catch(() => null) as any;
    const result = Array.isArray(results) && results.length === 1 ? results[0] : undefined;
    if (!response.ok || result?.isSuccess !== true) {
      const errors = Array.isArray(result?.errors) ? result.errors : Array.isArray(results) ? results : [];
      const codes = errors.map((error: any) => String(error.statusCode || error.errorCode || "UNKNOWN"))
        .filter((value: string) => /^[A-Z_]+$/.test(value));
      // Only failed-action error descriptions are logged. Redact request secrets and addresses;
      // never log the action response, request body, session or email contents.
      const descriptions = errors.map((error: any) => String(error.message || "")
        .split(code).join("[code]").split(email).join("[recipient]")
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
        .replace(/\b\d{6}\b/g, "[number]").slice(0, 800));
      console.warn("DMS_LOGIN_EMAIL_REJECTED", JSON.stringify({ httpStatus: response.status, errorCodes: codes, descriptions }));
      if (codes.some((value: string) => value.includes("LIMIT_EXCEEDED")))
        throw new DmsUpstreamError(503, "Salesforce daily email limit has been reached.");
      // Salesforce uses this ambiguous error for both missing recipients and exhausted
      // quotas. Check the live counters before telling the user that a limit is reached.
      if (codes.includes("EMAIL_NOT_PROCESSED_DUE_TO_PRIOR_ERROR") &&
          await this.emailAllowanceExhausted(session, version))
        throw new DmsUpstreamError(503, "Salesforce daily email limit has been reached.");
      // Never include the provider response: it may echo the recipient or code.
      throw new DmsUpstreamError(502, "Salesforce could not accept the sign-in email.");
    }
  }

  /** Diagnose a rejected send without resending it or exposing provider details. */
  private async emailAllowanceExhausted(
    session: { instanceUrl: string; accessToken: string }, version: string,
  ): Promise<boolean> {
    try {
      const response = await this.fetchHttp(`${session.instanceUrl}/services/data/v${version}/limits`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) return false;
      const limits = await response.json() as Record<string, { Remaining?: number }>;
      return [limits.SingleEmail?.Remaining, limits.DailyWorkflowEmails?.Remaining]
        .some(remaining => typeof remaining === "number" && remaining <= 0);
    } catch {
      // A diagnostic failure must not replace the original safe send failure.
      return false;
    }
  }

  /**
   * Send a DMS command to the Apex portal endpoint and translate transport or command failures
   * for the API caller.
   */
  async command(input: Record<string, unknown>, allowAuthRetry = true): Promise<any> {
    const session = await this.session();
    let response: Response;
    try {
      response = await this.fetchHttp(`${session.instanceUrl}/services/apexrest/dms/portal/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new DmsUpstreamError(
        502,
        "Salesforce is unreachable. Keep your saved request and retry with the same key.",
      );
    }
    if (response.status === 401 && allowAuthRetry) {
      await this.session(true);
      return this.command(input, false);
    }
    const data = (await response.json().catch(() => null)) as any;
    if (
      !response.ok ||
      !data ||
      data.error ||
      typeof data.id !== "string" ||
      !/^[A-Za-z0-9]{15,18}$/.test(data.id) ||
      typeof data.status !== "string"
    ) {
      throw new DmsUpstreamError(
        response.status === 400 && typeof data?.error === "string" ? 400 : 502,
        response.status === 400 && typeof data?.error === "string"
          ? data.error
          : "Salesforce could not confirm the operation. Your request has not been marked successful.",
      );
    }
    return data;
  }
}
