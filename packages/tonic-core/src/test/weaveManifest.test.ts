import test from "node:test";
import assert from "node:assert/strict";
import { parseManifestJson, serializeManifestJson } from "../weaveGit/manifest";
import type { TonicGitManifest } from "../weaveGit/types";

test("parseManifestJson rejects empty parent_weave_shas element", () => {
  const bad = {
    schema: "tonic-git-manifest",
    version: "1",
    commit: "a",
    paths: {
      p: {
        text_blob_sha: "b".repeat(64),
        weave_serialized_sha: "c".repeat(64),
        weave_format_version: "1",
        diff_engine_id: "tonic-v1",
        parent_weave_shas: [""],
      },
    },
  };
  assert.throws(() => parseManifestJson(JSON.stringify(bad)), /parent weave sha must be non-empty/);
});

test("serializeManifestJson sorts keys deeply", () => {
  const man: TonicGitManifest = {
    schema: "tonic-git-manifest",
    version: "1",
    commit: "0000000000000000000000000000000000000000",
    paths: {},
  };
  const s = serializeManifestJson(man);
  assert.ok(s.indexOf('"commit"') < s.indexOf('"paths"'));
  assert.ok(s.indexOf('"paths"') < s.indexOf('"schema"'));
});
