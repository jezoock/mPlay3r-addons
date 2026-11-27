import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { MPlay3rPlugin, PluginManifest } from '../sdk/types';

const root = fileURLToPath(new URL('..', import.meta.url));

describe('Official registry.json & SHA-256 verified bundles', () => {
  it('validates schemaVersion, SHA-256 digests, sizes, and dynamic ESM loading for every addon', async () => {
    const registryPath = path.join(root, 'registry.json');
    const doc = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as {
      schemaVersion: number;
      name: string;
      plugins: PluginManifest[];
    };

    assert.equal(doc.schemaVersion, 1);
    assert.ok(doc.plugins.length >= 3, 'Expected at least mplay3r.radio, mplay3r.radio-freebox, and mplay3r.podcasts');
    const ids = new Set(doc.plugins.map(p => p.id));
    assert.ok(ids.has('mplay3r.radio'));
    assert.ok(ids.has('mplay3r.radio-freebox'));
    assert.ok(ids.has('mplay3r.podcasts'));

    for (const entry of doc.plugins) {
      assert.ok(entry.entry && entry.entry.startsWith('./dist/'), `Unexpected entry path for ${entry.id}`);
      assert.match(entry.sha256 || '', /^[a-f0-9]{64}$/, `Invalid sha256 for ${entry.id}`);

      const bundlePath = path.resolve(root, entry.entry);
      const bytes = fs.readFileSync(bundlePath);
      const actualHash = createHash('sha256').update(bytes).digest('hex');

      assert.equal(actualHash, entry.sha256, `SHA-256 mismatch for ${entry.id}`);
      assert.equal(bytes.byteLength, entry.sizeBytes, `sizeBytes mismatch for ${entry.id}`);

      const mod = (await import(pathToFileURL(bundlePath).href)) as { default?: MPlay3rPlugin; plugin?: MPlay3rPlugin };
      const plugin = mod.default ?? mod.plugin;
      assert.ok(plugin && typeof plugin.activate === 'function', `${entry.id} bundle must export activate()`);
      assert.equal(plugin.manifest.id, entry.id);
      assert.equal(plugin.manifest.version, entry.version);
    }
  });
});
