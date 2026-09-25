'use strict';

const fs = require('fs');
const path = require('path');

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  if (!raw.trim()) throw new Error('Data file is empty.');
  return JSON.parse(raw);
}

function loadDataWithRecovery(dataFilePath, backupsDir, onError = () => {}) {
  if (fs.existsSync(dataFilePath)) {
    try {
      return readJson(dataFilePath);
    } catch (err) {
      onError(err);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      try {
        fs.renameSync(dataFilePath, `${dataFilePath}.corrupt-${stamp}`);
      } catch (renameError) {
        onError(renameError);
        return null;
      }
    }
  }

  if (!fs.existsSync(backupsDir)) return null;
  const backups = fs
    .readdirSync(backupsDir)
    .filter((name) => name.startsWith('backup-') && name.endsWith('.json'))
    .sort()
    .reverse();
  for (const backup of backups) {
    try {
      const recovered = readJson(path.join(backupsDir, backup));
      const tmpPath = `${dataFilePath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(recovered, null, 2), 'utf-8');
      fs.renameSync(tmpPath, dataFilePath);
      return recovered;
    } catch (err) {
      onError(err);
    }
  }
  return null;
}

module.exports = { loadDataWithRecovery };
