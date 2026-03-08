    const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const fs = require("fs");
const { CustomBuffer, CustomFile } = require("telegram/client/uploads");

const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const chatId = parseInt(process.env.TELEGRAM_GROUP_CHAT_ID);
const sessionString = process.env.TELEGRAM_SESSION || "";

let client = null;

// Initialize Telegram Client
async function initializeClient() {
    if (client && client.connected) {
        return client;
    }

    client = new TelegramClient(
        new StringSession(sessionString),
        apiId,
        apiHash,
        { connectionRetries: 5 }
    );

    try {
        await client.connect();
        console.log("Telegram Client connected");
        return client;
    } catch (err) {
        console.error("Error connecting Telegram client:", err);
        throw err;
    }
}

async function uploadFile(buffer, filename) {
    try {
        const tg = await initializeClient();
        const entity = await tg.getEntity(chatId);

        if (!Buffer.isBuffer(buffer)){
            throw new Error("Invalid file buffer: must be Buffer");
        }

        const doc = new CustomFile(filename, buffer.length, '', buffer);

            const result = await tg.sendFile(entity, {
                file: doc,
                forceDocument: true
            });


        console.log("File uploaded to Telegram:", result);
        return {
            success: true,
            messageId: result.id,
            filename: filename,
            documentId: result.document?.id,
        };
    } catch (err) {
        console.error("Error uploading file to Telegram:", err);
        throw err;
    }
}

async function downloadFile(messageId, filename, res) {
    try {
        const tg = await initializeClient();
        const entity = await tg.getEntity(chatId);

        // Get the message containing the file
        const message = await tg.getMessages(entity, { ids: [parseInt(messageId)] });

        if (!message || !message[0] || !message[0].document) {
            return res.status(404).send("File not found on Telegram");
        }

        const doc = message[0].document;

        // Set response headers
        const contentType = doc.mimeType || "application/octet-stream";
        const contentLength = doc.size;

        res.setHeader("Content-Type", contentType);
        res.setHeader("Content-Length", contentLength);
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${filename.replace(/["\\]/g, '')}"`
        );

        // Create a write stream to pipe the download to response
        const stream = await tg.downloadMedia(message[0], {
            progressCallback: (current, total) => {
                console.log(`Download progress: ${current}/${total}`);
            },
        });

        if (Buffer.isBuffer(stream)) {
            res.send(stream);
        } else if (stream instanceof fs.ReadStream) {
            stream.pipe(res);
        } else {
            res.send(stream);
        }
    } catch (err) {
        console.error("Error downloading file from Telegram:", err);
        res.status(500).send("Failed to download file from Telegram");
    }
}

module.exports = {
    uploadFile,
    downloadFile,
    initializeClient,
};