import { isRateLimited } from "@/lib/rate-limit";
test("allows 10 prompts per minute, blocks the 11th", () => {
  const t = 1_000_000;
  for (let i = 0; i < 10; i++) expect(isRateLimited("a", t + i)).toBe(false);
  expect(isRateLimited("a", t + 10)).toBe(true);
});
test("allows again after a minute", () => {
  const t = 5_000_000;
  for (let i = 0; i < 10; i++) isRateLimited("b", t);
  expect(isRateLimited("b", t + 60_001)).toBe(false);
});
