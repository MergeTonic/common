import test from "node:test";
import assert from "node:assert/strict";
import { resolveGitHubRemoteSpec, resolveHubRepoSpec, resolveRemoteSpec } from "../remoteSpec";

test("resolveHubRepoSpec bare id", () => {
  const r = resolveHubRepoSpec("org/model");
  assert.equal(r?.kind, "hub");
  assert.equal(r?.repoId, "org/model");
});

test("resolveGitHubRemoteSpec https", () => {
  const r = resolveGitHubRemoteSpec("https://github.com/foo/bar");
  assert.equal(r?.kind, "github");
  if (!r?.url) {
    assert.fail("Expected resolveGitHubRemoteSpec to return a URL");
  } else {
    assert.equal(new URL(r.url).hostname, "github.com");
  }
});

test("resolveRemoteSpec hf url", () => {
  const r = resolveRemoteSpec("https://huggingface.co/acme/m");
  assert.equal(r?.kind, "hub");
  if (r?.kind === "hub") {
    assert.equal(r.repoId, "acme/m");
  }
});
