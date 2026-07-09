// ===== START OF MY CODE =====
// To build the DB.
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const databasePath =
    process.argv[2] || path.join(__dirname, '..', 'database.db');
const schemaPath = path.join(__dirname, '..', 'db_schema.sql');

if (fs.existsSync(databasePath)) {
    fs.unlinkSync(databasePath);
}

const schema = fs.readFileSync(schemaPath, 'utf8');
const db = new sqlite3.Database(databasePath);

db.exec(schema, function (err) {
    if (err) {
        console.error(err);
        process.exit(1);
    }

    db.close(function (err) {
        if (err) {
            console.error(err);
            process.exit(1);
        }

        console.log('Database built successfully');
    });
});
// ===== END OF MY CODE =====
