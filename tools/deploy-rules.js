#!/usr/bin/env node
// Builds firestore.rules from the template plus the local trip code, so the
// secret never lands in the public repo.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(ROOT, 'trip-code.local'), 'utf8').trim();
if (!/^[A-Z0-9-]{10,}$/.test(code)) throw new Error('trip-code.local looks wrong');
const tpl = fs.readFileSync(path.join(ROOT, 'firestore.rules.template'), 'utf8');
fs.writeFileSync(path.join(ROOT, 'firestore.rules'), tpl.replace('__TRIP_CODE__', code));
console.log('firestore.rules written for code ending ...' + code.slice(-4));
