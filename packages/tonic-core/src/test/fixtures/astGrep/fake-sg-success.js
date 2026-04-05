#!/usr/bin/env node
const match = [
  {
    ruleId: "test-rule",
    severity: "warning",
    language: "typescript",
    path: "sample.ts",
    start: { line: 1, column: 0 },
    end: { line: 2, column: 0 },
    message: "fixture match",
    meta: {},
  },
];
console.log(JSON.stringify(match));
process.exit(0);
