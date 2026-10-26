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
