'use strict';
(()=>{
class TaskError extends Error {
    code;
    status;
    constructor(code, status = 400) {
        super(code);
        this.code = code;
        this.status = status;
    }
}
function validTaskDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function validateDocument(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new TaskError("INVALID_DOCUMENT");
    const d = value;
    if (d.version !== 1 || !Array.isArray(d.notes) || d.notes.length > 1000)
        throw new TaskError("INVALID_DOCUMENT");
    const ids = new Set();
    for (const n of d.notes) {
        if (!n || typeof n !== "object" || Array.isArray(n) || typeof n.id !== "string" || !n.id || n.id.length > 200 || ids.has(n.id))
            throw new TaskError("INVALID_TASK_ID");
        ids.add(n.id);
        if (typeof n.title !== "string" || !n.title.trim() || n.title.length > 500)
            throw new TaskError("INVALID_TITLE");
        if (!["life", "hobby", "shopping"].includes(n.category) || !["todo", "doing", "hold", "done"].includes(n.status))
            throw new TaskError("INVALID_TASK_STATE");
        for (const f of ["body", "nextAction", "plannedDate", "externalDeadline", "budget", "url", "priceObservedAt", "priceSource"]) {
            if (n[f] !== undefined && (typeof n[f] !== "string" || n[f].length > 20000))
                throw new TaskError("INVALID_TASK_FIELD");
        }
        for (const f of ["plannedDate", "externalDeadline"])
            if (n[f] && !validTaskDate(n[f]))
                throw new TaskError("INVALID_DATE");
        if (n.budget && (!Number.isFinite(Number(n.budget)) || Number(n.budget) < 0))
            throw new TaskError("INVALID_BUDGET");
        if (n.url) {
            try {
                if (!["https:", "http:"].includes(new URL(n.url).protocol))
                    throw Error();
            }
            catch {
                throw new TaskError("UNSAFE_URL");
            }
        }
    }
    if (new TextEncoder().encode(JSON.stringify(d)).length > 800000)
        throw new TaskError("TOO_LARGE", 413);
    return d;
}
function applyOperation(current, operation) {
    if (!operation || typeof operation !== "object")
        throw new TaskError("INVALID_OPERATION");
    const op = operation;
    if (op.type === "replace")
        return validateDocument(op.data);
    if (op.type !== "upsert" || !op.note)
        throw new TaskError("INVALID_OPERATION");
    validateDocument({ version: 1, notes: [op.note] });
    const notes = current.notes.slice();
    const idx = notes.findIndex(n => n.id === op.note.id);
    if (idx < 0)
        notes.push(op.note);
    else
        notes[idx] = { ...notes[idx], ...op.note };
    return validateDocument({ ...current, notes });
}

const emptyCalendar = { version: 1, events: [] };
function validDate(value) {
    return typeof value === "string" && /^[1-9]\d{3}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function validateCalendar(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new TaskError("INVALID_DOCUMENT");
    const d = value;
    if (d.version !== 1 || !Array.isArray(d.events) || d.events.length > 1000)
        throw new TaskError("INVALID_DOCUMENT");
    const ids = new Set();
    for (const e of d.events) {
        if (!e || typeof e !== "object" || Array.isArray(e) || typeof e.id !== "string" || !e.id || e.id.length > 200 || ids.has(e.id))
            throw new TaskError("INVALID_EVENT_ID");
        ids.add(e.id);
        if (typeof e.title !== "string" || !e.title.trim() || e.title.length > 300)
            throw new TaskError("INVALID_TITLE");
        if (!validDate(e.date))
            throw new TaskError("INVALID_DATE");
        if (!["life", "hobby", "shopping", "work"].includes(e.category) || !["planned", "done", "cancelled"].includes(e.status))
            throw new TaskError("INVALID_EVENT_STATE");
        for (const k of ["startTime", "endTime"])
            if (typeof e[k] !== "string" || (e[k] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(e[k])))
                throw new TaskError("INVALID_TIME");
        if (e.endTime && (!e.startTime || e.endTime <= e.startTime))
            throw new TaskError("INVALID_TIME_RANGE");
        if (typeof e.description !== "string" || e.description.length > 10000 || typeof e.linkedCardId !== "string" || e.linkedCardId.length > 200)
            throw new TaskError("INVALID_EVENT_FIELD");
    }
    if (new TextEncoder().encode(JSON.stringify(d)).length > 800000)
        throw new TaskError("TOO_LARGE", 413);
    return d;
}
function applyCalendarOperation(current, operation) {
    if (!operation || typeof operation !== "object")
        throw new TaskError("INVALID_OPERATION");
    const op = operation;
    if (op.type === "replace")
        return validateCalendar(op.data);
    if (op.type !== "upsert" || !op.event)
        throw new TaskError("INVALID_OPERATION");
    validateCalendar({ version: 1, events: [op.event] });
    const duplicate = current.events.find(e => e.id !== op.event.id && e.status !== "cancelled" && op.event.status !== "cancelled" && e.date === op.event.date && e.startTime === op.event.startTime && e.title.trim() === op.event.title.trim());
    if (duplicate)
        throw new TaskError("DUPLICATE_EVENT", 409);
    const events = current.events.slice(), i = events.findIndex(e => e.id === op.event.id);
    if (i < 0)
        events.push(op.event);
    else
        events[i] = { ...events[i], ...op.event };
    return validateCalendar({ ...current, events });
}

window.PersonalDemoModel={validateDocument,applyOperation,validateCalendar,applyCalendarOperation};
})();
