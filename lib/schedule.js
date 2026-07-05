const fs = require("fs");
const path = require("path");

const SCHEDULE_PATH = path.join(process.cwd(), "schedule.json");

function loadSchedule() {
    if (!fs.existsSync(SCHEDULE_PATH)) return [];
    try {
        return JSON.parse(fs.readFileSync(SCHEDULE_PATH, "utf8"));
    } catch {
        return [];
    }
}

function saveSchedule(schedule) {
    fs.writeFileSync(SCHEDULE_PATH, JSON.stringify(schedule, null, 2));
}

function addCommitment(date, note = "plans") {
    const schedule = loadSchedule();
    const existing = schedule.find(s => s.date === date);
    if (existing) {
        existing.note = note;
    } else {
        schedule.push({ date, status: "busy", note });
    }
    saveSchedule(schedule);
}

function removeCommitment(date) {
    let schedule = loadSchedule();
    schedule = schedule.filter(s => s.date !== date);
    saveSchedule(schedule);
}

function getScheduleSummary() {
    const schedule = loadSchedule();
    if (schedule.length === 0) return "";

    const today = new Date();
    const upcoming = schedule.filter(s => new Date(s.date) >= today);
    if (upcoming.length === 0) return "";

    return upcoming
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .map(s => `${s.date}: ${s.status}`)
        .join(", ");
}

function getFormattedSchedule() {
    const schedule = loadSchedule();
    if (schedule.length === 0) return "No commitments scheduled.";

    return schedule
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .map(s => `${s.date} — ${s.status} (${s.note})`)
        .join("\n");
}

module.exports = { loadSchedule, addCommitment, removeCommitment, getScheduleSummary, getFormattedSchedule };
