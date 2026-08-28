import { writeFile } from "node:fs/promises";

import { buildCensusReport, scanCorpus } from "../dist/index.js";

const [corpusDirectory, revision, outFile, url] = process.argv.slice(2);
if (corpusDirectory === undefined || revision === undefined || outFile === undefined) {
  console.error("usage: scan-corpus.mjs <corpus-directory> <revision> <out-file> [corpus-url]");
  process.exit(1);
}

process.stdout.write(`Scanning ${corpusDirectory}\n`);
const scans = await scanCorpus(corpusDirectory);
process.stdout.write(`Scanned ${scans.length} extensions\n`);

const report = buildCensusReport(scans, {
  corpusRevision: revision,
  ...(url === undefined ? {} : { corpusUrl: url }),
});
await writeFile(outFile, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`Wrote ${outFile}\n`);
