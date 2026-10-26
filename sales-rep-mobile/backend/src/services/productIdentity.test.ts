import { describe, expect, it } from "vitest";
import { productIdentity } from "./productIdentity.js";

describe("Salesforce product identity", () => {
  it("maps the three fields from the same Salesforce product", () => {
    expect(
      productIdentity({ Brand__c: "Brand A", Sub_Brand__c: "Range A", Brand_Alias__c: "Alias A" }),
    ).toEqual({ brand: "Brand A", subBrand: "Range A", brandAlias: "Alias A" });
  });
  it("returns empty values without inventing product metadata", () => {
    expect(productIdentity({ Brand__c: null })).toEqual({
      brand: "",
      subBrand: "",
      brandAlias: "",
    });
  });
});
