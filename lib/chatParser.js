const AdmZip = require("adm-zip");
const path = require("path");
const fs = require("fs");

const CHATS_DIR = path.join(process.cwd(), "chats");

const MSG_REGEX = /^[\[‎]?(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s*[aApP]?[mM]?)[\]"]?\s*[-–]?\s*([^:]+?):\s(.+)$/;

function parseWhatsAppChat(text) {
    const lines = text.split("\n");
    const messages = [];
    let current = null;

    for (const line of lines) {
        const cleanLine = line.replace(/[\u200e\u200f\u202a-\u202e\ufeff\u200b‎]/g, "").trim();
        if (!cleanLine) continue;

        const match = cleanLine.match(MSG_REGEX);
        if (match) {
            if (current) messages.push(current);
            const msgText = match[4].trim();
            if (msgText === "image omitted" || msgText === "video omitted" ||
                msgText === "audio omitted" || msgText === "sticker omitted" ||
                msgText === "document omitted" || msgText === "GIF omitted" ||
                msgText.includes("end-to-end encrypted")) {
                current = null;
                continue;
            }
            current = {
                date: match[1],
                time: match[2],
                sender: match[3].trim(),
                text: msgText
            };
        } else if (current && cleanLine) {
            current.text += "\n" + line.trim();
        }
    }
    if (current) messages.push(current);

    return messages;
}

function chunkMessages(messages, chunkSize = 8) {
    const chunks = [];
    for (let i = 0; i < messages.length; i += chunkSize) {
        const group = messages.slice(i, i + chunkSize);
        const text = group
            .map(m => `[${m.date} ${m.time}] ${m.sender}: ${m.text}`)
            .join("\n");
        const timestamp = group[0].date + " " + group[0].time;
        chunks.push({ text, timestamp, type: "export" });
    }
    return chunks;
}

function extractChatFromZip(zipPath) {
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();
    const chatEntry = entries.find(e =>
        e.entryName.endsWith(".txt") && !e.entryName.startsWith("__MACOSX")
    );
    if (!chatEntry) {
        throw new Error(`No .txt chat file found in ${zipPath}`);
    }
    return chatEntry.getData().toString("utf8");
}

async function ingestZipForContact(contactPhone, vectorStore) {
    const zipPath = path.join(CHATS_DIR, `${contactPhone}.zip`);
    if (!fs.existsSync(zipPath)) return false;

    const markerPath = path.join(CHATS_DIR, `${contactPhone}.ingested`);
    if (fs.existsSync(markerPath)) {
        console.log(`[Parser] ${contactPhone}.zip already ingested, skipping`);
        return true;
    }

    console.log(`[Parser] Ingesting ${contactPhone}.zip ...`);
    const chatText = extractChatFromZip(zipPath);
    const messages = parseWhatsAppChat(chatText);
    console.log(`[Parser] Parsed ${messages.length} messages`);

    const chunks = chunkMessages(messages);
    console.log(`[Parser] Created ${chunks.length} chunks`);

    await vectorStore.addChunks(contactPhone, chunks);

    fs.writeFileSync(markerPath, new Date().toISOString());
    console.log(`[Parser] Done ingesting ${contactPhone}.zip`);
    return true;
}

async function ingestAllZips(vectorStore) {
    if (!fs.existsSync(CHATS_DIR)) return;
    const files = fs.readdirSync(CHATS_DIR).filter(f => f.endsWith(".zip"));
    for (const file of files) {
        const phone = file.replace(".zip", "");
        await ingestZipForContact(phone, vectorStore);
    }
}

module.exports = { parseWhatsAppChat, chunkMessages, ingestZipForContact, ingestAllZips };
