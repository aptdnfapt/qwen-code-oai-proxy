import assert from "assert/strict";
import test from "node:test";
import { aggregateUsageDays } from "../helpers/runtime.js";

test("aggregateUsageDays maps cache metrics and hit rate", () => {
  const tokenUsage = new Map([
    [
      "acc-a",
      [
        {
          date: "2026-03-28",
          requests: 2,
          requestsKnown: true,
          inputTokens: 100,
          outputTokens: 40,
          cacheReadTokens: 60,
          cacheWriteTokens: 20,
          cacheTypes: ["ephemeral"],
        },
      ],
    ],
    [
      "acc-b",
      [
        {
          date: "2026-03-28",
          requests: 1,
          requestsKnown: true,
          inputTokens: 30,
          outputTokens: 10,
          cacheReadTokens: 10,
          cacheWriteTokens: 10,
          cacheTypes: ["ephemeral"],
        },
      ],
    ],
  ]);

  const days = aggregateUsageDays(tokenUsage, new Map(), "2026-03-28");
  assert.equal(days.length, 1);
  assert.deepEqual(days[0], {
    date: "2026-03-28",
    requests: 3,
    requestsKnown: true,
    requestFloor: 2,
    inputTokens: 130,
    outputTokens: 50,
    cacheReadTokens: 70,
    cacheWriteTokens: 30,
    cacheTypeLabel: "ephemeral",
    cacheHitRate: 0.7,
  });
});

test("aggregateUsageDays backfills today request count from request map", () => {
  const tokenUsage = new Map([
    [
      "acc-a",
      [
        {
          date: "2026-03-28",
          requests: 0,
          requestsKnown: false,
          inputTokens: 20,
          outputTokens: 5,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          cacheTypes: [],
        },
      ],
    ],
  ]);

  const days = aggregateUsageDays(tokenUsage, new Map([["acc-a", 4]]), "2026-03-28");
  assert.equal(days[0]?.requests, 4);
  assert.equal(days[0]?.requestsKnown, true);
  assert.equal(days[0]?.requestFloor, 1);
});
