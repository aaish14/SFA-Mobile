import { describe, it, expect } from "vitest";
import { distanceInMeters } from "./distance";
describe("distance validation", () => {
  it("accepts a nearby position", () =>
    expect(
      distanceInMeters(
        { latitude: 12.9719, longitude: 77.5949 },
        { latitude: 12.97191, longitude: 77.59491 },
      ),
    ).toBeLessThan(100));
  it("rejects a distant position", () =>
    expect(
      distanceInMeters(
        { latitude: 12.9719, longitude: 77.5949 },
        { latitude: 12.981, longitude: 77.61 },
      ),
    ).toBeGreaterThan(100));
});
