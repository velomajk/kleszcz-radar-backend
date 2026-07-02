import { describe, expect, it } from "vitest";
import { reportInputSchema, symptomInputSchema } from "../src/lib/validation.js";

const report = {
  email: "person@example.org", turnstileToken: "test", latitude: 52.2, longitude: 21,
  occurredOn: "2026-07-01", placeType: "park", subjectType: "adult", tickRemoved: true,
};

describe("report validation", () => {
  it("accepts only structured report fields", () => expect(reportInputSchema.parse(report)).toMatchObject({ placeType: "park" }));
  it("rejects unknown personal/free-text fields", () => expect(() => reportInputSchema.parse({ ...report, name: "Jan" })).toThrow());
  it("rejects a removal method when no removal occurred", () => expect(() => reportInputSchema.parse({ ...report, tickRemoved: false, removalMethod: "tweezers" })).toThrow());
});

describe("symptom validation", () => {
  it("defaults omitted structured flags", () => expect(symptomInputSchema.parse({ rash: true, observedAt: "2026-07-01T10:00:00.000Z" })).toMatchObject({ rash: true, fever: false }));
  it("rejects free-text medical notes", () => expect(() => symptomInputSchema.parse({ rash: true, observedAt: "2026-07-01T10:00:00.000Z", notes: "diagnosis" })).toThrow());
});
