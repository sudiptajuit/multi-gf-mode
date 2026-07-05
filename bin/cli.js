#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const command = process.argv[2];

function printUsage() {
    console.log(`
  multi-gf-mode — AI-powered WhatsApp auto-reply bot

  Usage:
    multi-gf-mode init     Create .env template and chats/ folder
    multi-gf-mode start    Start the bot
    multi-gf-mode help     Show this help

  Commands (from WhatsApp):
    /lookup <number>       Find a contact's internal ID
    /allow                 Add sender to allowed list
    /list                  Show allowed contacts
    /busy <date> <note>    Block a date (YYYY-MM-DD)
    /free <date>           Unblock a date
    /schedule              Show all commitments
`);
}

if (command === "init") {
    const envExample = path.join(__dirname, "..", "templates", ".env.example");
    const envTarget = path.join(process.cwd(), ".env");
    const chatsDir = path.join(process.cwd(), "chats");

    if (!fs.existsSync(envTarget)) {
        fs.copyFileSync(envExample, envTarget);
        console.log("Created .env — edit it with your API key and contacts");
    } else {
        console.log(".env already exists, skipping");
    }

    if (!fs.existsSync(chatsDir)) {
        fs.mkdirSync(chatsDir);
        console.log("Created chats/ — drop WhatsApp export zips here (e.g. 919876543210.zip)");
    } else {
        console.log("chats/ already exists, skipping");
    }

    console.log("\nNext steps:");
    console.log("  1. Edit .env with your GROQ_API_KEY and ALLOWED_CONTACTS");
    console.log("  2. (Optional) Drop chat export zips in chats/");
    console.log("  3. Run: multi-gf-mode start");

} else if (command === "start") {
    require("dotenv").config({ path: path.join(process.cwd(), ".env") });

    if (!process.env.GROQ_API_KEY) {
        console.error("Error: GROQ_API_KEY not set in .env");
        console.error("Run 'multi-gf-mode init' first, then edit .env");
        process.exit(1);
    }

    // Patch puppeteer exposeFunctionIfAbsent to prevent crash
    try {
        const puppeteerPath = require.resolve("whatsapp-web.js/src/util/Puppeteer.js");
        const origCode = fs.readFileSync(puppeteerPath, "utf8");
        if (!origCode.includes("already exists")) {
            const patched = origCode.replace(
                "await page.exposeFunction(name, fn);",
                `try { await page.exposeFunction(name, fn); } catch (e) { if (e.message && e.message.includes('already exists')) return; throw e; }`
            );
            fs.writeFileSync(puppeteerPath, patched);
        }
    } catch (e) {
        // Non-critical, continue
    }

    const { start } = require("../lib/bot");
    start();

} else {
    printUsage();
}
