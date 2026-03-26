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
exports.ConflictItem = exports.ConflictTreeProvider = void 0;
const vscode = __importStar(require("vscode"));
const core_1 = require("@mergetonic/core");
class ConflictTreeProvider {
    _doc;
    _onDidChange = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChange.event;
    setDocument(doc) {
        this._doc = doc;
        this._onDidChange.fire(undefined);
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element) {
            return [];
        }
        if (!this._doc) {
            return [];
        }
        const blocks = (0, core_1.parseTonicConflicts)(this._doc.getText());
        return blocks.map((b, i) => new ConflictItem((0, core_1.conflictSummary)(b), b.startLine, i, vscode.TreeItemCollapsibleState.None));
    }
}
exports.ConflictTreeProvider = ConflictTreeProvider;
class ConflictItem extends vscode.TreeItem {
    startLine;
    constructor(label, startLine, idx, state) {
        super(label, state);
        this.startLine = startLine;
        this.command = {
            command: "tonic.jumpToLine",
            title: "Jump",
            arguments: [startLine],
        };
        this.iconPath = new vscode.ThemeIcon("warning");
    }
}
exports.ConflictItem = ConflictItem;
