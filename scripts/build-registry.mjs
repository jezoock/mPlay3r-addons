// Zero-dependency Node 22 plugin bundler & SHA-256 registry generator for mPlay3r-addons.
// Compiles plugins/<dir>/src/*.ts into self-contained browser ESM bundles (dist/<dir>.js)
// using Node 22 built-in stripTypeScriptTypes and emits a deterministic registry.json.
//
// Usage:
//   node scripts/build-registry.mjs          # Build dist/*.js and write registry.json
//   node scripts/build-registry.mjs --check  # Verify dist/*.js and registry.json are up-to-date & loadable

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const pluginsDir = path.join(root, 'plugins');
const distDir = path.join(root, 'dist');
const registryPath = path.join(root, 'registry.json');
const checkOnly = process.argv.includes('--check');

function resolveLocalTs(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [base, `${base}.ts`, path.join(base, 'index.ts')];
  return candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}

function collectModuleGraph(entryFile, srcRoot) {
  const visited = new Set();
  const ordered = [];
  const importRe = /^\s*import\s+(?:type\s+)?[\s\S]*?\bfrom\s+['"]([^'"]+)['"];?\s*$/gm;

  function visit(file) {
    if (visited.has(file)) {
      return;
    }
    visited.add(file);
    const raw = fs.readFileSync(file, 'utf8');
    for (const match of raw.matchAll(importRe)) {
      const fullStmt = match[0];
      const spec = match[1];
      if (/^\s*import\s+type\b/.test(fullStmt) || !spec.startsWith('.')) {
        continue;
      }
      const target = resolveLocalTs(file, spec);
      if (target && target.startsWith(srcRoot)) {
        visit(target);
      }
    }
    ordered.push(file);
  }

  visit(entryFile);
  return ordered;
}

function transformModule(filePath, isEntry) {
  const tsSource = fs.readFileSync(filePath, 'utf8');
  let js = stripTypeScriptTypes(tsSource, { mode: 'transform' });

  // Strip import statements (single-line and multi-line) because dependencies are inlined above.
  js = js.replace(/^\s*import\s+[\s\S]*?\bfrom\s+['"][^'"]+['"];?\s*$/gm, '');
  js = js.replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '');

  if (!isEntry) {
    js = js.replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|var|class)\b)/gm, '');
    js = js.replace(/^export\s*\{[\s\S]*?\};?\s*$/gm, '');
  }

  // Collapse runs of >2 empty lines left by stripped type declarations.
  return js
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function bundlePlugin(pluginFolderName) {
  const dir = path.join(pluginsDir, pluginFolderName);
  const manifestFile = path.join(dir, 'manifest.json');
  const srcDir = path.join(dir, 'src');
  const entryFile = path.join(srcDir, 'index.ts');

  if (!fs.existsSync(manifestFile)) {
    throw new Error(`Missing manifest.json in plugins/${pluginFolderName}`);
  }
  if (!fs.existsSync(entryFile)) {
    throw new Error(`Missing src/index.ts in plugins/${pluginFolderName}`);
  }

  const rawManifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const files = collectModuleGraph(entryFile, srcDir);
  const chunks = files.map((file, idx) => transformModule(file, idx === files.length - 1));

  const header = `// mPlay3r addon bundle: ${rawManifest.id}@${rawManifest.version} (generated from plugins/${pluginFolderName}/src)\n`;
  const bundleText = `${header}\n${chunks.filter(Boolean).join('\n\n')}\n`;
  const bundleBytes = Buffer.from(bundleText, 'utf8');
  const sha256 = createHash('sha256').update(bundleBytes).digest('hex');

  const manifest = {
    ...rawManifest,
    entry: `./dist/${pluginFolderName}.js`,
    sha256,
    sizeBytes: bundleBytes.byteLength,
  };

  return {
    folder: pluginFolderName,
    distFile: path.join(distDir, `${pluginFolderName}.js`),
    bundleBytes,
    manifest,
  };
}

async function verifyLoadedBundle(distFile, expectedManifest) {
  const mod = await import(`${pathToFileURL(distFile).href}?check=${Date.now()}`);
  const plugin = mod.default ?? mod.plugin;
  if (!plugin || typeof plugin.activate !== 'function' || !plugin.manifest) {
    throw new Error(`Bundle ${path.basename(distFile)} does not export a valid MPlay3rPlugin default/plugin object.`);
  }
  if (plugin.manifest.id !== expectedManifest.id || plugin.manifest.version !== expectedManifest.version) {
    throw new Error(
      `Bundle ${path.basename(distFile)} manifest mismatch: got ${plugin.manifest.id}@${plugin.manifest.version}, expected ${expectedManifest.id}@${expectedManifest.version}`,
    );
  }
}

async function main() {
  if (!fs.existsSync(pluginsDir)) {
    throw new Error('plugins/ directory not found');
  }

  const pluginFolders = fs
    .readdirSync(pluginsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();

  const built = pluginFolders.map(bundlePlugin).sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
  const registryDoc = {
    schemaVersion: 1,
    name: 'mPlay3r Official Addons',
    plugins: built.map(item => item.manifest),
  };
  const registryText = `${JSON.stringify(registryDoc, null, 2)}\n`;

  if (checkOnly) {
    const errors = [];
    if (!fs.existsSync(registryPath)) {
      errors.push('Missing root registry.json (run npm run build:registry).');
    } else if (fs.readFileSync(registryPath, 'utf8') !== registryText) {
      errors.push('registry.json is out of date with plugins/ sources (run npm run build:registry).');
    }

    for (const item of built) {
      if (!fs.existsSync(item.distFile)) {
        errors.push(`Missing dist/${item.folder}.js (run npm run build:registry).`);
        continue;
      }
      const existing = fs.readFileSync(item.distFile);
      const actualHash = createHash('sha256').update(existing).digest('hex');
      if (actualHash !== item.manifest.sha256) {
        errors.push(`SHA-256 mismatch for dist/${item.folder}.js: expected ${item.manifest.sha256}, got ${actualHash}`);
        continue;
      }
      await verifyLoadedBundle(item.distFile, item.manifest);
    }

    if (errors.length > 0) {
      console.error('Registry verification failed:');
      for (const err of errors) {
        console.error(`  - ${err}`);
      }
      process.exit(1);
    }
    console.log(`Verified ${built.length} plugin bundle(s) and SHA-256 digests in registry.json.`);
    return;
  }

  fs.mkdirSync(distDir, { recursive: true });
  for (const item of built) {
    fs.writeFileSync(item.distFile, item.bundleBytes);
    await verifyLoadedBundle(item.distFile, item.manifest);
    console.log(
      `  built dist/${item.folder}.js (${(item.bundleBytes.byteLength / 1024).toFixed(2)} KB) sha256=${item.manifest.sha256.slice(0, 16)}…`,
    );
  }
  fs.writeFileSync(registryPath, registryText, 'utf8');
  console.log(`Wrote registry.json with ${built.length} verified plugin(s).`);
}

await main();
