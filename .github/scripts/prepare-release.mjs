import fs from 'node:fs';
import path from 'node:path';

// Read system.json without modifying its version
const systemRaw = fs.readFileSync('system.json', 'utf8');
const system = JSON.parse(systemRaw);
const version = system.version;

// Determine if this is a beta release
const isBeta = process.env.IS_BETA === 'true' || system.id.endsWith('-beta');
const baseId = system.id.replace(/-beta$/, '');

if (isBeta) {
  const betaId = `${baseId}-beta`;
  system.id = betaId;
  if (!system.title.includes('Beta')) {
    system.title = `${system.title.trim()} (Beta)`;
  }
  console.log(`Beta release mode enabled. System ID: ${system.id}`);

  // Helper function to perform search and replace in a single file
  function replaceInFile(filePath, replacements) {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    for (const [from, to] of replacements) {
      if (content.includes(from)) {
        content = content.replaceAll(from, to);
        modified = true;
      }
    }
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
    }
    return modified;
  }

  // Helper function to recursively search and replace in a directory
  function replaceInDir(dirPath, replacements, extensions) {
    if (!fs.existsSync(dirPath)) return 0;
    let count = 0;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        count += replaceInDir(fullPath, replacements, extensions);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (!extensions || extensions.includes(ext)) {
          if (replaceInFile(fullPath, replacements)) {
            count++;
          }
        }
      }
    }
    return count;
  }

  const replacements = [
    [`systems/${baseId}/`, `systems/${betaId}/`],
    [`system/${baseId}/`, `systems/${betaId}/`],
  ];

  let totalModified = 0;
  totalModified += replaceInDir('json-packs', replacements, ['.json']);
  totalModified += replaceInDir('module', replacements, ['.js', '.mjs']);
  totalModified += replaceInDir('templates', replacements, ['.hbs', '.html']);
  totalModified += replaceInDir('styles', replacements, ['.css']);
  if (fs.existsSync('trespasser.mjs')) {
    if (replaceInFile('trespasser.mjs', replacements)) {
      totalModified++;
    }
  }
  console.log(`Updated paths in ${totalModified} files from systems/${baseId}/ to systems/${betaId}/`);
} else {
  console.log(`Standard release mode. System ID: ${system.id}`);
}

// Determine release tag: use manual input if provided, otherwise default to v<version>
let tag = (process.env.INPUT_TAG_NAME || '').trim();
if (!tag) {
  tag = `v${version}`;
}

console.log(`System version: ${version}`);
console.log(`Release tag: ${tag}`);

/**
 * Extracts the release notes for a given version from CHANGELOG.md.
 * Scans line by line from the version header to the next heading.
 */
function extractChangelog(changelogContent, targetVersion) {
  const lines = changelogContent.split(/\r?\n/);
  const versionsToTry = [targetVersion];
  if (targetVersion.includes('-')) {
    versionsToTry.push(targetVersion.split('-')[0]);
  }

  for (const v of versionsToTry) {
    const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const headerRegex = new RegExp(`^##\\s+\\[?v?${escaped}\\]?(?:\\s+-.*)?$`, 'i');

    let capturing = false;
    const capturedLines = [];

    for (const line of lines) {
      if (!capturing) {
        if (headerRegex.test(line.trim())) {
          capturing = true;
        }
      } else {
        // Stop capturing when next level-2 or level-1 heading is encountered
        if (/^##?\s+/.test(line.trim())) {
          break;
        }
        capturedLines.push(line);
      }
    }

    const result = capturedLines.join('\n').trim();
    if (result) {
      console.log(`Found changelog notes for version: ${v}`);
      return result;
    }
  }

  return '';
}

let releaseNotes = '';
if (fs.existsSync('CHANGELOG.md')) {
  const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
  releaseNotes = extractChangelog(changelog, version);
}

if (!releaseNotes) {
  console.log('No specific changelog section found, falling back to release tag header.');
  releaseNotes = `Release ${tag}`;
}

fs.writeFileSync('release_notes.md', releaseNotes + '\n');

// Update manifest and download URLs in system.json for the release distribution asset
system.manifest = 'https://github.com/rmgodoy/unofficial-tresspasser-foundry-vtt/releases/latest/download/system.json';
system.download = `https://github.com/rmgodoy/unofficial-tresspasser-foundry-vtt/releases/download/${tag}/system.zip`;
fs.writeFileSync('system.json', JSON.stringify(system, null, 2) + '\n');

// Output variables for subsequent GitHub Actions steps
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `id=${system.id}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `tag=${tag}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `is_beta=${isBeta}\n`);
}
