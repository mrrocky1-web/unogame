const Database = require('better-sqlite3');
const fs = require('fs'), path = require('path');
const db = new Database(path.join(__dirname, '..', 'database', 'uno.db'));
db.pragma('journal_mode = WAL');
db.exec(fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8'));
module.exports = db;
