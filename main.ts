// Token Radar — the entrypoint (Node 22, standard library only).
//
// Reads the sealed snapshot from /input/snapshot.json (or --input
// <file|dir>), scores every genuine pre-token protocol with the model in
// lib/model.ts, writes the ranked board to /output/board.json, writes the
// dashboard's data beside the page as data.js, copies this repository's
// dashboard/ and screenshots/ to /output, and writes /output/dossier.json
// with the vendored make.fun library — the summary the judge reads.
//
// The run is deterministic: the same snapshot bytes always produce the
// same board bytes (fixed sort ties, no clock, no network, no randomness),
// so the grader's two runs write identical files.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the text cap shapes the dossier bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function fail(message: string): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(1);
}

/** The value of --name <value> or --name=<value>, or `fallback`. */
function arg(name: string, fallback: string): string {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === `--${name}` && i + 1 < argv.length) return argv[i + 1]!;
    if (argv[i]!.startsWith(`--${name}=`)) return argv[i]!.slice(name.length + 3);
  }
  return fallback;
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  fail(`no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input`);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) fail(`the model wrote a board the gate refuses: ${issue}`);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping dot-names. Returns the copied names. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const dashboardFiles = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
if (dashboardFiles.length === 0) fail('dashboard/ holds no files to copy');
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) fail(`screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`);
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
  // The gate refuses a screenshot that is not a whole PNG or JPEG or is past
  // 512 KiB, so check the magic bytes and the size here instead of letting
  // the dossier builder be the first to notice.
  const bytes = readFileSync(join(here, 'screenshots', name));
  const isPng = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!isPng && !isJpeg) fail(`screenshots/${name}: not a PNG or JPEG file`);
  if (bytes.length > SCREENSHOT_CAPS.max_bytes) fail(`screenshots/${name}: ${bytes.length} bytes, past the 512 KiB cap`);
}
if (dashboardFiles.length < 3 || !dashboardFiles.includes('index.html')) fail('dashboard/ must hold index.html and at least one .css and one .js file');

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: TEXT_MAX_BYTES,
    screenshots: SCREENSHOT_CAPS,
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  }),
);

const top = board[0]!;
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: rank 1 is ${top.name} at $${top.implied_value_usd.toLocaleString('en-US')} implied value\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dashboardFiles.length} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
