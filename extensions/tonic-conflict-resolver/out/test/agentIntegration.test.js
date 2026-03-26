"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const agentContract_1 = require("../agentContract");
(0, node_test_1.default)("parseAgentResult accepts valid JSON payload", () => {
    const payload = JSON.stringify({
        resolved_lines: ["line 1", "line 2"],
        rationale: "picked right-side logic",
    });
    const res = (0, agentContract_1.parseAgentResult)(payload);
    strict_1.default.deepEqual(res.resolved_lines, ["line 1", "line 2"]);
    strict_1.default.equal(res.rationale, "picked right-side logic");
});
(0, node_test_1.default)("parseAgentResult rejects non-array resolved_lines", () => {
    strict_1.default.throws(() => (0, agentContract_1.parseAgentResult)('{"resolved_lines":"oops"}'));
});
(0, node_test_1.default)("parseAgentResult rejects multiline entries", () => {
    strict_1.default.throws(() => (0, agentContract_1.parseAgentResult)(JSON.stringify({
        resolved_lines: ["line1\nline2"],
    })));
});
