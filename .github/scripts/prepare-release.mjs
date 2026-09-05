import fs from 'node:fs';

// Read system.json without modifying its version
const systemRaw = fs.readFileSync('system.json', 'utf8');
const system = JSON.parse(systemRaw);
const version = system.version;

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
}
