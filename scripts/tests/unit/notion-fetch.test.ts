import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  notionFetch,
  NotionNetworkError,
} from "../../../src/skills/bundled/notion-operator/init.ts";

const originalFetch = globalThis.fetch;

describe("notionFetch", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("retries a transient fetch-level network failure", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) {
        throw new TypeError("Failed to fetch");
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const result = await notionFetch("ntn_test", "POST", "/search", { query: "test" });

    assert.deepEqual(result, { ok: true });
    assert.equal(calls, 2);
  });

  it("classifies repeated fetch-level failures as Notion network errors", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;

    await assert.rejects(
      () => notionFetch("ntn_test", "POST", "/search", { query: "test" }),
      (error) => error instanceof NotionNetworkError,
    );
    assert.equal(calls, 2);
  });
});
