import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  defaultRepoProfile,
  mergeRepoProfiles,
  parseRepoProfileJson,
  readRepoProfile,
  refsToFetchFromProfile,
  writeRepoProfile,
} from "../repoProfile/repoProfile";

test("parse and write roundtrip", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-rp-"));
  const p = { ...defaultRepoProfile(), left_ref: "main" };
  writeRepoProfile(dir, p);
  const got = readRepoProfile(dir);
  assert.equal(got?.left_ref, "main");
});

test("refsToFetchFromProfile dedupes", () => {
  const p = { ...defaultRepoProfile(), canonical_ref: "main", left_ref: "main", right_ref: "f" };
  const r = refsToFetchFromProfile(p);
  assert.ok(r.includes("main"));
  assert.ok(r.includes("f"));
});

test("mergeRepoProfiles keeps remote when patch empty", () => {
  const m = mergeRepoProfiles(defaultRepoProfile(), { remote: "" });
  assert.equal(m.remote, "origin");
});

test("parseRepoProfileJson minimal", () => {
  const o = parseRepoProfileJson(
    JSON.stringify({ schema: "tonic-repo-profile", version: "1", remote: "upstream" }),
  );
  assert.equal(o.remote, "upstream");
});
