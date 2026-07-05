const fs = require("fs");
const path = require("path");
const vectorStore = require("./vectorStore");

const PENDING_DIR = path.join(process.cwd(), "pending");

function getIdleTimeout() {
    const mins = parseInt(process.env.IDLE_FLUSH_MINUTES) || 5;
    return mins * 60 * 1000;
}

const idleTimers = {};

function ensurePendingDir() {
    if (!fs.existsSync(PENDING_DIR)) {
        fs.mkdirSync(PENDING_DIR, { recursive: true });
    }
}

function getPendingPath(contactPhone) {
    return path.join(PENDING_DIR, `${contactPhone}.jsonl`);
}

function bufferMessage(contactPhone, sender, text) {
    ensurePendingDir();
    const entry = JSON.stringify({
        sender,
        text,
        timestamp: new Date().toISOString()
    }) + "\n";

    fs.appendFileSync(getPendingPath(contactPhone), entry);
    resetIdleTimer(contactPhone);
}

function resetIdleTimer(contactPhone) {
    if (idleTimers[contactPhone]) {
        clearTimeout(idleTimers[contactPhone]);
    }
    idleTimers[contactPhone] = setTimeout(() => {
        flushPending(contactPhone);
    }, getIdleTimeout());
}

async function flushPending(contactPhone) {
    const pendingPath = getPendingPath(contactPhone);
    if (!fs.existsSync(pendingPath)) return;

    const content = fs.readFileSync(pendingPath, "utf8").trim();
    if (!content) return;

    const lines = content.split("\n").filter(Boolean);
    const messages = lines.map(line => JSON.parse(line));
    if (messages.length === 0) return;

    const chunks = [];
    for (let i = 0; i < messages.length; i += 8) {
        const group = messages.slice(i, i + 8);
        const text = group
            .map(m => `[${m.timestamp}] ${m.sender}: ${m.text}`)
            .join("\n");
        chunks.push({
            text,
            timestamp: group[0].timestamp,
            type: "live"
        });
    }

    await vectorStore.addChunks(contactPhone, chunks);
    fs.unlinkSync(pendingPath);
    console.log(`[LiveIngest] Flushed ${messages.length} messages for ${contactPhone}`);
}

async function flushAllPending() {
    ensurePendingDir();
    const files = fs.readdirSync(PENDING_DIR).filter(f => f.endsWith(".jsonl"));
    for (const file of files) {
        const phone = file.replace(".jsonl", "");
        console.log(`[LiveIngest] Flushing leftover pending for ${phone}`);
        await flushPending(phone);
    }
}

module.exports = { bufferMessage, flushPending, flushAllPending };
