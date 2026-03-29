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
exports.reportRegionsToCore = reportRegionsToCore;
exports.readGitMergeDefaultsFromConfig = readGitMergeDefaultsFromConfig;
exports.applyGitMergeReconstructDefaults = applyGitMergeReconstructDefaults;
const vscode = __importStar(require("vscode"));
const core_1 = require("@mergetonic/core");
/** Map report JSON regions to @mergetonic/core ConflictRegion rows. */
function reportRegionsToCore(regions) {
    return (regions ?? []).map((r) => ({
        baseContent: r.base_content ?? "",
        leftContent: r.left_content ?? "",
        rightContent: r.right_content ?? "",
        startLine: r.start_line,
        endLine: r.end_line,
        conflictKind: r.conflict_kind,
        conflictBaseKind: r.conflict_base_kind,
        conflictTags: r.conflict_tags,
        markerLabelBegin: r.marker_label_begin,
        markerLabelMid: r.marker_label_mid,
    }));
}
function readGitMergeDefaultsFromConfig() {
    const c = vscode.workspace.getConfiguration("tonic");
    return {
        leftIntent: c.get("gitMergeIntent.leftDefault", "preserve_base") ?? "preserve_base",
        rightIntent: c.get("gitMergeIntent.rightDefault", "prefer_head") ?? "prefer_head",
        leftAuthor: c.get("gitMergeAuthor.leftDefault", "") ?? "",
        rightAuthor: c.get("gitMergeAuthor.rightDefault", "") ?? "",
    };
}
/**
 * Legacy reports may have `conflict_kind: "git merge"` without author/intent tags.
 * Fill defaults so reconstructed markers match hydrated git-merge output.
 * Preserves explicit `marker_label_begin` / `marker_label_mid` from JSON.
 */
function applyGitMergeReconstructDefaults(regions, d) {
    return regions.map((r) => {
        if (r.markerLabelBegin || r.markerLabelMid) {
            return r;
        }
        const meta = (0, core_1.parseConflictLabel)(r.conflictKind ?? "");
        if (meta.baseKind.trim().toLowerCase() !== "git merge") {
            return r;
        }
        const tags = { ...meta.tags, ...(r.conflictTags ?? {}) };
        if (!tags.intent) {
            tags.intent = d.leftIntent;
        }
        if (!tags.author) {
            tags.author = d.leftAuthor.trim() || "base";
        }
        if (!tags.intent_right) {
            tags.intent_right = d.rightIntent;
        }
        if (!tags.author_right) {
            tags.author_right = d.rightAuthor.trim() || "head";
        }
        return {
            ...r,
            conflictBaseKind: "git merge",
            conflictTags: tags,
            conflictKind: (0, core_1.formatConflictLabel)("git merge", tags),
        };
    });
}
