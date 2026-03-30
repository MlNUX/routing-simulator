import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sveld } from 'sveld';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const outDir = path.join(repoRoot, 'docs', 'api');
await mkdir(outDir, { recursive: true });

await sveld({
	input: 'src/lib/components/index.js',
	markdown: true,
	markdownOptions: {
		outFile: 'docs/api/index.md'
	},
	types: false
});
