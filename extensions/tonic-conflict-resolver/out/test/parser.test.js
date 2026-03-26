"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const core_1 = require("@mergetonic/core");
(0, node_test_1.default)("parses single block with two segments", () => {
    const src = [
        "<<<<<<< begin added left",
        "L1",
        "======= begin added right",
        "R1",
        ">>>>>>> end conflict",
    ].join("\n");
    const blocks = (0, core_1.parseTonicConflicts)(src);
    strict_1.default.equal(blocks.length, 1);
    strict_1.default.equal(blocks[0].segments.length, 2);
    strict_1.default.deepEqual(blocks[0].segments[0].lines, ["L1"]);
    strict_1.default.deepEqual(blocks[0].segments[1].lines, ["R1"]);
});
(0, node_test_1.default)("unclosed begin without end yields no blocks (current contract)", () => {
    const src = ["<<<<<<< begin added left", "orphan"].join("\n");
    strict_1.default.equal((0, core_1.parseTonicConflicts)(src).length, 0);
});
