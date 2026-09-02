import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.resolve(scriptDir, '..');
const sourceDir = path.join(workspaceDir, 'frontend-react', 'dist');
const targetDir = path.join(workspaceDir, 'backend', 'static');

await mkdir(targetDir, { recursive: true });
await cp(sourceDir, targetDir, { recursive: true, force: true });
console.log(`Frontend synced to ${targetDir}`);
