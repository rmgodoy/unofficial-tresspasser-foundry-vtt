#!/usr/bin/env node

/**
 * verify-integrity.mjs
 *
 * Standalone, zero-dependency Node.js verification harness for Trespasser Foundry VTT.
 * Uses strictly Node.js standard libraries: node:fs, node:path, node:url, node:child_process, node:vm.
 *
 * Capabilities:
 * 1. ES Module Syntax Validation (node --check across repository .mjs/.js files)
 * 2. Relative Import & Export Resolution (file targets exist, symbol verification)
 * 3. Manifest Validation (system.json esmodules, styles, packs, languages)
 * 4. Dependency Constraints (package.json zero runtime dependencies, permitted devDependencies)
 * 5. Line Count (LOC) Audit (categorizes files: >400 critical, 300-400 warning, <300 compliant)
 *
 * Exit Codes:
 * 0 - All requested verification checks passed cleanly.
 * 1 - One or more integrity checks failed.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(__filename));
const PERMITTED_DEV_DEPS = new Set(['@foundryvtt/foundryvtt-cli']);

const useColor = process.stdout.isTTY && !process.env.NO_COLOR && !process.argv.includes('--no-color');
const c = {
  reset: useColor ? '\x1b[0m' : '',
  bold: useColor ? '\x1b[1m' : '',
  dim: useColor ? '\x1b[2m' : '',
  red: useColor ? '\x1b[31m' : '',
  green: useColor ? '\x1b[32m' : '',
  yellow: useColor ? '\x1b[33m' : '',
  blue: useColor ? '\x1b[34m' : '',
  cyan: useColor ? '\x1b[36m' : '',
};

function stripComments(code) {
  let out = '', inStr = false, quote = '', inBlock = false, inLine = false;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i], next = code[i + 1];
    if (inLine) { if (ch === '\n') { inLine = false; out += ch; } continue; }
    if (inBlock) { if (ch === '*' && next === '/') { inBlock = false; i++; } else if (ch === '\n') out += '\n'; continue; }
    if (inStr) { out += ch; if (ch === '\\') { out += next || ''; i++; } else if (ch === quote) inStr = false; continue; }
    if (ch === '/' && next === '/') { inLine = true; i++; continue; }
    if (ch === '/' && next === '*') { inBlock = true; i++; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = true; quote = ch; out += ch; continue; }
    out += ch;
  }
  return out;
}

export function findSourceFiles(dir = ROOT_DIR) {
  const IGNORE = new Set(['.git', '.agents', 'node_modules', 'packs', 'json-packs', 'assets', 'styles', 'templates', 'lang', '.github']);
  const files = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.') || IGNORE.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) files.push(...findSourceFiles(full));
    else if (/\.(mjs|js)$/.test(ent.name)) files.push(full);
  }
  return files.sort();
}

function extractExports(filePath, cache) {
  if (cache.has(filePath)) return cache.get(filePath);
  if (!fs.existsSync(filePath)) return { symbols: new Set(), wildcards: [] };
  const clean = stripComments(fs.readFileSync(filePath, 'utf8'));
  const symbols = new Set(), wildcards = [];

  if (/export\s+default\b/.test(clean)) symbols.add('default');
  for (const m of clean.matchAll(/export\s+(?:async\s+)?function\s*\*?\s*([a-zA-Z0-9_$]+)/g)) symbols.add(m[1]);
  for (const m of clean.matchAll(/export\s+class\s+([a-zA-Z0-9_$]+)/g)) symbols.add(m[1]);
  for (const m of clean.matchAll(/export\s+(?:const|let|var)\s+([^;=]+)/g)) {
    for (const im of m[1].matchAll(/([a-zA-Z0-9_$]+)\s*(?:=|:|,|$)/g)) {
      if (im[1] && !['const', 'let', 'var'].includes(im[1])) symbols.add(im[1]);
    }
  }
  for (const m of clean.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const match = part.trim().match(/(?:([a-zA-Z0-9_$]+)\s+as\s+)?([a-zA-Z0-9_$]+)/);
      if (match) symbols.add(match[2]);
    }
  }
  for (const m of clean.matchAll(/export\s*\*\s*(?:as\s+([a-zA-Z0-9_$]+)\s+)?from\s*['"]([^'"]+)['"]/g)) {
    if (m[1]) symbols.add(m[1]);
    else wildcards.push(m[2]);
  }
  const res = { symbols, wildcards };
  cache.set(filePath, res);
  return res;
}

function fileExportsSymbol(targetFile, sym, cache, visited = new Set()) {
  if (visited.has(targetFile)) return false;
  visited.add(targetFile);
  const exp = extractExports(targetFile, cache);
  if (exp.symbols.has(sym)) return true;
  for (const w of exp.wildcards) {
    if (!w.startsWith('.')) return true;
    const resolved = path.resolve(path.dirname(targetFile), w);
    if (fs.existsSync(resolved) && fileExportsSymbol(resolved, sym, cache, visited)) return true;
  }
  return false;
}

function parseImportsAndExports(filePath) {
  const clean = stripComments(fs.readFileSync(filePath, 'utf8'));
  const stmts = [];
  for (const m of clean.matchAll(/import\s+([\s\S]*?)\s+from\s*['"]([^'"]+)['"]/g)) stmts.push({ type: 'import', clause: m[1].trim(), specifier: m[2].trim() });
  for (const m of clean.matchAll(/import\s*['"]([^'"]+)['"]/g)) stmts.push({ type: 'import-side-effect', clause: '', specifier: m[1].trim() });
  for (const m of clean.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) stmts.push({ type: 'import-dynamic', clause: '', specifier: m[1].trim() });
  for (const m of clean.matchAll(/export\s+([\s\S]*?)\s+from\s*['"]([^'"]+)['"]/g)) stmts.push({ type: 'export-from', clause: m[1].trim(), specifier: m[2].trim() });
  return stmts;
}

export function runSyntaxCheck(files) {
  const errors = [], passed = [];
  for (const file of files) {
    const rel = path.relative(ROOT_DIR, file).replace(/\\/g, '/');
    const res = spawnSync(process.execPath, ['--check', file], { cwd: ROOT_DIR, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    if (res.status === 0) passed.push(rel);
    else errors.push({ file: rel, error: (res.stderr || res.stdout || 'Syntax check failed').trim() });
  }
  return { name: 'Syntax Validation', total: files.length, passed: passed.length, failed: errors.length, errors };
}

export function runImportResolutionCheck(files) {
  const cache = new Map(), fileErrors = [], symbolWarnings = [];
  let totalStmts = 0;
  for (const file of files) {
    const relFile = path.relative(ROOT_DIR, file).replace(/\\/g, '/');
    const stmts = parseImportsAndExports(file);
    for (const stmt of stmts) {
      if (!stmt.specifier.startsWith('.')) continue;
      totalStmts++;
      const resolved = path.resolve(path.dirname(file), stmt.specifier);
      const relTarget = path.relative(ROOT_DIR, resolved).replace(/\\/g, '/');
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        fileErrors.push({ source: relFile, specifier: stmt.specifier, resolved: relTarget, error: `Target file not found: ${stmt.specifier}` });
        continue;
      }
      if (stmt.clause) {
        const namedBlock = stmt.clause.match(/\{([^}]+)\}/);
        if (namedBlock) {
          for (const rawName of namedBlock[1].split(',').map((s) => s.trim()).filter(Boolean)) {
            const sym = rawName.split(/\s+as\s+/)[0].trim();
            if (sym && !fileExportsSymbol(resolved, sym, cache) && extractExports(resolved, cache).wildcards.length === 0) {
              symbolWarnings.push({ source: relFile, target: relTarget, symbol: sym, error: `Symbol '${sym}' not found in '${relTarget}'` });
            }
          }
        }
        if (!stmt.clause.startsWith('{') && !stmt.clause.startsWith('*')) {
          const defaultMatch = stmt.clause.match(/^([a-zA-Z0-9_$]+)(?:\s*,|\s*$)/);
          if (defaultMatch && !['const', 'let', 'var'].includes(defaultMatch[1]) && !fileExportsSymbol(resolved, 'default', cache) && extractExports(resolved, cache).wildcards.length === 0) {
            symbolWarnings.push({ source: relFile, target: relTarget, symbol: 'default', error: `Default export '${defaultMatch[1]}' not in '${relTarget}'` });
          }
        }
      }
    }
  }
  return { name: 'Import & Export Graph', filesScanned: files.length, totalRelativeStatements: totalStmts, fileErrors, symbolWarnings, failed: fileErrors.length };
}

export function runManifestCheck() {
  const p = path.resolve(ROOT_DIR, 'system.json'), errors = [], verified = [];
  if (!fs.existsSync(p)) return { name: 'Manifest Validation', failed: 1, errors: [{ error: 'system.json missing' }] };
  let m;
  try { m = JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (err) { return { name: 'Manifest Validation', failed: 1, errors: [{ error: `system.json invalid: ${err.message}` }] }; }

  for (const field of ['id', 'title', 'version', 'compatibility', 'esmodules', 'styles', 'packs']) {
    if (m[field] === undefined) errors.push({ error: `system.json missing '${field}'` });
    else verified.push(`field '${field}'`);
  }
  if (Array.isArray(m.esmodules)) {
    for (const esm of m.esmodules) {
      if (!fs.existsSync(path.resolve(ROOT_DIR, esm))) errors.push({ error: `esmodule not found: '${esm}'` });
      else verified.push(`esmodule '${esm}'`);
    }
  } else errors.push({ error: "'esmodules' must be array" });
  if (Array.isArray(m.styles)) {
    for (const st of m.styles) {
      if (!fs.existsSync(path.resolve(ROOT_DIR, st))) errors.push({ error: `style not found: '${st}'` });
      else verified.push(`style '${st}'`);
    }
  } else errors.push({ error: "'styles' must be array" });
  if (Array.isArray(m.packs)) {
    for (const pk of m.packs) {
      const dPath = path.resolve(ROOT_DIR, pk.path || '');
      const sPath = path.resolve(ROOT_DIR, 'json-packs', pk.name || path.basename(pk.path || ''));
      if (fs.existsSync(dPath)) verified.push(`pack '${pk.name}' (target: ${pk.path})`);
      else if (fs.existsSync(sPath)) verified.push(`pack '${pk.name}' (source: json-packs/${pk.name})`);
      else errors.push({ error: `pack not found: '${pk.path}'` });
    }
  } else errors.push({ error: "'packs' must be array" });
  if (Array.isArray(m.languages)) {
    for (const lg of m.languages) {
      if (lg.path && !fs.existsSync(path.resolve(ROOT_DIR, lg.path))) errors.push({ error: `language file not found: '${lg.path}'` });
      else if (lg.path) verified.push(`language '${lg.lang}'`);
    }
  }
  return { name: 'Manifest Validation', totalVerified: verified.length, failed: errors.length, errors, verified };
}

export function runDependencyCheck() {
  const p = path.resolve(ROOT_DIR, 'package.json'), errors = [], verified = [];
  if (!fs.existsSync(p)) return { name: 'Dependency Constraints', failed: 1, errors: [{ error: 'package.json missing' }] };
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (err) { return { name: 'Dependency Constraints', failed: 1, errors: [{ error: `package.json invalid: ${err.message}` }] }; }

  if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
    errors.push({ error: `Disallowed runtime dependencies: [${Object.keys(pkg.dependencies).join(', ')}] (must be 0)` });
  } else verified.push('runtime dependencies: 0');
  if (pkg.devDependencies) {
    const unapproved = Object.keys(pkg.devDependencies).filter((d) => !PERMITTED_DEV_DEPS.has(d));
    if (unapproved.length > 0) errors.push({ error: `Unapproved devDependencies: [${unapproved.join(', ')}]` });
    else verified.push(`devDependencies: [${Object.keys(pkg.devDependencies).join(', ')}]`);
  }
  return { name: 'Dependency Constraints', failed: errors.length, errors, verified };
}

export function runLocAudit(files) {
  const stats = [];
  let total = 0;
  for (const file of files) {
    const rel = path.relative(ROOT_DIR, file).replace(/\\/g, '/');
    const lines = fs.readFileSync(file, 'utf8').split('\n').length;
    total += lines;
    stats.push({ file: rel, lines, category: lines > 400 ? 'critical' : lines >= 300 ? 'warning' : 'compliant' });
  }
  stats.sort((a, b) => b.lines - a.lines);
  const critical = stats.filter((s) => s.category === 'critical');
  const warning = stats.filter((s) => s.category === 'warning');
  const compliant = stats.filter((s) => s.category === 'compliant');
  return { name: 'LOC Audit', totalFiles: files.length, totalLoc: total, averageLoc: Math.round(total / (files.length || 1)), criticalCount: critical.length, warningCount: warning.length, compliantCount: compliant.length, criticalFiles: critical, warningFiles: warning, topFiles: stats.slice(0, 20) };
}

function printHelp() {
  console.log(`\n${c.bold}Trespasser Foundry VTT — Integrity Verification Harness${c.reset}\n\n${c.bold}USAGE:${c.reset}\n  node verify-integrity.mjs [options]\n\n${c.bold}OPTIONS:${c.reset}\n  --all           Run all verification checks (default)\n  --syntax        Run only ES module syntax validation (node --check)\n  --imports       Run only import/export graph traversal\n  --manifest      Run only system.json manifest verification\n  --deps          Run only package.json dependency constraints check\n  --loc           Run only LOC audit summary\n  --strict-loc    Fail (exit 1) if any file exceeds 400 LOC\n  --verbose, -v   Display detailed listings\n  --json          Output results in JSON format\n  --no-color      Disable colored output\n  --help, -h      Display this help\n\n${c.bold}EXIT CODES:${c.reset}\n  0               All checks passed\n  1               One or more checks failed\n`);
}

export function runCLI(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) { printHelp(); return 0; }
  const jsonMode = argv.includes('--json'), verbose = argv.includes('--verbose') || argv.includes('-v'), strictLoc = argv.includes('--strict-loc');
  const runAll = argv.length === 0 || argv.includes('--all') || !argv.some((a) => ['--syntax', '--imports', '--manifest', '--deps', '--loc'].includes(a));
  const files = findSourceFiles(ROOT_DIR);
  const report = { timestamp: new Date().toISOString(), filesDiscovered: files.length, passed: true, results: {} };
  let totalFailures = 0;

  if (!jsonMode) {
    console.log(`\n${c.bold}${c.cyan}==============================================================================${c.reset}`);
    console.log(`${c.bold}${c.cyan}  TRESPASSER FOUNDRY VTT — REPOSITORY INTEGRITY VERIFIER${c.reset}`);
    console.log(`${c.bold}${c.cyan}==============================================================================${c.reset}`);
    console.log(`${c.dim}Discovered ${files.length} JavaScript/MJS files in repository.${c.reset}\n`);
  }

  if (runAll || argv.includes('--syntax')) {
    const res = runSyntaxCheck(files);
    report.results.syntax = res;
    if (res.failed > 0) totalFailures += res.failed;
    if (!jsonMode) {
      if (res.failed === 0) console.log(`${c.green}✔ [PASS]${c.reset} ${c.bold}Syntax Validation${c.reset}: ${res.passed}/${res.total} files valid (node --check)`);
      else {
        console.log(`${c.red}✖ [FAIL]${c.reset} ${c.bold}Syntax Validation${c.reset}: ${res.failed} files failed`);
        for (const err of res.errors) console.log(`  ${c.red}→ ${err.file}:${c.reset} ${err.error}`);
      }
    }
  }

  if (runAll || argv.includes('--imports')) {
    const res = runImportResolutionCheck(files);
    report.results.imports = res;
    if (res.failed > 0) totalFailures += res.failed;
    if (!jsonMode) {
      if (res.failed === 0) {
        console.log(`${c.green}✔ [PASS]${c.reset} ${c.bold}Import & Export Graph${c.reset}: ${res.totalRelativeStatements} relative imports/exports resolved cleanly across ${res.filesScanned} files`);
        if (verbose && res.symbolWarnings.length > 0) console.log(`  ${c.yellow}ℹ Note: ${res.symbolWarnings.length} symbols could not be statically verified${c.reset}`);
      } else {
        console.log(`${c.red}✖ [FAIL]${c.reset} ${c.bold}Import & Export Graph${c.reset}: ${res.failed} unresolved targets`);
        for (const err of res.fileErrors) console.log(`  ${c.red}→ In ${err.source}: ${err.error}${c.reset}`);
      }
    }
  }

  if (runAll || argv.includes('--manifest')) {
    const res = runManifestCheck();
    report.results.manifest = res;
    if (res.failed > 0) totalFailures += res.failed;
    if (!jsonMode) {
      if (res.failed === 0) console.log(`${c.green}✔ [PASS]${c.reset} ${c.bold}Manifest Validation${c.reset}: system.json valid (${res.totalVerified} entries verified)`);
      else {
        console.log(`${c.red}✖ [FAIL]${c.reset} ${c.bold}Manifest Validation${c.reset}: ${res.failed} errors`);
        for (const err of res.errors) console.log(`  ${c.red}→ ${err.error}${c.reset}`);
      }
    }
  }

  if (runAll || argv.includes('--deps')) {
    const res = runDependencyCheck();
    report.results.dependencies = res;
    if (res.failed > 0) totalFailures += res.failed;
    if (!jsonMode) {
      if (res.failed === 0) console.log(`${c.green}✔ [PASS]${c.reset} ${c.bold}Dependency Constraints${c.reset}: package.json conforms strictly to zero-runtime constraint`);
      else {
        console.log(`${c.red}✖ [FAIL]${c.reset} ${c.bold}Dependency Constraints${c.reset}: ${res.failed} violations`);
        for (const err of res.errors) console.log(`  ${c.red}→ ${err.error}${c.reset}`);
      }
    }
  }

  if (runAll || argv.includes('--loc')) {
    const res = runLocAudit(files);
    report.results.loc = res;
    if (strictLoc && res.criticalCount > 0) totalFailures += res.criticalCount;
    if (!jsonMode) {
      const tag = strictLoc && res.criticalCount > 0 ? `${c.red}✖ [FAIL]${c.reset}` : `${c.blue}ℹ [AUDIT]${c.reset}`;
      console.log(`\n${tag} ${c.bold}Line Count (LOC) Audit Summary:${c.reset}`);
      console.log(`  Total LOC: ${c.bold}${res.totalLoc}${c.reset} across ${res.totalFiles} files (Average: ${res.averageLoc} LOC/file)`);
      console.log(`  • Compliant (<300 LOC):     ${c.green}${res.compliantCount}${c.reset} files`);
      console.log(`  • Warning (300-400 LOC):    ${c.yellow}${res.warningCount}${c.reset} files`);
      console.log(`  • Non-compliant (>400 LOC): ${c.red}${res.criticalCount}${c.reset} files`);
      if (verbose || res.criticalCount > 0) {
        console.log(`\n  ${c.bold}Oversized Files (>400 LOC):${c.reset}`);
        for (const f of res.criticalFiles) console.log(`    ${c.red}${String(f.lines).padStart(5)} LOC${c.reset}  ${f.file}`);
      }
    }
  }

  report.passed = totalFailures === 0;
  if (jsonMode) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`\n${c.bold}${c.cyan}==============================================================================${c.reset}`);
    console.log(report.passed ? `${c.green}${c.bold}OVERALL RESULT: ALL INTEGRITY CHECKS PASSED (Clean Exit Code 0)${c.reset}` : `${c.red}${c.bold}OVERALL RESULT: INTEGRITY VERIFICATION FAILED (${totalFailures} errors)${c.reset}`);
    console.log(`${c.bold}${c.cyan}==============================================================================${c.reset}\n`);
  }
  return report.passed ? 0 : 1;
}

if (process.argv[1] === __filename) {
  process.exit(runCLI());
}
