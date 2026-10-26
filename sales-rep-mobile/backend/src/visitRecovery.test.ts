import { beforeEach, describe, expect, it, vi } from "vitest";
import { salesforce, SalesforceService } from "./salesforce/SalesforceService.js";
import { restoreVisit } from "./services/visitRecovery.js";

describe("durable visit recovery", () => {
  beforeEach(() => vi.restoreAllMocks());
  it("only restores a visit owned by the signed-in employee", async () => {
    const records = vi.spyOn(salesforce, "records").mockResolvedValue([]);
    expect(await restoreVisit("visit-id", "employee-id")).toBeUndefined();
    expect(records.mock.calls[0][0]).toContain("Employee__c = 'employee-id'");
  });
  it("restores the Salesforce draft and saved actions after server memory is lost", async () => {
    vi.spyOn(salesforce, "records")
      .mockResolvedValueOnce([{ Id: "v", Employee__c: "e", Retailer__c: "r", Status__c: "Checked In", Mobile_Order_Draft__c: JSON.stringify([{ productId: "p", quantity: 2 }]) }])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([{ Id: "return" }]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ Id: "ticket" }]).mockResolvedValueOnce([{ Product__c: "refused" }])
      .mockResolvedValueOnce([{ Id: "stock" }]).mockResolvedValueOnce([{ Id: "asset" }]);
    const result = await restoreVisit("v", "e");
    expect(result?.orderLines[0].quantity).toBe(2);
    expect(result?.orderSubmitted).toBe(false);
    expect(result?.returns).toHaveLength(1);
    expect(result?.tickets).toHaveLength(1);
    expect(result?.stocks).toHaveLength(1);
    expect(result?.assets).toHaveLength(1);
    expect(result?.refusedProductIds).toEqual(["refused"]);
  });
  it("prefers committed order items over an older draft", async () => {
    vi.spyOn(salesforce, "records").mockResolvedValue([])
      .mockResolvedValueOnce([{ Id: "v", Employee__c: "e", Mobile_Order_Draft__c: "not-json" }])
      .mockResolvedValueOnce([{ Product__c: "p", Piece_Quantity__c: 4, Unit_Price__c: 20, Line_Amount__c: 80, Scheme__r: { Name: "Offer" } }]);
    const visit = await restoreVisit("v", "e");
    expect(visit?.orderSubmitted).toBe(true);
    expect(visit?.orderLines[0].amount).toBe(80);
    expect(visit?.orderLines[0].schemeName).toBe("Offer");
  });
});

describe("atomic Salesforce writes", () => {
  it("requests all-or-none and rejects failures inside an HTTP 200 composite", async () => {
    const sf = new SalesforceService();
    const request = vi.spyOn(sf as any, "request").mockResolvedValue({ compositeResponse: [{ httpStatusCode: 200, body: [{ success: false, errors: ["validation"] }] }] });
    await expect(sf.composite([{ referenceId: "order" }])).rejects.toThrow("Salesforce transaction failed");
    expect(JSON.parse((request.mock.calls[0][1] as RequestInit).body as string).allOrNone).toBe(true);
  });
  it("does not drop Salesforce query pages", async () => {
    const sf = new SalesforceService();
    vi.spyOn(sf as any, "request").mockResolvedValueOnce({ records: [{ Id: "one" }], done: false, nextRecordsUrl: "/services/data/v67.0/query/next" })
      .mockResolvedValueOnce({ records: [{ Id: "two" }], done: true });
    expect(await sf.records("SELECT Id FROM Product__c")).toEqual([{ Id: "one" }, { Id: "two" }]);
  });
});
