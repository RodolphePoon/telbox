const sqlite3 = require('sqlite3').verbose()

const DB_URL = process.env.DB_URL || 'disbox.db';
const db = new sqlite3.Database(DB_URL)


db.run(`
CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY,
    type TEXT,
    parent_id INTEGER,
    file_id TEXT,
    file_unique_id TEXT,
    file_name TEXT,
    file_type TEXT,
    file_size INTEGER,
    created_at INTEGER,
    updated_at INTEGER
);
`, (err) => {
    if (err) {
        console.log(err);
        throw err;
    }
})


async function getFiles(parentId, limit = 20, offset = 0, orderBy = 'created_at', orderDirection = 'DESC') {

    let query = `SELECT * FROM files`;

    if (parentId) {
        query += ` WHERE parent_id = ${parentId}`;
    } else {
        query += ` WHERE parent_id IS NULL`;
    }

    // Add ordering
    const validOrderFields = ['id', 'type', 'file_name', 'file_size', 'created_at', 'updated_at'];
    const validDirections = ['ASC', 'DESC'];
    
    if (validOrderFields.includes(orderBy) && validDirections.includes(orderDirection.toUpperCase())) {
        query += ` ORDER BY ${orderBy} ${orderDirection.toUpperCase()}`;
    } else {
        // Default ordering if invalid parameters
        query += ` ORDER BY created_at DESC`;
    }

    query += ` LIMIT ${limit} OFFSET ${offset}`;

    return new Promise((resolve, reject) => {
        db.all(query, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows || []);
            }
        });
    });
}

async function getFileById(fileId) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM files WHERE file_id = "${fileId}"`, (err, row) => {
            if (err) {
                reject(err);
            } else if (!row) {
                reject(new Error(`File with ID ${fileId} not found in database`));
            } else {
                resolve(row);
            }
        });
    });
}

async function saveFile(fileData, parentId) {
       const dataToInsert = [
            'FILE',
            parentId,
            fileData.file_id,
            fileData.file_unique_id,
            fileData.file_name,
            fileData.mime_type,
            fileData.file_size,
            new Date().getTime(),
            new Date().getTime(),
        ];

        const query = `INSERT INTO files (type, parent_id, file_id, file_unique_id, file_name, file_type, file_size, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    return new Promise((resolve, reject) => {

        db.run(query, dataToInsert, function (err) {
            if (err) {
                console.error('Error inserting file into database:', err);
                reject(err);
            } else {
                console.log(`Data saved to database:`, dataToInsert);
                resolve({ id: this.lastID, ...fileData });
            }
        });
    });
}

async function deleteFileById(fileId) {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM files WHERE file_id = "${fileId}"`, function (err) {
            if (err) {
                console.error('Error deleting file from database:', err);
                reject(err);
            } else if (this.changes === 0) {
                reject(new Error(`File with ID ${fileId} not found in database`));
            } else {
                console.log(`File with ID ${fileId} deleted from database`);
                resolve();
            }
        });
    });
}

async function createDirectory(name, parentId) {
    const dataToInsert = [
        'DIRECTORY',
        parentId,
        null,
        null,
        name,
        null,
        null,
        new Date().getTime(),
        new Date().getTime(),
    ];

    const query = `INSERT INTO files (type, parent_id, file_id, file_unique_id, file_name, file_type, file_size, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    return new Promise((resolve, reject) => {
        db.run(query, dataToInsert, function (err) {
            if (err) {
                console.error('Error creating directory in database:', err);                    
                reject(err);
            } else {
                console.log(`Directory "${name}" created in database with ID ${this.lastID}`);
                resolve({ id: this.lastID, type: 'DIRECTORY', parent_id: parentId, file_name: name });
            }
        });
    });
}


module.exports = {
    getFiles,
    getFileById,
    saveFile,
    deleteFileById,
    createDirectory
}