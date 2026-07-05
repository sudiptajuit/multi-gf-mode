const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const QRCode = require("qrcode");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const vectorStore = require("./vectorStore");
const { ingestAllZips } = require("./chatParser");
const { bufferMessage, flushAllPending } = require("./liveIngest");
const { getScheduleSummary, getFormattedSchedule, addCommitment, removeCommitment } = require("./schedule");
const { extractCommitments } = require("./commitExtractor");

function start() {
    const groq = new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: "https://api.groq.com/openai/v1"
    });

    const botName = process.env.BOT_NAME || "Assistant";
    const systemPrompt = (process.env.SYSTEM_PROMPT || "Reply casually and briefly as {BOT_NAME}. Use short WhatsApp-style messages. Don't reveal you are an AI.")
        .replace(/\{BOT_NAME\}/g, botName);

    const allowed = (process.env.ALLOWED_CONTACTS || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);

    const chats = {};
    const processedMessages = new Set();
    const lidPhoneCache = new Map();
    const QR_PATH = path.join(process.cwd(), "qr.html");

    const client = new Client({
        authStrategy: new LocalAuth()
    });

    async function resolvePhone(fromId) {
        if (fromId.endsWith("@c.us")) return fromId.replace("@c.us", "");
        if (!fromId.includes("@lid")) return fromId.replace(/@.*$/, "");

        const lid = fromId.includes(":")
            ? fromId.replace(/:\d+@lid$/, "@lid")
            : fromId;

        if (lidPhoneCache.has(lid)) {
            return lidPhoneCache.get(lid) || fromId.replace(/@.*$/, "");
        }

        try {
            const results = await client.getContactLidAndPhone([lid]);
            if (results?.length > 0 && results[0].pn) {
                const phone = results[0].pn.replace("@c.us", "");
                lidPhoneCache.set(lid, phone);
                return phone;
            }
        } catch (err) {
            console.warn("Failed to resolve LID:", err.message);
        }

        lidPhoneCache.set(lid, null);
        return fromId.replace(/@.*$/, "");
    }

    // QR code → save to HTML file + print in CLI
    client.on("qr", async qr => {
        console.log("Scan the QR code to link WhatsApp:\n");
        qrcode.generate(qr, { small: true });

        try {
            const qrDataUrl = await QRCode.toDataURL(qr, { width: 400 });
            const now = new Date().toLocaleString();
            const html = `<!DOCTYPE html>
<html><head><title>multi-gf-mode — Scan QR</title>
<style>body{font-family:system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;background:#111;color:#fff}
img{border-radius:16px}p{opacity:0.6;margin-top:12px}h2{margin-bottom:4px}</style></head>
<body><h2>multi-gf-mode</h2><p>Generated: ${now}</p><img src="${qrDataUrl}" /><p>Scan with WhatsApp → Linked Devices → Link a Device</p></body></html>`;
            fs.writeFileSync(QR_PATH, html);
            console.log(`QR code saved to ${QR_PATH}`);
        } catch (e) {
            console.warn("Could not save QR file:", e.message);
        }
    });

    client.on("ready", async () => {
        console.log("WhatsApp bot is ready!");

        // Delete QR file after successful auth
        if (fs.existsSync(QR_PATH)) {
            fs.unlinkSync(QR_PATH);
        }

        await flushAllPending();
        await ingestAllZips(vectorStore);
        console.log("Vector store initialized!");

        if (allowed.length > 0) {
            console.log(`Replying to: ${allowed.join(", ")}`);
        } else {
            console.log("Replying to: everyone (no ALLOWED_CONTACTS set)");
        }
    });

    client.on("disconnected", reason => console.log("Disconnected:", reason));
    client.on("auth_failure", msg => console.error("Auth failure:", msg));

    client.on("message", async message => {
        if (message.fromMe) return;
        if (message.from.endsWith("@g.us")) return;
        if (message.from === "status@broadcast") return;

        if (processedMessages.has(message.id._serialized)) return;
        processedMessages.add(message.id._serialized);

        if (processedMessages.size > 1000) {
            const arr = [...processedMessages];
            processedMessages.clear();
            arr.slice(-500).forEach(id => processedMessages.add(id));
        }

        console.log(`Message from: ${message.from} | Body: ${message.body}`);

        // --- Commands ---
        if (message.body.startsWith("/lookup ")) {
            const number = message.body.split(" ")[1];
            try {
                const result = await client.getNumberId(number);
                await message.reply(result
                    ? `Number: ${number}\nID: ${result._serialized}`
                    : `Number ${number} not found on WhatsApp.`);
            } catch (e) {
                await message.reply(`Lookup failed: ${e.message}`);
            }
            return;
        }

        if (message.body === "/allow") {
            const phone = await resolvePhone(message.from);
            if (!allowed.includes(phone)) {
                allowed.push(phone);
                console.log(`Added ${phone} to allowed list`);
                await message.reply(`Added: ${phone}`);
            } else {
                await message.reply(`Already allowed: ${phone}`);
            }
            return;
        }

        if (message.body === "/list") {
            await message.reply(`Allowed:\n${allowed.join("\n") || "(everyone)"}`);
            return;
        }

        if (message.body.startsWith("/busy ")) {
            const parts = message.body.slice(6).trim().split(" ");
            const date = parts[0];
            const note = parts.slice(1).join(" ") || "busy";
            addCommitment(date, note);
            await message.reply(`Blocked: ${date} (${note})`);
            return;
        }

        if (message.body.startsWith("/free ")) {
            const date = message.body.slice(6).trim();
            removeCommitment(date);
            await message.reply(`Freed: ${date}`);
            return;
        }

        if (message.body === "/schedule") {
            await message.reply(getFormattedSchedule());
            return;
        }

        if (message.body.startsWith("/")) return;

        // --- Allowlist check ---
        if (allowed.length > 0) {
            const phone = await resolvePhone(message.from);
            if (!allowed.includes(phone)) {
                console.log(`Blocked: ${message.from} (phone: ${phone})`);
                return;
            }
        }

        const contactPhone = await resolvePhone(message.from);

        bufferMessage(contactPhone, "user", message.body);

        if (!chats[message.from]) chats[message.from] = [];
        chats[message.from].push({ role: "user", content: message.body });

        if (chats[message.from].length > 20) {
            chats[message.from] = chats[message.from].slice(-20);
        }

        try {
            let pastContext = "";
            const results = await vectorStore.query(contactPhone, message.body, 5);
            if (results.length > 0) {
                pastContext = "\n\nRelevant past conversations:\n" +
                    results.map(r => r.text).join("\n---\n");
            }

            const scheduleSummary = getScheduleSummary();
            const scheduleContext = scheduleSummary
                ? `\n\nYour schedule (dates you're busy): ${scheduleSummary}. If someone asks to meet on a busy date, politely say you're occupied and suggest another day. Never reveal who you're meeting.`
                : "";

            const completion = await groq.chat.completions.create({
                model: "llama-3.1-8b-instant",
                messages: [
                    {
                        role: "system",
                        content: systemPrompt +
                            scheduleContext +
                            (pastContext ? "\n\nUse the following past conversations for context if relevant, but don't mention that you looked them up:" + pastContext : "")
                    },
                    ...chats[message.from]
                ]
            });

            const reply = completion.choices[0].message.content;

            chats[message.from].push({ role: "assistant", content: reply });
            bufferMessage(contactPhone, botName, reply);

            const chat = await message.getChat();
            await chat.sendStateTyping();

            const delay = 2000 + Math.random() * 3000;
            await new Promise(r => setTimeout(r, delay));

            await message.reply(reply);

            extractCommitments(message.body, reply).then(commitments => {
                for (const c of commitments) {
                    addCommitment(c.date, c.note);
                    console.log(`[Schedule] Auto-added: ${c.date} (${c.note})`);
                }
            });
        } catch (err) {
            console.error("Error:", err.message);
        }
    });

    client.initialize();
}

module.exports = { start };
