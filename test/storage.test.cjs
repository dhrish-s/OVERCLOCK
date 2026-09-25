'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadDataWithRecovery } = require('../storage');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'overclock-storage-'));
const dataFile = path.join(root, 'overclock-data.json');
const backupsDir = path.join(root, 'backups');
fs.mkdirSync(backupsDir);

try {
  fs.writeFileSync(dataFile, '{broken json', 'utf-8');
  fs.writeFileSync(path.join(backupsDir, 'backup-2026-01-01.json'), JSON.stringify({ version: 1, profile: { displayName: 'Recovered' } }), 'utf-8');
  const errors = [];
  const data = loadDataWithRecovery(dataFile, backupsDir, (err) => errors.push(err));
  assert.strictEqual(data.profile.displayName, 'Recovered');
  assert.strictEqual(JSON.parse(fs.readFileSync(dataFile, 'utf-8')).profile.displayName, 'Recovered');
  assert.ok(fs.readdirSync(root).some((name) => name.includes('.corrupt-')));
  assert.ok(errors.length >= 1);
  console.log('4 storage recovery checks passed');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
