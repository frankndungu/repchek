import { describe, expect, it } from "vitest";
import {
  isUuid,
  planFromStatus,
  shouldApply,
  toProfileUpdate,
} from "../supabase/functions/_shared/plan";
import type { PolarSubscription } from "../supabase/functions/_shared/plan";

const sub = (over: Partial<PolarSubscription> = {}): PolarSubscription => ({
  id: "sub_1",
  status: "active",
  current_period_end: "2026-12-03T00:00:00Z",
  cancel_at_period_end: false,
  modified_at: "2026-11-03T10:00:00Z",
  ...over,
});

describe("planFromStatus", () => {
  it("is premium while paid and in good standing", () => {
    expect(planFromStatus("active")).toBe("premium");
    expect(planFromStatus("trialing")).toBe("premium");
    // A failed payment keeps access while the card is retried.
    expect(planFromStatus("past_due")).toBe("premium");
  });

  it("is free for everything else", () => {
    for (const s of ["canceled", "unpaid", "paused", "incomplete", "incomplete_expired", "nonsense"]) {
      expect(planFromStatus(s)).toBe("free");
    }
  });
});

describe("toProfileUpdate", () => {
  it("keeps the period end and the cancel flag while premium", () => {
    expect(toProfileUpdate(sub({ cancel_at_period_end: true }))).toEqual({
      plan: "premium",
      premium_until: "2026-12-03T00:00:00Z",
      cancel_at_period_end: true,
      polar_subscription_id: "sub_1",
      subscription_modified_at: "2026-11-03T10:00:00Z",
    });
  });

  it("clears the dates once the subscription has ended", () => {
    expect(toProfileUpdate(sub({ status: "canceled", cancel_at_period_end: true }))).toMatchObject({
      plan: "free",
      premium_until: null,
      cancel_at_period_end: false,
    });
  });
});

describe("shouldApply", () => {
  const stored = {
    plan: "premium" as const,
    polar_subscription_id: "sub_1",
    subscription_modified_at: "2026-11-03T10:00:00Z",
  };

  it("applies the first event for a user", () => {
    expect(shouldApply(toProfileUpdate(sub()), null)).toBe(true);
    expect(
      shouldApply(toProfileUpdate(sub()), {
        plan: "free",
        polar_subscription_id: null,
        subscription_modified_at: null,
      }),
    ).toBe(true);
  });

  it("ignores an older event for the same subscription", () => {
    const older = toProfileUpdate(sub({ status: "canceled", modified_at: "2026-11-03T09:00:00Z" }));
    expect(shouldApply(older, stored)).toBe(false);
  });

  it("applies a newer or equal event", () => {
    expect(shouldApply(toProfileUpdate(sub({ modified_at: "2026-11-04T00:00:00Z" })), stored)).toBe(true);
    expect(shouldApply(toProfileUpdate(sub()), stored)).toBe(true);
  });

  it("does not let an ended subscription remove a live one", () => {
    const other = toProfileUpdate(sub({ id: "sub_2", status: "canceled" }));
    expect(shouldApply(other, stored)).toBe(false);
  });

  it("lets a new subscription replace an ended one", () => {
    const ended = { ...stored, plan: "free" as const };
    expect(shouldApply(toProfileUpdate(sub({ id: "sub_2" })), ended)).toBe(true);
  });
});

describe("isUuid", () => {
  it("accepts a user id and rejects anything else", () => {
    expect(isUuid("672d085e-a568-4d93-bccc-ce26d451b036")).toBe(true);
    expect(isUuid("not-an-id")).toBe(false);
    expect(isUuid(null)).toBe(false);
  });
});
