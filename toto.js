const sqlite3 = require('sqlite3').verbose()

const DB_URL = process.env.DB_URL || 'disbox.db';
const db = new sqlite3.Database(DB_URL)

console.log(DB_URL)
db.run(`
    DELETE FROM files WHERE id = 17547
`, (err) => {
    if (err) {
        console.log(err);
        throw err;
    }
})