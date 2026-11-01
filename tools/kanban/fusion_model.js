/* Pure, reversible display grouping; no task execution or status transitions. */
(() => {
  "use strict";
  const isFusion = n => n.id.startsWith("fusion-");
  const eligible = n => !isFusion(n) && !["handoff-","policy-","maintenance-"].some(p => n.id.startsWith(p));
  const members = (notes,id) => notes.filter(n => n.fusionId === id);
  function valid(notes) {
    const groups = new Set(notes.filter(isFusion).map(n => n.id));
    return notes.every(n => {
      if (isFusion(n) && ("fusionId" in n || ["queueStatus","queueRole","queueOrder","archivedAt"].some(k => k in n) || ![undefined,"standard"].includes(n.cardType) || members(notes,n.id).length < 2)) return false;
      return !("fusionId" in n) || (eligible(n) && typeof n.fusionId === "string" && groups.has(n.fusionId));
    });
  }
  function release(notes,id) {
    return notes.filter(n => n.id !== id).map(n => {
      if (n.fusionId !== id) return n;
      const copy = {...n}; delete copy.fusionId; return copy;
    });
  }
  function detach(notes,id) {
    const group = notes.find(n => n.id === id)?.fusionId;
    if (!group) return notes;
    if (members(notes,group).length <= 2) return release(notes,group);
    return notes.map(n => { if (n.id !== id) return n; const copy = {...n}; delete copy.fusionId; return copy; });
  }
  const remove = (notes,id) => detach(notes,id).filter(n => n.id !== id);
  function column(notes,id) {
    const rows = members(notes,id), pending = rows.filter(n => n.column !== "Done" && !n.archivedAt);
    if (!pending.length) return "Done";
    for (const c of ["Now","Next","Later","Hold"]) if (pending.some(n => n.column === c)) return c;
    return "Next";
  }
  function summary(notes,id) {
    const rows=members(notes,id),done=rows.filter(n => n.column==="Done").length;
    const hold=rows.filter(n=>n.column==="Hold" || ["blocked","failed"].includes(n.queueStatus)).length;
    const queued=rows.filter(n=>["queued","running"].includes(n.queueStatus)).length;
    return rows.length + "件中" + done + "件完了" + (hold ? " · 保留/失敗 " + hold + "件" : "") + (queued ? " · 予約 " + queued + "件" : "");
  }
  window.FusionModel={isFusion,eligible,members,valid,release,detach,remove,column,summary};
})();
