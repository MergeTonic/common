#!/usr/bin/env node
/** Intentional non-zero exit for INPUT_AST_HYDRATION_STRICT tests (mirrors failing ast-grep). */
console.error("fixture: fake-sg-fail (exit 3; >2 so runner treats as scan failure)");
process.exit(3);
