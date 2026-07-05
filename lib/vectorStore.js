const { LocalIndex } = require("vectra");
const { pipeline } = require("@xenova/transformers");
const path = require("path");
const fs = require("fs");

const VECTORS_DIR = path.join(process.cwd(), "vectors");

let embedder = null;

async function getEmbedder() {
    if (!embedder) {
        embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    }
    return embedder;
}

async function embed(text) {
    const model = await getEmbedder();
    const output = await model(text, { pooling: "mean", normalize: true });
    return Array.from(output.data);
}

function getIndexPath(contactPhone) {
    return path.join(VECTORS_DIR, contactPhone);
}

async function getOrCreateIndex(contactPhone) {
    const indexPath = getIndexPath(contactPhone);
    if (!fs.existsSync(indexPath)) {
        fs.mkdirSync(indexPath, { recursive: true });
    }
    const index = new LocalIndex(indexPath);
    if (!await index.isIndexCreated()) {
        await index.createIndex();
    }
    return index;
}

async function addChunks(contactPhone, chunks) {
    const index = await getOrCreateIndex(contactPhone);
    for (const chunk of chunks) {
        const vector = await embed(chunk.text);
        await index.insertItem({
            vector,
            metadata: {
                text: chunk.text,
                timestamp: chunk.timestamp || new Date().toISOString(),
                type: chunk.type || "live"
            }
        });
    }
    console.log(`[Vector] Added ${chunks.length} chunks for ${contactPhone}`);
}

async function query(contactPhone, queryText, topK = 5) {
    const indexPath = getIndexPath(contactPhone);
    if (!fs.existsSync(indexPath)) return [];

    const index = new LocalIndex(indexPath);
    if (!await index.isIndexCreated()) return [];

    const vector = await embed(queryText);
    const results = await index.queryItems(vector, queryText, topK);

    return results
        .filter(r => r.score > 0.3)
        .map(r => r.item.metadata);
}

module.exports = { addChunks, query, embed, getOrCreateIndex };
