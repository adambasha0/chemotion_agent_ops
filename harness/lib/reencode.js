// Re-encode already-recorded takes under the current trim policy, updating
// each provenance sidecar in place. Avoids re-driving the browser just to
// change how the frames are cut.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { trimAndEncode, OUT, WORK } = require('./flows/lib');

for (const dir of fs.readdirSync(WORK)) {
  const full = path.join(WORK, dir);
  if (!fs.statSync(full).isDirectory()) continue;
  const raw = fs.readdirSync(full).find((f) => f.endsWith('.webm'));
  if (!raw) continue;
  // work/<flow_name>/ -> the asset the flow published
  const sidecar = fs.readdirSync(OUT).filter((f) => f.endsWith('.json'))
    .map((f) => ({ f, j: JSON.parse(fs.readFileSync(path.join(OUT, f))) }))
    .find((x) => x.j.work_dir === dir || x.j.flow === dir
      || x.j.script === `flows/${dir}.js`);
  if (!sidecar) { console.log(`  ?  ${dir}: no sidecar, skipped`); continue; }
  const stem = sidecar.f.replace(/\.json$/, '');
  const dest = path.join(OUT, stem + '.webp');
  if (!fs.existsSync(dest)) { console.log(`  ?  ${dir}: ${stem} is not an animation`); continue; }
  const before = fs.statSync(dest).size;
  const stats = trimAndEncode(path.join(full, raw), dest);
  const buf = fs.readFileSync(dest);
  Object.assign(sidecar.j, {
    duration_seconds: stats.seconds,
    frames: `${stats.keptFrames} kept of ${stats.sourceFrames}`,
    bytes: buf.length,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    reencoded_at: new Date().toISOString(),
  });
  fs.writeFileSync(path.join(OUT, sidecar.f), JSON.stringify(sidecar.j, null, 2));
  console.log(`  ok ${stem}: ${stats.seconds}s, ${stats.keptFrames}/${stats.sourceFrames} frames, `
    + `${Math.round(before / 1024)} -> ${Math.round(buf.length / 1024)} KB`);
}
