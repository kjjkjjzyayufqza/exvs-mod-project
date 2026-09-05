import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOTS = ["src/components", "src/layout", "src/page"];
const ALLOWLIST_PATH = "scripts/i18n-coverage-allowlist.json";
const requestedFile = process.argv
  .find((argument) => argument.startsWith("--file="))
  ?.slice("--file=".length)
  .replaceAll("\\", "/");
const VISIBLE_ATTRIBUTES = new Set([
  "alt",
  "aria-label",
  "description",
  "emptyMessage",
  "emptyText",
  "helpText",
  "label",
  "loadingMessage",
  "message",
  "placeholder",
  "subtitle",
  "title",
  "tooltip",
]);
const VISIBLE_PROPERTIES = new Set([
  "description",
  "detail",
  "emptyMessage",
  "helpText",
  "label",
  "message",
  "subtitle",
  "title",
  "tooltip",
]);
const USER_MESSAGE_CALL = /(?:^|\.)(?:alert|confirm|setError|setMessage|setStatus|setWarning|toast\.(?:error|info|message|success|warning))$/;

const allowlist = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, "utf8"));
const allowedExact = new Set(allowlist.exact);
const allowedPatterns = allowlist.patterns.map((pattern) => new RegExp(pattern));
const excludedPathPrefixes = allowlist.excludedPathPrefixes ?? [];

function collectFiles(directory, output) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectFiles(filePath, output);
    else if (
      entry.isFile() &&
      filePath.endsWith(".tsx") &&
      !/\.(?:spec|test)\.tsx$/.test(filePath)
    ) {
      output.push(filePath);
    }
  }
}

function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function containsEnglishWords(value) {
  return /[A-Za-z]/.test(value);
}

function isAllowed(value) {
  if (!value || !containsEnglishWords(value)) return true;
  if (allowedExact.has(value)) return true;
  return allowedPatterns.some((pattern) => pattern.test(value));
}

function propertyNameText(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return "";
}

function jsxTagNameText(tagName) {
  if (ts.isIdentifier(tagName)) return tagName.text;
  if (ts.isPropertyAccessExpression(tagName)) return tagName.name.text;
  return "";
}

function isInsideCodeMarkup(node) {
  let current = node.parent;
  while (current) {
    if (ts.isJsxElement(current)) {
      const name = jsxTagNameText(current.openingElement.tagName).toLowerCase();
      if (name === "code" || name === "pre") return true;
    }
    current = current.parent;
  }
  return false;
}

function jsxAttributeNameText(name) {
  if (ts.isIdentifier(name) || ts.isJsxIdentifier(name)) return name.text;
  return "";
}

function openingAttributes(node) {
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    return node.attributes;
  }
  if (ts.isJsxElement(node)) return node.openingElement.attributes;
  return null;
}

function isInsideI18nIgnore(node) {
  let current = node;
  while (current) {
    const attributes = openingAttributes(current);
    if (attributes) {
      for (const attribute of attributes.properties) {
        if (
          ts.isJsxAttribute(attribute) &&
          jsxAttributeNameText(attribute.name) === "data-i18n-ignore"
        ) {
          return true;
        }
      }
    }
    current = current.parent;
  }
  return false;
}

function literalValue(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isTemplateExpression(node)) return node.getText();
  return null;
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

const files = [];
for (const root of ROOTS) collectFiles(root, files);
files.sort();
for (let index = files.length - 1; index >= 0; index -= 1) {
  const normalized = files[index].replaceAll("\\", "/");
  if (excludedPathPrefixes.some((prefix) => normalized.startsWith(prefix))) {
    files.splice(index, 1);
  }
}
if (requestedFile) {
  const requestedIndex = files.findIndex(
    (file) => file.replaceAll("\\", "/") === requestedFile,
  );
  if (requestedIndex < 0) {
    console.error(`i18n coverage file not found: ${requestedFile}`);
    process.exit(2);
  }
  files.splice(0, files.length, files[requestedIndex]);
}

const findings = [];
const seen = new Set();

function report(sourceFile, node, kind, rawValue) {
  if (isInsideI18nIgnore(node)) return;
  const value = normalizeText(rawValue);
  if (isAllowed(value)) return;
  const key = `${sourceFile.fileName}:${node.getStart(sourceFile)}:${kind}`;
  if (seen.has(key)) return;
  seen.add(key);
  findings.push({
    file: sourceFile.fileName.replaceAll("\\", "/"),
    line: lineOf(sourceFile, node),
    kind,
    value,
  });
}

for (const file of files) {
  const sourceText = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  function visit(node) {
    if (ts.isJsxText(node) && !isInsideCodeMarkup(node)) {
      report(sourceFile, node, "jsx-text", node.text);
    }

    if (
      ts.isJsxExpression(node) &&
      !ts.isJsxAttribute(node.parent) &&
      node.expression &&
      !isInsideCodeMarkup(node)
    ) {
      const value = literalValue(node.expression);
      if (value !== null) report(sourceFile, node.expression, "jsx-expression", value);
    }

    if (ts.isJsxAttribute(node) && VISIBLE_ATTRIBUTES.has(node.name.text)) {
      if (node.initializer && ts.isStringLiteral(node.initializer)) {
        report(sourceFile, node.initializer, `attribute:${node.name.text}`, node.initializer.text);
      } else if (
        node.initializer &&
        ts.isJsxExpression(node.initializer) &&
        node.initializer.expression
      ) {
        const value = literalValue(node.initializer.expression);
        if (value !== null) {
          report(sourceFile, node.initializer.expression, `attribute:${node.name.text}`, value);
        }
      }
    }

    if (ts.isPropertyAssignment(node) && VISIBLE_PROPERTIES.has(propertyNameText(node.name))) {
      const value = literalValue(node.initializer);
      if (value !== null) {
        report(sourceFile, node.initializer, `property:${propertyNameText(node.name)}`, value);
      }
    }

    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sourceFile);
      if (USER_MESSAGE_CALL.test(callee) && node.arguments[0]) {
        const value = literalValue(node.arguments[0]);
        if (value !== null) report(sourceFile, node.arguments[0], `call:${callee}`, value);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

if (findings.length > 0) {
  if (process.argv.includes("--summary")) {
    const counts = new Map();
    for (const finding of findings) {
      counts.set(finding.file, (counts.get(finding.file) ?? 0) + 1);
    }
    for (const [file, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
      console.error(`${String(count).padStart(4)} ${file}`);
    }
  } else {
    for (const finding of findings) {
      console.error(`${finding.file}:${finding.line} [${finding.kind}] ${finding.value}`);
    }
  }
  console.error(`i18n coverage failed: ${findings.length} untranslated UI candidate(s).`);
  process.exit(1);
}

console.log(`i18n coverage passed: ${files.length} production TSX files checked.`);
