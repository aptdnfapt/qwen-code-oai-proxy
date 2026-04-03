# Model Discovery Guide

## Overview

When updating model IDs in this proxy, it's important to distinguish between:

1. **OAuth models** - Available via `coder-model` alias (Qwen team auto-updates)
2. **Coding Plan models** - Defined separately with different baseUrl (may need special subscription)

## How to Find New OAuth Model IDs

### Step 1: Check QWEN_OAUTH_MODELS

The authoritative source in qwen-code:

```bash
# Location: qwen-code/packages/core/src/models/constants.ts
grep -A10 "QWEN_OAUTH_MODELS" qwen-code/packages/core/src/models/constants.ts
```

This shows ONLY models available via OAuth:
```typescript
export const QWEN_OAUTH_MODELS: ModelConfig[] = [
  {
    id: 'coder-model',
    name: 'coder-model',
    description: 'Qwen 3.6 Plus — efficient hybrid model...',
    capabilities: { vision: true },
  },
];
```

### Step 2: Check Coding Plan Models (May Not Work with OAuth)

Coding Plan models are defined separately:

```bash
# Location: qwen-code/packages/cli/src/constants/codingPlan.ts
grep -B2 -A10 "baseUrl" qwen-code/packages/cli/src/constants/codingPlan.ts
```

These have `baseUrl: 'https://coding.dashscope.aliyuncs.com/v1'` - might need special API key/sub.

**Don't assume these work with OAuth token** - they may need different auth.

### Step 3: Check Token Limits

Token limits confirm model capabilities:

```bash
# Location: qwen-code/packages/core/src/core/tokenLimits.test.ts
grep -A2 "qwen3.5-plus\|coder-model\|qwen3.6" qwen-code/packages/core/src/core/tokenLimits.test.ts
```

Output:
```typescript
expect(tokenLimit('qwen3.5-plus')).toBe(1000000);
expect(tokenLimit('coder-model')).toBe(1000000);
expect(tokenLimit('qwen3.5-plus', 'output')).toBe(65536);
expect(tokenLimit('qwen3.6-plus', 'output')).toBe(65536);
expect(tokenLimit('coder-model', 'output')).toBe(65536);
```

### Step 4: Test with curl

Test models directly with your OAuth token:

```bash
# Test coder-model (should work)
curl -X POST http://localhost:8082/v1/chat/completions \
  -H "Authorization: Bearer fake-key" \
  -d '{"model":"coder-model","messages":[{"role":"user","content":"hi"}]}'

# Test qwen3.5-plus (returns 400 with OAuth)
curl -X POST http://localhost:8082/v1/chat/completions \
  -H "Authorization: Bearer fake-key" \
  -d '{"model":"qwen3.5-plus","messages":[{"role":"user","content":"hi"}]}'
```

## What I Found (This Update)

### Verified Working with OAuth

| Model ID | Status |
|----------|--------|
| `coder-model` | ✅ Works - returns "Qwen 3.6 Plus" response |
| `qwen3-coder-plus` | ✅ Works - tested earlier |

### Verified NOT Working with OAuth

| Model ID | Error | Reason |
|----------|-------|--------|
| `qwen3.5-plus` | 400 | Defined in Coding Plan with different endpoint |

### From qwen-code Source

`QWEN_OAUTH_MODELS` only contains `coder-model`. No other models listed for OAuth auth.

## What Changed (This Update)

### Fixed in src/qwen/api.ts

```typescript
// BEFORE (wrong - qwen3.5-plus is Coding Plan, not OAuth)
const MODEL_ALIASES: Record<string, string> = {
  "qwen3.5-plus": "coder-model",
};

// AFTER (correct - qwen3.6-plus is mentioned in tokenLimits as equivalent)
const MODEL_ALIASES: Record<string, string> = {
  "qwen3.6-plus": "coder-model",
};

// Added token limits
const MODEL_LIMITS: Record<string, { maxTokens: number }> = {
  "qwen3.5-plus": { maxTokens: 65536 },
  "qwen3.6-plus": { maxTokens: 65536 },
  "coder-model": { maxTokens: 65536 },
};
```

## Files to Check When Updating

1. `qwen-code/packages/core/src/models/constants.ts` - QWEN_OAUTH_MODELS (authoritative)
2. `qwen-code/packages/core/src/config/models.ts` - DEFAULT_QWEN_MODEL
3. `qwen-code/packages/core/src/core/tokenLimits.test.ts` - Token limits
4. `qwen-code/packages/cli/src/constants/codingPlan.ts` - Check but may not apply to OAuth

## Summary

- **Only `coder-model` in `QWEN_OAUTH_MODELS`** (verified in source)
- **`qwen3.5-plus` returns 400 with OAuth** (verified with curl)
- **`coder-model` evolves** - Qwen team updates what it points to
- **Always test with actual API** - don't assume Coding Plan models work with OAuth