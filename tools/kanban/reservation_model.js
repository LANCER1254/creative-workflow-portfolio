/* Pure queue rules. No scheduling, filesystem access, or task execution. */
(() => {
  "use strict";
  const ACTIVE = new Set(["queued", "running", "blocked", "failed"]);
  const STATUSES = {queued:"待機",running:"着手記録あり",blocked:"保留",failed:"失敗",completed:"完了",cancelled:"取消"};
  const eligible = n => !["policy-","maintenance-","handoff-","fusion-"].some(prefix => n.id.startsWith(prefix));
  const setId = n => n.queueSetId || "default";
  const priority = n => n.priority ?? 5;
  const isDoneAudit = n => n.id.startsWith("done-audit-");
  const rank = n => n.queueRole === "end" ? 2 : isDoneAudit(n) ? 1 : 0;
  const ordered = notes => notes.filter(n => ACTIVE.has(n.queueStatus)).sort((a,b) =>
    rank(a) - rank(b) || a.queueOrder - b.queueOrder || a.id.localeCompare(b.id));
  function valid(n) {
    if (n.queueSetId !== undefined && (typeof n.queueSetId !== "string" || !n.queueSetId || n.queueSetId.length > 80 || !n.queueStatus)) return false;
    if (n.priority !== undefined && (!Number.isInteger(n.priority) || n.priority < 1 || n.priority > 10)) return false;
    if (n.handoffTheme !== undefined && !["gold","rainbow","meritocracia"].includes(n.handoffTheme)) return false;
    if (["queueStatus","queueOrder","queueRole"].some(k => k in n)) {
      if (!eligible(n) || !Object.hasOwn(STATUSES,n.queueStatus) || !["task","end"].includes(n.queueRole) || !Number.isInteger(n.queueOrder) || n.queueOrder < 1 || n.queueOrder > 1000000) return false;
      if (ACTIVE.has(n.queueStatus) && (n.column === "Done" || n.archivedAt)) return false;
      if (n.column === "Hold" && ["queued","running"].includes(n.queueStatus)) return false;
    }
    return true;
  }
  function validSets(sets) {
    return Array.isArray(sets) && sets.length > 0 && sets.length <= 50 && sets.some(s => s.id === "default") && new Set(sets.map(s => s.id)).size === sets.length && sets.every(s => s && Object.keys(s).every(k => ["id","name","executor","plannedDate"].includes(k)) && (s.plannedDate === undefined || (typeof s.plannedDate === "string" && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s.plannedDate) && !s.plannedDate.startsWith("0000") && Number.isFinite(Date.parse(s.plannedDate)) && new Date(s.plannedDate).toISOString().slice(0,10) === s.plannedDate)) && ["work","codex"].includes(s.executor || "work") && typeof s.id === "string" && s.id.length > 0 && s.id.length <= 80 && typeof s.name === "string" && s.name.trim() && s.name.length <= 60);
  }
  function validQueue(notes, sets) {
    if (sets !== undefined && !validSets(sets)) return false;
    const allowed = new Set(["default", ...(sets || []).map(s => s.id)]);
    if (notes.some(n => !allowed.has(setId(n)))) return false;
    const rows = ordered(notes), running = rows.filter(n => n.queueStatus === "running");
    return [...allowed].every(id => rows.filter(n => setId(n) === id && n.queueRole === "end").length <= 1) && running.length <= 1 && !running.some(n => n.queueRole === "end" && rows.some(x => setId(x) === setId(n) && x.queueRole !== "end"));
  }
  function blockedReason(n, notes) {
    if (n.column === "Hold") return "Holdを維持中。解除はカード側で判断してください。";
    if (n.queueStatus === "blocked") return "保留中。確認後に待機へ戻してください。";
    if (n.queueStatus === "failed") return "失敗を記録中。原因を確認してから再開してください。";
    const all = ordered(notes), rows = all.filter(x => setId(x) === setId(n));
    if (all.some(x => x.id !== n.id && x.queueStatus === "running")) return "他の予約に着手記録があります。";
    if (rows.findIndex(x => x.id === n.id) > 0) return n.queueRole === "end" ? "未完了の予約が残っています。ENDは最後です。" : "前の予約が未完了です。";
    return "";
  }
  function syncState(n) {
    if (!ACTIVE.has(n.queueStatus)) return n;
    if (n.column === "Done" || n.archivedAt) return {...n, queueStatus:"completed"};
    if (n.column === "Hold" && ["queued","running"].includes(n.queueStatus)) return {...n, queueStatus:"blocked"};
    return n;
  }
  window.ReservationModel = Object.freeze({ACTIVE,STATUSES,eligible,priority,ordered,isDoneAudit,rank,valid,validSets,validQueue,blockedReason,syncState,setId});
})();
