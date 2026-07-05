const OpenAI = require("openai");

let groq = null;

function getGroq() {
    if (!groq) {
        groq = new OpenAI({
            apiKey: process.env.GROQ_API_KEY,
            baseURL: "https://api.groq.com/openai/v1"
        });
    }
    return groq;
}

async function extractCommitments(userMessage, botReply) {
    try {
        const today = new Date().toISOString().split("T")[0];
        const completion = await getGroq().chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages: [
                {
                    role: "system",
                    content: `You are a date extraction tool. Today is ${today}. 
Extract any date commitments (meetings, plans, events) from the conversation below.

Rules:
- Only extract if a specific date/time was CONFIRMED or AGREED upon
- Convert relative dates ("next Friday", "15th Oct") to YYYY-MM-DD format
- If no commitment was made, return empty array
- Return ONLY valid JSON, nothing else

Output format: [{"date": "YYYY-MM-DD", "note": "brief 3-word reason"}]
If no dates found: []`
                },
                {
                    role: "user",
                    content: `User said: "${userMessage}"\nBot replied: "${botReply}"\n\nExtract commitments:`
                }
            ],
            temperature: 0
        });

        const raw = completion.choices[0].message.content.trim();
        const jsonMatch = raw.match(/\[.*\]/s);
        if (!jsonMatch) return [];

        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.filter(item =>
            item.date && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && item.note
        );
    } catch (err) {
        console.warn("[Extractor] Failed:", err.message);
        return [];
    }
}

module.exports = { extractCommitments };
