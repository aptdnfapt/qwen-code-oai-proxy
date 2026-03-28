import assert from "assert/strict";
import test from "node:test";
import { extractUsageFromSseText } from "../../qwen/api.js";

test("extractUsageFromSseText keeps latest usage payload across chunks", () => {
  const first = extractUsageFromSseText(
    'data: {"choices":[{"delta":{"content":"hi"}}]}\n',
    null,
  );
  assert.equal(first.latestUsage, null);

  const second = extractUsageFromSseText(
    `${first.buffer}data: {"usage":{"prompt_tokens":12,"completion_tokens":4,"prompt_tokens_details":{"cached_tokens":6,"cache_creation_input_tokens":2,"cache_type":"ephemeral"}}}\n`,
    first.latestUsage,
  );

  assert.deepEqual(second.latestUsage, {
    prompt_tokens: 12,
    completion_tokens: 4,
    prompt_tokens_details: {
      cached_tokens: 6,
      cache_creation_input_tokens: 2,
      cache_type: "ephemeral",
    },
  });
  assert.equal(second.buffer, "");
});

test("extractUsageFromSseText preserves incomplete trailing chunk", () => {
  const result = extractUsageFromSseText('data: {"usage":{"prompt_tokens":8', null);
  assert.equal(result.latestUsage, null);
  assert.equal(result.buffer, 'data: {"usage":{"prompt_tokens":8');
});
