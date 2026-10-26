import { describe, it, expect } from "vitest";
import { loadCliSession } from "./cliSession.js";

describe("Salesforce CLI session metadata", () => {
  it("loads the org URL when the token command returns only a token", async () => {
    const commands: string[][] = [];
    const session = await loadCliSession(async (command) => {
      commands.push(command);
      return command.includes("display")
        ? { instanceUrl: "https://example.my.salesforce.com" }
        : { accessToken: "synthetic-token" };
    });
    expect(commands).toEqual([
      ["org", "auth", "show-access-token"],
      ["org", "display"],
    ]);
    expect(session).toEqual({
      accessToken: "synthetic-token",
      instanceUrl: "https://example.my.salesforce.com",
    });
  });
  it("preserves an explicit HTTPS instance without an extra CLI command", async () => {
    let calls = 0;
    expect(
      (
        await loadCliSession(async () => {
          calls++;
          return { accessToken: "test" };
        }, "https://example.my.salesforce.com/")
      ).instanceUrl,
    ).toBe("https://example.my.salesforce.com");
    expect(calls).toBe(1);
  });
  it("fails before HTTP on missing URL or token, without leaking credentials", async () => {
    await expect(loadCliSession(async () => ({ accessToken: "private-value" }))).rejects.toThrow(
      "Salesforce instance URL is missing or invalid",
    );
    await expect(
      loadCliSession(async () => ({ instanceUrl: "https://example.my.salesforce.com" })),
    ).rejects.toThrow("Salesforce CLI returned no access token");
    await expect(
      loadCliSession(async () => ({ accessToken: "test" }), "http://example.my.salesforce.com"),
    ).rejects.toThrow("Salesforce instance URL is missing or invalid");
  });
});
