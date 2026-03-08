require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');


const db = require('./orm');
const { uploadFile, downloadFile } = require('./file-manager');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));

const upload = multer();





app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/upload', upload.single('file'), async (req, res) => {

  if (!req.file) {
    return res.status(400).send('No file uploaded');
  }


  try {
    const parentId = req.body.parent_id ? parseInt(req.body.parent_id) : null;

    const response = await uploadFile(req.file.buffer, req.file.originalname);
    db.saveFile({
        file_name: req.file.originalname,
        file_size: req.file.size,
        date: new Date().getTime(),
        mime_type: req.file.mimetype,
        file_id: response.messageId.toString(),
        file_unique_id: response.documentId?.toString() || response.messageId.toString(),
    }, parentId)
    console.log(`response from Telegram:`, response);
    res.send(`File "${req.file.originalname}" sent to Telegram successfully!`);
  } catch (err) {
    console.error('Telegram upload failed:', err);
    res.status(500).send('Failed to send file to Telegram');
  }
});

app.get('/files', async (req, res) => {
    const parentId = parseInt(req.query.parent_id) || null;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    const orderBy = req.query.orderBy || 'created_at';
    const orderDirection = req.query.orderDirection || 'DESC';

    const files = await db.getFiles(parentId, limit, offset, orderBy, orderDirection)
    res.send(files)
})

app.post('/directories', async (req, res) => {

  console.log('Received request to create directory with data:', req.body);
    const { name, parent_id } = req.body;

    try {
        const newDirectory = await db.createDirectory(name, parent_id);
        res.status(201).send(newDirectory);
    } catch (err) {
        console.error('Failed to create directory:', err);
        res.status(500).send('Failed to create directory');
    }
})

app.get('/download/:fileId', async (req, res) => {
  try {
    const fileId = req.params.fileId;
    const filename = (await db.getFileById(fileId)).file_name;

    await downloadFile(fileId,filename, res);
    
  } catch (err) {
    console.error('Failed to download file:', err);
    res.status(500).send('Failed to download file');
  }
});

app.delete('/files/:fileId', async (req, res) => {
    try {
        const fileId = req.params.fileId;
        await db.deleteFileById(fileId);
        res.send(`File with ID ${fileId} deleted successfully`);
    } catch (err) {
        console.error('Failed to delete file:', err);
        res.status(500).send('Failed to delete file');
    }
});

app.get('/health', (req, res) => {
    res.send('OK');
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
