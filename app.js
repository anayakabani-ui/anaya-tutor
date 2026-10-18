// Tutor web app: the screen and the cloud. The thinking is in logic.js.
//
// It reads what the desktop tutor writes (her list, tests, YouTube log,
// her REVISION files) and writes three things of its own: her answers to
// the YouTube question, the Gemini chats she pastes in, and a note asking
// the laptop to sync. Every write also touches meta/inbox, which is the
// one document the laptop looks at to know there's something new.
import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
         collection, doc, onSnapshot, addDoc, setDoc, deleteDoc, getDocs, query, orderBy }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { noteLines, todayLines, settleTicks, FILE_TYPES, isoDay, isoNow, daysUntil, clock12, dayText, minutesText,
         sizeText, inDays, rankSubjects, youtubeToday, reflectionDue, reflectionTally,
         parseGeminiChat, guessSubject, chatProblem, fileState, SHELVES,
         groupPapers, minutesForMarks, clockText, timerLeft, examEdit, examWords,
         schoolWork, workAsTasks, comingEvents, googleStatus,
         lessonSubjects, lessonDays, lessonDayWords,
         ringWords, RING_KEYS, RING_NAMES,
         parseUsage, rangeBounds, rangeWords, usageTotals, appParts, secondsWords,
         usefulTotals, historyDays, dayHours, hourLine, viewLines, hiddenOptional,
         savedCopies, goBackWords,
         doneTodayLines,
         calendarCan, calendarProblem, calendarWords, calendarOffers, calendarWriteWords, calendarWhen,
         withSciences, weekKey, focusCheck, focusNow,
         reviewDue, reviewWords, reviewProblem,
         videosToday, askVideos, askTasks, askApps, reflectionVideos, videoName,
         joinChunks, syncStatus,
         TAB_GROUPS, TOP_TABS, tabName, tabOnTop, startTab, tabStep, lessonReal, autoPoints, overnightWords,
         rewardUse, rewardPiles,
         allDays, dayKey, dayLines, dayHead, allDaysCount, settleDays,
         CAL_VIEWS, CAL_FEW, addMove, BANK, BANK_PICK, PICK_LEASTS, bankTabs, pickLine, withMoves, calendarDays,
         HOUR_PX, CAL_LAYOUTS, clockWords, minutesOf, hhmm, dropTime, mergedTimes, timeColumn, firstScroll, scrollFloor, CAL_LOCK_HOUR, settleSwaps, swapSig, calendarStep, calendarTitle, calendarCells,
         moveProblem, settleMoves, notesIncoming, noteVersion,
         splitLine, parseChat, chatWaiting, APP_VERSION, nowScroll, eventAfterDrag,
         planCheck, repeatWords, subjectColour, eventColour, EVENT_COLOURS } from "./logic.js";

const $ = (id) => document.getElementById(id);
// 2026-10-18b: a line's subject, by its words, from the bank's subject lists.
const subjectOfLine = new Map();
const show = (id, on) => { $(id).hidden = !on; };

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

// ---------------------------------------------------------------- drawing
function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;   // never innerHTML
  return node;
}

function row(text, side, cls) {
  const item = el("li", "row " + (cls || ""));
  item.append(el("span", "grow", text));
  if (side) item.append(el("span", "side", side));
  return item;
}

function button(text, cls, onClick) {
  const node = el("button", cls, text);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

const state = { tasks: [], exams: [], timetable: [], visits: [], day: null, meta: null,
                reflections: [], chats: [], materials: [],
                asked: null,          // the Sync now she pressed: {stamp, atMs}
                chatView: null,       // "new", or the id of the chat that's open
                fileView: null,       // {file, url} for the paper that's open
                fileNote: "",
                timer: null,          // {title, endsMs, pausedLeft}
                paperOpen: new Set(), // which subjects and notes are unfolded
                paperShut: new Set(), // which shelves she's folded away
                events: [], work: [], google: null,
                made: [], writes: [],  // what the tutor wrote on her calendar
                lessons: [],           // her lesson review, every row
                ringView: "all",       // the ring's switch: all or useful
                ringRange: { kind: "today", n: 3, unit: "hours" },
                usage: [],             // time per app, a document a day
                history: [],           // every tick, untick, add and removal
                snapshots: [],         // whole saved copies of her list
                goBack: null,          // the copy she's pressed "Go back to this" on
                savedSent: "",         // what was last sent from Saved copies
                view: { hideOptional: false, doneLast: false },
                focus: null, focusEditing: false, focusSent: null,
                bank: null,            // {minutes, rewards, extra} off the laptop
                rewards: [],           // what she's swapped minutes for
                swapAsk: null,         // the reward she's about to confirm
                pointsSent: null,      // minutes on their way to being points
                autoSent: null,        // the overnight switch she just pressed: {on, atMs}
                usedSent: {},          // swaps she just marked: id -> {used, atMs}
                tab: "today",          // the page that's showing
                videoUse: {},          // this ask's videos: school or fun
                bankTab: "",           // 2026-10-16m: the bank list that's open
                bankLeast: {},         // 2026-10-16m: list -> least minutes on its card
                swapSent: [],          // sent, not yet seen back: {cost, atMs}
                asks: [], reviewAsk: null,
                live: null,           // her note as text, with its version
                pendingTasks: new Set(), pendingToday: new Map(),
                madeAt: new Map(),
                // 2026-10-10q: every day's list, the calendar, her notes.
                alldays: null,         // live/alldays off the laptop
                pendingDays: new Map(), // ticks on other days: "day|words" -> done
                moves: [],             // drags the laptop hasn't shown yet
                calView: "week", calAnchor: null, calPick: null, calSaid: "", calSwap: null,
                calLayout: "times", timesWaiting: [], eventsWaiting: [], eventsGone: new Set(),
                calEventPick: null, calEventForm: false, calScrollKey: "", calScrollTop: 0, calHoursLocked: true, swaps: [], lockWaiting: new Map(), calMore: false,
                dragging: false, calStale: false, calDrag: null,
                notes: null,           // live/notes off the laptop
                // 2026-10-17: the bank's folds, the repeat form, the chat.
                bankShut: new Set(), bankGroupsOpen: new Set(), calRepeat: null,
                chat: [], chatSeen: false, chatWaiting: [],
                // 2026-10-17b: events changed here, waiting for the laptop
                // (id -> {day, title, start, end, atMs}); the one being
                // renamed; tasks typed onto a day or into the bank.
                eventsEdited: new Map(), calRename: "", calAdding: "", addsWaiting: [],
                goalsWaiting: new Map() };   // 2026-10-18: list -> {count, by, atMs}
let cloud = null;                     // {db, base} once she's signed in

// An edit for the laptop to make. It lands in `edits`, the laptop takes it
// on its next pass (about 20 seconds) and her real list changes there.
async function sendEdit(edit) {
  if (!cloud) return false;
  try {
    await addDoc(collection(cloud.db, cloud.base + "edits"),
                 { at: isoNow(new Date()), ...edit });
    await touchInbox();
    return true;
  } catch (error) {
    $("sync-status").textContent = "Couldn't send that. Are you online?";
    return false;
  }
}

// One note, like the real app: a box in the margin, her order, her gaps.
// onTick, when given, makes the boxes real buttons.
function noteCard(lines, emptyText, onTick) {
  const card = el("div", "note");
  if (!lines.some((l) => l.kind === "line")) {
    card.append(el("p", "empty", emptyText));
    return card;
  }
  lines.forEach((line) => {
    if (line.kind === "gap") { card.append(el("div", "note-gap")); return; }
    if (line.kind === "head") { card.append(el("div", "note-head", line.text)); return; }
    const item = el("div", "note-line" + (line.done ? " done" : "") +
      (line.sub ? " sub" : "") + (line.group ? " group" : "") +
      (line.optional ? " optional" : "") + (line.bold ? " bold" : "") +
      (line.fun ? " fun" : ""));
    if (onTick) {
      const box = button("", "box" + (line.done ? " ticked" : ""), () => onTick(line));
      box.setAttribute("aria-label", (line.done ? "Untick " : "Tick ") + line.text);
      box.setAttribute("aria-pressed", String(Boolean(line.done)));
      item.append(box);
    } else {
      item.append(el("span", "box" + (line.done ? " ticked" : "")));
    }
    item.append(el("span", "grow", (line.sub ? "> " : "") + line.text));
    if (line.due) item.append(el("span", "side" + (line.soon ? " soon" : ""), line.due));
    card.append(item);
  });
  return card;
}

function settle() {
  settleTicks(state.pendingTasks, state.tasks, state.pendingToday,
              state.day && state.day.lines, state.madeAt, Date.now());
}

// ---- The ring: how her time went this week, by her own answers to the
// 20 minute question. Total in the middle, and a switch to useful or
// wasted. Drawn as rounded arcs with gaps, the way a circle timer is.
const SVG = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs) {
  const node = document.createElementNS(SVG, tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
  return node;
}

// Small things she sets here stay set on this device.
function recall(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch (error) { return fallback; }
}
function keep(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { /* private window */ }
}
state.view = { ...state.view, ...recall("tutor-view", {}) };
state.ringRange = { ...state.ringRange, ...recall("tutor-range", {}) };
if (recall("tutor-ring", "all") === "useful") state.ringView = "useful";

const APP_COLOURS = ["var(--accent)", "var(--ring-warm)", "var(--group)", "#8E7CC3", "#E6B450", "var(--muted)"];

function redrawRing() { keep("tutor-range", state.ringRange); keep("tutor-ring", state.ringView); drawToday(); drawYoutube(); }

function chipRow(cls, label, choices, current, onPick) {
  const pick = el("div", cls);
  pick.setAttribute("role", "group");
  pick.setAttribute("aria-label", label);
  choices.forEach(([value, words]) => {
    const chip = button(words, "ring-chip", () => onPick(value));
    chip.title = label + ": " + words;
    chip.setAttribute("aria-pressed", String(current === value));
    pick.append(chip);
  });
  return pick;
}

function ringCard() {
  const now = new Date();
  const bounds = rangeBounds(state.ringRange, now);
  const useful = state.ringView === "useful";
  const card = el("section", "ring-card");
  card.setAttribute("aria-label", "Your time, " + rangeWords(state.ringRange));
  const head = el("div", "ring-head");
  const titles = el("div");
  titles.append(el("p", "ring-kicker", "Your time"),
    el("p", "ring-title", useful ? "Spent usefully" : "Apps and websites"));
  head.append(titles, chipRow("ring-switch", "What to show", [["all", "All"], ["useful", "Useful"]],
    state.ringView, (view) => { state.ringView = view; redrawRing(); }));
  const ranges = el("div", "ring-ranges");
  ranges.append(chipRow("ring-switch", "Over how long", [["today", "Today"], ["week", "Week"], ["custom", "Custom"]],
    state.ringRange.kind, (kind) => { state.ringRange = { ...state.ringRange, kind }; redrawRing(); }));
  if (state.ringRange.kind === "custom") {
    const n = el("input", "ring-n"); n.type = "number"; n.min = "1"; n.max = "720";
    n.value = String(state.ringRange.n || 3);
    n.setAttribute("aria-label", "How many");
    const unit = el("select", "ring-unit");
    [["hours", "hours"], ["days", "days"]].forEach(([value, words]) => {
      const o = el("option", "", words); o.value = value; unit.append(o);
    });
    unit.value = state.ringRange.unit === "days" ? "days" : "hours";
    unit.setAttribute("aria-label", "Hours or days");
    const set = () => { state.ringRange = { kind: "custom", n: Math.max(1, Number(n.value) || 1), unit: unit.value }; redrawRing(); };
    n.addEventListener("change", set);
    unit.addEventListener("change", set);
    ranges.append(el("span", "ring-last", "last"), n, unit);
  }
  const body = el("div", "ring-body");
  const R = 52, C = 2 * Math.PI * R;
  const svg = svgEl("svg", { viewBox: "0 0 140 140", class: "ring", role: "img" });
  svg.append(svgEl("circle", { cx: 70, cy: 70, r: R, class: "ring-track" }));
  // 2026-10-04h: "each colour if u hover on it itll show an aesthetic info
  // abt what it was and time spent". A small card that follows the pointer:
  // the colour, the name, the time, and its share. A tap does the same.
  const tip = el("div", "ring-tip");
  tip.hidden = true;
  const lines = new Map();            // arc -> its legend line
  const showTip = (node, info, event) => {
    tip.replaceChildren();
    const dot = el("span", "ring-dot");
    dot.style.background = info.colour;
    const top = el("div", "ring-tip-top");
    top.append(dot, el("span", "ring-tip-name", info.name));
    tip.append(top, el("div", "ring-tip-time", info.time),
      el("div", "ring-tip-share", info.share));
    tip.hidden = false;
    const box = ringBox.getBoundingClientRect();
    const x = event && event.clientX ? event.clientX - box.left : box.width / 2;
    const y = event && event.clientY ? event.clientY - box.top : box.height / 2;
    tip.style.left = Math.max(0, Math.min(box.width - 10, x + 12)) + "px";
    tip.style.top = Math.max(0, y - 14) + "px";
    svg.querySelectorAll(".ring-arc").forEach((other) => other.classList.toggle("dim", other !== node));
    node.classList.add("lift");
    lines.forEach((item, key) => item.classList.toggle("lit", key === node));
  };
  const hideTip = () => {
    tip.hidden = true;
    svg.querySelectorAll(".ring-arc").forEach((other) => other.classList.remove("dim", "lift"));
    lines.forEach((item) => item.classList.remove("lit"));
  };
  const arc = (part, colour, cls, info) => {
    const cap = part.length < 1 ? Math.min(14, part.length * C * 0.5) : 0;
    const node = svgEl("circle", { cx: 70, cy: 70, r: R, class: "ring-arc " + (cls || ""),
      "stroke-dasharray": Math.max(0.5, part.length * C - cap) + " " + C,
      "stroke-dashoffset": -(part.start * C + cap / 2),
      "stroke-linecap": part.length < 1 ? "round" : "butt", transform: "rotate(-90 70 70)" });
    if (colour) node.style.stroke = colour;
    svg.append(node);
    if (info) {
      node.classList.add("hot");
      node.setAttribute("tabindex", "0");
      node.setAttribute("aria-label", info.name + ", " + info.time + ", " + info.share);
      node.addEventListener("pointerenter", (event) => showTip(node, info, event));
      node.addEventListener("pointermove", (event) => showTip(node, info, event));
      node.addEventListener("pointerleave", hideTip);
      node.addEventListener("focus", () => showTip(node, info, null));
      node.addEventListener("blur", hideTip);
      node.addEventListener("click", (event) => { event.stopPropagation(); showTip(node, info, event); });
    }
    return node;
  };
  const legend = el("ul", "ring-legend");
  const line = (dot, words, side, colour) => {
    const item = el("li", "ring-line");
    const mark = el("span", "ring-dot " + (dot || ""));
    if (colour) mark.style.background = colour;
    item.append(mark, el("span", "grow", words), el("span", "side", side));
    legend.append(item);
    return item;
  };
  const shareWords = (part, whole) => whole
    ? Math.max(1, Math.round((part / whole) * 100)) + "% of " + rangeWords(state.ringRange) : "";
  let big = "0m", small = rangeWords(state.ringRange), empty = "";
  if (!useful) {
    const totals = usageTotals(parseUsage(state.usage), bounds);
    const parts = appParts(totals);
    parts.forEach((part) => {
      const colour = part.rest ? "var(--muted)" : APP_COLOURS[part.index % 5];
      const info = { colour, name: part.label, time: secondsWords(part.seconds),
                     share: shareWords(part.seconds, totals.total) };
      const node = arc(part, colour, "", info);
      const item = line("", part.label, secondsWords(part.seconds), colour);
      lines.set(node, item);
      item.addEventListener("pointerenter", () => showTip(node, info, null));
      item.addEventListener("pointerleave", hideTip);
    });
    big = secondsWords(totals.total);
    svg.setAttribute("aria-label", parts.map((x) => x.label + " " + secondsWords(x.seconds)).join(", ") || "Nothing yet");
    if (!totals.total) empty = "Nothing counted for " + rangeWords(state.ringRange) + " yet. The laptop counts what's in front while the tutor is open, and sends it here.";
  } else {
    const time = usefulTotals(state.reflections, state.history, bounds);
    const asked = time.total;
    if (asked) {
      const share = time.worth / asked;
      if (time.worth) arc({ start: 0, length: share === 1 ? 1 : Math.max(0.02, share - 0.018) }, null, "worth",
        { colour: "var(--accent)", name: RING_NAMES.worth, time: ringWords(time.worth),
          share: shareWords(time.worth, asked) });
    }
    line("worth", RING_NAMES.worth, ringWords(time.worth));
    line("okay", RING_NAMES.okay, ringWords(time.okay));
    line("not", RING_NAMES.not, ringWords(time.not));
    const done = el("li", "ring-line ring-done");
    done.append(el("span", "grow", "Tasks ticked off"), el("span", "side", String(time.tasks)));
    legend.append(done);
    big = ringWords(time.worth);
    small = asked ? "useful of " + ringWords(asked) : rangeWords(state.ringRange);
    svg.setAttribute("aria-label", "Useful " + ringWords(time.worth) + " of " + ringWords(asked));
    if (!time.answers) empty = "No answers for " + rangeWords(state.ringRange) + " yet. It fills in as you answer the 20 minute question.";
  }
  const ringBox = el("div", "ring-box");
  const mid = el("div", "ring-middle");
  mid.append(el("span", "ring-big", big), el("span", "ring-small", small));
  ringBox.append(svg, mid, tip);
  ringBox.addEventListener("pointerleave", hideTip);
  body.append(ringBox, legend);
  card.append(head, ranges, body);
  if (empty) card.append(el("p", "muted", empty));
  return card;
}

// The day, an hour at a time: what was in front, and what got done in it.
// The hour with the most ticked off is marked, so a good hour is seen.
function dayCard() {
  const now = new Date();
  const day = isoDay(now);
  const data = dayHours(parseUsage(state.usage), state.history, day);
  const card = el("section", "ring-card day-card");
  card.append(el("p", "ring-kicker", "Today"), el("p", "ring-title", "Hour by hour"));
  if (!data.rows.length) {
    card.append(el("p", "muted", "Nothing for today yet."));
    return card;
  }
  const list = el("ul", "day-hours");
  data.rows.forEach((hour) => {
    const item = el("li", "day-hour" + (hour.hour === data.best ? " best" : "") +
      (hour.youtube >= 1200 && !hour.tasks.length ? " drift" : ""));
    item.append(el("span", "day-when", hour.words));
    const said = el("span", "grow", hourLine(hour) || "At the laptop " + secondsWords(hour.seconds));
    item.append(said);
    if (hour.hour === data.best) item.append(el("span", "day-tag", "Best hour"));
    if (hour.tasks.length) item.title = hour.tasks.join("\n");
    list.append(item);
  });
  card.append(list);
  return card;
}

// "Hide optional" and "Done at the bottom", on the website's own lists.
function viewChips(lines, redraw) {
  const rowEl = el("div", "view-chips");
  const hidden = state.view.hideOptional ? hiddenOptional(lines) : 0;
  [["hideOptional", hidden ? "Hide optional (" + hidden + " hidden)" : "Hide optional"],
   ["doneLast", "Done at the bottom"]].forEach(([key, words]) => {
    const chip = button(words, "view-chip", () => {
      state.view = { ...state.view, [key]: !state.view[key] };
      keep("tutor-view", state.view);
      redraw();
    });
    chip.setAttribute("aria-pressed", String(Boolean(state.view[key])));
    rowEl.append(chip);
  });
  return rowEl;
}

// Every tick, untick, add and removal, so nothing she's done is lost.
function historyFold(which, title) {
  const days = historyDays(state.history, which, "");
  const count = days.reduce((n, d) => n + d.rows.length, 0);
  return fold("history:" + which, title, count, (inside) => {
    if (!days.length) {
      inside.append(el("p", "empty", "Nothing yet. From now on, everything you tick, untick, add or take off is written down here with its time."));
      return;
    }
    const now = new Date();
    days.slice(0, 30).forEach((day) => {
      inside.append(el("h3", "", lessonDayWords(day.day, now)));
      const list = el("ul", "history");
      day.rows.forEach((h) => {
        const item = el("li", "history-line " + h.what);
        item.append(el("span", "history-when", clock12(h.at)), el("span", "history-what", h.words),
          el("span", "grow", h.text));
        list.append(item);
      });
      inside.append(list);
    });
  }, false);
}

// 2026-10-10i: whole saved copies of her list, her temporary lists and
// Today. "Save everything now" asks the laptop for one. "Go back to this"
// takes two presses, and says what it will do in between.
function savedFold() {
  const copies = savedCopies(state.snapshots, new Date());
  return fold("saved-copies", "Saved copies", copies.length, (inside) => {
    const top = el("div", "choices");
    top.append(button("Save everything now", "soft", async () => {
      state.savedSent = (await sendEdit({ kind: "snapshot" }))
        ? "Asked the laptop to save a copy. It shows here in about 20 seconds while the tutor is open."
        : "Couldn't send that. Are you online?";
      drawTasks();
    }));
    inside.append(top);
    if (state.savedSent) inside.append(el("p", "muted", state.savedSent));
    if (!copies.length) {
      inside.append(el("p", "empty", "No saved copies yet. Press Save everything now, or in the tutor: Notes, More, Save all tasks to history."));
      return;
    }
    copies.forEach((copy) => {
      inside.append(fold("saved:" + copy.id, copy.when + " \u00b7 " + copy.label, null, (card) => {
        card.append(el("p", "muted", copy.counts + (copy.lists.length ? ": " + copy.lists.join(", ") : "")));
        const asking = state.goBack === copy.id;
        if (asking) card.append(el("p", "saved-warn", goBackWords(copy)));
        const row = el("div", "choices");
        row.append(button(asking ? "Yes, go back" : "Go back to this", asking ? "" : "soft", async () => {
          if (!asking) { state.goBack = copy.id; drawTasks(); return; }
          state.goBack = null;
          state.savedSent = (await sendEdit({ kind: "restore", snapshot: Number(copy.id) }))
            ? "Sent. Your list changes on the laptop in about 20 seconds while the tutor is open."
            : "Couldn't send that. Are you online?";
          drawTasks();
        }));
        if (asking) row.append(button("No, leave it", "soft", () => { state.goBack = null; drawTasks(); }));
        card.append(row);
        card.append(el("h3", "", "The list"));
        card.append(el("pre", "saved-text", copy.text || "(nothing on it)"));
        if (copy.today) {
          card.append(el("h3", "", "Today"));
          card.append(el("pre", "saved-text", copy.today));
        }
      }, false));
    });
  }, false);
}

function drawToday() {
  const box = $("tab-today");
  box.replaceChildren();
  box.append(ringCard(), dayCard());
  settle();
  const all = todayLines(state.day && state.day.lines, state.pendingToday);
  box.append(viewChips(all, drawToday));
  box.append(noteCard(viewLines(all, state.view),
    "Nothing on Today yet. It fills in from the desktop tutor.", (line) => {
      const target = !line.done;
      state.pendingToday.set(line.text, target);
      state.madeAt.set("d:" + line.text, Date.now());
      drawToday();
      sendEdit({ kind: "today", text: line.text, done: target });
    }));
  box.append(historyFold("today", "Today history"));
}

// 2026-10-03r: "no, revert it for the tasks. it works but super janky and
// terrible." The Tasks tab is her list to look at and tick, and one box
// to add a task. No typing on the lines.
// 2026-10-10q: "the tasks is now just all tasks for all days instead". A
// heading a day with that day's lines under it, the same list as All days
// in the tutor. What has no day yet (her old list) is folded under it.
function tickDay(line) {
  const target = !line.done;
  if (line.day === isoDay(new Date())) {
    state.pendingToday.set(line.raw, target);
    state.madeAt.set("d:" + line.raw, Date.now());
    sendEdit({ kind: "today", text: line.raw, done: target });
  }
  const key = dayKey(line.day, line.raw);
  state.pendingDays.set(key, target);
  state.madeAt.set("a:" + key, Date.now());
  drawTasks(); drawToday();
  if (line.day !== isoDay(new Date())) {
    sendEdit({ kind: "day_tick", day: line.day, text: line.raw, done: target });
  }
}

function noDayCard() {
  let lines = noteLines(state.tasks, new Date(), state.pendingTasks);
  if (state.view.doneLast) {
    // What she's ticked today is kept in sight, at the bottom, with its time.
    const done = doneTodayLines(state.tasks, new Date());
    if (done.length) lines = lines.concat([{ kind: "gap" }], done);
  }
  return noteCard(viewLines(lines, state.view),
    "Nothing on your list. It fills in from the desktop tutor.", (line) => {
      if (line.done) return;            // a tick is a full stop, as on the laptop
      state.pendingTasks.add(line.id);
      state.madeAt.set("t:" + line.id, Date.now());
      drawTasks();
      sendEdit({ kind: "tick", task: Number(line.id) });
    });
}

function drawTasks() {
  const box = $("tab-tasks");
  const typing = box.querySelector(".adder input");
  const held = typing ? typing.value : "";
  const focused = typing && document.activeElement === typing;
  box.replaceChildren();
  settle();
  const now = new Date();
  const found = allDays(state.alldays);
  const open = state.tasks.filter((t) => !t.done).length;
  if (found) {
    settleDays(state.pendingDays, found, state.madeAt, Date.now());
    box.append(el("h2", "", allDaysCount(found).words));
    const every = found.days.flatMap((d) => dayLines(d.lines, d.day, state.pendingDays));
    box.append(viewChips(every, drawTasks));
    let shown = 0;
    found.days.forEach((d) => {
      const lines = viewLines(dayLines(d.lines, d.day, state.pendingDays), state.view);
      const isToday = d.day === isoDay(now);
      if (!isToday && !lines.some((l) => l.kind === "line")) return;   // an empty day isn't listed
      box.append(el("h3", "day-head" + (isToday ? " today" : ""), dayHead(d.day, now)));
      box.append(noteCard(lines, "Nothing on this day yet.", tickDay));
      shown += 1;
    });
    if (!shown) box.append(el("p", "empty", "Nothing on any day yet."));
    box.append(el("p", "muted", "To move something to another day: Calendar, in the menu."));
    box.append(fold("no-day", "No day yet", open, (inside) => {
      inside.append(el("p", "muted", "Your list from the tutor's Notes tab: what hasn't got a day."));
      inside.append(noDayCard());
    }, false));
  } else {
    // An older tutor on the laptop, or it hasn't synced yet: her list as before.
    box.append(el("h2", "", open + " open"));
    box.append(el("p", "muted", "The days show here once the laptop has sent them. Open the tutor and press Sync now."));
    box.append(viewChips(noteLines(state.tasks, now, state.pendingTasks), drawTasks));
    box.append(noDayCard());
  }
  const adder = el("form", "adder");
  const field = el("input");
  field.type = "text"; field.maxLength = 300; field.autocomplete = "off";
  field.placeholder = "Add a task (no day yet)";
  field.setAttribute("aria-label", "Add a task to your list");
  field.value = held;
  const add = el("button", "", "Add");
  add.type = "submit";
  adder.append(field, add);
  adder.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = field.value.trim();
    if (!text) return;
    field.value = "";
    if (await sendEdit({ kind: "add", text })) {
      $("sync-status").textContent = "Added. It shows once the laptop has it.";
    }
  });
  box.append(adder);
  box.append(el("p", "muted", "Ticks and new tasks reach the laptop in about 20 seconds while the tutor is open."));
  box.append(historyFold("main", "Task history"));
  box.append(savedFold());
  if (focused) field.focus();
}

// ---- 2026-10-10q: the calendar. Step 3 of her plan: "an easy drag and
// drop system of dropping tasks into the calender". Drag a line onto
// another day, or press it and then press Move here on a day. Only its
// day changes, never its words: the laptop does the moving, the same way
// as cutting and pasting under another heading on All days.
function moveLine(pick, to) {
  if (pick && pick.from === BANK_PICK) return pickToDay(pick, to);   // 2026-10-16m
  if (pick && pick.repeat) {             // 2026-10-17: a repeat stays put
    state.calPick = null;
    state.calSaid = "A repeat comes back every day by itself. Press it to stop it.";
    drawCalendar();
    return Promise.resolve(false);
  }
  const now = new Date();
  const problem = moveProblem(pick.text, pick.from, to, now);
  state.calPick = null;
  if (problem) { state.calSaid = problem; drawCalendar(); return Promise.resolve(false); }
  state.moves = addMove(state.moves, { text: pick.text, from: pick.from, to, atMs: Date.now() });
  state.calSaid = (to === BANK ? "Put in the bank" : "Moved to " + dayHead(to, now)) +
    ". The laptop takes it in about 20 seconds while the tutor is open.";
  drawCalendar();
  // 2026-10-15c: into or out of the task bank.
  const kind = to === BANK ? "bank_put" : pick.from === BANK ? "bank_take" : "day_move";
  return sendEdit({ kind, text: pick.text, from: pick.from, to }).then((sent) => {
    if (sent) return true;
    state.moves = state.moves.filter((m) => !(m.text === pick.text && m.to === to));
    state.calSaid = "Couldn't send that. Are you online?";
    drawCalendar();
    return false;
  });
}

// ---- 2026-10-16: the times view. A line put at a rough time, events.
function sendTime(day, text, at) {
  state.timesWaiting = state.timesWaiting.filter((t) => Date.now() - t.atMs < 120000 && t.key !== day + "|" + text);
  state.timesWaiting.push({ key: day + "|" + text, at, atMs: Date.now() });
  state.calPick = null;
  state.calSaid = at ? "\u201c" + text + "\u201d at about " + clockWords(at) + "." : "Its time's gone.";
  drawCalendar();
  return sendEdit({ kind: "line_time", day, text, time: at });
}

function placeAt(held, day, at) {
  if (held.from === day) return sendTime(day, held.text, at);
  return Promise.resolve(moveLine(held, day)).then((moved) => {
    if (moved) return sendTime(day, held.text, at);
    return false;
  });
}

function addEvent(day, title, start, end, quiet, color) {
  const words = String(title || "").trim();
  if (!words) { state.calSaid = "Give it a name first."; drawCalendar(); return; }
  if (start && end && end <= start) { state.calSaid = "It has to end after it starts."; drawCalendar(); return; }
  state.eventsWaiting.push({ id: "w" + Date.now(), day, title: words, start: start || "", end: end || "",
                             color: eventColour(color), atMs: Date.now() });
  state.calEventForm = false;
  state.calSaid = "Added \u201c" + words + "\u201d. The laptop keeps quiet while it's on.";
  drawCalendar();
  sendEdit({ kind: "event_add", day, title: words, start: start || "", end: end || "", quiet: Boolean(quiet),
             color: eventColour(color) });
}

// 2026-10-18b: a line that came from a subject list takes that subject's
// colour, wherever it shows (the calendar, the bank).
function subjectFor(line) {
  const words = String((line && (line.text || line.raw)) || "").replace(/^>\s*/, "").trim().toLowerCase();
  return subjectOfLine.get(words) || "";
}
function applySubject(node, line) {
  const colour = subjectColour(subjectFor(line));
  if (!colour) return;
  node.classList.add("subj");
  node.style.setProperty("--subj", colour);
}

// 2026-10-18b: colour swatches for an event (the editor and the add form).
// Picking one sends it at once; "No colour" puts the default back.
function colourRow(current, onPick) {
  const row = el("div", "colour-row");
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", "Event colour");
  const mine = eventColour(current);
  const options = [["", "No colour"]].concat(EVENT_COLOURS.map((c) => [c, c]));
  options.forEach(([value, label]) => {
    const dot = button("", "colour-dot" + (value ? "" : " none") + (value === mine ? " on" : ""), () => {
      row.querySelectorAll(".colour-dot.on").forEach((d) => d.classList.remove("on"));
      dot.classList.add("on");
      onPick(value);
    });
    if (value) dot.style.setProperty("--dot", value);
    dot.title = value ? "Colour this event " + label : "No colour";
    dot.setAttribute("aria-label", value ? "Colour " + value : "No colour");
    dot.setAttribute("aria-pressed", String(value === mine));
    row.append(dot);
  });
  return row;
}

function dropEvent(e) {
  state.eventsGone.add(e.id);
  state.calEventPick = null;
  state.calSaid = "Took \u201c" + e.title + "\u201d off.";
  drawCalendar();
  sendEdit({ kind: "event_del", id: e.id });
}

// 2026-10-17b: "click, adjust name, and drag its time start and extend via
// a pull its length", like Google Calendar. Shown at once here; the laptop
// takes it in about 20 seconds.
function editEvent(e, change) {
  if (!e || String(e.id).startsWith("w")) {
    state.calSaid = "One sec, that event's still being saved.";
    drawCalendar();
    return;
  }
  const next = { day: e.day, title: e.title, start: e.start || "", end: e.end || "", quiet: Boolean(e.quiet),
                 color: eventColour(e.color), ...change };
  if (!String(next.title || "").trim()) next.title = e.title;
  if (next.start && next.end && next.end <= next.start) {
    state.calSaid = "It has to end after it starts.";
    drawCalendar();
    return;
  }
  state.eventsEdited.set(String(e.id), { ...next, atMs: Date.now() });
  state.calRename = "";
  if (state.calEventPick && state.calEventPick.id === e.id) state.calEventPick = { ...e, ...next };
  state.calSaid = "\u201c" + next.title + "\u201d" + (next.start ? ", " + clockWords(next.start) +
    (next.end ? " to " + clockWords(next.end) : "") : ", all day") + ".";
  drawCalendar();
  sendEdit({ kind: "event_edit", id: String(e.id), day: next.day, title: next.title,
             start: next.start, end: next.end, quiet: Boolean(next.quiet), color: eventColour(next.color) });
}

// Events with her changes on top, until the laptop shows them (or 2 min).
function eventsNow(found, nowMs) {
  state.eventsWaiting = state.eventsWaiting.filter((w) => nowMs - w.atMs < 120000 &&
    !found.events.some((e) => e.day === w.day && e.title === w.title && e.start === w.start));
  state.eventsEdited.forEach((edit, id) => {
    const real = found.events.find((e) => String(e.id) === id);
    if (nowMs - edit.atMs > 120000 || !real || (real.day === edit.day && real.title === edit.title &&
        real.start === edit.start && real.end === edit.end)) state.eventsEdited.delete(id);
  });
  return found.events.concat(state.eventsWaiting).filter((e) => !state.eventsGone.has(e.id))
    .map((e) => (state.eventsEdited.has(String(e.id)) ? { ...e, ...state.eventsEdited.get(String(e.id)) } : e));
}

// 2026-10-18: an all-day event dragged to another day, or onto an hour
// (then it gets that time, an hour long).
function eventChipDrag(chip, e) {
  chip.draggable = true;
  chip.title = "Drag to another day, or onto an hour to give it a time. Press to change it.";
  chip.addEventListener("dragstart", (event) => {
    state.dragging = true;
    state.calDrag = { event: e, from: e.day, text: e.title };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", e.title);
  });
  chip.addEventListener("dragend", () => {
    state.dragging = false;
    state.calDrag = null;
    document.querySelectorAll(".over").forEach((d) => d.classList.remove("over"));
    if (state.calStale) { state.calStale = false; drawCalendar(); }
  });
}

function eventDropped(e, day, at) {
  if (!at) return editEvent(e, { day, start: "", end: "" });
  const length = (minutesOf(e.end) || 0) - (minutesOf(e.start) || 0);
  const end = hhmm(Math.min(23 * 60 + 59, minutesOf(at) + (length > 0 ? length : 60)));
  return editEvent(e, { day, start: at, end });
}

// The bar under the calendar's top for the picked event: name, times,
// all day, take it off.
function eventEditor(e) {
  const row = el("div", "plan-bar event-editor");
  const name = el("input", "plan-event-title");
  name.value = e.title;
  name.maxLength = 80;
  name.setAttribute("aria-label", "Event name");
  const start = el("input");
  start.type = "time"; start.value = e.start || ""; start.setAttribute("aria-label", "Starts");
  const end = el("input");
  end.type = "time"; end.value = e.end || ""; end.setAttribute("aria-label", "Ends");
  // 2026-10-18: "i cant drag change the date of the event". Its day here
  // too, and whether it keeps the laptop quiet.
  const when = el("input");
  when.type = "date"; when.value = e.day; when.min = isoDay(new Date());
  when.setAttribute("aria-label", "Which day");
  const quiet = quietBox(e.quiet);
  const save = () => editEvent(e, { title: name.value.trim(), start: start.value, end: end.value,
                                    day: when.value || e.day, quiet: quiet.box.checked });
  name.addEventListener("keydown", (event) => { if (event.key === "Enter") save(); });
  quiet.box.addEventListener("change", save);
  row.append(name, when, el("span", "muted", "from"), start, el("span", "muted", "to"), end, quiet.label,
    colourRow(e.color, (c) => editEvent(e, { color: c })),
    button("Save", "", save),
    button("All day", "quiet", () => editEvent(e, { start: "", end: "" })),
    button("Take it off", "quiet", () => dropEvent(e)),
    button("Close", "quiet", () => { state.calEventPick = null; state.calRename = ""; drawCalendar(); }));
  return row;
}

// Press on an event: a short press renames it right there; a drag moves it
// (to another time, or across to another day); the strip at its bottom
// pulls its end.
function eventPointer(block, item, day) {
  const e = item.event;
  const grip = el("div", "tg-resize");
  grip.title = "Pull to make it longer or shorter";
  block.append(grip);
  const begin = (event, mode) => {
    if (event.button !== 0 || state.calRename === String(e.id)) return;
    event.preventDefault();
    event.stopPropagation();
    const y0 = event.clientY;
    const top0 = parseFloat(block.style.top) || 0;
    const tall0 = parseFloat(block.style.height) || 22;
    let moved = false, toDay = day;
    block.setPointerCapture(event.pointerId);
    const move = (ev) => {
      const dy = ev.clientY - y0;
      if (!moved && Math.abs(dy) < 4 && Math.abs(ev.clientX - event.clientX) < 4) return;
      moved = true;
      state.dragging = true;               // no redraw under her hand
      block.classList.add("moving");
      const step = HOUR_PX / 4;
      const snapped = Math.round(dy / step) * step;
      if (mode === "resize") {
        block.style.height = Math.max(step - 2, tall0 + snapped) + "px";
        return;
      }
      block.style.top = Math.max(0, top0 + snapped) + "px";
      const under = document.elementsFromPoint(ev.clientX, ev.clientY).find((n) => n.classList && n.classList.contains("tg-col"));
      if (under && under.dataset.day && !under.classList.contains("past") && under !== block.parentElement) {
        toDay = under.dataset.day;
        under.append(block);
      } else if (under && under === block.parentElement) {
        toDay = under.dataset.day || toDay;
      }
    };
    const up = (ev) => {
      block.removeEventListener("pointermove", move);
      block.removeEventListener("pointerup", up);
      block.removeEventListener("pointercancel", up);
      block.classList.remove("moving");
      state.dragging = false;
      state.calStale = false;
      if (!moved) {
        if (mode === "resize") return;
        state.calEventPick = e;
        state.calRename = String(e.id);
        state.calSaid = "";
        drawCalendar();
        return;
      }
      const minutes = (ev.clientY - y0) / HOUR_PX * 60;
      const after = eventAfterDrag(e.start, e.end, minutes, mode);
      if (!after) { drawCalendar(); return; }
      editEvent(e, mode === "resize" ? { end: after.end } : { day: toDay, start: after.start, end: after.end });
    };
    block.addEventListener("pointermove", move);
    block.addEventListener("pointerup", up);
    block.addEventListener("pointercancel", up);
  };
  block.addEventListener("pointerdown", (event) => begin(event, "move"));
  grip.addEventListener("pointerdown", (event) => begin(event, "resize"));
  if (state.calRename === String(e.id)) {
    const input = el("input", "tg-rename");
    input.value = e.title;
    input.maxLength = 80;
    input.setAttribute("aria-label", "Rename event");
    let done = false;
    const finish = (keep) => {
      if (done) return;
      done = true;
      const words = input.value.trim();
      if (keep && words && words !== e.title) editEvent(e, { title: words });
      else { state.calRename = ""; drawCalendar(); }
    };
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") finish(true);
      if (event.key === "Escape") finish(false);
    });
    input.addEventListener("pointerdown", (event) => event.stopPropagation());
    input.addEventListener("blur", () => setTimeout(() => finish(true), 120));
    const name = block.querySelector(".tg-item-name");
    if (name) name.replaceWith(input);
    requestAnimationFrame(() => { input.focus(); input.select(); });
  }
}

// 2026-10-17b: "add custom tasks ... i juts cant find a place to do that".
// A + on every day (and an Add box on every bank list): type it, Enter.
// "[10]" on the end is its worth, as everywhere else.
function addTaskBox(day, list) {
  const wrap = el("div", "add-task");
  const open = state.calAdding === (list ? "bank|" + list : day);
  const waiting = state.addsWaiting.filter((w) => Date.now() - w.atMs < 120000 &&
    (list ? w.list === list : w.day === day && !w.list));
  waiting.forEach((w) => wrap.append(el("p", "plan-line adding", w.text)));
  if (!open) {
    const plus = button(list ? "+ Add to " + list : "+ Add a task", "add-task-btn", () => {
      state.calAdding = list ? "bank|" + list : day; drawCalendar();
    });
    plus.title = list ? "Add a task to this list" : "Add a task to this day";
    wrap.append(plus);
    return wrap;
  }
  const input = el("input", "add-task-input");
  input.placeholder = list ? "Add to " + list + " ([10] on the end = its worth)" : "New task ([10] on the end = its worth)";
  input.maxLength = 300;
  const send = () => {
    const text = input.value.trim();
    state.calAdding = "";
    if (!text) { drawCalendar(); return; }
    state.addsWaiting = state.addsWaiting.concat([{ day, list: list || "", text, atMs: Date.now() }]);
    state.calSaid = "Added \u201c" + text + "\u201d. The laptop puts it in in about 20 seconds.";
    drawCalendar();
    sendEdit(list ? { kind: "bank_add", text, list } : { kind: "day_add", day, text });
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") send();
    if (event.key === "Escape") { state.calAdding = ""; drawCalendar(); }
  });
  input.addEventListener("blur", () => setTimeout(() => {
    if (state.calAdding && input.isConnected) { if (input.value.trim()) send(); else { state.calAdding = ""; drawCalendar(); } }
  }, 150));
  wrap.append(input);
  requestAnimationFrame(() => input.focus());
  return wrap;
}

// 2026-10-18: "the option to have 'laptop is quiet' off bc its more just
// for me, this is to plan". Off unless she ticks it.
function quietBox(on) {
  const label = el("label", "quiet-box");
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = Boolean(on);
  label.title = "Ticked: the tutor keeps quiet while this is on. Not ticked: it's just there for planning.";
  label.append(box, document.createTextNode(" Laptop quiet"));
  return { label, box };
}

function eventForm(days, now) {
  const form = el("div", "plan-event-form");
  const title = el("input", "plan-event-title");
  title.placeholder = "What is it? (restaurant, meeting...)";
  title.maxLength = 80;
  const day = el("select", "plan-event-day");
  days.filter((d) => d >= isoDay(now)).forEach((d) => {
    const o = el("option", "", dayHead(d, now));
    o.value = d;
    day.append(o);
  });
  const start = el("input");
  start.type = "time";
  start.setAttribute("aria-label", "Starts");
  const end = el("input");
  end.type = "time";
  end.setAttribute("aria-label", "Ends");
  const quiet = quietBox(false);
  let colour = "";
  form.append(title, day, el("span", "muted", "from"), start, el("span", "muted", "to"), end, quiet.label,
    colourRow("", (c) => { colour = c; }),
    button("Add", "", () => addEvent(day.value, title.value, start.value, end.value, quiet.box.checked, colour)),
    button("Cancel", "quiet", () => { state.calEventForm = false; drawCalendar(); }));
  setTimeout(() => title.focus(), 0);
  return form;
}

function swapButton(cell) {
  const swap = state.calSwap;
  const label = swap === cell.day ? "Cancel" : swap ? "Swap here" : "Swap";
  const sw = button(label, "plan-swap", () => {
    if (!swap) { state.calSwap = cell.day; state.calSaid = ""; drawCalendar(); return; }
    if (swap === cell.day) { state.calSwap = null; drawCalendar(); return; }
    swapDays(swap, cell.day);
  });
  sw.title = swap ? "Swap everything on these two days (locked tasks stay)" : "Swap this day's tasks with another day's";
  return sw;
}

// Drops on the hours (a time) or along the top (no time).
function timesDrop(target, day, onHours) {
  const at = (event) => dropTime(event.clientY - target.getBoundingClientRect().top);
  target.addEventListener("dragover", (event) => {
    if (!state.calDrag) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    target.classList.add("over");
  });
  target.addEventListener("dragleave", (event) => {
    if (!target.contains(event.relatedTarget)) target.classList.remove("over");
  });
  target.addEventListener("drop", (event) => {
    event.preventDefault();
    const held = state.calDrag;
    state.dragging = false; state.calDrag = null; state.calStale = false;
    if (!held) return;
    if (held.event) { eventDropped(held.event, day, onHours ? at(event) : ""); return; }   // 2026-10-18
    if (onHours) { placeAt(held, day, at(event)); return; }
    if (held.from !== day) { moveLine(held, day); return; }
    if (held.timed) sendTime(day, held.text, "");
  });
  if (onHours) {
    // Picked, then pressed somewhere on the hours: there, at that time.
    target.addEventListener("click", (event) => {
      if (event.target !== target || !state.calPick) return;
      placeAt(state.calPick, day, at(event));
    });
  }
}

function timedBlock(item, day, past) {
  const top = item.start / 60 * HOUR_PX;
  const tall = Math.max(22, (item.end - item.start) / 60 * HOUR_PX - 2);
  const width = 100 / item.lanes;
  const isEvent = item.kind === "event";
  const short = item.end - item.start <= 45;
  const block = el(past ? "div" : "button", "tg-item" + (isEvent ? " event" : "") + (short ? " short" : ""));
  if (!past) block.type = "button";
  // 2026-10-18b: an event she coloured keeps its colour; a subject line its subject's.
  if (isEvent && eventColour(item.event.color)) { block.classList.add("coloured"); block.style.setProperty("--ev", item.event.color); }
  if (!isEvent && item.line) applySubject(block, item.line);
  block.style.top = top + "px";
  block.style.height = tall + "px";
  block.style.left = "calc(" + (item.lane * width) + "% + 2px)";
  block.style.width = "calc(" + width + "% - 4px)";
  const when = clockWords(hhmm(item.start)) + (isEvent && item.event.end ? " to " + clockWords(item.event.end) : "");
  block.append(el("span", "tg-item-name", item.label), el("span", "tg-item-time", when));
  if (!isEvent && item.line && item.line.locked) {      // 2026-10-16e
    block.classList.add("locked");
    block.prepend(icon("lock"));
  }
  if (past) return block;
  if (isEvent) {
    block.title = "Press to rename. Drag to move it. Pull its bottom to make it longer.";
    if (state.calEventPick && state.calEventPick.id === item.event.id) block.classList.add("picked");
    eventPointer(block, item, day);       // 2026-10-17b
    return block;
  }
  const raw = item.line.raw;
  const picked = state.calPick && state.calPick.text === raw && state.calPick.from === day;
  if (picked) block.classList.add("picked");
  block.draggable = true;
  block.title = "Drag to another time or day. Drag it to the top to take its time off.";
  block.addEventListener("click", () => {
    state.calPick = picked ? null : { text: raw, from: day, timed: true };
    state.calSaid = "";
    drawCalendar();
  });
  block.addEventListener("dragstart", (event) => {
    state.dragging = true;
    state.calDrag = { text: raw, from: day, timed: true };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", raw);
    block.classList.add("dragged");
  });
  block.addEventListener("dragend", () => {
    state.dragging = false;
    state.calDrag = null;
    document.querySelectorAll(".over").forEach((d) => d.classList.remove("over"));
    if (state.calStale) { state.calStale = false; drawCalendar(); }
  });
  return block;
}

function drawTimes(box, days, found, now, pick) {
  const nowMs = Date.now();
  const cells = calendarCells(days, found, state.moves, state.exams, state.tasks, now, 0, state.swaps, locksNow(found));
  const times = mergedTimes(found, state.timesWaiting, nowMs);
  const events = eventsNow(found, nowMs);          // 2026-10-17b: with her edits
  const cols = cells.map((cell) => ({ cell, ...timeColumn(cell.lines, cell.day, times, events) }));
  const wrap = el("div", "tg");
  wrap.style.setProperty("--days", String(days.length));
  wrap.style.setProperty("--hour", HOUR_PX + "px");
  const head = el("div", "tg-row tg-head");
  head.append(el("div", "tg-gutter"));
  cols.forEach(({ cell }) => {
    const h = el("div", "tg-dayhead" + (cell.today ? " today" : "") + (cell.past ? " past" : "") +
      (state.calSwap === cell.day ? " swapping" : ""));
    h.append(el("span", "plan-name", cell.name), el("span", "tg-date", String(cell.date)));
    if (!cell.past) h.append(swapButton(cell));
    head.append(h);
  });
  const top = el("div", "tg-row tg-top");
  top.append(el("div", "tg-gutter tg-label", "no time"));
  cols.forEach(({ cell, untimed }) => {
    const c = el("div", "tg-alld" + (cell.past ? " past" : ""));
    cell.tests.forEach((test) => c.append(el("p", "plan-mark test", test)));
    cell.due.forEach((name) => c.append(el("p", "plan-mark due", "Due: " + name)));
    untimed.forEach((item) => {
      if (item.kind === "event") {
        const chip = button(item.event.title, "plan-mark event", () => {
          state.calEventPick = item.event; drawCalendar();
        });
        if (eventColour(item.event.color)) { chip.classList.add("coloured"); chip.style.setProperty("--ev", item.event.color); }
        if (cell.past) chip.disabled = true;
        else eventChipDrag(chip, item.event);     // 2026-10-18
        c.append(chip);
        return;
      }
      if (item.kind === "gap") return;
      c.append(calLine(item, cell.day, cell.past, pick));
    });
    if (!cell.past) c.append(addTaskBox(cell.day));     // 2026-10-17b
    if (!cell.past) timesDrop(c, cell.day, false);
    top.append(c);
  });
  const scroll = el("div", "tg-scroll");
  const body = el("div", "tg-row tg-body");
  const labels = el("div", "tg-gutter tg-hours");
  for (let h = 0; h < 24; h += 1) {
    labels.append(el("div", "tg-hour", h ? clockWords(String(h).padStart(2, "0") + ":00") : ""));
  }
  body.append(labels);
  cols.forEach(({ cell, timed }) => {
    const col = el("div", "tg-col" + (cell.past ? " past" : "") + (cell.today ? " today" : ""));
    col.dataset.day = cell.day;            // 2026-10-17b: an event dragged across
    timed.forEach((item) => col.append(timedBlock(item, cell.day, cell.past)));
    if (cell.today) {
      const line = el("div", "tg-now");
      line.style.top = ((now.getHours() * 60 + now.getMinutes()) / 60 * HOUR_PX) + "px";
      col.append(line);
    }
    if (!cell.past) timesDrop(col, cell.day, true);
    body.append(col);
  });
  scroll.append(body);
  wrap.append(head, top, scroll);
  box.append(wrap);
  // Opens at the first thing with a time; after that, stays where she left it.
  const key = days.join();
  const fresh = state.calScrollKey !== key;
  state.calScrollKey = key;
  // 2026-10-16e: never above her earliest time (the lock).
  const floor = scrollFloor(cols, state.calHoursLocked ? CAL_LOCK_HOUR : 0);
  // 2026-10-17b: opens where now is (the line), not the first timed thing.
  const want = Math.max(floor, fresh ? nowScroll(cols, now, 8) : state.calScrollTop);
  state.calScrollTop = want;
  requestAnimationFrame(() => {
    if (!scroll.isConnected) return;     // redrawn already: the new one does it
    scroll.scrollTop = want;
    scroll.addEventListener("scroll", () => {
      if (floor && scroll.scrollTop < floor) scroll.scrollTop = floor;
      state.calScrollTop = scroll.scrollTop;
    });
  });
}

// 2026-10-16m: the "Do 1 from [LIST]" card dropped on a day. The line
// goes on that day; the laptop puts it there in about 20 seconds.
function pickToDay(pick, to) {
  const now = new Date();
  state.calPick = null;
  if (to === BANK || to === BANK_PICK) return Promise.resolve(false);
  const problem = moveProblem(pick.text, BANK_PICK, to, now);
  if (problem) { state.calSaid = problem; drawCalendar(); return Promise.resolve(false); }
  state.calSaid = "\u201c" + pick.text + "\u201d goes on " + dayHead(to, now) +
    ". The laptop takes it in about 20 seconds while the tutor is open.";
  drawCalendar();
  return sendEdit({ kind: "bank_pick", text: pick.text, from: BANK, to }).then((sent) => {
    if (sent) return true;
    state.calSaid = "Couldn't send that. Are you online?";
    drawCalendar();
    return false;
  });
}

function drawBank(box, found, pick) {
  // 2026-10-15c: "drag the tasks to a box OUTSIDE ... a tasks bank".
  // 2026-10-17: "this is flippin terrible?? ... what i meant were
  // collapsible layers ... like u can view 3 at a time and click to
  // collapse and scroll down to see the rest of the subjects." So: every
  // list is a card, three across; press its name to fold it. Inside, a
  // little heading ("mr khan") folds its lines too (folded to start with).
  // The bank scrolls for the rest.
  const bankBox = el("section", "plan-day plan-bank");
  bankBox.setAttribute("aria-label", "Task bank");
  bankBox.append(el("p", "plan-head", "Task bank"));
  const tabs = bankTabs(withMoves(found, state.moves).get(BANK) || []);
  if (!tabs.length) bankBox.append(el("p", "muted", "Your Subjects lists show here. You can also drag a task here to keep it for later, off every day."));
  const grid = el("div", "bank-grid");
  tabs.forEach((tab) => {
    const shut = state.bankShut.has(tab.name);
    const card = el("section", "bank-sub" + (shut ? " shut" : ""));
    const colour = subjectColour(tab.name);          // 2026-10-18b
    if (colour) { card.classList.add("subj"); card.style.setProperty("--subj", colour); }
    const count = tab.lines.filter((l) => !String(l.text).trim().startsWith(">")).length;
    const head = button("", "bank-sub-head", () => {
      if (shut) state.bankShut.delete(tab.name); else state.bankShut.add(tab.name);
      keep("tutor-bank-shut", [...state.bankShut]);
      drawCalendar();
    });
    head.setAttribute("aria-expanded", String(!shut));
    head.title = shut ? "Open " + tab.name : "Fold " + tab.name;
    head.append(el("span", "fold-arrow" + (shut ? "" : " open"), ""), el("span", "bank-sub-name", tab.name),
      el("span", "bank-count", String(count)));
    card.append(head);
    if (!shut) {
      card.append(pickCard(tab.name));
      // The lines, with each little heading's lines under it, folded.
      const rows = dayLines(tab.lines, BANK).filter((l) => l.kind !== "gap");
      let i = 0;
      while (i < rows.length) {
        const group = String((tab.lines[i] || {}).group || "");
        let j = i;
        while (j < rows.length && String((tab.lines[j] || {}).group || "") === group) j++;
        const target = group ? el("div", "bank-group-lines") : card;
        if (group) {
          const key = tab.name + "|" + group;
          const open = state.bankGroupsOpen.has(key);
          const gh = button("", "bank-group-head", () => {
            if (open) state.bankGroupsOpen.delete(key); else state.bankGroupsOpen.add(key);
            keep("tutor-bank-groups", [...state.bankGroupsOpen]);
            drawCalendar();
          });
          gh.setAttribute("aria-expanded", String(open));
          gh.append(el("span", "fold-arrow" + (open ? " open" : ""), ""), el("span", "", group),
            el("span", "bank-count", String(j - i)));
          card.append(gh);
          if (open) card.append(target);
        }
        for (let k = i; k < j; k++) {
          const line = rows[k];
          const item = calLine(line, BANK, false, pick);
          const worth = Number((tab.lines[k] || {}).minutes) || 0;
          if (worth && line.kind === "line" && !line.sub) item.append(el("span", "bank-worth", worth + " min"));
          target.append(item);
        }
        i = j;
      }
      card.append(addTaskBox("", tab.name));     // 2026-10-17b
    }
    grid.append(card);
  });
  if (tabs.length) bankBox.append(grid);
  calDrop(bankBox, BANK, pick);
  box.append(bankBox);
}

// "complete a task from [list] (optional if minimum worth x mins)": drag
// it onto a day (or press it, then Move here). The least is optional.
function pickCard(name) {
  const least = state.bankLeast[name] || "0";
  const text = pickLine(name, least);
  const card = el("div", "bank-pick");
  const picked = state.calPick && state.calPick.from === BANK_PICK && state.calPick.text === text;
  const go = el("button", "plan-line bank-pick-line" + (picked ? " picked" : ""), "Do 1 from " + name);
  go.type = "button";
  if (subjectColour(name)) { go.classList.add("subj"); go.style.setProperty("--subj", subjectColour(name)); }
  go.draggable = true;
  go.title = "Drag onto a day: that day gets \u201c" + text + "\u201d. Tick it there and the tutor asks which one you did.";
  go.setAttribute("aria-pressed", String(Boolean(picked)));
  go.addEventListener("click", () => {
    state.calPick = picked ? null : { text, from: BANK_PICK };
    state.calSaid = "";
    drawCalendar();
  });
  go.addEventListener("dragstart", (event) => {
    state.dragging = true;
    state.calDrag = { text, from: BANK_PICK };
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", text);
  });
  go.addEventListener("dragend", () => {
    state.dragging = false;
    state.calDrag = null;
    document.querySelectorAll(".plan-day.over").forEach((d) => d.classList.remove("over"));
    if (state.calStale) { state.calStale = false; drawCalendar(); }
  });
  card.append(go, chipRow("bank-least", "At least worth", PICK_LEASTS, least, (value) => {
    state.bankLeast = { ...state.bankLeast, [name]: value };
    drawCalendar();
  }));
  return card;
}

// One line on the calendar or in the bank: drag it, or press it to pick it.
function calLine(line, dayId, past, pick) {
  const head = line.kind === "head";
  const can = !past && !line.done && !line.sub;
  const picked = pick && pick.text === line.raw && pick.from === dayId;
  const item = el(can ? "button" : "p", "plan-line" + (head ? " head" : "") + (line.done ? " done" : "") +
    (line.sub ? " sub" : "") + (line.optional ? " optional" : "") + (line.fun ? " fun" : "") +
    (line.bold ? " bold" : "") + (line.moving ? " moving" : "") + (picked ? " picked" : "") +
    (line.repeat ? " repeat" : "") + (line.locked ? " locked" : ""),
    (line.sub ? "> " : "") + line.text);
  if (line.locked) item.prepend(icon("lock"));
  if (!line.head) applySubject(item, line);      // 2026-10-18b
  if (line.repeat) item.title = "Comes back every day. It lands on this day's list on the day.";
  if (!can) return item;
  item.type = "button";
  // 2026-10-17: a repeat can be pressed (to stop it), not dragged.
  item.draggable = !line.repeat;
  item.setAttribute("aria-pressed", String(Boolean(picked)));
  item.title = head ? "Drag it to another day and the lines under it go too"
    : "Drag to another day or the bank, or press to pick it (and lock it to this day)";
  item.addEventListener("click", () => {
    state.calPick = picked ? null : { text: line.raw, from: dayId, repeat: Boolean(line.repeat) };
    state.calSaid = "";
    state.calRepeat = null;
    drawCalendar();
  });
  item.addEventListener("dragstart", (event) => {
    if (line.repeat) { event.preventDefault(); return; }
    state.dragging = true;
    state.calDrag = { text: line.raw, from: dayId };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", line.raw);
    item.classList.add("dragged");
  });
  item.addEventListener("dragend", () => {
    state.dragging = false;
    state.calDrag = null;
    item.classList.remove("dragged");
    document.querySelectorAll(".plan-day.over").forEach((d) => d.classList.remove("over"));
    if (state.calStale) { state.calStale = false; drawCalendar(); }
  });
  return item;
}

// A day (or the bank) that a line can be dropped on.
function calDrop(target, dayId, pick) {
  target.addEventListener("dragover", (event) => {
    if (!state.calDrag || state.calDrag.from === dayId) return;
    if (state.calDrag.from === BANK_PICK && dayId === BANK) return;   // 2026-10-16m
    if (state.calDrag.event && dayId === BANK) return;                 // 2026-10-18
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    target.classList.add("over");
  });
  target.addEventListener("dragleave", (event) => {
    if (!target.contains(event.relatedTarget)) target.classList.remove("over");
  });
  target.addEventListener("drop", (event) => {
    event.preventDefault();
    const held = state.calDrag;
    state.dragging = false; state.calDrag = null; state.calStale = false;
    if (held && held.event) { if (dayId !== BANK) eventDropped(held.event, dayId, ""); return; }   // 2026-10-18
    if (held) moveLine(held, dayId);
  });
  if (pick && !pick.repeat && pick.from !== dayId && !(pick.from === BANK_PICK && dayId === BANK)) {
    target.append(button(dayId === BANK ? "Put in the bank" : "Move here", "plan-here", () => moveLine(pick, dayId)));
  }
}

// 2026-10-18: the plan check. "i can choose how many i want to finish by
// what date. then itll say with the current plan setup ... u will have [x]
// tasks leftover from whatever lists". One row a list: how many are in it,
// "Finish [n] by [date]", and what the days up to then have on them.
function drawPlanCheck(box, found) {
  const now = new Date();
  // Goals she's just set win until the laptop has them (or 2 min).
  const goals = { ...(found.goals || {}) };
  state.goalsWaiting.forEach((g, name) => {
    const real = goals[name];
    if (Date.now() - g.atMs > 120000 || (real && real.count === g.count && real.by === g.by) ||
        (!real && !g.count)) { state.goalsWaiting.delete(name); return; }
    if (g.count) goals[name] = { count: g.count, by: g.by }; else delete goals[name];
  });
  const check = planCheck({ ...found, goals }, now);
  // 2026-10-18: "PLAN CHECK should have a hide button". Hidden, it's one
  // line: its name and what it says.
  const shut = Boolean(recall("tutor-plan-shut", false));
  const card = el("section", "plan-check" + (shut ? " shut" : ""));
  const head = el("div", "plan-check-top");
  // 2026-10-18b: the old arrow was too small to read as a button. A plain
  // word on the right: "Hide" or "Show".
  const fold = button(shut ? "Show" : "Hide", "plan-check-fold", () => { keep("tutor-plan-shut", !shut); drawCalendar(); });
  fold.title = shut ? "Show the plan check" : "Hide the plan check";
  fold.setAttribute("aria-expanded", String(!shut));
  head.append(el("p", "plan-head", "Plan check"), fold);
  card.append(head, el("p", "plan-check-says" + (check.total ? " short" : ""), check.words));
  if (shut) { box.append(card); return; }
  // 2026-10-18b: "i want to mass set the date for x amount to be done for
  // all of them". One count and one date, put on every list at once (a
  // list never gets more than it has open).
  const all = el("div", "plan-check-all");
  const allCount = document.createElement("input");
  allCount.type = "number"; allCount.min = "1";
  allCount.placeholder = "How many";
  allCount.setAttribute("aria-label", "How many from every list");
  const allBy = document.createElement("input");
  allBy.type = "date"; allBy.min = isoDay(now);
  allBy.setAttribute("aria-label", "By when, for every list");
  const allGo = button("Set for all lists", "plan-check-all-go", () => {
    const n = Math.max(0, Math.round(Number(allCount.value) || 0));
    if (!n || !allBy.value) { state.calSaid = "Put a number and a date first."; drawCalendar(); return; }
    check.rows.forEach((row) => {
      const count = Math.min(n, row.open);
      state.goalsWaiting.set(row.name, { count, by: allBy.value, atMs: Date.now() });
      sendEdit({ kind: "bank_goal", list: row.name, count, by: allBy.value });
    });
    state.calSaid = "Set on every list. The laptop takes it in about 20 seconds.";
    drawCalendar();
  });
  all.append(el("span", "muted", "Finish"), allCount, el("span", "muted", "from every list by"), allBy, allGo);
  card.append(all);
  const table = el("div", "plan-check-rows");
  check.rows.forEach((row) => {
    const line = el("div", "plan-check-row" + (row.short ? " short" : ""));
    line.append(el("span", "plan-check-name", row.name), el("span", "muted plan-check-open", row.open + " to do"));
    const count = document.createElement("input");
    count.type = "number"; count.min = "0"; count.max = String(Math.max(row.open, 1));
    count.value = row.goal ? String(row.goal.count) : "";
    count.placeholder = "0";
    count.setAttribute("aria-label", "How many from " + row.name);
    const by = document.createElement("input");
    by.type = "date"; by.min = isoDay(now);
    by.value = row.goal ? row.goal.by : "";
    by.setAttribute("aria-label", "By when");
    const send = () => {
      const n = Math.max(0, Math.round(Number(count.value) || 0));
      if (n && !by.value) return;          // waits for the date
      state.goalsWaiting.set(row.name, { count: n, by: by.value, atMs: Date.now() });
      drawCalendar();
      sendEdit({ kind: "bank_goal", list: row.name, count: n, by: by.value || "" });
    };
    count.addEventListener("change", send);
    by.addEventListener("change", send);
    line.append(el("span", "muted", "Finish"), count, el("span", "muted", "by"), by);
    line.append(el("span", "plan-check-result", !row.goal ? ""
      : row.late ? "that date's gone"
      : row.planned + " planned by then" + (row.short ? ", " + row.short + " short" : ", covered")));
    table.append(line);
  });
  if (check.rows.length) card.append(table);
  box.append(card);
}

// 2026-10-17: split and repeat, picked on the calendar.
function splitPicked(pick, parts) {
  state.calPick = null;
  state.calSaid = "Splitting into " + parts.n + " \u00d7 \u201c" + parts.one + "\u201d. The laptop does it in about 20 seconds.";
  drawCalendar();
  return sendEdit({ kind: "line_split", day: pick.from, text: pick.text, n: parts.n, one: parts.one });
}

function repeatForm(pick, parts) {
  const form = el("div", "plan-bar repeat-form");
  // 2026-10-18: "i can also change repeat to be every [x] hours/days/weeks"
  const every = document.createElement("input");
  every.type = "number"; every.min = "1"; every.max = "60"; every.value = "1";
  every.className = "repeat-every";
  every.setAttribute("aria-label", "Every how many");
  const unit = document.createElement("select");
  unit.setAttribute("aria-label", "Hours, days or weeks");
  [["hour", "hours"], ["day", "days"], ["week", "weeks"]].forEach(([v, w]) => {
    const o = el("option", "", w); o.value = v; if (v === "day") o.selected = true; unit.append(o);
  });
  form.append(el("span", "muted", "Every"), every, unit, el("span", "muted", "from this day until"));
  const until = document.createElement("input");
  until.type = "date";
  until.min = pick.from;
  until.title = "Leave it empty to keep it going until you stop it";
  form.append(until);
  let apart = null;
  if (parts) {
    const label = el("label", "repeat-apart");
    apart = document.createElement("input");
    apart.type = "checkbox";
    apart.checked = true;
    label.append(apart, document.createTextNode(" as " + parts.n + " \u00d7 \u201c" + parts.one + "\u201d"));
    form.append(label);
  }
  form.append(button("Repeat it", "", () => {
    const times = apart && apart.checked && unit.value !== "hour" ? parts.n : 1;
    const n = Math.max(1, Math.min(60, Math.round(Number(every.value) || 1)));
    state.calRepeat = null;
    state.calPick = null;
    state.calSaid = "Repeating \u201c" + (times > 1 ? parts.one + "\u201d \u00d7 " + times : pick.text + "\u201d") +
      " " + repeatWords({ every: n, unit: unit.value }) +
      (until.value ? " until " + dayHead(until.value, new Date()) : "") + ". The laptop sets it up in about 20 seconds.";
    drawCalendar();
    sendEdit({ kind: "repeat_add", day: pick.from, text: pick.text, until: until.value || "",
               times, one: times > 1 ? parts.one : "", every: n, unit: unit.value });
  }), button("Cancel", "quiet", () => { state.calRepeat = null; drawCalendar(); }));
  return form;
}

function stopRepeat(text) {
  text = String(text).replace(/\s+\(every [^)]*\)$/, "");    // an hourly one's label
  state.calPick = null;
  state.calSaid = "Stopped. \u201c" + text + "\u201d won't come back (the laptop takes it in about 20 seconds).";
  drawCalendar();
  return sendEdit({ kind: "repeat_stop", text });
}

function swapDays(one, two) {
  state.calSwap = null;
  const now = new Date();
  // 2026-10-16e: "ive clicked swap here, tasks didnt swap". It waited for
  // the laptop with nothing to show. Now it's swapped here at once (locked
  // lines stay), and the laptop does the same in about 20 seconds.
  const found = allDays(state.alldays);
  state.swaps = state.swaps.concat([{ one, two, atMs: Date.now(),
    before: { one: swapSig(found, one), two: swapSig(found, two) } }]);
  state.calSaid = "Swapped " + dayHead(one, now) + " and " + dayHead(two, now) +
    ". Locked tasks stayed put. The laptop takes it in about 20 seconds while the tutor is open.";
  drawCalendar();
  sendEdit({ kind: "day_swap", text: "", from: one, to: two }).then((sent) => {
    if (sent) return;
    state.swaps = state.swaps.filter((sw) => !(sw.one === one && sw.two === two));
    state.calSaid = "Couldn't send that. Are you online?";
    drawCalendar();
  });
}

// ---- 2026-10-16e: a task locked to its day. Locked here at once; the
// laptop keeps the real list.
function locksNow(found) {
  const out = new Set((found && found.locks) || []);
  const nowMs = Date.now();
  state.lockWaiting.forEach((w, key) => {
    if (nowMs - w.atMs > 120000 || out.has(key) === w.locked) { state.lockWaiting.delete(key); return; }
    if (w.locked) out.add(key); else out.delete(key);
  });
  return out;
}

function lockLine(day, text, locked) {
  const key = dayKey(day, text);
  state.lockWaiting.set(key, { locked, atMs: Date.now() });
  state.calPick = null;
  state.calSaid = locked ? "Locked to this day. A swap leaves it here." : "Unlocked. A swap takes it with the rest.";
  drawCalendar();
  sendEdit({ kind: "line_lock", day, text, locked }).then((sent) => {
    if (sent) return;
    state.lockWaiting.delete(key);
    state.calSaid = "Couldn't send that. Are you online?";
    drawCalendar();
  });
}

// Small line icons, drawn here so they match the tutor's.
function icon(name) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("ico");
  const paths = {
    lock: ["M4.5 7.5h7v6h-7z", "M6 7.5V5.5a2 2 0 0 1 4 0v2"],
    unlock: ["M4.5 7.5h7v6h-7z", "M6 7.5V5.5a2 2 0 0 1 3.8-.9"],
    sliders: ["M2.5 4.5h11", "M2.5 8h11", "M2.5 11.5h11", "M5.5 3v3", "M10.5 6.5v3", "M7 10v3"],
    plus: ["M8 3v10", "M3 8h10"],
  }[name] || [];
  paths.forEach((d) => {
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", "1.5");
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    svg.append(p);
  });
  return svg;
}

function iconButton(name, tip, onClick, pressed) {
  const b = button("", "icon-btn", onClick);
  b.append(icon(name));
  b.title = tip;
  b.setAttribute("aria-label", tip);
  if (pressed !== undefined) b.setAttribute("aria-pressed", String(Boolean(pressed)));
  return b;
}

// 2026-10-18: "when adding a new event, i type the name in and then it
// DELETES ALL OF IT". The laptop's updates redrew the whole calendar (and
// the half-typed form with it) every 20 seconds or so. An update that
// comes while she's typing in the calendar waits until she's done.
function typingInCalendar() {
  const active = document.activeElement;
  return Boolean(active && $("tab-calendar").contains(active) &&
    /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName));
}

function drawCalendarSoft() {
  if (typingInCalendar()) { state.calStale = true; return; }
  drawCalendar();
}

document.addEventListener("focusout", () => {
  setTimeout(() => {
    if (state.calStale && !state.dragging && !typingInCalendar()) { state.calStale = false; drawCalendar(); }
  }, 300);
});

function drawCalendar() {
  // Never redrawn in the middle of a drag: the line she's holding would go.
  if (state.dragging) { state.calStale = true; return; }
  const box = $("tab-calendar");
  box.replaceChildren();
  const now = new Date();
  const found = allDays(state.alldays);
  if (!found) {
    box.append(el("p", "empty", "The days show here once the laptop has sent them. Open the tutor and press Sync now."));
    return;
  }
  state.moves = settleMoves(state.moves, found, Date.now());
  state.swaps = settleSwaps(state.swaps, found, Date.now());
  // 2026-10-18b: which subject each line belongs to, from the bank's lists.
  subjectOfLine.clear();
  [].concat(found.bank || [], found.planned || []).forEach((l) => {
    const words = String((l && l.text) || "").trim();
    const list = String((l && l.list) || "").trim();
    if (!words || words.startsWith(">") || !subjectColour(list)) return;
    subjectOfLine.set(words.toLowerCase(), list);
  });
  const anchor = state.calAnchor || isoDay(now);
  const days = calendarDays(anchor, state.calView);
  // 2026-10-16e: "the ui on the website looks CLUTTERED as heck now at
  // the top. i should alteast be able to hover and understand what the
  // funciton is". One row: arrows, the dates, how much to show, and three
  // icons (lock the hours, view options, add an event). Layout and lines
  // a day live behind the view options icon. Everything says what it
  // does on hover.
  const bar = el("div", "plan-bar");
  const step = (by) => { state.calAnchor = calendarStep(anchor, state.calView, by); drawCalendar(); };
  const back = button("<", "quiet", () => step(-1));
  back.setAttribute("aria-label", "Earlier");
  back.title = "Back";
  const on = button(">", "quiet", () => step(1));
  on.setAttribute("aria-label", "Later");
  on.title = "On";
  const todayBtn = button("Today", "quiet", () => { state.calAnchor = null; drawCalendar(); });
  todayBtn.title = "Back to today";
  const views = chipRow("ring-switch", "How much to show", CAL_VIEWS, state.calView, (view) => {
    state.calView = view; keep("tutor-cal", view); drawCalendar();
  });
  views.title = "How many days to show";
  const tools = el("div", "plan-tools");
  const hours = state.calLayout === "times" && state.calView !== "month";
  if (hours) {
    tools.append(iconButton(state.calHoursLocked ? "lock" : "unlock",
      state.calHoursLocked ? "Hours locked at 5am: press to scroll to midnight"
        : "Hours unlocked: press to lock them at 5am", () => {
        state.calHoursLocked = !state.calHoursLocked;
        keep("tutor-cal-hours-lock", state.calHoursLocked ? "1" : "0");
        state.calScrollKey = ""; drawCalendar();
      }, state.calHoursLocked));
  }
  tools.append(
    iconButton("sliders", state.calMore ? "Hide view options" : "View options: layout and lines a day",
      () => { state.calMore = !state.calMore; drawCalendar(); }, state.calMore),
    iconButton("plus", "Add an event (restaurant, meeting, birthday)",
      () => { state.calEventForm = !state.calEventForm; drawCalendar(); }, state.calEventForm));
  bar.append(back, todayBtn, on, el("p", "plan-title", calendarTitle(days, state.calView, anchor)), views, tools);
  if (state.calMore) {
    const more = el("div", "plan-bar plan-more");
    if (state.calView !== "month") {
      const layout = chipRow("ring-switch", "Layout", CAL_LAYOUTS, state.calLayout, (layout) => {
        state.calLayout = layout; keep("tutor-cal-layout", layout); drawCalendar();
      });
      layout.title = "Times: hours down the side. List: just each day's lines.";
      more.append(el("span", "muted", "Layout"), layout);
    }
    const few = chipRow("ring-switch", "Lines a day", CAL_FEW, String(state.calFew), (few) => {
      state.calFew = Number(few) || 0; state.calOpen = {}; keep("tutor-cal-few", String(state.calFew)); drawCalendar();
    });
    few.title = "Show every line on a day, or a few and \u201cand N more\u201d";
    more.append(el("span", "muted", "Lines a day"), few);
    box.append(bar, more);
    bar.dataset.more = "1";
  }
  if (!bar.dataset.more) box.append(bar);
  if (state.calEventForm) box.append(eventForm(days, now));
  const pick = state.calPick;
  const said = el("p", "muted plan-said", pick
    ? "Moving \u201c" + pick.text + "\u201d. Press Move here on a day, or press it again to leave it."
    : state.calSaid || (state.calLayout === "times" && state.calView !== "month"
      ? "Drag a task onto an hour for a rough time, onto another day, or into the bank. Or press it, then press where it goes."
      : "Drag a task onto another day. Or press it, then press Move here on the day."));
  said.setAttribute("role", "status");
  box.append(said);
  // 2026-10-16e: a picked task can be locked to its day.
  // 2026-10-17: and split ("3 crochet bracelets" into three), or made to
  // repeat. A repeat that's picked can be stopped.
  if (pick && pick.repeat) {
    const row = el("div", "plan-bar");
    row.append(el("p", "plan-title", "\u201c" + pick.text + "\u201d comes back every day."),
      button("Stop repeating", "quiet", () => stopRepeat(pick.text)));
    box.append(row);
  } else if (pick && pick.from !== BANK && pick.from !== BANK_PICK) {
    const locked = locksNow(found).has(dayKey(pick.from, pick.text));
    const row = el("div", "plan-bar");
    const lb = button(locked ? "Unlock" : "Lock to this day", "quiet",
      () => lockLine(pick.from, pick.text, !locked));
    lb.prepend(icon(locked ? "unlock" : "lock"));
    lb.title = locked ? "A swap will take it with the rest" : "A swap leaves it on this day";
    row.append(lb);
    const parts = splitLine(pick.text);
    if (parts) {
      const sb = button("Split into " + parts.n, "quiet", () => splitPicked(pick, parts));
      sb.title = "Makes it " + parts.n + " separate tasks: \u201c" + parts.one + "\u201d";
      row.append(sb);
    }
    const rb = button("Repeat", "quiet", () => {
      state.calRepeat = state.calRepeat ? null : { text: pick.text, from: pick.from };
      drawCalendar();
    });
    rb.title = "A fresh one every day from this day";
    row.append(rb);
    box.append(row);
    if (state.calRepeat && state.calRepeat.text === pick.text) box.append(repeatForm(pick, parts));
  }
  if (state.calEventPick) box.append(eventEditor(state.calEventPick));   // 2026-10-17b
  if (pick && pick.timed) {
    box.append(button("Take its time off", "quiet", () => sendTime(pick.from, pick.text, "")));
  }
  if (state.calLayout === "times" && state.calView !== "month") {
    drawTimes(box, days, found, now, pick);
    drawBank(box, found, pick);
    drawPlanCheck(box, found);             // 2026-10-18
    box.append(el("p", "muted", "Drag a task onto an hour to give it a rough time, or to the top to take it off. " +
      "Meals and prayers stay on Today. Days that have gone can't be changed."));
    return;
  }
  const grid = el("div", "plan-grid " + state.calView);
  const cells = calendarCells(days, found, state.moves, state.exams, state.tasks, now,
                              state.calView === "month" ? 4 : (state.calFew || 0), state.swaps, locksNow(found));
  const swap = state.calSwap;
  cells.forEach((cell) => {
    const day = el("section", "plan-day" + (cell.past ? " past" : "") + (cell.today ? " today" : "") +
      (swap === cell.day ? " swapping" : ""));
    day.setAttribute("aria-label", dayHead(cell.day, now));
    const head = el("p", "plan-head");
    head.append(el("span", "plan-name", cell.name), el("span", "plan-date",
      cell.date + (cell.date === 1 || cell.day === days[0] ? " " + cell.month : "")));
    // 2026-10-15c: "i can swap days". Swap on one day, then Swap here on
    // the other: everything on them changes places. Meals and prayers stay.
    if (!cell.past) head.append(swapButton(cell));
    day.append(head);
    cell.tests.forEach((test) => day.append(el("p", "plan-mark test", test)));
    cell.due.forEach((name) => day.append(el("p", "plan-mark due", "Due: " + name)));
    cell.lines.forEach((line) => day.append(calLine(line, cell.day, cell.past, pick)));
    if (!cell.past) day.append(addTaskBox(cell.day));     // 2026-10-17b
    if (cell.more > 0) {
      // 2026-10-13: press it to see that day's lines.
      day.append(button("and " + cell.more + " more", "plan-more", () => {
        state.calView = "three"; state.calFew = 0; state.calAnchor = cell.day;
        keep("tutor-cal", "three"); keep("tutor-cal-few", "0"); drawCalendar();
      }));
    }
    if (!cell.past) calDrop(day, cell.day, pick);
    grid.append(day);
  });
  box.append(grid);
  drawBank(box, found, pick);
  drawPlanCheck(box, found);               // 2026-10-18
  box.append(el("p", "muted", "Only the day changes, never the words. Meals and prayers stay on Today. Days that have gone can't be changed."));
}

// ---- 2026-10-10q: her notes, the same ones as the top of the tutor's
// Notes tab. The box is built ONCE and never redrawn, so a live update
// can't take what she's typing. It sends a moment after she stops.
const notes = { box: null, said: null, dirty: false, base: "", sent: null, timer: null };

function notesSend() {
  notes.timer = null;
  if (!notes.dirty || !cloud) return;
  const text = notes.box.value;
  notes.dirty = false;
  const base = notes.base;
  notes.sent = { text, base, atMs: Date.now() };
  // What the laptop will call this copy once it has it, so the next thing
  // she types is sent as a change to THIS, not to the one before.
  notes.base = noteVersion(text);
  notes.said.textContent = "Sending";
  sendEdit({ kind: "notes", text, base }).then((sent) => {
    if (!sent) {
      notes.dirty = true; notes.base = base; notes.sent = null;
      notes.said.textContent = "Couldn't send that. Are you online? It's still in the box.";
      return;
    }
    drawNotes();
  });
}

function drawNotes() {
  const tab = $("tab-notes");
  if (!notes.box) {
    notes.box = el("textarea", "notes-box");
    notes.box.maxLength = 60000;
    notes.box.placeholder = "Write anything. It's the same as the notes box in the tutor.";
    notes.box.setAttribute("aria-label", "Your notes");
    notes.said = el("p", "muted");
    notes.said.setAttribute("role", "status");
    notes.box.addEventListener("input", () => {
      notes.dirty = true;
      notes.said.textContent = "Typing. It sends when you stop.";
      clearTimeout(notes.timer);
      notes.timer = setTimeout(notesSend, 1500);
    });
    notes.box.addEventListener("blur", () => { if (notes.dirty) { clearTimeout(notes.timer); notesSend(); } });
    tab.replaceChildren(notes.box, notes.said,
      el("p", "muted", "These are your notes, not tasks. Your tasks are on Tasks and Today."));
  }
  const got = notesIncoming({ text: notes.box.value, dirty: notes.dirty, base: notes.base, sent: notes.sent },
                            state.notes, Date.now());
  notes.base = got.base;
  notes.sent = got.sent;
  if (got.set) {
    const at = notes.box.selectionStart;
    notes.box.value = got.text;
    if (document.activeElement === notes.box) notes.box.setSelectionRange(at, at);
  }
  notes.said.textContent = got.words;
}

// Her own tasks plus what Classroom says is due.
function allWork() {
  return state.tasks.concat(workAsTasks(state.work));
}

// ---- Dates on her Google Calendar. The form is built ONCE and never
// redrawn, so a live update can't take her typing or her preview away.
// Only the lists under it are redrawn. Nothing is sent until she has read
// the exact words and pressed "Write it".
const cal = { zone: null, title: null, day: null, start: null, said: null,
              preview: null, lists: null, waiting: null };

function calShow(op, entry, old) {
  cal.waiting = { op, entry, old };
  cal.preview.replaceChildren();
  const words = el("pre", "cal-words", calendarWords(op, entry, old));
  const choices = el("div", "choices");
  const yes = button(op === "remove" ? "Take it off" : "Write it", "", async () => {
    const job = cal.waiting;
    if (!job) return;
    yes.disabled = true;
    const sent = await sendEdit({ kind: "gcal", op: job.op, title: String(job.entry.title).trim(),
                                  day: job.entry.day, start: job.entry.start || "",
                                  end: job.entry.end || "", made: job.old ? job.old.event : "" });
    cal.waiting = null;
    cal.preview.replaceChildren();
    cal.said.textContent = sent ? "Sent to the laptop. It shows below when it's done."
      : "Couldn't send that. Are you online?";
    if (sent && job.op === "add") { cal.title.value = ""; cal.day.value = ""; cal.start.value = ""; }
  });
  const no = button("Don't", "soft", () => {
    cal.waiting = null;
    cal.preview.replaceChildren();
    cal.said.textContent = "Nothing was written.";
  });
  choices.append(yes, no);
  cal.preview.append(words, choices);
  cal.said.textContent = "";
  cal.preview.scrollIntoView({ block: "nearest" });
}

function calBuild() {
  cal.zone = el("div", "cal-zone");
  cal.zone.append(el("h2", "", "Put a date on Google Calendar"));
  cal.can = el("p", "muted", "");
  const form = el("div", "cal-form");
  cal.title = el("input"); cal.title.type = "text"; cal.title.maxLength = 200;
  cal.title.placeholder = "What is it? (Physics test)";
  cal.title.setAttribute("aria-label", "What to put on the calendar");
  cal.day = el("input"); cal.day.type = "date";
  cal.day.setAttribute("aria-label", "Which day");
  cal.start = el("input"); cal.start.type = "time";
  cal.start.setAttribute("aria-label", "What time, or leave empty for all day");
  const check = button("Show me what it will write", "soft", () => {
    const entry = { title: cal.title.value, day: cal.day.value, start: cal.start.value, end: "" };
    const wrong = calendarCan(state.google) || calendarProblem(entry, new Date());
    if (wrong) { cal.preview.replaceChildren(); cal.waiting = null; cal.said.textContent = wrong; return; }
    calShow("add", entry, null);
  });
  form.append(cal.title, cal.day, cal.start, el("p", "muted", "Leave the time empty for an all day date."), check);
  cal.form = form;
  cal.said = el("p", "muted", "");
  cal.preview = el("div", "cal-preview");
  cal.lists = el("div", "cal-lists");
  cal.zone.append(cal.can, form, cal.said, cal.preview, cal.lists);
}

function calDraw() {
  const blocked = calendarCan(state.google);
  cal.can.textContent = blocked || ("The tutor only ever changes or removes dates it wrote itself" +
    (state.google && state.google.account ? ". Calendar: " + state.google.account + "." : "."));
  cal.form.hidden = Boolean(blocked);
  // The lists are left alone while she's typing a new date into one.
  if (cal.lists.contains(document.activeElement)) return;
  cal.lists.replaceChildren();
  if (blocked) return;
  const now = new Date();
  const offers = calendarOffers(state.exams, state.tasks, state.made, now);
  if (offers.length) {
    cal.lists.append(fold("cal:offers", "Tests and due dates not on your calendar", offers.length, (inside) => {
      offers.forEach((offer) => {
        const card = el("div", "paper");
        card.append(el("p", "paper-title", offer.title));
        card.append(el("p", "muted", calendarWhen(offer.day, "", "")));
        const choices = el("div", "choices");
        choices.append(button("Put on Calendar", "soft", () =>
          calShow("add", { title: offer.title, day: offer.day, start: "", end: "" }, null)));
        card.append(choices);
        inside.append(card);
      });
    }, false));
  }
  const mine = state.made.filter((m) => !state.google || !state.google.account ||
                                        m.account === state.google.account);
  if (mine.length) {
    cal.lists.append(fold("cal:made", "Dates the tutor wrote", mine.length, (inside) => {
      [...mine].sort((a, b) => String(a.day).localeCompare(String(b.day))).forEach((made) => {
        const card = el("div", "paper");
        card.append(el("p", "paper-title", made.title));
        card.append(el("p", "muted", calendarWhen(made.day, made.start, made.end)));
        const choices = el("div", "choices");
        const day = el("input", "cal-newday"); day.type = "date"; day.value = made.day;
        day.setAttribute("aria-label", "New day for " + made.title);
        choices.append(day, button("Change the date", "soft", () => {
          const entry = { title: made.title, day: day.value, start: made.start, end: made.end };
          const wrong = calendarProblem(entry, new Date());
          if (wrong) { cal.said.textContent = wrong; return; }
          if (entry.day === made.day) { cal.said.textContent = "That's the date it already has."; return; }
          calShow("edit", entry, made);
        }), button("Take it off", "soft", () => calShow("remove", made, made)));
        card.append(choices);
        inside.append(card);
      });
    }, true));
  }
  const recent = [...state.writes].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 5);
  if (recent.length) {
    const list = el("ul");
    recent.forEach((write) => list.append(row(calendarWriteWords(write), clock12(write.at))));
    cal.lists.append(list);
  }
}

function drawSchool() {
  const tab = $("tab-school");
  if (!cal.zone) {
    calBuild();
    cal.top = el("div");
    cal.rest = el("div");
    tab.replaceChildren(cal.top, cal.zone, cal.rest);
  }
  cal.top.replaceChildren(el("p", "muted", googleStatus(state.google)));
  calDraw();
  const box = cal.rest;
  box.replaceChildren();
  const now = new Date();
  const buckets = schoolWork(state.work, now);
  box.append(el("h2", "", "Classroom"));
  if (!buckets.length) box.append(el("p", "empty", "No Classroom work to show."));
  buckets.forEach((bucket) => {
    box.append(fold("w:" + bucket.name, bucket.name, bucket.rows.length, (inside) => {
      bucket.rows.forEach((work) => {
        const card = el("div", "paper");
        card.append(el("p", "paper-title", work.title));
        const due = work.left === null ? "no due date" : "due " + inDays(work.left);
        const facts = el("p", "muted", (work.subject || work.course) + ", " + due);
        if (!work.done && work.left !== null && work.left <= 1) facts.classList.add("soon");
        const choices = el("div", "choices");
        if (work.link) {
          const open = el("a", "linkbutton", "Open in Classroom");
          open.href = work.link; open.target = "_blank"; open.rel = "noopener";
          choices.append(open);
        }
        if (!work.done) {
          const add = button("Add to my list", "soft", async () => {
            add.disabled = true;
            const line = work.title + (work.subject ? " (" + work.subject + ")" : "");
            add.textContent = await sendEdit({ kind: "add", text: line })
              ? "Added" : "Add to my list";
          });
          choices.append(add);
        }
        card.append(facts, choices);
        inside.append(card);
      });
    }, bucket.name !== "Handed in" && bucket.name !== "No due date"));
  });
  const events = comingEvents(state.events, now);
  box.append(el("h2", "", "Calendar, next 14 days"));
  if (!events.length) { box.append(el("p", "empty", "Nothing in the calendar.")); }
  const list = el("ul");
  events.forEach((event) => {
    const when = inDays(event.left) + (event.all_day ? "" : " " + clock12(event.start));
    list.append(row(event.title, when));
  });
  box.append(list);
  const stuff = state.work.filter((w) => w.kind === "material");
  if (stuff.length) {
    box.append(fold("w:materials", "Classroom materials", stuff.length, (inside) => {
      const links = el("ul");
      [...stuff].sort((a, b) => String(b.updated).localeCompare(String(a.updated)))
        .forEach((item) => {
          const line = el("li", "row");
          const open = el("a", "grow", item.title);
          open.href = item.link; open.target = "_blank"; open.rel = "noopener";
          line.append(open, el("span", "side", item.subject || item.course));
          links.append(line);
        });
      inside.append(links);
    }));
  }
}

function subjectNames() {
  return rankSubjects(state.timetable, state.exams, state.tasks, new Date())
    .map((s) => s.name);
}

// This week's weakest subject and the exact things to work on. Asked once
// a week. "I'm bad at French" isn't accepted: it has to be something she
// can actually revise.
function drawFocus(box) {
  const now = new Date();
  const sent = state.focusSent && state.focusSent.week === weekKey(now) ? state.focusSent : null;
  const focus = focusNow(state.focus, now) || sent;
  const card = el("div", "form focus");
  if (focus && !state.focusEditing) {
    card.append(el("h2", "", "This week's focus: " + focus.subject));
    const list = el("ul");
    (focus.points || []).forEach((point) => list.append(el("li", "point", point)));
    card.append(list);
    card.append(el("p", "muted", "Any spare time goes on these first. It asks again next week."));
    const choices = el("div", "choices");
    choices.append(button("Change it", "soft", () => { state.focusEditing = true; drawSubjects(true); }));
    card.append(choices);
    box.append(card);
    return;
  }
  card.append(el("h2", "", "What's your weakest subject this week?"));
  const subjectLabel = el("label", "", "Subject");
  const subject = el("select");
  ["", ...subjectNames()].forEach((name) => {
    const option = el("option", "", name || "Pick one");
    option.value = name;
    subject.append(option);
  });
  if (focus) subject.value = focus.subject;
  subjectLabel.append(subject);
  const pointsLabel = el("label", "", "The exact things you need to work on, one a line");
  const points = el("textarea");
  points.className = "short";
  points.placeholder = "reflexive verbs in the past tense\ncalculating Rf values";
  if (focus) points.value = (focus.points || []).join("\n");
  pointsLabel.append(points);
  const problem = el("p", "error");
  problem.setAttribute("role", "alert");
  const choices = el("div", "choices");
  const save = button("Save", "", async () => {
    const check = focusCheck(subject.value, points.value);
    if (check.problem) { problem.textContent = check.problem; return; }
    save.disabled = true;
    if (await sendEdit({ kind: "focus", subject: subject.value, points: check.good })) {
      state.focusSent = { week: weekKey(new Date()), subject: subject.value, points: check.good };
      state.focusEditing = false;
      drawSubjects(true);
    } else save.disabled = false;
  });
  choices.append(save);
  if (focus) choices.append(button("Cancel", "soft", () => { state.focusEditing = false; drawSubjects(true); }));
  card.append(subjectLabel, pointsLabel, problem, choices);
  box.append(card);
}

function focusTyping() {
  const area = document.querySelector("#tab-subjects .focus textarea");
  return Boolean(area && (area.value.trim() || document.activeElement === area));
}

function drawSubjects(force) {
  const box = $("tab-subjects");
  if (!force && focusTyping()) return;  // never redraw over what she's typing
  box.replaceChildren();
  drawFocus(box);
  const ranked = rankSubjects(state.timetable, state.exams, allWork(), new Date());
  if (!ranked.length) {
    box.append(el("p", "empty", "No subjects yet. They come from your timetable and tests."));
    return;
  }
  const list = el("ul");
  ranked.forEach((subject) => {
    const bits = [];
    if (subject.exam !== null) bits.push("test " + inDays(subject.exam));
    if (subject.due !== null) bits.push("homework " + inDays(subject.due));
    if (!bits.length && subject.open) bits.push(subject.open + " open");
    const item = row(subject.name, bits.join(", "));
    const closest = Math.min(subject.exam ?? Infinity, subject.due ?? Infinity);
    if (closest <= 2) item.querySelector(".side").classList.add("soon");
    list.append(item);
  });
  box.append(list);
}

const ANSWERS = { worth: "Useful", okay: "Mixed", not: "Wasted" };

function drawYoutube() {
  const box = $("tab-youtube");
  box.replaceChildren();
  const now = new Date();
  const today = youtubeToday(state.visits, now);
  box.append(el("h2", "", "YouTube today"));
  box.append(el("p", "big", minutesText(today.seconds)));
  if (!today.visits.length) {
    box.append(el("p", "empty", "No YouTube today."));
  } else {
    // 2026-10-05: by video, so it says exactly what the time went on.
    const videos = videosToday(state.visits, now);
    const uses = new Map();
    state.reflections.forEach((r) => reflectionVideos(r).forEach((v) => uses.set(String(v.title).toLowerCase(), v.for)));
    if (videos.length) {
      box.append(el("h3", "", "What it went on"));
      const byVideo = el("ul");
      videos.forEach((video) => {
        const use = uses.get(video.title.toLowerCase());
        byVideo.append(row(video.title, (use ? (use === "fun" ? "Fun, " : "School, ") : "") + secondsWords(video.seconds)));
      });
      box.append(byVideo);
    }
    box.append(el("h3", "", "When"));
    const list = el("ul");
    today.visits.forEach((visit) => {
      const names = (visit.titles || []).map(videoName).filter(Boolean);
      list.append(row(names.join(", ") || "YouTube",
        clock12(visit.started) + " to " + clock12(visit.ended) + ", " + minutesText(visit.seconds)));
    });
    box.append(list);
  }
  const tally = reflectionTally(state.reflections, now);
  const total = tally.worth + tally.okay + tally.not;
  box.append(ringCard());              // 2026-10-03k: was a flat bar
  box.append(el("h2", "", "Your 20 minute reviews, last 7 days"));
  if (!total) {
    box.append(el("p", "empty", "Nothing yet. The tutor asks after every 20 minutes at the laptop."));
    return;
  }
  box.append(el("p", "muted", "Useful " + tally.worth + ", mixed " + tally.okay +
                              ", wasted " + tally.not));
  const said = el("ul");
  [...state.reflections].sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 12).forEach((r) => {
      said.append(row((ANSWERS[r.answer] || r.answer) + (r.note ? ": " + r.note : ""),
                      dayText(r.at, now) + " " + clock12(r.at)));
    });
  box.append(said);
}

// One question at a time: the newest stretch she hasn't answered for.
function drawReflect() {
  const due = reviewDue(state.asks, state.reflections, new Date());
  const on = Boolean(due.ask) && Boolean(cloud);
  const was = state.reviewAsk && String(state.reviewAsk.id);
  state.reviewAsk = on ? due.ask : null;
  show("reflect", on);
  if (!on) return;
  $("reflect-words").textContent = reviewWords(due.ask);
  // 2026-10-05: each video in that stretch, and what it was for.
  if (was !== String(due.ask.id)) state.videoUse = {};
  // 2026-10-06: what she ticked, and where she was, in that stretch.
  const seen = $("reflect-seen");
  if (seen) {
    seen.replaceChildren();
    const tasks = askTasks(due.ask), apps = askApps(due.ask);
    const row = (label, words) => {
      const item = el("li", "reflect-seen-line");
      item.append(el("span", "reflect-seen-label", label), el("span", "grow", words));
      seen.append(item);
    };
    if ("tasks" in due.ask) row("Ticked off", tasks.length ? tasks.join(", ") : "Nothing in this stretch");
    // 2026-10-06j: "it should show it mroe like a hisotry thingy". One
    // row each, the time then the name, longest first.
    if (apps.length) {
      const item = el("li", "reflect-seen-line reflect-seen-apps");
      const rows = el("ul", "history reflect-apps");
      apps.forEach((a) => {
        const line = el("li", "history-line");
        line.append(el("span", "history-when", secondsWords(a.seconds)), el("span", "grow", a.name));
        rows.append(line);
      });
      item.append(el("span", "reflect-seen-label", "You were on"), rows);
      seen.append(item);
    }
  }
  const list = $("reflect-videos");
  if (!list) return;
  list.replaceChildren();
  askVideos(due.ask).forEach((video) => {
    const item = el("li", "reflect-video");
    item.append(el("span", "grow", video.title),
      el("span", "side", secondsWords(video.seconds)),
      chipRow("ring-switch", "What " + video.title + " was for", [["school", "School"], ["fun", "Fun"]],
        state.videoUse[video.title] || "", (use) => { state.videoUse[video.title] = use; drawReflect(); }));
    list.append(item);
  });
}

async function touchInbox(extra) {
  const stamp = isoNow(new Date());
  // site: where this web app lives, so the laptop can open it.
  await setDoc(doc(cloud.db, cloud.base + "meta/inbox"),
               { changed: stamp, site: new URL(".", location.href).href, ...(extra || {}) }, { merge: true });
  return stamp;
}

async function answerReflection(answer) {
  const ask = state.reviewAsk;
  if (!cloud || !ask) return;
  const note = $("reflect-note").value.trim().slice(0, 300);
  const wrong = reviewProblem(note);
  $("reflect-error").textContent = wrong;
  if (wrong) { $("reflect-note").focus(); return; }
  const videos = askVideos(ask).map((v) => ({ title: v.title, for: state.videoUse[v.title] || "" }));
  if (videos.some((v) => !v.for)) {
    $("reflect-error").textContent = "Say what each video was for first: School or Fun.";
    return;
  }
  const now = new Date();
  $("reflect-note").value = "";
  try {
    await addDoc(collection(cloud.db, cloud.base + "reflections"),
                 { at: isoNow(now), day: isoDay(now), answer, note, ask: String(ask.id),
                   from: ask.from || "", to: ask.at || "",
                   videos: JSON.stringify(videos),
                   seconds: ask.youtube_seconds || 0 });
    await touchInbox();
  } catch (error) {
    $("reflect-error").textContent = "Couldn't save that. Try again in a moment.";
  }
}

// ------------------------------------------------------------------ chats
function drawChats() {
  const box = $("tab-chats");
  box.replaceChildren();
  if (state.chatView === "new") { drawChatForm(box); return; }
  const open = state.chats.find((c) => c.id === state.chatView);
  if (open) { drawChatOpen(box, open); return; }
  state.chatView = null;
  box.append(button("Add a Gemini chat", "", () => { state.chatView = "new"; drawChats(); }));
  if (!state.chats.length) {
    box.append(el("p", "empty", "No chats yet. Copy a revision chat out of Gemini and add it here."));
    return;
  }
  const now = new Date();
  const bySubject = new Map();
  [...state.chats].sort((a, b) => String(b.added).localeCompare(String(a.added)))
    .forEach((chat) => {
      const name = chat.subject || "Other";
      if (!bySubject.has(name)) bySubject.set(name, []);
      bySubject.get(name).push(chat);
    });
  [...bySubject.keys()].sort().forEach((name) => {
    box.append(el("h2", "", name));
    const list = el("ul");
    bySubject.get(name).forEach((chat) => {
      const item = row(chat.title || "Chat", dayText(chat.added, now) + ", " +
                       (chat.turns || []).length + " parts", "tap");
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      const go = () => { state.chatView = chat.id; drawChats(); };
      item.addEventListener("click", go);
      item.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
      list.append(item);
    });
    box.append(list);
  });
}

function drawChatForm(box) {
  const form = el("div", "form");
  form.append(el("h2", "", "Add a Gemini chat"));
  form.append(el("p", "muted", "In Gemini, select the whole chat, copy it, and paste it here."));
  const titleLabel = el("label", "", "Title (leave empty and it's named from your first line)");
  const title = el("input");
  title.type = "text"; title.maxLength = 80;
  titleLabel.append(title);
  const subjectLabel = el("label", "", "Subject");
  const subject = el("select");
  ["Work it out for me", ...subjectNames(), "Other"].forEach((name) => {
    const option = el("option", "", name);
    option.value = name;
    subject.append(option);
  });
  subjectLabel.append(subject);
  const textLabel = el("label", "", "The chat");
  const text = el("textarea");
  textLabel.append(text);
  const problem = el("p", "error");
  problem.setAttribute("role", "alert");
  const save = button("Save it", "", async () => {
    const wrong = chatProblem(text.value);
    if (wrong) { problem.textContent = wrong; return; }
    const parsed = parseGeminiChat(text.value);
    let picked = subject.value;
    if (picked === "Work it out for me") {
      picked = guessSubject(text.value, subjectNames()) || "Other";
    }
    save.disabled = true;
    try {
      const made = await addDoc(collection(cloud.db, cloud.base + "gemini_chats"), {
        title: title.value.trim() || parsed.title || "Chat",
        subject: picked, added: isoNow(new Date()),
        turns: parsed.turns, assessment: parsed.assessment });
      await touchInbox();
      state.chatView = made.id;
    } catch (error) {
      problem.textContent = "Couldn't save that. Try again in a moment.";
      save.disabled = false;
      return;
    }
    drawChats();
  });
  const choices = el("div", "choices");
  choices.append(save, button("Cancel", "soft", () => { state.chatView = null; drawChats(); }));
  form.append(titleLabel, subjectLabel, textLabel, problem, choices);
  box.append(form);
}

function drawChatOpen(box, chat) {
  box.append(button("Back to chats", "link", () => { state.chatView = null; drawChats(); }));
  box.append(el("h2", "", (chat.subject || "Other") + ", " + dayText(chat.added, new Date())));
  box.append(el("p", "big", chat.title || "Chat"));
  if (chat.assessment) {
    box.append(el("h2", "", "Final assessment"));
    box.append(el("div", "assessment", chat.assessment));
  }
  const names = { you: "You", gemini: "Gemini", note: "Notes" };
  (chat.turns || []).forEach((turn) => {
    const part = el("div", "turn " + (names[turn.who] ? turn.who : "note"));
    part.append(el("span", "who", names[turn.who] || "Notes"));
    part.append(document.createTextNode(turn.text || ""));
    box.append(part);
  });
  // Two presses to delete, so one slip can't lose a chat.
  const remove = button("Delete this chat", "danger", () => {
    if (remove.dataset.sure !== "yes") {
      remove.dataset.sure = "yes";
      remove.textContent = "Really delete it? Press again";
      return;
    }
    deleteDoc(doc(cloud.db, cloud.base + "gemini_chats/" + chat.id)).catch(() => {});
    state.chatView = null;
    drawChats();
  });
  box.append(remove);
}

// ----------------------------------------------------------------- papers
function closeFile() {
  if (state.fileView && state.fileView.url) URL.revokeObjectURL(state.fileView.url);
  state.fileView = null;
  state.fileNote = "";
}

async function openFile(file) {
  closeFile();
  state.fileNote = "Opening " + file.name;
  drawPapers();
  try {
    const got = await getDocs(query(
      collection(cloud.db, cloud.base + "materials/" + file.id + "/chunks"), orderBy("n")));
    const whole = joinChunks(got.docs.map((d) => ({
      n: d.data().n, bytes: d.data().data.toUint8Array() })), file.chunks);
    if (!whole) { state.fileNote = "Not all of it is up yet. Try again in a few minutes."; }
    else {
      const blob = new Blob([whole], { type: FILE_TYPES[file.type] || "application/octet-stream" });
      state.fileView = { file, url: URL.createObjectURL(blob) };
      state.fileNote = "";
    }
  } catch (error) {
    state.fileNote = "Couldn't open that. Are you online?";
  }
  drawPapers();
}

// ------------------------------------------------------- the paper timer
// 2026-10-11h: proper is "Do it properly": the page goes black with just
// the paper and its clock, full screen, and the tutor on her laptop is told
// so its own black screen comes up over everything else too.
function startTimer(title, minutes, proper) {
  state.timer = { title, endsMs: Date.now() + minutes * 60000, pausedLeft: null,
                  proper: Boolean(proper) };
  if (proper) {
    const edit = examEdit(title, minutes, state.timer.endsMs);
    if (edit) sendEdit(edit);
    try {
      const page = document.documentElement;
      if (page.requestFullscreen) page.requestFullscreen().catch(() => {});
    } catch (error) { /* full screen is a nicety, the black page is the point */ }
  }
  drawTimer();
}

function endExam(how) {
  const timer = state.timer;
  if (!timer || !timer.proper) return;
  if (timerLeft(timer, Date.now()) > 0) sendEdit({ kind: "exam_end", how });
  state.timer = null;
  try {
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  } catch (error) { /* nothing to leave */ }
  drawTimer();
}

function drawExam() {
  const words = examWords(state.timer, Date.now());
  show("exam", Boolean(words));
  if (!words) return;
  $("exam-title").textContent = words.title;
  $("exam-clock").textContent = words.clock;
  $("exam-note").textContent = words.note;
  $("exam-done").textContent = words.over ? "OK" : "I've finished";
  $("exam-stop").hidden = words.over;
}

function drawTimer() {
  const bar = $("timer");
  const timer = state.timer;
  drawExam();
  show("timer", Boolean(timer) && !timer.proper);
  if (!timer || timer.proper) return;
  const left = timerLeft(timer, Date.now());
  $("timer-words").textContent = left > 0
    ? timer.title + ": " + clockText(left) + " left"
    : "Time's up on " + timer.title + ". Pens down, then mark it.";
  bar.classList.toggle("over", left <= 0);
  $("timer-pause").textContent = timer.pausedLeft !== null ? "Carry on" : "Pause";
  $("timer-pause").hidden = left <= 0;
}

function fileButton(label, file, cls) {
  const waiting = fileState(file);
  const node = button(waiting ? label + " (not up yet)" : label, cls || "soft",
                      () => { if (!waiting) openFile(file); });
  node.disabled = Boolean(waiting);
  if (waiting) node.title = waiting;
  return node;
}

// One past paper with its mark scheme and its timer.
function paperFolder(folder) {
  const card = el("div", "paper");
  card.append(el("p", "paper-title", folder.title));
  const facts = el("p", "muted");
  const choices = el("div", "choices");
  if (folder.paper) choices.append(fileButton(
    folder.paper.role === "both" ? "Open (questions and mark scheme)" : "Open paper",
    folder.paper, ""));
  if (folder.scheme && folder.scheme !== folder.paper) {
    choices.append(fileButton("Mark scheme", folder.scheme));
  }
  if (!folder.paper) facts.textContent = "Mark scheme only. The paper isn't in your folder.";
  if (folder.paper && folder.minutes) {
    facts.textContent = folder.marks + " marks, " + minutesText(folder.minutes * 60);
    choices.append(button("Start timer", "soft",
      () => startTimer(folder.title, folder.minutes)));
    choices.append(button("Do it properly", "soft",
      () => startTimer(folder.title, folder.minutes, true)));
  } else if (folder.paper) {
    // Marks not known for this one: she says how many, the time follows.
    const marks = el("input");
    marks.type = "number"; marks.min = "1"; marks.max = "400"; marks.inputMode = "numeric";
    marks.placeholder = "Marks"; marks.className = "marks";
    marks.setAttribute("aria-label", "How many marks is " + folder.title);
    facts.textContent = "Type the marks for a timer.";
    marks.addEventListener("input", () => {
      const mins = minutesForMarks(marks.value);
      facts.textContent = mins ? marks.value + " marks, " + minutesText(mins * 60)
                               : "Type the marks for a timer.";
    });
    choices.append(marks, button("Start timer", "soft", () => {
      const mins = minutesForMarks(marks.value);
      if (mins) startTimer(folder.title, mins);
    }), button("Do it properly", "soft", () => {
      const mins = minutesForMarks(marks.value);
      if (mins) startTimer(folder.title, mins, true);
    }));
  }
  card.append(facts, choices);
  return card;
}

// A folding section that remembers how she left it across redraws.
// startOpen ones remember being shut, the rest remember being opened.
function fold(key, title, count, fill, startOpen) {
  const box = el("details", "fold");
  box.open = startOpen ? !state.paperShut.has(key) : state.paperOpen.has(key);
  // Remembered on the press itself, not on the "toggle" event: that event
  // comes late, and a live update redrawing the page in between lost her
  // press and folded the section shut again.
  const head = el("summary", "", title + (count === null ? "" : " (" + count + ")"));
  head.addEventListener("click", () => {
    const opening = !box.open;
    if (startOpen) {
      if (opening) state.paperShut.delete(key); else state.paperShut.add(key);
    } else if (opening) state.paperOpen.add(key); else state.paperOpen.delete(key);
  });
  box.append(head);
  const inside = el("div", "fold-in");
  fill(inside);
  box.append(inside);
  return box;
}

function drawPapers() {
  const box = $("tab-papers");
  box.replaceChildren();
  if (state.fileView) {
    const { file, url } = state.fileView;
    const viewer = el("div", "viewer");
    viewer.append(button("Back to papers", "link", () => { closeFile(); drawPapers(); }));
    viewer.append(el("p", "big", file.name));
    const links = el("p");
    const tab = el("a", "", "Open in a new tab");
    tab.href = url; tab.target = "_blank"; tab.rel = "noopener";
    const keep = el("a", "", "Download");
    keep.href = url; keep.download = file.name;
    links.append(tab, keep);
    viewer.append(links);
    if (file.type === "pdf" || file.type === "txt") {
      const frame = el("iframe");
      frame.src = url; frame.title = file.name;
      viewer.append(frame);
      viewer.append(el("p", "muted", "If it shows blank on a phone, press Open in a new tab."));
    } else {
      const picture = el("img");
      picture.src = url; picture.alt = file.name;
      viewer.append(picture);
    }
    box.append(viewer);
    return;
  }
  if (state.fileNote) box.append(el("p", "muted", state.fileNote));
  if (!state.materials.length) {
    box.append(el("p", "empty", "Nothing here yet. Files in your REVISION folder come up from the laptop, a few at a time."));
    return;
  }
  const subjectFold = (subject) => {
    const papers = subject.exams.reduce((n, e) =>
      n + SHELVES.reduce((m, [key]) => m + e[key].length, 0), 0);
    return fold("s:" + subject.name, subject.name, null, (inside) => {
      subject.exams.forEach((exam) => {
        inside.append(el("h2", "exam", exam.name));
        SHELVES.forEach(([key, title]) => {
          if (!exam[key].length) return;
          // 2026-10-03: every shelf folds, like Notes does.
          inside.append(fold("k:" + subject.name + ":" + exam.name + ":" + key,
            title, exam[key].length,
            (shelf) => exam[key].forEach((folder) => shelf.append(paperFolder(folder))),
            true));
        });
        if (exam.notes.length) {
          inside.append(fold("n:" + subject.name + ":" + exam.name, "Notes",
            exam.notes.length, (notes) => {
              const list = el("ul");
              exam.notes.forEach((file) => {
                const waiting = fileState(file);
                const item = row(file.name, waiting || sizeText(file.size),
                                 waiting ? "off" : "tap");
                if (!waiting) {
                  item.tabIndex = 0;
                  item.setAttribute("role", "button");
                  item.addEventListener("click", () => openFile(file));
                  item.addEventListener("keydown", (e) => { if (e.key === "Enter") openFile(file); });
                }
                list.append(item);
              });
              notes.append(list);
            }));
        }
        if (!papers && !exam.notes.length) inside.append(el("p", "empty", "Nothing here yet."));
      });
    });
  };
  // 2026-10-03: Biology, Chemistry and Physics sit together under Sciences.
  withSciences(groupPapers(state.materials)).forEach((entry) => {
    if (entry.group) {
      box.append(fold("g:Sciences", "Sciences", null,
        (inside) => entry.group.forEach((subject) => inside.append(subjectFold(subject)))));
    } else box.append(subjectFold(entry));
  });
}

function drawSync() {
  $("status").textContent = state.meta && state.meta.last_sync
    ? "Laptop last synced " + clock12(state.meta.last_sync)
    : "Waiting for the laptop";
  $("sync-status").textContent = syncStatus(state.asked, state.meta, Date.now());
  // 2026-10-17b: which website this is.
  if ($("site-version")) $("site-version").textContent = "Website " + APP_VERSION;
}

// ---- Her lesson review. It used to be a tab on the laptop; it's read here
// now. The two filters are built once and never redrawn, so a live update
// can't take what she's typing. Only the list under them is redrawn.
const review = { zone: null, subject: null, search: null, list: null };

function drawLessons() {
  const tab = $("tab-lessons");
  if (!review.zone) {
    review.zone = el("div");
    review.subject = el("select");
    review.subject.setAttribute("aria-label", "Which subject");
    review.search = el("input");
    review.search.type = "search";
    review.search.placeholder = "Search what you said, or a date";
    review.search.setAttribute("aria-label", "Search your lesson review");
    review.subject.addEventListener("change", drawLessons);
    review.search.addEventListener("input", drawLessons);
    const filters = el("div", "review-filters");
    filters.append(review.subject, review.search);
    review.list = el("div");
    review.zone.append(filters, review.list);
    tab.replaceChildren(review.zone);
  }
  const names = lessonSubjects(state.lessons.filter(lessonReal));
  const held = review.subject.value;
  const have = [...review.subject.options].map((o) => o.value).join("|");
  if (have !== [""].concat(names).join("|")) {
    review.subject.replaceChildren();
    const all = el("option", "", "All subjects"); all.value = "";
    review.subject.append(all);
    names.forEach((name) => { const o = el("option", "", name); o.value = name; review.subject.append(o); });
    review.subject.value = names.includes(held) ? held : "";
  }
  const days = lessonDays(state.lessons, review.subject.value, review.search.value);
  review.list.replaceChildren();
  if (!state.lessons.some(lessonReal)) {
    review.list.append(el("p", "empty", "Nothing here yet. After school the tutor asks what you did in each lesson, and it shows up here."));
    return;
  }
  if (!days.length) { review.list.append(el("p", "empty", "Nothing matches that.")); return; }
  const now = new Date();
  days.forEach((day) => {
    review.list.append(el("h2", "", lessonDayWords(day.day, now)));
    const card = el("div", "note");
    day.rows.forEach((line) => {
      const one = el("div", "review-line");
      one.append(el("span", "review-subject", line.subject || "School"), el("span", "grow", line.said));
      card.append(one);
    });
    review.list.append(card);
  });
}

// ------------------------------------------------------------- Rewards
// 2026-10-04h: "maybe a REWARDS page on the website. u can exchange time for
// stuff ... once converted, you cant un-convert." The prices and the balance
// come off the laptop. A swap is asked twice, sent to the laptop, and the
// laptop is what takes the minutes and writes it down.
function drawRewards() {
  const box = $("tab-rewards");
  if (!box) return;
  const extraField = box.querySelector(".swap-extra input");
  const heldExtra = extraField ? extraField.value : "";
  box.replaceChildren();
  const bank = state.bank;
  const now = Date.now();
  // A swap she's sent stays "sending" until the laptop's own row for it
  // turns up (one that wasn't there when she pressed), or 90 seconds pass.
  state.swapSent = state.swapSent.filter((s) => now - s.atMs < 90000 &&
    !state.rewards.some((r) => r.key === s.key && !s.had.includes(r.key + "|" + r.at)));
  const waiting = state.swapSent.reduce((n, s) => n + s.cost, 0);
  // 2026-10-04l: points. Minutes saved as points keep for three days and
  // can't be YouTube. A swap takes tonight's minutes first, then points.
  if (state.pointsSent && (now - state.pointsSent.atMs > 90000 ||
      (bank && Number(bank.points || 0) !== state.pointsSent.was))) state.pointsSent = null;
  const moving = state.pointsSent ? state.pointsSent.minutes : 0;
  const mins = bank ? Math.max(0, Number(bank.minutes || 0) - moving) : 0;
  const pts = bank ? Number(bank.points || 0) + moving : 0;
  const have = Math.max(0, mins + pts - waiting);
  const top = el("section", "ring-card bank-card");
  const pair = el("div", "bank-pair");
  const left = el("div"), right = el("div");
  left.append(el("p", "ring-kicker", "In the bank"), el("p", "bank-big", mins + " min"));
  right.append(el("p", "ring-kicker", "Points"), el("p", "bank-big", String(pts)));
  pair.append(left, right);
  // 2026-10-07: "add a toggle on rewards page". The overnight switch.
  const auto = autoPoints(bank, state.autoSent, now);
  if (state.autoSent && !auto.sending) state.autoSent = null;
  top.append(pair, el("p", "muted", bank
      ? "Minutes come from ticking things off. " + overnightWords(auto) + " Points keep for 3 days, then drop to a fifth. Points are for rewards only, never YouTube."
      : "Waiting for the laptop to send your balance. Open the tutor and it'll show here."));
  if (bank && auto.known) {
    const line = el("div", "switch-row");
    const words = el("div", "grow");
    words.append(el("p", "switch-name", "Save leftover minutes as points overnight"),
      el("p", "muted", auto.sending ? "Telling the laptop. About 20 seconds while the tutor is open."
        : auto.on ? "On. Nothing in the bank is lost at the end of the day."
        : "Off. Only a quarter of the bank is kept each night."));
    const flip = button(auto.on ? "On" : "Off", "switch", () => {
      state.autoSent = { on: !auto.on, atMs: Date.now() };
      drawRewards();
      sendEdit({ kind: "auto_points", on: !auto.on });
    });
    flip.setAttribute("role", "switch");
    flip.setAttribute("aria-checked", String(auto.on));
    flip.setAttribute("aria-label", "Save leftover minutes as points overnight");
    line.append(words, flip);
    top.append(line);
  } else if (bank) {
    top.append(el("p", "muted", "The overnight switch shows here once the tutor on the laptop has been restarted."));
  }
  if (bank && (bank.lots || []).length) {
    const soon = bank.lots[0];
    top.append(el("p", "muted", soon.points + " point" + (soon.points === 1 ? "" : "s") + " drop to a fifth in " +
      soon.left + " day" + (soon.left === 1 ? "" : "s") + "."));
  }
  if (waiting || moving) top.append(el("p", "muted", "Sending that to the laptop. About 20 seconds while the tutor is open."));
  if (bank && mins > 0) {
    const save = el("form", "save-points reward-foot");
    const field = el("input");
    field.type = "number"; field.min = "1"; field.max = String(mins); field.value = String(mins);
    field.setAttribute("aria-label", "How many minutes to save as points");
    const go = button(state.swapAsk === "points" ? "Sure? No YouTube from points" : "Save as points", "soft", null);
    go.type = "submit";
    save.append(field, go);
    save.addEventListener("submit", (event) => {
      event.preventDefault();
      const n = Math.max(1, Math.min(mins, Math.floor(Number(field.value) || 0)));
      if (state.swapAsk !== "points") {
        state.swapAsk = "points";
        go.textContent = "Sure? No YouTube from points";
        return;
      }
      state.swapAsk = null;
      state.pointsSent = { minutes: n, atMs: Date.now(), was: Number(bank.points || 0) };
      drawRewards();
      sendEdit({ kind: "points", minutes: n });
    });
    top.append(save);
  }
  box.append(top);
  if (!bank) return;
  const list = el("div", "reward-list");
  (bank.rewards || []).forEach((reward) => {
    const card = el("section", "reward");
    const can = have >= reward.cost;
    card.append(el("p", "reward-name", reward.name), el("p", "muted", reward.note || ""));
    const foot = el("div", "reward-foot");
    foot.append(el("span", "reward-cost", reward.cost + " min"));
    const asking = state.swapAsk === reward.key;
    if (asking) {
      foot.append(button("Yes, swap " + reward.cost, "", () => {
        state.swapAsk = null;
        state.swapSent.push({ key: reward.key, cost: reward.cost, atMs: Date.now(),
          had: state.rewards.map((r) => r.key + "|" + r.at) });
        drawRewards();
        sendEdit({ kind: "redeem", reward: reward.key });
      }), button("No", "soft", () => { state.swapAsk = null; drawRewards(); }));
    } else {
      const go = button(can ? "Swap" : (reward.cost - have) + " more to go", can ? "" : "soft",
        () => { state.swapAsk = reward.key; drawRewards(); });
      go.disabled = !can;
      foot.append(go);
    }
    card.append(foot);
    if (asking) card.append(el("p", "reward-warn", "This can't be undone. The minutes are gone from the bank for good."));
    list.append(card);
  });
  // Extra minutes to finish a movie, four banked for each one.
  const extra = bank.extra;
  const hasMovie = state.rewards.some((r) => r.key === "movie");
  if (extra && hasMovie) {
    const card = el("section", "reward");
    card.append(el("p", "reward-name", "Extra minutes to finish the movie"),
      el("p", "muted", extra.rate + " banked minutes for each extra minute."));
    const form = el("form", "swap-extra reward-foot");
    const field = el("input");
    field.type = "number"; field.min = "1"; field.max = String(extra.max || 120);
    field.value = heldExtra || "10";
    field.setAttribute("aria-label", "How many extra minutes");
    const cost = () => Math.max(1, Math.min(Number(extra.max || 120), Math.floor(Number(field.value) || 1))) * extra.rate;
    const price = el("span", "reward-cost", cost() + " min");
    field.addEventListener("input", () => { price.textContent = cost() + " min"; });
    const go = button("Swap", "", null);
    go.type = "submit";
    form.append(field, price, go);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const minutes = cost() / extra.rate;
      if (cost() > have) { price.textContent = "Not enough: " + cost() + " min"; return; }
      if (state.swapAsk !== "extra:" + minutes) {
        state.swapAsk = "extra:" + minutes;
        go.textContent = "Sure? Can't be undone";
        return;
      }
      state.swapAsk = null;
      state.swapSent.push({ key: extra.key, cost: cost(), atMs: Date.now(),
          had: state.rewards.map((r) => r.key + "|" + r.at) });
      drawRewards();
      sendEdit({ kind: "redeem", reward: extra.key, minutes });
    });
    card.append(form);
    list.append(card);
  }
  box.append(list);
  box.append(el("p", "muted", "More rewards to come."));
  // 2026-10-07b: "rewards can't be marked used". Two piles: still to use,
  // and used. A press shows at once; the laptop writes it down.
  Object.keys(state.usedSent).forEach((id) => {
    const row = state.rewards.find((r) => String(r.id) === id);
    if (!row || !rewardUse(row, state.usedSent[id], now).sending) delete state.usedSent[id];
  });
  const piles = rewardPiles(state.rewards, state.usedSent, now);
  box.append(el("h2", "", "Swapped so far"));
  if (!piles.waiting.length && !piles.used.length) {
    box.append(el("p", "empty", "Nothing yet. What you swap is kept here, with when."));
    return;
  }
  const when = (stamp) => lessonDayWords(String(stamp).slice(0, 10), new Date()) + ", " + clock12(stamp);
  const pile = (title, rows, used) => {
    box.append(el("p", "swap-pile", title + " (" + rows.length + ")"));
    const list = el("ul", "history swapped");
    rows.forEach((r) => {
      const item = el("li", "history-line" + (used ? " used" : ""));
      const words = el("span", "grow");
      words.append(el("span", "swap-name", r.name),
        el("span", "swap-when", used
          ? (r.use.when ? "Used " + when(r.use.when) : "Used") + ". Swapped " + when(r.at) + ", " + r.cost + " min."
          : "Swapped " + when(r.at) + ", " + r.cost + " min."));
      const go = button(r.use.sending ? "Sending" : used ? "Not used yet" : "Mark used", "quiet", () => {
        state.usedSent[String(r.id)] = { used: !used, atMs: Date.now() };
        drawRewards();
        sendEdit({ kind: "reward_used", id: Number(r.id), used: !used });
      });
      go.disabled = r.use.sending;
      item.append(words, go);
      list.append(item);
    });
    box.append(list);
  };
  if (piles.waiting.length) pile("Still to use", piles.waiting, false);
  if (piles.used.length) pile("Used", piles.used, true);
}

function drawAll() {
  drawRewards();
  drawLessons();
  drawToday(); drawSubjects(); drawSchool();
  drawTasks();                          // the text box itself is never rebuilt
  drawCalendarSoft(); drawNotes();      // 2026-10-10q; 2026-10-18 soft
  drawTalk();                           // 2026-10-17
  drawYoutube(); drawReflect(); drawSync();
  // The form and an open paper are left alone while she's using them.
  if (state.chatView !== "new") drawChats();
  if (!state.fileView) drawPapers();
}

// ------------------------------------------------------- 2026-10-17: Tutor chat
// "is there ni way u can add the api key there so it can use it and have the
// chat like tutor on my laptop?" Asked which way: "Through my laptop". What
// she types goes to the tutor on her laptop as if typed there, the same cats
// answer, and the chat comes back up as live/chat. The box is made once, so
// a redraw never loses what she's typing.
const CHAT_COLOURS = { You: "var(--muted)", Graystripe: "#D9922E", Jayfeather: "var(--accent)",
                       Firestar: "#E0662F", System: "var(--muted)" };

function drawTalk() {
  const box = $("tab-talk");
  if (!box) return;
  if (!box.dataset.built) {
    box.dataset.built = "1";
    const card = el("section", "talk-card");
    card.append(el("p", "muted talk-note", "This goes to the tutor on your laptop. The cats answer while it's on."));
    const list = el("div", "talk-list");
    list.id = "talk-list";
    list.addEventListener("scroll", () => {
      state.chatScrolled = list.scrollHeight - list.scrollTop - list.clientHeight > 40;
    });
    list.setAttribute("aria-live", "polite");
    const form = el("form", "talk-form");
    const input = document.createElement("textarea");
    input.id = "talk-input";
    input.rows = 2;
    input.placeholder = "Say something to the cats";
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
    });
    const send = el("button", "", "Send");
    send.type = "submit";
    form.append(input, send);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      const since = state.chat.reduce((m, r) => Math.max(m, r.id), 0);
      state.chatWaiting = state.chatWaiting.concat([{ text, since, atMs: Date.now() }]);
      input.value = "";
      drawTalk();
      if (!(await sendEdit({ kind: "chat", text }))) {
        state.chatWaiting = state.chatWaiting.filter((w) => w.text !== text);
        input.value = text;
        drawTalk();
      }
    });
    card.append(list, form);
    box.append(card);
  }
  const list = $("talk-list");
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  list.replaceChildren();
  if (!state.chat.length && !state.chatWaiting.length) {
    list.append(el("p", "muted", state.chatSeen ? "Nothing said yet." : "Waiting for your laptop to send the chat up."));
  }
  state.chat.forEach((m) => {
    const row = el("div", "talk-row" + (m.who === "You" ? " mine" : "") + (m.who === "System" ? " system" : ""));
    const who = el("span", "talk-who", m.who === "System" ? "" : m.who);
    who.style.color = CHAT_COLOURS[m.who] || "var(--muted)";
    row.append(who, el("p", "talk-body", m.body));
    if (m.stamp) row.append(el("span", "talk-stamp", m.stamp));
    list.append(row);
  });
  const now = Date.now();
  state.chatWaiting.forEach((w) => {
    const row = el("div", "talk-row mine waiting");
    row.append(el("span", "talk-who", "You"), el("p", "talk-body", w.text),
      el("span", "talk-stamp", now - w.atMs > 60000
        ? "Not picked up yet. Is your laptop on, with the tutor open?" : "Sending to your laptop..."));
    list.append(row);
  });
  // 2026-10-18: "it shuld auto scroll to the BOTTOM". New messages, or
  // the page just opened: to the bottom. Only left where it is if she's
  // scrolled up to read and nothing new has come.
  const count = state.chat.length + state.chatWaiting.length;
  const fresh = count !== state.chatCount;
  state.chatCount = count;
  if (atBottom || fresh || state.chatWaiting.length || !state.chatScrolled) {
    requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
  }
}

function talkToBottom() {
  const list = $("talk-list");
  if (!list) return;
  state.chatScrolled = false;
  requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
}

// ------------------------------------------------------------- the sidebar
// 2026-10-07c: five pages along the top, the rest down the side. One page
// shows at a time, as before, and which one is kept on this device. Menu
// hides the side and brings it back (kept too); narrow, it's a drawer.
const TAB_BUTTONS = "#tabs button, #top-tabs button";
const narrow = () => window.matchMedia("(max-width: 819px)").matches;

function selectTab(key, focus) {
  const name = tabName(key);
  if (!name) return;
  state.tab = key;
  if (key === "talk") setTimeout(talkToBottom, 0);     // 2026-10-18
  document.querySelectorAll(TAB_BUTTONS).forEach((other) => {
    const on = other.dataset.tab === key;
    other.setAttribute("aria-selected", String(on));
    other.tabIndex = on ? 0 : -1;
    show("tab-" + other.dataset.tab, on);
    if (on && focus) other.focus();
  });
  // A page off the side says its name; one on the top is already lit there.
  $("page-name").textContent = name;
  show("page-name", !tabOnTop(key));
  // 2026-10-10q: the calendar wants the width; every other page is a column.
  document.body.classList.toggle("wide-page", key === "calendar");
  keep("tutor-tab", key);
}

function sideOpen(open) {
  document.body.classList.toggle("side-open", open);
  show("side-shade", open);
  sideSays();
}

function sideSays() {
  const body = document.body.classList;
  const showing = narrow() ? body.contains("side-open") : !body.contains("side-hidden");
  $("side-open").setAttribute("aria-expanded", String(showing));
  $("side-open").textContent = showing && !narrow() ? "Hide menu" : "Menu";
}

function tabButton(key, name) {
  const tab = button(name, "", () => { selectTab(key); sideOpen(false); });
  tab.setAttribute("role", "tab");
  tab.setAttribute("aria-controls", "tab-" + key);
  tab.dataset.tab = key;
  return tab;
}

function buildTabs() {
  const top = $("top-tabs");
  top.replaceChildren(...TOP_TABS.map(([key, name]) => tabButton(key, name)));
  const nav = $("tabs");
  nav.replaceChildren();
  TAB_GROUPS.forEach((group) => {
    const head = el("p", "side-head", group.name);
    head.setAttribute("role", "presentation");
    nav.append(head);
    group.tabs.forEach(([key, name]) => nav.append(tabButton(key, name)));
  });
  const arrows = (forward, back) => (event) => {
    const by = event.key === forward ? 1 : event.key === back ? -1 : 0;
    if (!by || !event.target.dataset || !event.target.dataset.tab) return;
    event.preventDefault();
    selectTab(tabStep(event.target.dataset.tab, by), true);
  };
  nav.addEventListener("keydown", arrows("ArrowDown", "ArrowUp"));
  top.addEventListener("keydown", arrows("ArrowRight", "ArrowLeft"));
  if (recall("tutor-side", "shown") === "hidden") document.body.classList.add("side-hidden");
  $("side-open").addEventListener("click", () => {
    if (narrow()) {
      sideOpen(true);
      const first = document.querySelector('#tabs button[aria-selected="true"]') || document.querySelector("#tabs button");
      if (first) first.focus();
      return;
    }
    const hidden = document.body.classList.toggle("side-hidden");
    keep("tutor-side", hidden ? "hidden" : "shown");
    sideSays();
  });
  $("side-close").addEventListener("click", () => { sideOpen(false); $("side-open").focus(); });
  $("side-shade").addEventListener("click", () => sideOpen(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("side-open")) {
      sideOpen(false);
      $("side-open").focus();
    }
  });
  window.addEventListener("resize", () => { if (!narrow()) sideOpen(false); else sideSays(); });
  selectTab(startTab(location.hash, recall("tutor-tab", "today")));
  sideSays();
}

// ---------------------------------------------------------------- start
function start() {
  if (String(firebaseConfig.apiKey).includes("PASTE")) { show("setup", true); return; }
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
  let stops = [];

  $("signin-form").addEventListener("submit", (event) => {
    event.preventDefault();
    $("signin-error").textContent = "";
    signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value)
      .catch(() => { $("signin-error").textContent = "That email or password isn't right."; });
  });
  $("signout").addEventListener("click", () => signOut(auth));
  $("sync").addEventListener("click", async () => {
    if (!cloud) return;
    try {
      const stamp = isoNow(new Date());
      state.asked = { stamp, atMs: Date.now() };
      drawSync();
      await touchInbox({ sync: stamp });
    } catch (error) {
      state.asked = null;
      $("sync-status").textContent = "Couldn't reach the cloud. Are you online?";
    }
  });
  setInterval(drawSync, 5000);         // so "isn't answering" can show up
  setInterval(() => { if (state.chatWaiting.length) drawTalk(); }, 10000);   // 2026-10-17
  // 2026-10-10q: "Sent" on the notes gives way once the laptop has answered
  // or stopped answering, and a drag that never arrived goes back.
  setInterval(() => { drawNotes(); if (state.moves.length) drawCalendarSoft(); }, 15000);
  state.calView = recall("tutor-cal", "three");
  state.calLayout = recall("tutor-cal-layout", "times");
  state.calFew = Number(recall("tutor-cal-few", "0")) || 0;
  state.calHoursLocked = recall("tutor-cal-hours-lock", "1") !== "0";   // 2026-10-16e
  state.bankTab = String(recall("tutor-bank-tab", "") || "");          // 2026-10-16m
  try { state.bankShut = new Set(recall("tutor-bank-shut", []) || []); } catch (e) { state.bankShut = new Set(); }
  try { state.bankGroupsOpen = new Set(recall("tutor-bank-groups", []) || []); } catch (e) { state.bankGroupsOpen = new Set(); }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.calPick) { state.calPick = null; drawCalendar(); }
  });
  setInterval(drawTimer, 1000);
  $("timer-pause").addEventListener("click", () => {
    const timer = state.timer;
    if (!timer) return;
    if (timer.pausedLeft !== null) {
      timer.endsMs = Date.now() + timer.pausedLeft * 1000;
      timer.pausedLeft = null;
    } else {
      timer.pausedLeft = timerLeft(timer, Date.now());
    }
    drawTimer();
  });
  $("timer-stop").addEventListener("click", () => { state.timer = null; drawTimer(); });
  $("exam-done").addEventListener("click", () => endExam("finished"));
  $("exam-stop").addEventListener("click", () => endExam("stopped"));
  setInterval(drawReflect, 60000);
  document.querySelectorAll("#reflect [data-answer]").forEach((choice) => {
    choice.addEventListener("click", () => answerReflection(choice.dataset.answer));
  });
  buildTabs();                          // 2026-10-07: the sidebar

  onAuthStateChanged(auth, (user) => {
    stops.forEach((stop) => stop());
    stops = [];
    cloud = null;
    show("signin", !user);
    show("app", Boolean(user));
    if (!user) return;
    const base = "users/" + user.uid + "/";
    cloud = { db, base };
    const listen = (name, key) => stops.push(onSnapshot(collection(db, base + name), (snap) => {
      state[key] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      drawAll();
    }, () => { $("status").textContent = "Can't reach the cloud right now"; }));
    listen("tasks", "tasks");
    listen("exams", "exams");
    listen("timetable", "timetable");
    listen("youtube_visits", "visits");
    listen("reflections", "reflections");
    listen("review_asks", "asks");
    // Tell the laptop where this web app lives, once per sign in.
    touchInbox().catch(() => {});
    // Opened from the tutor's "Review on the website": go to that tab.
    if (location.hash === "#lessons") {
      const tab = document.querySelector('#tabs button[data-tab="lessons"]');
      if (tab) tab.click();
    }
    // Opened from the tutor's "Answer on the website": go to the question.
    if (location.hash === "#review") {
      setTimeout(() => { if (!$("reflect").hidden) $("reflect-note").focus(); }, 1200);
    }
    listen("gemini_chats", "chats");
    listen("materials", "materials");
    listen("google_events", "events");
    listen("classroom_work", "work");
    listen("calendar_made", "made");
    listen("review_log", "lessons");
    listen("usage", "usage");
    listen("rewards", "rewards");
    stops.push(onSnapshot(doc(db, base + "live/bank"), (snap) => {
      state.bank = snap.exists() ? snap.data() : null;
      drawRewards();
    }));
    listen("task_history", "history");
    listen("task_snapshots", "snapshots");
    listen("calendar_writes", "writes");
    stops.push(onSnapshot(doc(db, base + "live/focus"), (snap) => {
      state.focus = snap.exists() ? snap.data() : null;
      drawSubjects();
    }));
    stops.push(onSnapshot(doc(db, base + "live/google"), (snap) => {
      state.google = snap.exists() ? snap.data() : null;
      drawSchool();
    }));
    stops.push(onSnapshot(doc(db, base + "days/" + isoDay(new Date())), (snap) => {
      state.day = snap.exists() ? snap.data() : null;
      drawAll();
    }));
    stops.push(onSnapshot(doc(db, base + "live/note"), (snap) => {
      state.live = snap.exists() ? snap.data() : null;
    }));
    // 2026-10-10q: every day's list, and her notes.
    stops.push(onSnapshot(doc(db, base + "live/alldays"), (snap) => {
      state.alldays = snap.exists() ? snap.data() : null;
      drawTasks(); drawCalendarSoft();
    }));
    stops.push(onSnapshot(doc(db, base + "live/notes"), (snap) => {
      state.notes = snap.exists() ? snap.data() : null;
      drawNotes();
    }));
    stops.push(onSnapshot(doc(db, base + "live/chat"), (snap) => {   // 2026-10-17
      state.chat = parseChat(snap.exists() ? snap.data() : null);
      state.chatSeen = true;
      state.chatWaiting = chatWaiting(state.chatWaiting, state.chat);
      drawTalk();
    }));
    stops.push(onSnapshot(doc(db, base + "meta/desktop"), (snap) => {
      state.meta = snap.exists() ? snap.data() : null;
      drawAll();
    }));
  });
}

start();
