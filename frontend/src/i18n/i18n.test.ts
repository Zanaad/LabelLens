import { expect, it } from "vitest";
import { en } from "./en";

it("never uses the word 'safe' in user-facing strings", () => {
  expect(Object.entries(en).filter(([, v]) => /safe/i.test(v))).toEqual([]);
});
