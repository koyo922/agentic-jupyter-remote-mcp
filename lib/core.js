import path from 'node:path';

export function normalizeNotebookPath(notebookPath) {
  if (typeof notebookPath !== 'string' || notebookPath.trim() === '') {
    throw new Error('Notebook path must be a non-empty string');
  }
  if (notebookPath.includes('\\')) {
    throw new Error('Notebook path must use POSIX separators');
  }
  if (path.posix.isAbsolute(notebookPath)) {
    throw new Error('Notebook path must be relative to JUPYTER_NOTEBOOKS');
  }
  const normalized = path.posix.normalize(notebookPath);
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw new Error('Notebook path escapes JUPYTER_NOTEBOOKS');
  }
  if (!normalized.endsWith('.ipynb')) {
    throw new Error('Notebook path must end with .ipynb');
  }
  return normalized;
}

export function remoteNotebookPath(root, notebookPath) {
  return path.posix.join(root, normalizeNotebookPath(notebookPath));
}

export function resolveLocalMirrorPath(root, notebookPath) {
  const normalized = normalizeNotebookPath(notebookPath);
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, ...normalized.split('/'));
  const relative = path.relative(resolvedRoot, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Local mirror path escapes JUPYTER_LOCAL_ROOT');
  }
  return target;
}

export function selectExactSession(sessions, notebookPath) {
  const normalized = normalizeNotebookPath(notebookPath);
  return sessions.find(session => {
    const sessionPath = session?.path ?? session?.notebook?.path;
    if (typeof sessionPath !== 'string') return false;
    try {
      return normalizeNotebookPath(sessionPath) === normalized;
    } catch {
      return false;
    }
  });
}

export function sanitizeBaseUrl(baseUrl) {
  const parsed = new URL(baseUrl);
  parsed.username = '';
  parsed.password = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}
