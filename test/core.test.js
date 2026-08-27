import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  normalizeNotebookPath,
  remoteNotebookPath,
  resolveLocalMirrorPath,
  selectExactSession,
} from '../lib/core.js';

test('normalizes safe notebook paths and rejects escapes', () => {
  assert.equal(normalizeNotebookPath('folder/../demo.ipynb'), 'demo.ipynb');
  assert.throws(() => normalizeNotebookPath('../secret.ipynb'), /escapes/);
  assert.throws(() => normalizeNotebookPath('/absolute.ipynb'), /relative/);
  assert.throws(() => normalizeNotebookPath('notes.txt'), /\.ipynb/);
});

test('builds remote and local paths under configured roots', () => {
  assert.equal(remoteNotebookPath('/home/aiuser/work', 'a/demo.ipynb'), '/home/aiuser/work/a/demo.ipynb');
  const root = path.join(os.tmpdir(), 'jupyter-local-root');
  assert.equal(resolveLocalMirrorPath(root, 'a/demo.ipynb'), path.join(root, 'a', 'demo.ipynb'));
});

test('session selection uses exact normalized paths, not basename substrings', () => {
  const sessions = [
    { id: 'wrong', path: 'archive/demo.ipynb.bak.ipynb' },
    { id: 'right', path: 'research/demo.ipynb' },
  ];
  assert.equal(selectExactSession(sessions, 'research/demo.ipynb').id, 'right');
  assert.equal(selectExactSession(sessions, 'demo.ipynb'), undefined);
});
