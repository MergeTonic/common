"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.semanticColorForLabel = semanticColorForLabel;
const vscode = __importStar(require("vscode"));
const core_1 = require("@mergetonic/core");
const PALETTES = {
    tonic: {
        "added left": "#fff3cd",
        "added right": "#cce5ff",
        "added both": "#d4edda",
        "deleted left": "#f8d7da",
        "deleted right": "#fce5cd",
        "deleted both": "#e2e3e5",
        "git merge": "#e7d9ff",
    },
    contrast: {
        "added left": "#ffe082",
        "added right": "#81d4fa",
        "added both": "#a5d6a7",
        "deleted left": "#ef9a9a",
        "deleted right": "#ffcc80",
        "deleted both": "#b0bec5",
        "git merge": "#ce93d8",
    },
};
function asPalette(value) {
    switch (value) {
        case "contrast":
            return "contrast";
        case "tonic":
        default:
            return "tonic";
    }
}
function parseRules(value) {
    if (!value || typeof value !== "object" || !Array.isArray(value.rules)) {
        return [];
    }
    const out = [];
    for (const raw of value.rules) {
        if (!raw || typeof raw !== "object") {
            continue;
        }
        const candidate = raw;
        if (typeof candidate.backgroundColor !== "string" || !candidate.backgroundColor.trim()) {
            continue;
        }
        const tags = {};
        if (candidate.tags && typeof candidate.tags === "object") {
            for (const [k, v] of Object.entries(candidate.tags)) {
                if (typeof v === "string") {
                    tags[k] = v;
                }
            }
        }
        out.push({
            kind: typeof candidate.kind === "string" ? candidate.kind : undefined,
            tags,
            backgroundColor: candidate.backgroundColor.trim(),
        });
    }
    return out;
}
function tagsMatch(actual, expected) {
    for (const [key, value] of Object.entries(expected)) {
        if (actual[key] !== value) {
            return false;
        }
    }
    return true;
}
function semanticColorForLabel(label) {
    const cfg = vscode.workspace.getConfiguration("tonic");
    const enabled = cfg.get("highlight.enableSemantic", false);
    if (!enabled) {
        return undefined;
    }
    const paletteName = asPalette(cfg.get("highlight.defaultPalette", "tonic"));
    const parsed = (0, core_1.parseConflictLabel)(label);
    const userRules = parseRules(cfg.get("conflictLabelConfig"));
    for (const rule of userRules) {
        const kindOk = !rule.kind || rule.kind === parsed.baseKind;
        const tagsOk = !rule.tags || tagsMatch(parsed.tags, rule.tags);
        if (kindOk && tagsOk) {
            return rule.backgroundColor;
        }
    }
    return PALETTES[paletteName][parsed.baseKind];
}
