import fs from "fs";

const r = JSON.parse(fs.readFileSync("scripts/deep-audit-results.json", "utf-8"));
const nonRef = r.filter(x => x.type !== "Reference Node in Flow");
console.log("Count of semantic mistakes:", nonRef.length);
nonRef.forEach((x, i) => {
  console.log(`${i + 1}. [${x.type}] ${x.deed} (${x.file})`);
  console.log(`   Issue: ${x.description}`);
  console.log(`   Fix: ${x.fix}`);
});
