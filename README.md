# multi-gf-mode

> Your digital clone handles WhatsApp while you touch grass. 🌿

An AI-powered WhatsApp auto-reply bot that impersonates you — with conversation memory, past chat awareness, and schedule management. It remembers what you talked about, knows when you're busy, and replies like you would.

Built for people who have too many chats and not enough time.

---

## What it does

- **Replies as you** — casual, natural, WhatsApp-style messages
- **Remembers conversations** — keeps context within a chat session
- **Knows your past** — import old WhatsApp chats, and the bot recalls events, plans, and inside jokes
- **Manages your schedule** — if you told Contact A you're busy on the 15th, it'll tell Contact B the same (without leaking details)
- **Learns on the fly** — new conversations are automatically saved for future context
- **Looks human** — typing indicators + random reply delays

---

## How it works

```
Someone messages you on WhatsApp
        │
        ▼
  Bot checks past conversations (vector search)
  Bot checks your schedule
        │
        ▼
  AI generates a reply as you
        │
        ▼
  Typing indicator... (2-5 sec delay)
        │
        ▼
  Reply sent ✓✓
```

---

## Quick start

```bash
git clone https://github.com/sudiptajuit/multi-gf-mode.git
cd multi-gf-mode
npm install
```

Initialize your config:

```bash
npx multi-gf-mode init
```

This creates:
- `.env` — your configuration (API key, contacts, persona)
- `chats/` — folder for WhatsApp chat exports

Edit `.env`:

```env
GROQ_API_KEY=gsk_your_key_here
ALLOWED_CONTACTS=919876543210,918765432109
BOT_NAME=Your Name
```

Start the bot:

```bash
npx multi-gf-mode start
```

Scan the QR code (opens as `qr.html` in your browser or shows in terminal), and you're live.

---

## Getting your Groq API key

1. Go to [console.groq.com](https://console.groq.com)
2. Sign up (free)
3. Create an API key
4. Paste it in `.env`

Groq is free and fast — runs Llama 3.1 with near-instant responses.

---

## Importing past chats

Want the bot to remember old conversations? Export a chat from WhatsApp:

1. Open a chat → Tap ⋮ → **Export chat** → **Without media**
2. You'll get a `.zip` file
3. Rename it to the contact's phone number: `919876543210.zip`
4. Drop it in the `chats/` folder
5. Restart the bot — it auto-ingests on startup

Now when that contact asks "remember when we went to Goa?", the bot actually remembers.

---

## Schedule awareness

The bot automatically detects date commitments in conversations:

> **Contact A:** "Let's meet on the 15th"
> **Bot (as you):** "Done, see you then"
> → Bot saves: Oct 15 = busy

> **Contact B:** "Free on the 15th?"
> **Bot (as you):** "Nah, 15th won't work. How about the 16th?"

No details are leaked between contacts. Ever.

### Manual schedule commands

Send these from any WhatsApp chat:

| Command | Example | What it does |
|---|---|---|
| `/busy <date> <note>` | `/busy 2026-10-15 dentist` | Block a date |
| `/free <date>` | `/free 2026-10-15` | Unblock a date |
| `/schedule` | `/schedule` | Show all commitments |

---

## All WhatsApp commands

| Command | What it does |
|---|---|
| `/lookup <number>` | Find a contact's internal WhatsApp ID |
| `/allow` | Add the sender to the allowed contacts list |
| `/list` | Show all allowed contacts |
| `/busy <date> <note>` | Block a date |
| `/free <date>` | Unblock a date |
| `/schedule` | View your schedule |

---

## Configuration

All config lives in `.env`:

```env
# Required
GROQ_API_KEY=gsk_your_key_here

# Phone numbers to reply to (comma-separated, with country code, no +)
# Leave empty to reply to everyone
ALLOWED_CONTACTS=919876543210,918765432109

# The name the bot uses as its identity
BOT_NAME=Your Name

# Customize the AI's personality
SYSTEM_PROMPT=You are {BOT_NAME}. Reply naturally — casual, friendly, and brief. Use short WhatsApp-style messages. Don't reveal you are an AI.

# Minutes of silence before saving conversation to memory
IDLE_FLUSH_MINUTES=5
```

---

## How memory works

### Short-term (session)
Last 20 messages per contact are kept in memory. Resets on restart.

### Long-term (vector search)
Conversations are saved to a local vector database after 5 minutes of inactivity. When a new message comes in, the bot searches past conversations for relevant context and uses it in the reply.

Each contact has their own isolated index — no cross-contact data leakage.

### Imported chats
WhatsApp exports dropped in `chats/` are parsed, chunked, and embedded on first startup. The bot uses them to recall past events, plans, and conversations.

---

## Tech stack

| Component | Tool |
|---|---|
| WhatsApp client | [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) |
| AI model | Llama 3.1 via [Groq](https://groq.com) (free, fast) |
| Vector DB | [Vectra](https://github.com/Stevenic/vectra) (local, file-based) |
| Embeddings | [all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2) via transformers.js (runs locally) |
| QR code | Saved as HTML file for easy scanning |

---

## Project structure

```
multi-gf-mode/
├── bin/cli.js              ← CLI (init / start)
├── lib/
│   ├── bot.js              ← Main bot logic
│   ├── vectorStore.js      ← Embeddings + vector search
│   ├── chatParser.js       ← WhatsApp export parser
│   ├── liveIngest.js       ← Auto-save conversations
│   ├── schedule.js         ← Shared calendar
│   └── commitExtractor.js  ← Auto-detect date plans
├── templates/.env.example  ← Config template
└── package.json
```

After running, these are created in your directory:

```
.env                ← Your config (gitignored)
chats/              ← WhatsApp export zips
vectors/            ← Vector indexes (auto-created)
pending/            ← Crash-safe message buffer
schedule.json       ← Your commitments
qr.html             ← QR code for scanning
.wwebjs_auth/       ← WhatsApp session (persists login)
```

---

## Heads up

- WhatsApp doesn't officially support bots. Use at your own risk, preferably on a secondary number.
- First startup takes ~30 seconds (downloads the embedding model).
- The bot only works while the Node.js process is running. Consider using `pm2` or `screen` to keep it alive.

---

## License

MIT

---

*Built by [Sudipta Biswas](https://github.com/sudiptajuit) — because even you need a backup sometimes.*
