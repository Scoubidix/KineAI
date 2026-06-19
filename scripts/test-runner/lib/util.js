// Retire les codes couleur ANSI des messages d'erreur (Jest/Playwright en colorisent).
function stripAnsi(str) {
  if (!str) return '';
  // eslint-disable-next-line no-control-regex
  // Retire les codes couleur ANSI (séquences ESC[…m) des messages d'erreur.
  return String(str).replace(/\x1b\[[0-9;]*m/g, '');
}

// Découpe un buffer stdout/stderr en lignes et les transmet à onLog.
function streamLines(stream, onLog) {
  let buf = '';
  stream.on('data', (chunk) => {
    buf += chunk.toString();
    const lines = buf.split(/\r?\n/);
    buf = lines.pop();
    for (const line of lines) if (onLog) onLog(line);
  });
  stream.on('end', () => { if (buf && onLog) onLog(buf); });
}

module.exports = { stripAnsi, streamLines };
