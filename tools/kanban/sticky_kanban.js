(() => {
  "use strict";
  const KEY = "public.sticky-kanban.r01";
  const COLUMNS = ["Now", "Next", "Later", "Hold", "Done"];
  const LABELS = ["いまやる", "つぎにやる", "あとでやる", "いったん保留", "完了"];
  const COLORS = ["yellow", "pink", "blue", "green", "white", "navy", "charcoal", "burgundy", "forest", "purple", "teal"];
  const Q = window.ReservationModel;
  const F = window.FusionModel;
  const isHandoff = note => note.id.startsWith("handoff-");
  const isRule = note => note.id.startsWith("policy-");
  const isMaintenance = note => note.id.startsWith("maintenance-");
  const board = document.getElementById("board");
  const form = document.getElementById("note-form");
  const titleInput = document.getElementById("note-title");
  const memoInput = document.getElementById("note-memo");
  const cardTypeInput = document.getElementById("note-card-type");
  const minutesMemoInput = document.getElementById("note-minutes-memo");
  const minutesFormField = document.getElementById("minutes-form-field");
  const priorityInput = document.getElementById("note-priority");
  const themeInput = document.getElementById("note-handoff-theme");
  const themeField = document.getElementById("handoff-theme-field");
  const isMeeting = note => note.cardType === "meeting" && !isHandoff(note) && !isRule(note) && !isMaintenance(note);
  cardTypeInput.addEventListener("change", () => {
    minutesFormField.hidden = cardTypeInput.value !== "meeting";
    themeField.hidden = cardTypeInput.value !== "command-handoff";
    if (cardTypeInput.value === "command-handoff" && !editingId && !memoInput.value.trim()) {
      memoInput.value = "【復元入口・参照先】\n\n【今回の成果・証跡】\n\n【未完了・次の作業】\n\n【Hold・Human Gate】\n\n【実行してよい範囲】\n";
    }
  });
  const completionMemoInput = document.getElementById("note-completion-memo");
  const dateInput = document.getElementById("note-date");
  const columnInput = document.getElementById("note-column");
  const status = document.getElementById("save-status");
  const error = document.getElementById("form-error");
  let selectedId = null, serverRevision = null, editingRevision = null, saveBusy = false;
  let editingRule = false, editingMaintenance = false;
  let queueSets, activeQueueSet = localStorage.getItem(KEY + ".selectedSet") || "default";
  const setDefinitions = () => queueSets || [{id:"default",name:"予約セット1"}];
  const setExecutor = id => setDefinitions().find(s => s.id === id)?.executor === "codex" ? "Codex" : "Work";
  const setName = id => setDefinitions().find(s => s.id === id)?.name || id;
  const selectedRows = () => Q.ordered(notes).filter(n => Q.setId(n) === activeQueueSet);
  const documentData = (items, sets = queueSets) => ({version:1, notes:items, ...(sets === undefined ? {} : {queueSets:sets})});
  let notes = [], savedRaw = null, editingId = null, editingRaw = null, draggedId = null, blocked = false;
  const message = (text, failed = false) => { status.textContent = text; status.classList.toggle("error", failed); };
  const validDate = (date) => date === "" || (/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date);
  const decode = (raw) => {
    if (raw === null) return [];
    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || !Array.isArray(data.notes)) throw new Error("形式が一致しません");
    const ids = new Set();
    for (const note of data.notes) {
      if (!note || typeof note.id !== "string" || !note.id || ids.has(note.id) || typeof note.title !== "string" || !note.title.trim() || note.title.length > 120 || typeof note.memo !== "string" || note.memo.length > 4000 || (note.archivedAt !== undefined && (typeof note.archivedAt !== "string" || (note.archivedAt && (note.column !== "Done" || !Number.isFinite(Date.parse(note.archivedAt)))))) || (note.completionMemo !== undefined && (typeof note.completionMemo !== "string" || note.completionMemo.length > 4000)) || (note.cardType !== undefined && !["standard","meeting","command-handoff"].includes(note.cardType)) || (note.minutesMemo !== undefined && (typeof note.minutesMemo !== "string" || note.minutesMemo.length > 4000)) || typeof note.date !== "string" || !validDate(note.date) || !COLUMNS.includes(note.column) || !COLORS.includes(note.color) || !Q.valid(note)) throw new Error("付箋の形式が一致しません");
      ids.add(note.id);
    }
    if (!F.valid(data.notes)) throw new Error("融合情報の形式が一致しません");
    if (!Q.validQueue(data.notes, data.queueSets)) throw new Error("予約キューの形式が一致しません");
    return data.notes;
  };
  function cloudMessage(){message('このデモのブラウザ内に保存済み · 外部同期なし');}
  const persist = async (next, expected = savedRaw, revision = serverRevision, nextSets = queueSets) => {
    if (blocked || saveBusy) return false;
    next = next.map(Q.syncState);
    if (localStorage.getItem(KEY) !== expected) {
      error.textContent = "別のタブで変更されました。入力を控えて付箋を開き直してください。";
      return false;
    }
    saveBusy = true;
    try {
      const data = documentData(next, nextSets);
      const result = await api("POST", { data, expectedRevision: revision, overwrite: true });
      notes = next; queueSets = nextSets; serverRevision = result.revision;
      savedRaw = JSON.stringify(data);
      try { localStorage.setItem(KEY, savedRaw); }
      catch { message("保存を確認できません", true); }
      message("ブラウザ内に保存済み · 外部同期なし");
      render();
      return true;
    } catch (e) {
      error.textContent = "保存できませんでした。入力を控えて再読み込みしてください。";
      message("保存を確認できません · " + e.message, true);
      return false;
    } finally { saveBusy = false; render(); }
  };
  const detail = document.getElementById("note-detail");
  const editSelected = document.getElementById("edit-selected");
  function renderDetail() {
    const note = notes.find(item => item.id === selectedId);
    document.getElementById("detail-empty").hidden = !!note;
    document.getElementById("detail-content").hidden = !note;
    editSelected.hidden = !note || F.isFusion(note) || (!!note.archivedAt && !isHandoff(note) && !isRule(note) && !isMaintenance(note));
    editSelected.disabled = blocked;
    document.getElementById("archive-selected").hidden = !note || isRule(note) || isMaintenance(note) || note.column !== "Done" || !!note.archivedAt;
    document.getElementById("restore-selected").hidden = !note?.archivedAt || isRule(note) || isMaintenance(note);
    document.getElementById("archive-selected").disabled = blocked || saveBusy;
    document.getElementById("restore-selected").disabled = blocked || saveBusy;
    const reserve = document.getElementById("reserve-selected");
    reserve.hidden = !note || !Q.eligible(note) || !!note.archivedAt || note.column === "Done";
    reserve.disabled = blocked || saveBusy;
    reserve.textContent = Q.ACTIVE.has(note?.queueStatus) ? "⏰ 予約を解除" : "⏰ 予約する";
    if (!note) return;
    const flags = document.getElementById("detail-task-flags"); flags.replaceChildren();
    if (note.cardType === "command-handoff") flags.append(flag("✦ 司令塔引き継ぎ", "command-badge"));
    if (note.priority !== undefined || Q.ACTIVE.has(note.queueStatus)) flags.append(flag(`優先度 ${Q.priority(note)}`, "priority-badge"));
    if (note.fusionId) {
      const groupButton=document.createElement("button"); groupButton.type="button"; groupButton.textContent="🃏 融合カードへ";
      groupButton.addEventListener("click",()=>openFusion(note.fusionId)); flags.append(groupButton);
    }
    if (note.queueStatus) flags.append(flag(`予約：${Q.STATUSES[note.queueStatus]}${note.queueRole === "end" ? " · 最後にEND" : ""}`, "queue-state-badge"));
    document.getElementById("detail-title").textContent = note.title;
    document.getElementById("detail-column").textContent = isRule(note) ? "運用ルール" : isMaintenance(note) ? "定期メンテナンス" : note.archivedAt ? "アーカイブ（Done）" : note.column;
    const date = document.getElementById("detail-date");
    date.textContent = note.date.replaceAll("-", "/");
    date.dateTime = note.date;
    date.hidden = !note.date;
    document.getElementById("detail-memo").textContent = note.memo || "メモはありません。";
    document.getElementById("detail-minutes-section").hidden = !isMeeting(note);
    document.getElementById("detail-minutes-memo").textContent = note.minutesMemo || "議事録メモはありません。";
    document.getElementById("detail-completion-memo").textContent = note.completionMemo || "完了メモはありません。";
  }
  function showDetail(id = selectedId) {
    selectedId = notes.some(item => item.id === id) ? id : null;
    editingId = null; editingRaw = null;
    form.hidden = true; detail.hidden = false;
    document.getElementById("editor-heading").textContent = "付箋の詳細";
    error.textContent = "";
    render();
  }
  editSelected.addEventListener("click", () => { if (!blocked && selectedId) editor(selectedId); });
  const editor = (id = null, column = "Now", focus = true, createRule = false) => {
    const note = notes.find((item) => item.id === id);
    selectedId = note ? note.id : null;
    form.hidden = false; detail.hidden = true; editSelected.hidden = true;
    editingId = note ? note.id : null; editingRaw = savedRaw; editingRevision = serverRevision;
    editingRule = note ? isRule(note) : createRule;
    editingMaintenance = !!note && isMaintenance(note);
    form.reset();
    cardTypeInput.value = note?.cardType || "standard";
    priorityInput.value = note?.priority ?? "";
    themeInput.value = note?.handoffTheme || "gold";
    themeField.hidden = cardTypeInput.value !== "command-handoff";
    cardTypeInput.disabled = editingRule || editingMaintenance;
    minutesMemoInput.value = note?.minutesMemo || "";
    minutesFormField.hidden = cardTypeInput.value !== "meeting" || editingRule || editingMaintenance;
    titleInput.value = note?.title || ""; memoInput.value = note?.memo || ""; completionMemoInput.value = note?.completionMemo || ""; dateInput.value = note?.date || ""; columnInput.value = note?.column || column;
    columnInput.disabled = editingRule || editingMaintenance;
    document.getElementById("rule-form-hint").hidden = !editingRule;
    document.getElementById("maintenance-form-hint").hidden = !editingMaintenance;
    form.querySelector(`input[name=color][value=${note?.color || "yellow"}]`).checked = true;
    document.getElementById("editor-heading").textContent = editingRule ? (note ? "運用ルールを編集" : "新しい運用ルール") : editingMaintenance ? "定期メンテナンスを編集" : note ? "付箋を編集" : "新しい付箋を追加";
    document.getElementById("save-note").textContent = note ? "変更を保存" : "追加する";
    document.getElementById("edit-actions").hidden = false;
    document.getElementById("delete-note").hidden = !note;
    error.textContent = "";
    render();
    if (focus) titleInput.focus();
  };
  document.querySelectorAll("[data-copy-field]").forEach(button => button.addEventListener("click", async () => {
    const note = notes.find(n => n.id === selectedId); if (!note) return;
    const value = note[button.dataset.copyField] || "";
    try { await navigator.clipboard.writeText(value); button.textContent = "コピーしました"; }
    catch { const target = document.getElementById({memo:"detail-memo",minutesMemo:"detail-minutes-memo",completionMemo:"detail-completion-memo"}[button.dataset.copyField]); const range = document.createRange(); range.selectNodeContents(target); getSelection().removeAllRanges(); getSelection().addRange(range); button.textContent = "本文を選択しました"; }
    setTimeout(() => { button.textContent = {memo:"詳細メモをコピー",minutesMemo:"議事録メモをコピー",completionMemo:"完了メモをコピー"}[button.dataset.copyField]; }, 1800);
  }));
  const isProduction = note => note.id.startsWith("production-meeting-");
  const onBoard = note => !note.fusionId && !F.isFusion(note) && !isHandoff(note) && !isHandoff(note) && !isRule(note) && !isMaintenance(note) && !note.archivedAt && !(isProduction(note) && note.column === "Later");
  function render() {
    renderProduction();
    renderRules();
    renderHandoffs();
    renderFollowups();
    renderMaintenance();
    renderQueue();
    renderFusionView();
    document.getElementById("new-fusion").disabled = blocked || saveBusy;
    board.replaceChildren();
    const archived = notes.filter(note => !!note.archivedAt && !isHandoff(note) && !isRule(note) && !isMaintenance(note));
    const toggle = document.getElementById("toggle-archive");
    toggle.textContent = `📦 アーカイブ (${archived.length})`; toggle.disabled = blocked;
    document.getElementById("archive-done").disabled = blocked || saveBusy || !notes.some(note => !isHandoff(note) && !isRule(note) && !isMaintenance(note) && note.column === "Done" && !note.archivedAt);
    const archiveList = document.getElementById("archive-list"); archiveList.replaceChildren();
    if (!archived.length) archiveList.textContent = "アーカイブした付箋はありません。";
    archived.forEach(note => {
      const row = document.createElement("div"); row.className = "archive-row"; row.dataset.noteId = note.id;
      const open = document.createElement("button"); open.type = "button"; open.className = "archive-title"; open.textContent = note.title; open.addEventListener("click", () => showDetail(note.id));
      const label = document.createElement("span"); label.className = "memo-status"; label.textContent = note.completionMemo?.trim() ? "完了メモあり" : "未記入";
      const restore = document.createElement("button"); restore.type = "button"; restore.textContent = "Doneへ戻す"; restore.disabled = blocked || saveBusy; restore.addEventListener("click", () => setArchive(note.id, false));
      row.append(open, label, restore); archiveList.append(row);
    });
    COLUMNS.forEach((column, index) => {
      const section = document.createElement("section"); section.className = "column"; section.dataset.column = column; section.setAttribute("aria-label", column);
      const top = document.createElement("div"); top.className = "column-top";
      const heading = document.createElement("h2"); heading.textContent = column;
      const count = document.createElement("span"); count.className = "count"; count.textContent = String(notes.filter((note) => note.column === column && onBoard(note)).length + notes.filter(n => F.isFusion(n) && F.column(notes,n.id) === column).length); heading.append(count);
      const add = document.createElement("button"); add.type = "button"; add.className = "add-note"; add.textContent = "＋ 追加"; add.disabled = blocked; add.setAttribute("aria-label", `${column}に付箋を追加`); add.addEventListener("click", () => editor(null, column));
      top.append(heading, add);
      const description = document.createElement("p"); description.className = "column-description"; description.textContent = LABELS[index];
      const list = document.createElement("div"); list.className = "notes";
      const items = notes.filter((note) => note.column === column && onBoard(note));
      renderFusionCards(column,list);
      if (!items.length && !list.childNodes.length) { const empty = document.createElement("p"); empty.className = "empty"; empty.textContent = "まだ付箋はありません"; list.append(empty); }
      items.forEach((note) => {
        const card = document.createElement("article"); card.className = `note ${note.color}`; card.dataset.noteId = note.id; card.tabIndex = 0; card.draggable = !blocked; card.setAttribute("role", "button"); card.setAttribute("aria-label", `${note.title}の詳細を表示`); card.setAttribute("aria-pressed", String(note.id === selectedId)); card.classList.toggle("selected", note.id === selectedId);
        const mark = document.createElement("span"); mark.className = "edit-mark"; mark.textContent = "•••"; mark.setAttribute("aria-hidden", "true");
        const title = document.createElement("h3"); title.textContent = note.title; card.append(mark, title);
        if (note.cardType === "command-handoff") {
          card.classList.add("command-handoff", `command-theme-${note.handoffTheme || "gold"}`);
          card.prepend(flag("✦ 司令塔引き継ぎ", "command-badge"));
        }
        const badge = document.createElement("span"); badge.className = "memo-status" + (note.completionMemo?.trim() ? " has-memo" : ""); badge.textContent = note.completionMemo?.trim() ? "完了メモあり" : "未記入"; card.append(badge);
        const tools = document.createElement("div"); tools.className = "note-task-tools";
        if (note.priority !== undefined || Q.ACTIVE.has(note.queueStatus)) tools.append(flag(`P${Q.priority(note)}`, "priority-badge"));
        if (note.column !== "Done") {
          const reserve = document.createElement("button"); reserve.type = "button"; reserve.className = "reserve-note";
          reserve.textContent = Q.ACTIVE.has(note.queueStatus) ? "予約済み −" : "＋ 予約";
          reserve.setAttribute("aria-label", `${note.title}の予約${Q.ACTIVE.has(note.queueStatus) ? "を解除" : "に追加"}`);
          reserve.disabled = blocked || saveBusy;
          reserve.addEventListener("click", e => { e.stopPropagation(); toggleReservation(note.id); }); tools.append(reserve);
        }
        if (tools.childNodes.length) card.append(tools);
        card.addEventListener("click", () => { if (!draggedId) showDetail(note.id); });
        card.addEventListener("keydown", (e) => { if (e.target === card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); showDetail(note.id); } });
        card.addEventListener("dragstart", (e) => { draggedId = note.id; card.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", note.id); });
        card.addEventListener("dragend", () => { draggedId = null; card.classList.remove("dragging"); document.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over")); });
        list.append(card);
      });
      section.addEventListener("dragover", (e) => { if (!draggedId || blocked) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; section.classList.add("drag-over"); });
      section.addEventListener("dragleave", (e) => { if (!section.contains(e.relatedTarget)) section.classList.remove("drag-over"); });
      section.addEventListener("drop", async (e) => {
        e.preventDefault(); section.classList.remove("drag-over");
        const id = draggedId; draggedId = null;
        if (blocked || !id || !notes.some((note) => note.id === id)) return;
        if (await persist(notes.map((note) => note.id === id ? { ...note, column } : note))) {
          if (editingId === id) editor(id, column, false);
        }
      });
      section.append(top, description, list); board.append(section);
    });
    if (form.hidden) renderDetail();
  }
  function flag(text, className) {
    const span = document.createElement("span"); span.className = className; span.textContent = text; return span;
  }
  const fusionDialog = document.getElementById("fusion-dialog");
  const fusionForm = document.getElementById("fusion-form");
  const fusionError = document.getElementById("fusion-error");
  let fusionId = null, fusionRaw = null, fusionRevision = null, fusionSelection = new Set();
  const fusionGuard = () => {
    if (blocked || saveBusy) return false;
    if (!form.hidden) { message("編集中の内容を保存するか、編集をやめてください。",true); return false; }
    return true;
  };
  function renderFusionCards(column,list) {
    for (const group of notes.filter(n => F.isFusion(n) && F.column(notes,n.id) === column)) {
      const card = document.createElement("article"); card.className="fusion-card"; card.dataset.fusionId=group.id;
      const title=document.createElement("h3"); title.textContent="🃏 "+group.title;
      const summary=document.createElement("p");summary.textContent=F.summary(notes,group.id);
      const open=document.createElement("button");open.type="button";open.textContent="開く";open.disabled=blocked;
      open.addEventListener("click",()=>openFusion(group.id));card.append(title,summary,open);list.append(card);
    }
  }
  function renderFusionChoices() {
    const list=document.getElementById("fusion-choices"),search=document.getElementById("fusion-search").value.toLocaleLowerCase();
    list.replaceChildren();
    for(const note of notes.filter(n=>F.eligible(n) && (!n.fusionId || n.fusionId===fusionId) && (!n.archivedAt || fusionSelection.has(n.id)) && n.title.toLocaleLowerCase().includes(search))) {
      const label=document.createElement("label");label.className="fusion-choice";
      const input=document.createElement("input");input.type="checkbox";input.value=note.id;input.checked=fusionSelection.has(note.id);
      input.addEventListener("change",()=>{if(input.checked)fusionSelection.add(note.id);else fusionSelection.delete(note.id);document.getElementById("fusion-selected-count").textContent=fusionSelection.size+"枚を選択";});
      const text=document.createElement("span");text.textContent=note.title+" · "+note.column;
      label.append(input,text);list.append(label);
    }
    document.getElementById("fusion-selected-count").textContent=fusionSelection.size+"枚を選択";
  }
  function editFusion(id=null) {
    if(!fusionGuard())return;
    fusionId=id;fusionRaw=savedRaw;fusionRevision=serverRevision;fusionError.textContent="";
    const group=notes.find(n=>n.id===id);
    fusionSelection=new Set(F.members(notes,id).map(n=>n.id));
    document.getElementById("fusion-heading").textContent=group?"🃏 融合カードの編集":"🃏 カードを融合";
    document.getElementById("fusion-title").value=group?.title||"";
    document.getElementById("fusion-search").value="";
    document.getElementById("fusion-summary").textContent="2枚以上を選んでまとめます。元カードはそのまま保持され、いつでも分離できます。";
    document.getElementById("fusion-view").hidden=true;fusionForm.hidden=false;
    document.getElementById("fusion-save").textContent=group?"構成を保存":"融合する";
    renderFusionChoices();if(!fusionDialog.open)fusionDialog.showModal();
  }
  function openFusion(id) {
    if(!fusionGuard())return;
    fusionId=id;fusionRaw=savedRaw;fusionRevision=serverRevision;fusionError.textContent="";
    fusionForm.hidden=true;document.getElementById("fusion-view").hidden=false;
    renderFusionView();if(!fusionDialog.open)fusionDialog.showModal();
  }
  function renderFusionView() {
    if(!fusionId || !fusionForm.hidden)return;
    const group=notes.find(n=>n.id===fusionId);
    if(!group){if(fusionDialog.open)fusionDialog.close();return;}
    document.getElementById("fusion-heading").textContent="🃏 "+group.title;
    document.getElementById("fusion-summary").textContent=F.summary(notes,group.id)+" · 各カードの現在の状態";
    const list=document.getElementById("fusion-members");list.replaceChildren();
    for(const note of F.members(notes,group.id)){
      const row=document.createElement("article");row.className="fusion-member";row.dataset.memberId=note.id;
      const title=document.createElement("h3");title.textContent=note.title;
      const state=document.createElement("p");state.textContent=note.column+(note.archivedAt?" · アーカイブ":"")+(note.queueStatus?" · 予約："+Q.STATUSES[note.queueStatus]:"");
      const actions=document.createElement("div");actions.className="fusion-actions";
      const button=(text,action)=>{const b=document.createElement("button");b.type="button";b.textContent=text;b.disabled=blocked||saveBusy;b.addEventListener("click",action);actions.append(b);return b;};
      button("詳細",()=>{fusionDialog.close();showDetail(note.id);detail.scrollIntoView({block:"nearest"});});
      if(!note.archivedAt)button("編集",()=>{fusionDialog.close();editor(note.id);form.scrollIntoView({block:"nearest"});});
      if(!note.archivedAt && note.column!=="Done" && Q.eligible(note))button(Q.ACTIVE.has(note.queueStatus)?"予約を解除":"＋ 予約",async()=>{await toggleReservation(note.id);fusionRaw=savedRaw;fusionRevision=serverRevision;});
      button("取り出す",async()=>{
        if(!fusionGuard())return;
        const next=F.detach(notes,note.id);
        if(await persist(next,fusionRaw,fusionRevision)){
          fusionRaw=savedRaw;fusionRevision=serverRevision;
          if(!notes.some(n=>n.id===fusionId))fusionDialog.close();
        }else fusionError.textContent="保存できませんでした。再読み込みして状態を確認してください。";
      });
      row.append(title,state,actions);list.append(row);
    }
    document.getElementById("fusion-release").disabled=blocked||saveBusy;
    document.getElementById("fusion-reconfigure").disabled=blocked||saveBusy;
  }
  document.getElementById("new-fusion").addEventListener("click",()=>editFusion());
  document.getElementById("fusion-close").addEventListener("click",()=>fusionDialog.close());
  document.getElementById("fusion-search").addEventListener("input",renderFusionChoices);
  document.getElementById("fusion-reconfigure").addEventListener("click",()=>editFusion(fusionId));
  document.getElementById("fusion-release").addEventListener("click",async()=>{
    if(!fusionGuard())return;
    if(await persist(F.release(notes,fusionId),fusionRaw,fusionRevision))fusionDialog.close();
    else fusionError.textContent="保存できませんでした。再読み込みして状態を確認してください。";
  });
  fusionForm.addEventListener("submit",async event=>{
    event.preventDefault();if(!fusionGuard())return;fusionError.textContent="";
    const title=document.getElementById("fusion-title").value.trim();
    if(!title || title.length>120 || fusionSelection.size<2){fusionError.textContent="名前と2枚以上のカードを指定してください。";return;}
    const selected=notes.filter(n=>fusionSelection.has(n.id));
    if(selected.length!==fusionSelection.size || selected.some(n=>!F.eligible(n) || (n.fusionId && n.fusionId!==fusionId))){fusionError.textContent="カードの構成が変わりました。開き直してください。";return;}
    const id=fusionId||"fusion-"+crypto.randomUUID();
    let next=notes.map(n=>{
      const copy={...n};if(copy.fusionId===id)delete copy.fusionId;
      if(fusionSelection.has(n.id))copy.fusionId=id;
      if(n.id===id)copy.title=title;return copy;
    });
    if(!fusionId)next.push({id,title,memo:"表示を束ねる融合カード。中のカードの進行・受入・予約は個別に管理する。",date:"",color:"purple",column:"Next",cardType:"standard"});
    if(await persist(next,fusionRaw,fusionRevision)){
      fusionId=id;fusionRaw=savedRaw;fusionRevision=serverRevision;
      fusionForm.hidden=true;document.getElementById("fusion-view").hidden=false;renderFusionView();
    }else fusionError.textContent="保存できませんでした。再読み込みして状態を確認してください。";
  });

  const queueDialog = document.getElementById("queue-dialog");
  const queueError = document.getElementById("queue-error");
  function queueGuard() {
    if (blocked || saveBusy) return false;
    if (!form.hidden) { queueError.textContent = "編集中の内容を保存するか、編集をやめてください。"; message(queueError.textContent, true); return false; }
    return true;
  }
  async function queueCommit(next) {
    if (!queueGuard()) return false;
    queueError.textContent = "";
    if (!await persist(next)) { queueError.textContent = "予約を保存できませんでした。再読み込みして最新の内容を確認してください。"; return false; }
    return true;
  }
  async function toggleReservation(id) {
    if (!queueGuard()) return;
    const note = notes.find(n => n.id === id);
    if (!note || !Q.eligible(note) || note.archivedAt || note.column === "Done") return;
    if (note.queueStatus === "running") { message("着手中の予約です。予約パネルで保留・失敗・完了を記録してください。", true); return; }
    const active = Q.ACTIVE.has(note.queueStatus);
    const order = Math.max(0, ...notes.map(n => n.queueOrder || 0)) + 1;
    await queueCommit(notes.map(n => n.id === id ? {...n,queueStatus:active ? "cancelled" : (n.column === "Hold" ? "blocked" : "queued"),queueOrder:active ? n.queueOrder : order,queueRole:n.queueRole || "task",queueSetId:active ? Q.setId(n) : activeQueueSet} : n));
  }
  async function queueState(id, state) {
    const note = notes.find(n => n.id === id); if (!note || !queueGuard()) return;
    if (state === "running") {
      const reason = Q.blockedReason(note,notes);
      if (note.queueStatus !== "queued" || reason) { queueError.textContent = reason || "待機中の予約だけ着手を記録できます。"; return; }
    }
    if (state === "queued" && note.column === "Hold") { queueError.textContent = "Holdを維持します。解除はカード側で判断してください。"; return; }
    if (state === "completed" && note.queueStatus !== "running") return;
    if (state === "cancelled" && note.queueStatus === "running") return;
    await queueCommit(notes.map(n => n.id === id ? {...n,queueStatus:state,...(state === "running" ? {column:"Now"} : state === "completed" ? {column:"Done"} : state === "blocked" ? {column:"Hold"} : {})} : n));
  }
  async function reorderQueue(id, offset) {
    if (!queueGuard()) return;
    const rows = selectedRows();
    if (notes.some(n => n.queueStatus === "running")) return;
    const i = rows.findIndex(n => n.id === id), j = i + offset;
    if (i < 0 || j < 0 || j >= rows.length || Q.rank(rows[i]) !== Q.rank(rows[j])) return;
    [rows[i],rows[j]] = [rows[j],rows[i]];
    const ranks = new Map(rows.map((n,k) => [n.id,k+1]));
    await queueCommit(notes.map(n => ranks.has(n.id) ? {...n,queueOrder:ranks.get(n.id)} : n));
  }
  function queueInstructions() {
    const rows = selectedRows();
    return ["予約キューの実行依頼用下書き",`担当: ${setExecutor(activeQueueSet)}`,`対象セット: ${setName(activeQueueSet)} / ID: ${activeQueueSet}`,"このセットだけを実行対象とし、別セットへ自動で進まないでください。",`取得revision: ${serverRevision}`,"",
      "本人から実行指示を受けた担当AIが、最新のカードを再読して順番に処理してください。予約登録・装飾は実行許可やGate解除を意味しません。",
      "Hold・Human Gate・許可範囲・同時進行を確認し、未承認事項や失敗があれば後続を停止して記録してください。報告値を検証済みに格上げしないでください。",
      "最後のENDは先行予約が完了してから。カードのDoneと予約のcompletedを併せて記録し、ENDの証跡確認・保全は既存手順を使ってください。",
      "対象は下記のカードIDだけです。途中で予約が増えても今回の対象へ自動追加せず、同名の別カードやキュー外のHold案件を推測で実行しないでください。", "",
      ...rows.map((n,i) => `${i+1}. ${n.queueRole === "end" ? "【最後にEND】" : ""}${n.title}\nカードID: ${n.id}\n優先度: ${Q.priority(n)} / 状態: ${Q.STATUSES[n.queueStatus]} / 列: ${n.column}\n${n.memo}`)
    ].join("\n\n");
  }
  function renderQueue() {
    if (!blocked && !setDefinitions().some(s => s.id === activeQueueSet)) activeQueueSet = "default";
    const selector = document.getElementById("queue-set-select"); selector.replaceChildren();
    for (const set of setDefinitions()) { const o = document.createElement("option"); o.value=set.id; o.textContent=`${set.executor === "codex" ? "Codex" : "Work"} · ${set.name}${set.plannedDate ? " · "+set.plannedDate+" JST" : ""} (${Q.ordered(notes).filter(n => Q.setId(n) === set.id).length})`; selector.append(o); }
    selector.value = activeQueueSet;
    document.getElementById("queue-set-date").value = setDefinitions().find(s=>s.id===activeQueueSet)?.plannedDate || "";
    document.getElementById("queue-set-executor").value = setExecutor(activeQueueSet).toLowerCase();
    document.getElementById("queue-export").textContent = `${setExecutor(activeQueueSet)}へ渡す開始依頼`;
    const rows = selectedRows(), history = notes.filter(n => Q.setId(n) === activeQueueSet && ["completed","cancelled"].includes(n.queueStatus)).sort((a,b) => b.queueOrder-a.queueOrder);
    const locked = blocked || saveBusy, running = notes.some(n => n.queueStatus === "running");
    const toggle = document.getElementById("toggle-queue"); toggle.textContent = `⏰ 予約タスク (${Q.ordered(notes).length})`; toggle.disabled = blocked;
    const list = document.getElementById("queue-list"); list.replaceChildren();
    if (!rows.length) { const empty = document.createElement("p"); empty.className = "queue-empty"; empty.textContent = "予約はありません。カードの「＋ 予約」から追加できます。"; list.append(empty); }
    rows.forEach((note,index) => {
      const row = document.createElement("section"); row.className = "queue-row" + (note.queueRole === "end" ? " queue-finalizer" : ""); row.dataset.queueId = note.id;
      const heading = document.createElement("div"); heading.className = "queue-row-heading";
      heading.append(flag(note.queueRole === "end" ? "END" : String(index+1),"queue-number"));
      const title = document.createElement("button"); title.type = "button"; title.className = "queue-title"; title.textContent = note.title;
      title.addEventListener("click", () => { queueDialog.close(); showDetail(note.id); detail.scrollIntoView({block:"nearest"}); }); heading.append(title);
      const meta = document.createElement("div"); meta.className = "queue-row-meta"; meta.append(flag(`P${Q.priority(note)}`,"priority-badge"),flag(Q.STATUSES[note.queueStatus],`queue-state-badge state-${note.queueStatus}`));
      if (note.queueRole === "end") meta.append(flag("最後にEND", "end-badge"));
      const reason = Q.blockedReason(note,notes);
      const hint = document.createElement("p"); hint.className = "queue-block-reason"; hint.textContent = reason;
      const controls = document.createElement("div"); controls.className = "queue-row-actions";
      const action = (label, key, disabled, handler) => {
        const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.dataset.queueAction = key; b.disabled = locked || disabled; b.addEventListener("click",handler); controls.append(b); return b;
      };
      const move = document.createElement("select"); move.className="queue-set-move"; move.setAttribute("aria-label", `${note.title}の移動先セット`);
      for (const s of setDefinitions()) { const o=document.createElement("option"); o.value=s.id; o.textContent=`${s.executor === "codex" ? "Codex" : "Work"} · ${s.name}`; move.append(o); }
      move.value=Q.setId(note); move.disabled=locked || running || setDefinitions().length < 2;
      move.addEventListener("change", async () => {
        const target=move.value;
        if (note.queueRole === "end" && Q.ordered(notes).some(n => Q.setId(n) === target && n.queueRole === "end")) { queueError.textContent="移動先には既にENDがあります。"; move.value=Q.setId(note); return; }
        if (!await queueCommit(notes.map(n => n.id===note.id ? {...n,queueSetId:target,queueOrder:Math.max(0,...notes.map(x=>x.queueOrder||0))+1} : n))) move.value=Q.setId(note);
      }); controls.append(move);
      const isEnd = note.queueRole === "end";
      action("↑", "up", running || isEnd || index === 0 || Q.rank(note)!==Q.rank(rows[index-1]), () => reorderQueue(note.id,-1)).setAttribute("aria-label", `${note.title}を前へ`);
      action("↓", "down", running || isEnd || index >= rows.length-1 || Q.rank(note)!==Q.rank(rows[index+1]), () => reorderQueue(note.id,1)).setAttribute("aria-label", `${note.title}を後へ`);
      action("着手を記録", "running", note.queueStatus !== "queued" || !!reason, () => queueState(note.id,"running"));
      action("完了を記録（Done）", "completed", note.queueStatus !== "running", () => queueState(note.id,"completed"));
      if (note.queueStatus === "running") {
        action("保留を記録", "blocked", false, () => queueState(note.id,"blocked"));
        action("失敗を記録", "failed", false, () => queueState(note.id,"failed"));
      } else if (["blocked","failed"].includes(note.queueStatus)) {
        action("待機へ戻す", "queued", note.column === "Hold", () => queueState(note.id,"queued"));
      }
      action(isEnd ? "END指定を解除" : "最後のENDに指定", "role", running || Q.isDoneAudit(note) || (!isEnd && rows.some(n => n.queueRole === "end")), () => queueCommit(notes.map(n => n.id === note.id ? {...n,queueRole:isEnd ? "task" : "end"} : n)));
      action("予約解除", "cancelled", note.queueStatus === "running", () => queueState(note.id,"cancelled"));
      row.append(heading,meta); if (reason) row.append(hint); row.append(controls); list.append(row);
    });
    document.getElementById("queue-set-executor").disabled = locked || running;
    document.getElementById("queue-set-date").disabled = locked || running;
    document.getElementById("queue-set-name").disabled = locked || running;
    document.getElementById("queue-set-create").disabled = locked || running || setDefinitions().length >= 50;
    document.getElementById("queue-set-rename").disabled = locked || running;
    document.getElementById("queue-set-delete").disabled = locked || running || activeQueueSet === "default" || notes.some(n => Q.setId(n) === activeQueueSet && n.queueStatus);
    document.getElementById("queue-sort").disabled = locked || running || rows.length < 2;
    document.getElementById("queue-add-end").disabled = locked || running || rows.some(n => n.queueRole === "end");
    document.getElementById("queue-add-done").disabled = locked || running;
    const count = new Set(notes.filter(n => !n.id.startsWith("fusion-") && !n.archivedAt && n.column==="Done" && (n.completionMemo||"").trim()).map(n=>n.id)).size;
    document.getElementById("done-backlog-status").textContent = blocked ? "Done整理待ち：未確認（再読込してください）" : `Done整理待ち：${count}件${count>=10 ? "（10件以上）・予約タスク → Done整理" : ""} · 読込時点の情報`;
    document.getElementById("queue-export").disabled = locked || !rows.length;
    document.getElementById("queue-history-heading").textContent = `完了・取消 (${history.length})`;
    const h = document.getElementById("queue-history-list"); h.replaceChildren();
    for (const n of history) {
      const button = document.createElement("button"); button.type = "button"; button.className = "queue-history-item"; button.textContent = `${Q.STATUSES[n.queueStatus]} · ${n.title}`;
      button.addEventListener("click", () => { queueDialog.close(); showDetail(n.id); }); h.append(button);
    }
    if (!document.getElementById("queue-export-panel").hidden) document.getElementById("queue-instructions").value = queueInstructions();
  }
  document.getElementById("queue-set-select").addEventListener("change", e => {
    activeQueueSet=e.target.value; localStorage.setItem(KEY+".selectedSet",activeQueueSet); queueError.textContent=""; renderQueue();
  });
  async function changeQueueSets(action) {
    if (!queueGuard() || notes.some(n=>n.queueStatus==="running")) return;
    const input=document.getElementById("queue-set-name"), name=input.value.trim() || (action==="rename" ? setName(activeQueueSet) : "");
    if (action!=="delete" && (!name || name.length>60)) { queueError.textContent="セット名を1〜60文字で入力してください。"; return; }
    const executor=document.getElementById("queue-set-executor").value;
    const plannedDate=document.getElementById("queue-set-date").value;
    if (!validDate(plannedDate) || plannedDate.startsWith("0000")) {queueError.textContent="予定日を確認してください";return;}
    let next=setDefinitions().map(s=>({...s})), selected=activeQueueSet;
    if (action==="create") { if(next.length>=50)return; selected=crypto.randomUUID(); next.push({id:selected,name,executor,...(plannedDate?{plannedDate}:{})}); }
    if (action==="rename") next=next.map(s=>{if(s.id!==selected)return s;const value={...s,name,executor};if(plannedDate)value.plannedDate=plannedDate;else delete value.plannedDate;return value;});
    if (action==="delete") {
      if(selected==="default" || notes.some(n=>Q.setId(n)===selected && n.queueStatus)) {queueError.textContent="予約・履歴があるセットは削除できません。"; return;}
      next=next.filter(s=>s.id!==selected);selected="default";
    }
    if(await persist(notes,savedRaw,serverRevision,next)) {activeQueueSet=selected;localStorage.setItem(KEY+".selectedSet",selected);input.value="";renderQueue();}
    else queueError.textContent="セットを保存できません。再読み込みして確認してください。";
  }
  for(const action of ["create","rename","delete"])document.getElementById("queue-set-"+action).addEventListener("click",()=>changeQueueSets(action));
  document.getElementById("toggle-queue").addEventListener("click", () => { queueError.textContent = ""; renderQueue(); if (!queueDialog.open) queueDialog.showModal(); });
  document.getElementById("queue-close").addEventListener("click", () => queueDialog.close());
  document.getElementById("reserve-selected").addEventListener("click", () => toggleReservation(selectedId));
  document.getElementById("queue-sort").addEventListener("click", () => {
    if (!queueGuard()) return;
    const rows = selectedRows(); if (notes.some(n => n.queueStatus === "running")) return;
    rows.sort((a,b) => Q.rank(a)-Q.rank(b) || Q.priority(a)-Q.priority(b) || a.queueOrder-b.queueOrder);
    const ranks = new Map(rows.map((n,i) => [n.id,i+1]));
    queueCommit(notes.map(n => ranks.has(n.id) ? {...n,queueOrder:ranks.get(n.id)} : n));
  });
  document.getElementById("queue-add-done").addEventListener("click", async () => {
    if (!queueGuard() || notes.some(n=>n.queueStatus==="running")) return;
    const existing=selectedRows().find(Q.isDoneAudit);
    if(existing) {queueError.textContent=`このセットに既存のDone整理予約があります：${existing.title}`;return;}
    const executor=setExecutor(activeQueueSet);
    const card={id:"done-audit-"+crypto.randomUUID(),title:`Done整理｜${setName(activeQueueSet)}`,memo:`担当：${executor}。開始指示後、policy-sticky-kanban-done-handoff-r01-20261020 の運用で実行。開始時に未整理Doneの対象IDを固定し、完了範囲・証跡・残件・引受先・Human Gateを1件ずつ確認。必要な引き継ぎを補完し保存再読後、条件を満たす対象だけアーカイブ。未確認・行き先不明・未承認Gateは理由/再開条件を記録してスキップ。依存不能・保存競合は停止。残件数・理由・次の行動を報告。クリックは予約保存のみ。通常タスク→Done整理→ENDの順。`,date:"",column:"Next",color:"charcoal",queueRole:"task",queueStatus:"queued",queueSetId:activeQueueSet,queueOrder:Math.max(0,...notes.map(n=>n.queueOrder||0))+1};
    if(await queueCommit([...notes,card])) {
      try {const check=await api("GET");if(!check.data.notes.some(n=>n.id===card.id))throw Error("予約の読戻し不一致");queueError.textContent="Done整理を予約・再読確認しました。実処理は開始していません。";}
      catch(e){queueError.textContent="保存後の確認が未確定です。追加操作をせず再読み込みしてください。";blocked=true;renderQueue();}
    }
  });
  document.getElementById("queue-add-end").addEventListener("click", () => {
    if (!queueGuard() || notes.some(n=>n.queueStatus==="running") || selectedRows().some(n => n.queueRole === "end")) return;
    queueCommit([...notes,{id:crypto.randomUUID(),title:`END処理｜${setName(activeQueueSet)}終了後`,memo:"先行予約の完了後、既存END手順で今回の成果・残件・Holdを保存し、読み戻し・保全・復元入口を確認する。未承認Gateは維持する。",date:"",column:"Next",color:"charcoal",priority:10,queueSetId:activeQueueSet,queueRole:"end",queueStatus:"queued",queueOrder:Math.max(0,...notes.map(n => n.queueOrder || 0))+1}]);
  });
  document.getElementById("queue-export").addEventListener("click", () => { document.getElementById("queue-export-panel").hidden = false; document.getElementById("queue-instructions").value = queueInstructions(); });
  document.getElementById("queue-copy").addEventListener("click", async () => {
    const text = document.getElementById("queue-instructions"); text.value = queueInstructions();
    try { await navigator.clipboard.writeText(text.value); document.getElementById("queue-copy").textContent = "コピーしました"; }
    catch { text.focus(); text.select(); document.getElementById("queue-copy").textContent = "指示書を選択しました"; }
  });
  const handoffDialog = document.getElementById("handoff-dialog");
  let handoffId = null, handoffRaw = null, handoffRevision = null;
  const handoffSources = note => (note.memo.match(/^元カードID：(.+)$/m)?.[1] || "").split(" / ").filter(Boolean);
  function renderHandoffs() {
    const items = notes.filter(isHandoff), pending = items.filter(n => n.column !== "Done"), resolved = items.filter(n => n.column === "Done");
    const toggle = document.getElementById("toggle-handoffs");
    toggle.textContent = `🔗 引き継ぎ (${pending.length})`; toggle.disabled = blocked;
    document.getElementById("handoff-resolved-heading").textContent = `処理済み・移管先あり (${resolved.length})`;
    for (const [id, rows] of [["handoff-list", pending], ["handoff-resolved-list", resolved]]) {
      const list = document.getElementById(id); list.replaceChildren();
      if (!rows.length) { const empty = document.createElement("p"); empty.textContent = id === "handoff-list" ? "未処理の引き継ぎはありません。" : "処理済みはありません。"; list.append(empty); }
      for (const note of rows) {
        const row = document.createElement("div"); row.className = "archive-row handoff-row"; row.dataset.handoffId = note.id;
        const button = document.createElement("button"); button.type = "button"; button.className = "archive-title"; button.textContent = note.title; button.addEventListener("click", () => openHandoff(note.id));
        const label = document.createElement("span"); label.className = "memo-status"; label.textContent = note.column === "Done" ? (note.completionMemo.startsWith("移管先あり") ? "移管先あり" : "処理済み") : "要確認・未処理";
        const promote = document.createElement("button"); promote.type = "button";
        const link = followupLink(note);
        promote.textContent = link.id ? "カードを開く" : "📋 カード化";
        promote.disabled = blocked || saveBusy || (!link.id && note.column === "Done");
        promote.addEventListener("click", () => cardifyHandoff(note.id));
        row.append(button, label, promote); list.append(row);
      }
    }
    if (handoffDialog.open) refreshHandoff();
  }
  function refreshHandoff() {
    const note = notes.find(n => n.id === handoffId && isHandoff(n));
    if (!note) { handoffDialog.close(); return; }
    document.getElementById("handoff-dialog-title").textContent = note.title;
    document.getElementById("handoff-state").textContent = note.column === "Done" ? "処理済み・移管先あり（作業完了とは別）" : "要確認・未処理（欠落や未達成の断定ではありません）";
    document.getElementById("handoff-memo").textContent = note.memo;
    document.getElementById("handoff-result").textContent = note.completionMemo || "処理記録はありません。";
    const links = document.getElementById("handoff-source-links"); links.replaceChildren();
    for (const id of handoffSources(note)) {
      const source = notes.find(n => n.id === id);
      const button = document.createElement("button"); button.type = "button"; button.textContent = source ? `元カード：${source.title}` : `元カード未取得：${id}`; button.disabled = !source;
      button.addEventListener("click", () => { handoffDialog.close(); showDetail(id); document.getElementById("note-detail").scrollIntoView({block:"nearest"}); }); links.append(button);
    }
    const promote = document.getElementById("handoff-cardify"), link = followupLink(note);
    promote.textContent = link.id ? "カードを開く" : "📋 カード化";
    promote.disabled = blocked || saveBusy || (!link.id && note.column === "Done");
    document.getElementById("handoff-reopen").hidden = note.column !== "Done";
    document.querySelectorAll("#handoff-form button").forEach(b => { b.disabled = blocked || saveBusy; });
  }
  // Use existing IDs and memo links so old clients preserve the v1 document.
  const followupId = source => "followup-" + source.id.slice("handoff-".length);
  function followupLink(source) {
    const matches = [...(source.completionMemo || "").matchAll(/^移管先あり：([^\n]+)$/gm)];
    const id = matches.length ? matches[matches.length - 1][1].trim() : null;
    if (id) return {id, target:notes.find(n => n.id === id && !isHandoff(n) && !isRule(n) && !isMaintenance(n))};
    const deterministic = notes.find(n => n.id === followupId(source));
    if (deterministic) return {id:deterministic.id, target:deterministic,
      collision:!deterministic.memo.startsWith("引き継ぎ元ID：" + source.id + "\n")};
    return {id:null};
  }
  function openFollowup(id) {
    handoffDialog.close();
    showDetail(id); document.getElementById("note-detail").scrollIntoView({block:"nearest"});
  }
  async function cardifyHandoff(id) {
    const err = document.getElementById("handoff-error"), listError = document.getElementById("followup-error");
    err.textContent = ""; listError.textContent = "";
    const fail = text => { err.textContent = text; listError.textContent = text; message(text, true); };
    if (blocked || saveBusy) return;
    if (!form.hidden) { fail("編集中の内容を保存するか、編集をやめてください。"); return; }
    const source = notes.find(n => n.id === id && isHandoff(n)); if (!source) return;
    const link = followupLink(source);
    if (link.id) {
      if (!link.target || link.collision) { fail("移管先が見つからないかIDが競合しています。新規作成せず確認してください。"); return; }
      openFollowup(link.id); return;
    }
    if (source.column === "Done") { fail("処理済みの項目は、必要なら未処理へ戻してからカード化してください。"); return; }
    const memo = "引き継ぎ元ID：" + source.id + "\n\n" + source.memo;
    const result = (source.completionMemo ? source.completionMemo + "\n\n" : "") +
      "移管先あり：" + followupId(source) + "\n残件・出典・Gateを後続カードへ引き継ぎ。カード化は実行開始・受入・Hold解除とは別。\n記録日時：" + new Date().toISOString();
    if (memo.length > 4000 || result.length > 4000) { fail("メモが4000文字を超えるため作成できません。原文を削らず整理してください。"); return; }
    const today = new Date(), date = [today.getFullYear(),String(today.getMonth()+1).padStart(2,"0"),String(today.getDate()).padStart(2,"0")].join("-");
    const target = {id:followupId(source),title:source.title,memo,date,color:source.color,
      column:source.column === "Hold" ? "Hold" : "Next",cardType:"standard"};
    if (source.priority !== undefined) target.priority = source.priority;
    // A single CAS save makes the task and its transfer record atomic.
    const expected = handoffDialog.open && handoffId === id ? handoffRaw : savedRaw;
    const revision = handoffDialog.open && handoffId === id ? handoffRevision : serverRevision;
    const next = [...notes.map(n => n.id === id ? {...n,column:"Done",completionMemo:result} : n),target];
    if (!await persist(next,expected,revision)) { fail("保存できませんでした。再読み込みして状態を確認してください。"); return; }
    handoffRaw = savedRaw; handoffRevision = serverRevision;
    document.getElementById("followup-panel").hidden = false;
    document.getElementById("toggle-followups").setAttribute("aria-expanded","true");
    openFollowup(target.id);
  }
  function renderFollowups() {
    const ids = new Set(notes.filter(isHandoff).map(n => followupLink(n)).filter(l => l.target && !l.collision).map(l => l.id));
    const items = notes.filter(n => ids.has(n.id));
    const toggle = document.getElementById("toggle-followups");
    toggle.textContent = "📋 後続タスク (" + items.length + ")"; toggle.disabled = blocked;
    const list = document.getElementById("followup-list"); list.replaceChildren();
    if (!items.length) { const p = document.createElement("p"); p.textContent = "カード化した後続タスクはありません。引き継ぎの「カード化」から追加できます。"; list.append(p); }
    for (const note of items) {
      const row = document.createElement("article"); row.className = "followup-card note " + note.color; row.dataset.followupId = note.id;
      const title = document.createElement("h3"); title.textContent = note.title;
      const state = document.createElement("p"); state.textContent = (note.archivedAt ? "アーカイブ · " : "") + note.column + (note.cardType === "meeting" ? " · 会議" : "");
      const actions = document.createElement("div"); actions.className = "followup-actions";
      const open = document.createElement("button"); open.type = "button"; open.textContent = "詳細"; open.addEventListener("click", () => openFollowup(note.id)); actions.append(open);
      if (!note.archivedAt) {
        const edit = document.createElement("button"); edit.type = "button"; edit.textContent = "編集・会議にする";
        edit.disabled = blocked || saveBusy;
        edit.addEventListener("click", () => {
          if (!form.hidden) { document.getElementById("followup-error").textContent = "編集中の内容を保存するか、編集をやめてください。"; return; }
          editor(note.id); form.scrollIntoView({block:"nearest"});
        }); actions.append(edit);
        if (note.column !== "Done" && Q.eligible(note)) {
          const reserve = document.createElement("button"); reserve.type = "button"; reserve.textContent = Q.ACTIVE.has(note.queueStatus) ? "予約を解除" : "＋ 予約";
          reserve.disabled = blocked || saveBusy;
          reserve.addEventListener("click", () => toggleReservation(note.id)); actions.append(reserve);
        }
      }
      row.append(title,state,actions); list.append(row);
    }
  }
  document.getElementById("toggle-followups").addEventListener("click", () => {
    const panel = document.getElementById("followup-panel"); panel.hidden = !panel.hidden;
    document.getElementById("toggle-followups").setAttribute("aria-expanded",String(!panel.hidden));
  });
  document.getElementById("handoff-cardify").addEventListener("click", () => cardifyHandoff(handoffId));
  function openHandoff(id) {
    handoffId = id; handoffRaw = savedRaw; handoffRevision = serverRevision; document.getElementById("handoff-form").reset(); document.getElementById("handoff-error").textContent = "";
    refreshHandoff(); if (!handoffDialog.open) handoffDialog.showModal();
  }
  document.getElementById("toggle-handoffs").addEventListener("click", () => {
    const panel = document.getElementById("handoff-panel"); panel.hidden = !panel.hidden;
    document.getElementById("toggle-handoffs").setAttribute("aria-expanded", String(!panel.hidden));
  });
  document.getElementById("handoff-close").addEventListener("click", () => handoffDialog.close());
  document.getElementById("handoff-form").addEventListener("submit", async event => {
    event.preventDefault(); const error = document.getElementById("handoff-error"); error.textContent = "";
    const note = notes.find(n => n.id === handoffId && isHandoff(n)); if (!note || blocked || saveBusy) return;
    if (!form.hidden) { error.textContent = "付箋の編集を保存するか、編集をやめてください。"; return; }
    const reason = document.getElementById("handoff-reason").value.trim(), targetId = document.getElementById("handoff-target").value.trim(), action = event.submitter?.value;
    if (!["transfer", "confirmed", "withdraw"].includes(action)) return;
    const target = notes.find(n => n.id === targetId && !F.isFusion(n) && !isHandoff(n) && !isRule(n));
    if (!reason) { error.textContent = "処理の範囲・根拠・理由を記入してください。"; return; }
    if (action === "transfer" && (!target || target.archivedAt || target.column === "Done" || handoffSources(note).includes(targetId))) { error.textContent = "移管先には元カード以外の未完了の既存カードIDを指定してください。"; return; }
    const label = {transfer:"移管先あり",confirmed:"解消確認",withdraw:"取り下げ"}[action];
    if (!confirm(`${label}として記録しますか？元カードと移管先の状態は変更しません。`)) return;
    const result = `${label}：${action === "transfer" ? targetId + "\n" : ""}${reason}\n記録日時：${new Date().toISOString()}`;
    const history = note.completionMemo ? note.completionMemo + "\n\n" : "";
    if ((history + result).length > 4000) { error.textContent = "処理履歴が長いため保存できません。Workへ整理を依頼してください。"; return; }
    if (!await persist(notes.map(n => n.id === note.id ? {...n, column:"Done", completionMemo:history + result} : n), handoffRaw, handoffRevision)) error.textContent = "保存できませんでした。内容を控えて再読み込みしてください。";
    handoffRaw = savedRaw; handoffRevision = serverRevision; refreshHandoff();
  });
  document.getElementById("handoff-reopen").addEventListener("click", async () => {
    if (!form.hidden || blocked || saveBusy) return;
    if (!confirm("処理履歴を残して未処理へ戻しますか？")) return;
    await persist(notes.map(n => n.id === handoffId && isHandoff(n) ? {...n, column:"Later"} : n), handoffRaw, handoffRevision); handoffRaw = savedRaw; handoffRevision = serverRevision; refreshHandoff();
  });
  function renderMaintenance() {
    const items = notes.filter(isMaintenance);
    const toggle = document.getElementById("toggle-maintenance");
    toggle.textContent = `🔧 定期メンテナンス (${items.length})`;
    toggle.disabled = blocked;
    const list = document.getElementById("maintenance-list");
    list.replaceChildren();
    if (!items.length) list.textContent = "まだ定期メンテナンスの枠はありません。";
    items.forEach(note => {
      const row = document.createElement("div"); row.className = "archive-row maintenance-row"; row.dataset.noteId = note.id;
      const open = document.createElement("button"); open.type = "button"; open.className = "archive-title";
      open.textContent = note.title; open.setAttribute("aria-label", `${note.title}の詳細を開く`);
      open.addEventListener("click", () => showDetail(note.id));
      const record = document.createElement("span"); record.className = "memo-status";
      record.textContent = note.completionMemo?.trim() ? "実施メモあり" : "実施メモ未記入";
      row.append(open, record); list.append(row);
    });
  }
  document.getElementById("toggle-maintenance").addEventListener("click", () => {
    const panel = document.getElementById("maintenance-panel");
    panel.hidden = !panel.hidden;
    document.getElementById("toggle-maintenance").setAttribute("aria-expanded", String(!panel.hidden));
  });
  function renderRules() {
    const items = notes.filter(isRule);
    const toggle = document.getElementById("toggle-rules");
    toggle.textContent = `📘 運用ルール (${items.length})`;
    toggle.disabled = blocked;
    document.getElementById("new-rule").disabled = blocked || saveBusy;
    const list = document.getElementById("rules-list");
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("p"); empty.textContent = "まだ運用ルールはありません。"; list.append(empty);
    }
    items.forEach(note => {
      const row = document.createElement("div"); row.className = "archive-row rule-row"; row.dataset.noteId = note.id;
      const open = document.createElement("button"); open.type = "button"; open.className = "archive-title";
      open.textContent = note.title;
      open.setAttribute("aria-label", `${note.title}の詳細を開く`);
      open.addEventListener("click", () => showDetail(note.id));
      const date = document.createElement("span"); date.className = "rule-date";
      date.textContent = note.date ? note.date.replaceAll("-", "/") : "日付未設定";
      row.append(open, date); list.append(row);
    });
  }
  document.getElementById("toggle-rules").addEventListener("click", () => {
    const panel = document.getElementById("rules-panel");
    panel.hidden = !panel.hidden;
    document.getElementById("toggle-rules").setAttribute("aria-expanded", String(!panel.hidden));
  });
  document.getElementById("new-rule").addEventListener("click", () => {
    if (blocked || saveBusy) return;
    editor(null, "Now", true, true);
  });
  function renderProduction() {
    const M = window.MeetingState;
    const items = notes.filter(n => isProduction(n) || M.isTheme(n));
    const themes = items.filter(M.isTheme);
    document.getElementById("toggle-production").textContent = `🎬 制作会議 (${themes.length})`;
    const list = document.getElementById("production-list"); list.replaceChildren();
    const groups = [
      ["open", "未閉廷のテーマ", themes.filter(n => ["queued","in_progress"].includes(M.read(n).status))],
      ["unknown", "閉廷状況未確認", themes.filter(n => M.read(n).status === "unknown")],
      ["closed", "閉廷済み", themes.filter(n => M.read(n).status === "closed" && !n.archivedAt)],
      ["archived", "会議アーカイブ（閉廷済み）", themes.filter(n => M.read(n).status === "closed" && n.archivedAt)],
      ["cancelled", "取消", themes.filter(n => M.read(n).status === "cancelled")],
      ["related", "関連する候補一覧・管理カード", items.filter(n => !M.isTheme(n))]
    ];
    for (const [key, title, rows] of groups) {
      if (!rows.length && !["open","closed","archived"].includes(key)) continue;
      const section = document.createElement(key === "archived" ? "details" : "section");
      section.className = "production-group"; section.dataset.meetingGroup = key;
      const heading = document.createElement(key === "archived" ? "summary" : "h3"); heading.textContent = `${title} (${rows.length})`; section.append(heading);
      const body = document.createElement("div"); body.className = "production-group-list"; section.append(body); list.append(section);
      if (!rows.length) { const p = document.createElement("p"); p.textContent = "該当するテーマはありません。"; body.append(p); }
      for (const note of rows) {
        const metadata = M.read(note), closed = metadata.status === "closed";
        const row = document.createElement("article"); row.className = "production-row"; row.dataset.noteId = note.id;
        const open = document.createElement("button"); open.type = "button"; open.className = "production-title"; open.textContent = note.title;
        open.addEventListener("click", () => showDetail(note.id));
        const state = document.createElement("span"); state.className = "production-state"; state.textContent = M.isTheme(note) ? M.label(metadata.status) : "候補一覧";
        row.append(open, state);
        if (metadata.docsUrl) {
          try {
            const url = new URL(metadata.docsUrl);
            if (url.protocol === "https:" && url.hostname === "docs.google.com" && url.pathname.startsWith("/document/d/")) {
              const link = document.createElement("a"); link.href = url.href; link.target = "_blank"; link.rel = "noopener noreferrer";
              link.textContent = "議事録Docsを開く ↗"; row.append(link);
            }
          } catch {}
        }
        const action = document.createElement("button"); action.type = "button";
        if (closed) {
          action.textContent = note.archivedAt ? "一覧へ戻す" : "会議をアーカイブ";
          action.disabled = blocked || saveBusy;
          action.addEventListener("click", () => setArchive(note.id, !note.archivedAt));
        } else {
          action.textContent = note.archivedAt ? "カード保管中" : "▶ Nextへ";
          action.disabled = blocked || saveBusy || note.column !== "Later" || !!note.archivedAt || !["queued","in_progress"].includes(metadata.status);
          action.addEventListener("click", async () => {
            if (!form.hidden) { error.textContent = "編集中の内容を保存するか、編集をやめてください。"; return; }
            if (await persist(notes.map(item => item.id === note.id ? { ...item, column: "Next" } : item))) showDetail(note.id);
          });
        }
        row.append(action); body.append(row);
      }
    }
  }
  document.getElementById("toggle-production").addEventListener("click", () => {
    const panel = document.getElementById("production-panel"); panel.hidden = !panel.hidden;
    document.getElementById("toggle-production").setAttribute("aria-expanded", String(!panel.hidden));
  });
  async function setArchive(id, archived) {
    if (blocked || saveBusy || !form.hidden) return;
    const note = notes.find(item => item.id === id);
    if (!note || isHandoff(note) || isRule(note) || isMaintenance(note) || (note.column !== "Done" && !(window.MeetingState.isTheme(note) && window.MeetingState.read(note).status === "closed"))) return;
    if (await persist(notes.map(item => item.id === id ? { ...item, ...(archived && window.MeetingState.isTheme(item) && window.MeetingState.read(item).status === "closed" ? { column: "Done" } : {}), archivedAt: archived ? new Date().toISOString() : "" } : item))) showDetail(archived ? null : id);
  }
  document.getElementById("archive-selected").addEventListener("click", () => setArchive(selectedId, true));
  document.getElementById("restore-selected").addEventListener("click", () => setArchive(selectedId, false));
  document.getElementById("toggle-archive").addEventListener("click", () => {
    const panel = document.getElementById("archive-panel"); panel.hidden = !panel.hidden;
    document.getElementById("toggle-archive").setAttribute("aria-expanded", String(!panel.hidden));
  });
  document.getElementById("archive-done").addEventListener("click", async () => {
    if (blocked || saveBusy || !form.hidden) { error.textContent = "編集中の内容を保存するか、編集をやめてください。"; return; }
    const done = notes.filter(note => !isHandoff(note) && !isRule(note) && !isMaintenance(note) && note.column === "Done" && !note.archivedAt);
    if (!done.length || !confirm(`Doneの${done.length}件をアーカイブしますか？メモ・履歴は保持され、後から戻せます。`)) return;
    const at = new Date().toISOString();
    if (await persist(notes.map(note => !isHandoff(note) && !isRule(note) && !isMaintenance(note) && note.column === "Done" && !note.archivedAt ? { ...note, archivedAt: at } : note))) showDetail(null);
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); error.textContent = "";
    const title = titleInput.value.trim();
    if (!title || !validDate(dateInput.value)) { error.textContent = "タイトルと日付を確認してください。"; return; }
    if (editingId && !notes.some((note) => note.id === editingId)) { error.textContent = "この付箋は別のタブで削除されました。入力をコピーして新しい付箋を作成してください。"; return; }
    const original = notes.find(item => item.id === editingId);
    const note = { ...original, id: editingId || (editingRule ? "policy-" + crypto.randomUUID() : crypto.randomUUID()), title, memo: memoInput.value, completionMemo: completionMemoInput.value, date: dateInput.value, color: form.querySelector("input[name=color]:checked").value, column: editingRule ? "Now" : editingMaintenance ? "Later" : columnInput.value };
    if (cardTypeInput.value !== "standard" || (original && "cardType" in original)) note.cardType = cardTypeInput.value;
    if (priorityInput.value !== "") note.priority = Number(priorityInput.value);
    else if (original && "priority" in original) note.priority = 5;
    if (note.cardType === "command-handoff" || (original && "handoffTheme" in original)) note.handoffTheme = themeInput.value;
    if (note.cardType === "meeting") note.minutesMemo = minutesMemoInput.value;
    if (original && "archivedAt" in original) note.archivedAt = original.archivedAt;
    const next = editingId ? notes.map((item) => item.id === editingId ? note : item) : [...notes, note];
    if (await persist(next, editingRaw, editingRevision)) showDetail(note.id);
  });
  document.getElementById("new-note").addEventListener("click", () => editor());
  document.getElementById("cancel-edit").addEventListener("click", () => showDetail());
  document.getElementById("delete-note").addEventListener("click", async () => {
    if (!editingId || !confirm("この付箋を削除しますか？")) return;
    if (await persist(F.remove(notes,editingId), editingRaw, editingRevision)) showDetail(null);
  });
  // Explicit file operations only. The server fixes the destination path.
  const jsonStatus = document.getElementById("json-status");
  const jsonSave = document.getElementById("json-save"), jsonLoad = document.getElementById("json-load");
  const preview = document.getElementById("json-preview");
  let pendingImport = null, jsonBusy = false;
  const jsonMessage = (text) => { jsonStatus.textContent = text; };
  async function revision(raw){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw||'')))).map(x=>x.toString(16).padStart(2,'0')).join('')}
  const api = async (method='GET',body) => {
    const raw=localStorage.getItem(KEY),rev=await revision(raw);
    if(method==='GET')return {exists:raw!==null,data:raw===null?null:JSON.parse(raw),revision:rev};
    if(method!=='POST'||body.expectedRevision!==rev)throw Error('別タブで変更されました。再読み込みしてください。');
    decode(JSON.stringify(body.data));
    // Web Locks coordinates writes from every tab of this isolated demo.
    const write=async()=>{if(localStorage.getItem(KEY)!==raw)throw Error('別タブで変更されました');const next=JSON.stringify(body.data);localStorage.setItem(KEY,next);if(localStorage.getItem(KEY)!==next)throw Error('保存再読が一致しません');return {exists:true,data:body.data,revision:await revision(next)}};
    if(!navigator.locks)throw Error('安全な保存にWeb Locks対応ブラウザが必要です');
    return navigator.locks.request(KEY,write);
  };
  const withJson = async (action) => {
    if (jsonBusy || blocked) return;
    jsonBusy = true; jsonSave.disabled = jsonLoad.disabled = true;
    try { await action(); } catch (e) { jsonMessage(e.message); }
    finally { jsonBusy = false; jsonSave.disabled = jsonLoad.disabled = blocked; }
  };
  jsonSave.addEventListener("click", () => withJson(async () => {
    const result = await api();
    cloudMessage(result);
    jsonMessage("操作ごとにブラウザ内へ保存します。JSON保存で別環境へ移せます。外部同期はありません。");
  }));
  jsonLoad.addEventListener("click", () => withJson(async () => {
    const result = await api();
    if (!result.exists) throw new Error("保存済みJSONがありません。先に「JSONに保存」を実行してください。");
    const restored = decode(JSON.stringify(result.data));
    pendingImport = { notes: restored, queueSets: result.data.queueSets, expected: savedRaw, revision: result.revision };
    document.getElementById("json-summary").textContent = `${result.path} · ${restored.length}件（` + COLUMNS.map(c => `${c}: ${restored.filter(n => n.column === c).length}`).join(" / ") + `） · 現在の付箋${notes.length}件を置き換えます。`;
    document.getElementById("json-content").value = JSON.stringify(result.data, null, 2);
    preview.showModal();
  }));
  document.getElementById("json-cancel").addEventListener("click", () => { pendingImport = null; preview.close(); jsonMessage("復元を取り消しました。付箋は変更していません。"); });
  preview.addEventListener("cancel", () => { pendingImport = null; });
  document.getElementById("json-apply").addEventListener("click", () => withJson(async () => {
    const item = pendingImport;
    if (!item) return;
    const latest = await api();
    if (latest.revision !== item.revision) throw new Error("確認中にJSONが変更されました。取り消して再度読み込んでください。");
    if (savedRaw !== item.expected || localStorage.getItem(KEY) !== item.expected) throw new Error("確認中に付箋が変更されました。取り消して再度読み込んでください。");
    if (await persist(item.notes, item.expected, item.revision, item.queueSets)) { showDetail(null); pendingImport = null; preview.close(); jsonMessage(`JSONから${item.notes.length}件を復元し、このブラウザに保存しました。`); }
    else jsonMessage("復元できませんでした。現在の付箋は置き換えていません。");
  }));
  const DEMO_SAMPLE={"version": 1, "queueSets": [{"id": "default", "name": "展示準備ロット", "executor": "work"}], "notes": [{"id": "demo-plan", "title": "体験コーナーの説明文を短くする", "memo": "困りごと：展示で説明が長くなり、体験まで進めない。\n受入条件：説明を3文にまとめ、PCで表示確認する。", "completionMemo": "", "date": "", "column": "Next", "color": "yellow", "priority": 9, "queueSetId": "default", "queueStatus": "queued", "queueRole": "task", "queueOrder": 1}, {"id": "demo-review", "title": "公開前に本人が画面を確認する", "memo": "説明文が伝わるか、画面を本人が確認する。技術検証と本人受入を分ける。", "completionMemo": "確認はまだです。前の作業の結果と残件を見てから実施。", "date": "", "column": "Next", "color": "pink", "priority": 7, "queueSetId": "default", "queueStatus": "queued", "queueRole": "task", "queueOrder": 2}, {"id": "demo-done", "title": "案内カードの合成サンプルを用意", "memo": "デモ用の架空カード。実案件は含みません。", "completionMemo": "合成サンプルを用意しました。次の担当：説明文の検討へ。", "date": "", "column": "Done", "color": "green"}]};
  async function initialize(){
    try{let result=await api();if(result.data===null)result=await api('POST',{data:DEMO_SAMPLE,expectedRevision:result.revision});
      notes=decode(JSON.stringify(result.data));queueSets=result.data.queueSets;serverRevision=result.revision;savedRaw=JSON.stringify(result.data);blocked=false;
      form.querySelectorAll('input,textarea,select,button').forEach(e=>e.disabled=false);document.querySelector('#new-note').disabled=false;jsonSave.disabled=jsonLoad.disabled=false;showDetail();cloudMessage();
    }catch(e){blocked=true;message('読込失敗：保存内容を保持して停止。'+e.message,true)}
  }
  document.querySelector('#demo-export').onclick=()=>{try{const raw=localStorage.getItem(KEY);decode(raw);const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='sticky-kanban-demo.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){message('出力失敗：'+e.message,true)}};
  document.querySelector('#demo-import').onchange=async e=>{try{const f=e.target.files[0];if(f.size>1000000)throw Error('JSONが大きすぎます');const raw=await f.text();decode(raw);if(!confirm('デモのカードをこのJSONで置き換えますか？先にJSON保存で退避できます。'))return;const v=JSON.parse(raw);if(await persist(v.notes,savedRaw,serverRevision,v.queueSets))showDetail();}catch(e){message('復元失敗：'+e.message,true)}e.target.value=''};
  window.PublicKanban={snapshot:()=>documentData(notes),validate:raw=>decode(raw)};
  initialize();

})();

// Navigation changes only the viewport; it never writes note data.
(() => {
  const viewport = document.getElementById("board-scroll");
  const left = document.getElementById("board-left");
  const right = document.getElementById("board-right");
  if (!viewport || !left || !right) return;
  const update = () => {
    left.disabled = viewport.scrollLeft <= 1;
    right.disabled = viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - 1;
  };
  const move = direction => {
    const column = viewport.querySelector(".column");
    const step = column ? column.getBoundingClientRect().width + 10 : 200;
    viewport.scrollBy({ left: direction * step, behavior: "auto" });
    update();
  };
  left.addEventListener("click", () => move(-1));
  right.addEventListener("click", () => move(1));
  viewport.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  new ResizeObserver(update).observe(viewport);
  new MutationObserver(update).observe(document.getElementById("board"), { childList: true });
  update();
})();
