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
         CAL_VIEWS, CAL_FEW, addMove, BANK, BANK_PICK, pickCount, settlePicks, withPicks, totalCount, typedWords, PICK_LEASTS, bankTabs, pickLine, withMoves, calendarDays,
         HOUR_PX, ZOOMS, setHourPx, timeSnap, pickName, CAL_LAYOUTS, clockWords, minutesOf, hhmm, timeParts, timeSpan, taskLength, lineLabel, boxHits, shiftTimes, dropTime, mergedTimes, timeColumn, firstScroll, scrollFloor, CAL_LOCK_HOUR, settleSwaps, swapSig, calendarStep, calendarTitle, calendarCells,
         moveProblem, settleMoves, notesIncoming, noteVersion,
         splitLine, parseChat, chatWaiting, APP_VERSION, nowScroll, eventAfterDrag,
         planCheck, repeatWords, subjectColour, eventColour, EVENT_COLOURS,
         pageData, pageHabits, pageSlots, pageGaps, longerBy, pageSteps, carryList, PAGE_MOST_HABITS, PAGE_HABIT_IDEAS, PAGE_MOST_STARS, pageDoneBySlot,
         smartItems, smartPlan, smartDefaults, smartLeftovers, smartReadWords, smartLevelOf, smartSubjectKey, SMART_LEVELS,
         NOW_BLOCKS, nowBlocks, nowPick, nowRollover, nowBlockOf } from "./logic.js";   // 2026-10-20d   // 2026-10-19o: smart plan

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
                bankShut: new Set(), bankGroupsOpen: new Set(), calRepeat: null, flexFlip: {}, calInfo: null, calDayMenu: null, calDelete: null, delWaiting: new Map(), picksWaiting: [], calMulti: [], calMultiRepeat: false, calHidePast: false,
                chat: [], chatSeen: false, chatWaiting: [],
                // 2026-10-17b: events changed here, waiting for the laptop
                // (id -> {day, title, start, end, atMs}); the one being
                // renamed; tasks typed onto a day or into the bank.
                eventsEdited: new Map(), calRename: "", calAdding: "", addsWaiting: [],
                goalsWaiting: new Map(),
                pages: {} };            // 2026-10-19i: the Day page, pages/<day>   // 2026-10-18: list -> {count, by, atMs}
let cloud = null;                     // {db, base} once she's signed in

// An edit for the laptop to make. It lands in `edits`, the laptop takes it
// on its next pass (about 20 seconds) and her real list changes there.
async function sendEdit(edit) {
  if (!cloud) return false;
  try {
    // 2026-10-19c: to the millisecond, so a task added and moved at once
    // reaches the laptop in that order.
    const now = new Date();
    await addDoc(collection(cloud.db, cloud.base + "edits"),
                 { at: isoNow(now) + "." + String(now.getMilliseconds()).padStart(3, "0"), ...edit });
    await touchInbox();
    return true;
  } catch (error) {
    $("sync-status").textContent = "Couldn't send that. Are you online?";
    return false;
  }
}

// One note, like the real app: a box in the margin, her order, her gaps.
// onTick, when given, makes the boxes real buttons.
// 2026-10-18e: "yeasssss please" to a faster pickup. While this page is
// open in front of her, a stamp goes in meta/inbox every 30 seconds; the
// laptop looks every few seconds for as long as the stamps keep coming.
const SITE_BEAT_MS = 30000;
let siteBeatAt = 0;
async function siteBeat() {
  if (!cloud || document.visibilityState !== "visible") return;
  if (Date.now() - siteBeatAt < SITE_BEAT_MS - 1000) return;
  siteBeatAt = Date.now();
  try {
    await setDoc(doc(cloud.db, cloud.base + "meta/inbox"), { open: isoNow(new Date()) }, { merge: true });
  } catch (error) { siteBeatAt = 0; }
}
setInterval(siteBeat, SITE_BEAT_MS);
document.addEventListener("visibilitychange", () => { siteBeatAt = 0; siteBeat(); });

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
        ? "Asked the laptop to save a copy. It shows here in a few seconds while the tutor is open."
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
            ? "Sent. Your list changes on the laptop in a few seconds while the tutor is open."
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
  // 2026-10-19i: today's North Star, off the Day page.
  const starList = pageData(state.pages[isoDay(new Date())]).stars;   // 2026-10-19n: all of them
  const star = starList.map((s) => lineLabel(s.text)).join(", ");
  if (star) {
    const go = button("", "today-star", () => {
      page.day = isoDay(new Date());
      const tab = document.querySelector('button[data-tab="page"]');
      if (tab) tab.click();
    });
    go.append(el("span", "page-star-icon small", "\u2605"), el("span", "grow", (starList.length > 1 ? "North Stars: " : "North Star: ") + star));
    box.append(go);
  } else {
    const go = button("", "today-star none", () => {
      page.day = isoDay(new Date());
      const tab = document.querySelector('button[data-tab="page"]');
      if (tab) tab.click();
    });
    go.append(el("span", "page-star-icon small", "\u2606"), el("span", "grow", "Plan your day: pick a North Star"));
    box.append(go);
  }
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
  box.append(el("p", "muted", "Ticks and new tasks reach the laptop in a few seconds while the tutor is open."));
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
  // 2026-10-19m: "what the FLIP is this". A "Do 1 from [Geography]" card
  // put in the bank landed in Other as a task. The card only points at its
  // list, which is in the bank already, so it comes off the day instead.
  if (to === BANK && /^do 1 from \[/i.test(String(pick.text || "").trim())) {
    return Promise.resolve(deleteLine(pick.from, pick.text)).then(() => {
      state.calSaid = "That card just points at its list, and the list's already in the bank, so it's off the day now.";
      drawCalendar();
      return true;
    });
  }
  const now = new Date();
  const problem = moveProblem(pick.text, pick.from, to, now);
  state.calPick = null;
  if (problem) { state.calSaid = problem; drawCalendar(); return Promise.resolve(false); }
  state.moves = addMove(state.moves, { text: pick.text, from: pick.from, to, atMs: Date.now() });
  remember("Move \u201c" + pick.text + "\u201d",                              // 2026-10-19b
    () => moveLine({ text: pick.text, from: to }, pick.from), () => moveLine({ text: pick.text, from: pick.from }, to));
  state.calSaid = (to === BANK ? "Put in the bank" : "Moved to " + dayHead(to, now)) +
    ". The laptop takes it in a few seconds while the tutor is open.";
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
  const was = mergedTimes(allDays(state.alldays), state.timesWaiting, Date.now())[day + "|" + text] || "";
  if (was !== (at || "")) remember("Time of \u201c" + text + "\u201d",        // 2026-10-19b
    () => sendTime(day, text, was), () => sendTime(day, text, at));
  state.timesWaiting = state.timesWaiting.filter((t) => Date.now() - t.atMs < 120000 && t.key !== day + "|" + text);
  state.timesWaiting.push({ key: day + "|" + text, at, atMs: Date.now() });
  state.calPick = null;
  const span = timeParts(at);
  state.calSaid = !at ? "Its time's gone." : "\u201c" + text + "\u201d at about " + clockWords(hhmm(span ? span.start : minutesOf(at))) +
    (span && span.end !== null ? " to " + clockWords(hhmm(span.end)) : "") + ".";
  drawCalendar();
  return sendEdit({ kind: "line_time", day, text, time: at });
}

function placeAt(held, day, at) {
  if (held.from === BANK_PICK) return pickToDay(held, day, at);     // 2026-10-18f
  // 2026-10-19: a task she'd pulled longer keeps its length when moved.
  const had = mergedTimes(allDays(state.alldays), state.timesWaiting, Date.now())[held.from + "|" + held.text];
  if (at && timeParts(had) && timeParts(had).end !== null) {
    const s = minutesOf(at);
    at = timeSpan(s, s + taskLength(had));
  }
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
  // 2026-10-18c: "tasks from subjects must have those colours". Matches the
  // line's words (ignoring its worth and "(optional)"), a "do 1 from [X]"
  // card, and a line that starts "physics:".
  // 2026-10-20d: "these tasks dont have their colorus". A smart plan's "Go over X (1 of 3)" is X's subject.
  const raw = String((line && (line.text || line.raw)) || "").replace(/^>\s*/, "").trim()
    .replace(/^Go over (.+) \(\d+ of \d+\)$/, "$1");
  // 2026-10-18e: a copy ("words (2)") has its subject's colour too.
  let words = raw;
  for (let i = 0; i < 3; i += 1) {
    words = words.replace(/\s*\[\d+\]\s*$/, "").replace(/\s*\(optional\)\s*$/i, "").replace(/\s*\(\d{1,2}\)\s*$/, "");
  }
  words = words.trim().toLowerCase();
  if (subjectOfLine.has(words)) return subjectOfLine.get(words);
  const pick = /^do 1 from \[([^\]/]+)/i.exec(raw);        // 2026-10-19c: not the "/ sublist"
  if (pick) return pick[1].trim();
  const head = /^([a-z& ]+):/i.exec(raw);
  if (head && subjectColour(head[1].trim())) return head[1].trim();
  return "";
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
// takes it in a few seconds.
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
  // 2026-10-19c: "id like to be able to add and move the tasks onto the
  // calendar as soon as i put it down". A new task is a real line at once
  // (faded till the laptop has it), so it can be dragged straight away.
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
    const loaded = allDays(state.alldays);
    const words = typedWords(text);
    state.picksWaiting = state.picksWaiting.concat([{ text: words, to: list ? BANK : day, list: list || "",
      had: pickCount(loaded, day, words), hadAll: totalCount(loaded, words), atMs: Date.now() }]);
    state.calSaid = "Added \u201c" + words + "\u201d. You can drag it now; it's faded till the laptop has it.";
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
// 2026-10-19: "select an area and it would select it". Press on an empty
// bit of the hours and drag out a box: every task it touches is picked (as
// shift-click picks them), ready to repeat, bank or delete together. Hold
// Shift to add to what's picked already.
function boxSelect(col, wrap) {
  col.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target !== col) return;
    const x0 = event.clientX, y0 = event.clientY;
    const keep = event.shiftKey;
    let mark = null;
    const area = (ev) => ({ left: Math.min(x0, ev.clientX), right: Math.max(x0, ev.clientX),
                            top: Math.min(y0, ev.clientY), bottom: Math.max(y0, ev.clientY) });
    const move = (ev) => {
      if (!mark && Math.abs(ev.clientX - x0) < 6 && Math.abs(ev.clientY - y0) < 6) return;
      if (!mark) {
        mark = el("div", "box-select");
        document.body.append(mark);
        state.dragging = true;              // no redraw under her hand
      }
      const a = area(ev);
      Object.assign(mark.style, { left: a.left + "px", top: a.top + "px",
        width: (a.right - a.left) + "px", height: (a.bottom - a.top) + "px" });
      ev.preventDefault();
    };
    const up = (ev) => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      if (!mark) return;
      mark.remove();
      state.dragging = false;
      state.calStale = false;
      state.boxedAt = Date.now();          // not a click on the hours too
      const nodes = [...wrap.querySelectorAll(".tg-item[data-raw], .plan-line[data-raw]")];
      const hit = boxHits(area(ev), nodes.map((n) => {
        const r = n.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, day: n.dataset.day, raw: n.dataset.raw };
      }));
      const picked = keep ? state.calMulti.slice() : [];
      hit.forEach((h) => {
        const key = h.day + "|" + h.raw;
        if (!picked.some((m) => m.key === key)) picked.push({ key, text: h.raw, from: h.day });
      });
      state.calMulti = picked;
      state.calPick = null;
      state.calSaid = hit.length ? "" : "Nothing in that box. Drag it over some tasks.";
      drawCalendar();
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  });
}

// 2026-10-19d: the hover icons on a task: done, lock, repeat, split, time
// off (if it has one) and delete (undo with Ctrl+Z). Spans, not buttons, so
// they sit inside the task's own button.
function taskTools(node, day, line, timed) {
  const raw = line.raw;
  const tools = el("span", "task-tools");
  const tool = (name, tip, act) => {
    const t = el("span", "task-tool");
    t.setAttribute("role", "button");
    t.tabIndex = -1;
    t.title = tip;
    t.setAttribute("aria-label", tip);
    t.append(icon(name));
    t.addEventListener("mousedown", (ev) => { ev.stopPropagation(); ev.preventDefault(); });
    t.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    t.addEventListener("click", (ev) => { ev.stopPropagation(); ev.preventDefault(); act(); });
    tools.append(t);
  };
  tool("tick", "Done", () => markDone(day, raw, true));
  const locked = locksNow(allDays(state.alldays) || {}).has(dayKey(day, raw));
  tool(locked ? "unlock" : "lock", locked ? "Unlock (a swap takes it)" : "Lock to this day (a swap leaves it)",
    () => lockLine(day, raw, !locked));
  tool("repeat", "Repeat", () => {
    state.calPick = { text: raw, from: day, timed };
    state.calRepeat = { text: raw, from: day };
    drawCalendar();
  });
  const parts = splitLine(raw);
  if (parts) tool("split", "Split into " + parts.n + " \u00d7 \u201c" + parts.one + "\u201d", () => splitPicked({ text: raw, from: day }, parts));
  if (timed) tool("clockoff", "Take its time off", () => sendTime(day, raw, ""));
  tool("bin", "Delete (Ctrl+Z puts it back)", () => {
    deleteLine(day, raw);
    state.calSaid = "Deleted \u201c" + lineLabel(raw) + "\u201d. Ctrl+Z puts it back.";
    drawCalendar();
  });
  node.append(tools);
}

// 2026-10-19d: "itd also be better if the tasks could SNAP into a position".
// While a task is held over the hours, a box shows where it'll land.
function snapMark(target, day, y) {
  const held = state.calDrag;
  if (!held || held.event) return;
  const at = dropTime(y);
  let length = 30;
  if (held.timed) {
    const had = mergedTimes(allDays(state.alldays), state.timesWaiting, Date.now())[held.from + "|" + held.text];
    length = taskLength(had);
  }
  let mark = target.querySelector(".tg-snap");
  if (!mark) { mark = el("div", "tg-snap"); target.append(mark); }
  const start = minutesOf(at);
  mark.style.top = (start / 60 * HOUR_PX) + "px";
  mark.style.height = Math.max(18, length / 60 * HOUR_PX - 2) + "px";
  mark.textContent = clockWords(at) + (held.count > 1 ? " \u00d7 " + held.count : "");
}
function snapOff() { document.querySelectorAll(".tg-snap").forEach((m) => m.remove()); }
document.addEventListener("dragend", snapOff);
document.addEventListener("drop", () => setTimeout(snapOff, 0));

// 2026-10-19d: flexible days. "c": both. A day's Flexible switch (the
// laptop moves what she's late for by itself), and +30 to move what's
// still to come that day half an hour later.
function flexChips(cell, found) {
  const wrap = el("span", "flex-chips");
  const on = Boolean(found && found.flex && found.flex.has(cell.day)) !== Boolean(state.flexFlip[cell.day]);
  const fb = button("Flexible", "plan-swap flex" + (on ? " on" : ""), () => {
    state.flexFlip = { ...state.flexFlip, [cell.day]: !state.flexFlip[cell.day] };
    sendEdit({ kind: "flex_day", day: cell.day, on: !on });
    state.calSaid = !on ? "Flexible: anything with a time that you're more than 15 minutes late for moves on by itself."
      : "Flexible's off for that day. Times stay where you put them.";
    drawCalendar();
  });
  fb.setAttribute("aria-pressed", String(on));
  fb.title = on ? "Flexible is on: late tasks move on by themselves. Press to turn it off."
    : "Make this day flexible: tasks you haven't done move on by themselves";
  wrap.append(fb);
  const plus = button("+30", "plan-swap", () => shiftDay(cell.day, 30));
  plus.title = "Move the tasks still to come on this day 30 minutes later (Ctrl+Z undoes)";
  wrap.append(plus);
  return wrap;
}
function shiftDay(day, minutes) {
  const now = new Date();
  const found = allDays(state.alldays);
  const times = mergedTimes(found, state.timesWaiting, Date.now());
  const from = day === isoDay(now) ? now.getHours() * 60 + now.getMinutes() - 15 : 0;
  const done = new Set();
  ((found && found.days) || []).filter((d) => d.day === day)
    .forEach((d) => d.lines.forEach((l) => { if (l.done) done.add(day + "|" + String(l.text).trim()); }));
  const moved = shiftTimes(times, day, minutes, from, done);
  const keys = Object.keys(moved);
  if (!keys.length) { state.calSaid = "Nothing with a time still to come on that day."; drawCalendar(); return; }
  const before = {};
  keys.forEach((k) => { before[k] = times[k]; });
  const apply = (map) => Object.keys(map).forEach((k) => {
    state.timesWaiting = state.timesWaiting.filter((t) => t.key !== k);
    state.timesWaiting.push({ key: k, at: map[k], atMs: Date.now() });
  });
  apply(moved);
  sendEdit({ kind: "day_shift", day, minutes });
  remember("+" + minutes + " on " + dayHead(day, now), () => {
    apply(before);
    Object.keys(before).forEach((k) => sendEdit({ kind: "line_time", day, text: k.slice(day.length + 1), time: before[k] }));
  }, () => { apply(moved); sendEdit({ kind: "day_shift", day, minutes }); });
  state.calSaid = "Moved " + keys.length + (keys.length === 1 ? " task " : " tasks ") + minutes + " minutes later. Ctrl+Z puts them back.";
  drawCalendar();
}

// ---- 2026-10-19e: a task's card, like Google Calendar's. Its name, its
// day and time, its subject, and what can be done with it.
function dayMenuButton(cell, found) {
  const on = Boolean(found && found.flex && found.flex.has(cell.day)) !== Boolean(state.flexFlip[cell.day]);
  const b = button("\u22ef", "plan-swap day-menu-btn" + (on ? " flex-on" : ""), (ev) => {
    state.calDayMenu = state.calDayMenu && state.calDayMenu.day === cell.day ? null
      : { day: cell.day, rect: ev.currentTarget.getBoundingClientRect() };
    state.calInfo = null;
    drawCalendar();
  });
  b.title = "Swap, Flexible, +30" + (on ? " (Flexible is on)" : "");
  b.setAttribute("aria-label", "Day options for " + dayHead(cell.day, new Date()));
  return b;
}
function popCard(rect, cls) {
  const card = el("div", "pop-card " + (cls || ""));
  card.setAttribute("role", "dialog");
  const w = 340, pad = 10;
  const vw = window.innerWidth, vh = window.innerHeight;
  let left = rect.right + pad;
  if (left + w > vw - pad) left = Math.max(pad, rect.left - w - pad);
  let top = Math.max(pad, Math.min(rect.top, vh - 260));
  Object.assign(card.style, { left: left + "px", top: top + "px", width: w + "px" });
  card.addEventListener("click", (ev) => ev.stopPropagation());
  card.addEventListener("pointerdown", (ev) => ev.stopPropagation());
  return card;
}
function popTools(card, items) {
  const row = el("div", "pop-tools");
  items.forEach(([name, tip, act, danger]) => {
    const b = iconButton(name, tip, act);
    if (danger) b.classList.add("danger-ico");
    row.append(b);
  });
  card.append(row);
}
function drawInfoCard(found) {
  document.querySelectorAll(".pop-card").forEach((c) => c.remove());
  const info = state.calInfo;
  if (info && info.rect) {
    const { day, raw } = info;
    const card = popCard(info.rect, "task-card");
    const locked = locksNow(found || {}).has(dayKey(day, raw));
    const parts = splitLine(raw);
    const tools = [
      ["tick", "Done (Ctrl+Enter)", () => { state.calInfo = null; markDone(day, raw, true); }],
      [locked ? "unlock" : "lock", locked ? "Unlock: a swap takes it" : "Lock to this day: a swap leaves it",
        () => { state.calInfo = null; lockLine(day, raw, !locked); }],
      ["repeat", "Repeat", () => { state.calInfo = null; state.calPick = { text: raw, from: day }; state.calRepeat = { text: raw, from: day }; drawCalendar(); }],
    ];
    if (parts) tools.push(["split", "Split into " + parts.n, () => { state.calInfo = null; splitPicked({ text: raw, from: day }, parts); }]);
    if (info.timed) tools.push(["clockoff", "Take its time off", () => { state.calInfo = null; sendTime(day, raw, ""); }]);
    tools.push(["bin", "Delete (Ctrl+Z puts it back)", () => {
      state.calInfo = null; deleteLine(day, raw);
      state.calSaid = "Deleted \u201c" + lineLabel(raw) + "\u201d. Ctrl+Z puts it back."; drawCalendar();
    }, true]);
    tools.push(["close", "Close (Esc)", () => { state.calInfo = null; state.calPick = null; drawCalendar(); }]);
    popTools(card, tools);
    const head = el("div", "pop-head");
    const dot = el("span", "pop-dot");
    const colour = subjectColour(subjectFor(info.line || { text: raw })) || "var(--accent)";
    dot.style.background = colour;
    head.append(dot, el("p", "pop-title", lineLabel(raw)));
    card.append(head);
    const when = dayHead(day, new Date()) + (info.timed && info.start !== undefined
      ? " \u00b7 " + clockWords(hhmm(info.start)) + " to " + clockWords(hhmm(info.end)) : "");
    card.append(el("p", "pop-line", when));
    const subj = subjectFor(info.line || { text: raw });
    const sub = /\[[^\]]*\/\s*([^\]]+)\]/.exec(raw);
    if (subj) card.append(el("p", "pop-line muted", (/^dt$/i.test(subj) ? "DT" : subj.charAt(0).toUpperCase() + subj.slice(1).toLowerCase()) +
      (sub ? " \u00b7 " + sub[1].trim().toLowerCase() : "")));
    if (/^do 1 from/i.test(raw)) card.append(el("p", "pop-line muted", "When it's time, the tutor asks which one you'll do."));
    if (locked) card.append(el("p", "pop-line muted", "Locked to this day."));
    card.append(el("p", "pop-hint muted", "Drag it to move it. Or press where it goes."));
    document.body.append(card);
  }
  const menu = state.calDayMenu;
  if (menu && menu.rect) {
    const card = popCard(menu.rect, "day-card");
    const on = Boolean(found && found.flex && found.flex.has(menu.day)) !== Boolean(state.flexFlip[menu.day]);
    popTools(card, [["close", "Close (Esc)", () => { state.calDayMenu = null; drawCalendar(); }]]);
    card.append(el("p", "pop-title", dayHead(menu.day, new Date())));
    const list = el("div", "pop-menu");
    const item = (label, tip, act) => { const b = button(label, "pop-item", act); b.title = tip; list.append(b); };
    item("Swap with another day", "Then press Swap here on the other day (locked tasks stay)", () => {
      state.calDayMenu = null; state.calSwap = menu.day; state.calSaid = "Now press Swap here on the other day."; drawCalendar();
    });
    item(on ? "Flexible: on (turn off)" : "Make it flexible",
      "Flexible: tasks with a time that you're more than 15 minutes late for move on by themselves", () => {
        state.flexFlip = { ...state.flexFlip, [menu.day]: !state.flexFlip[menu.day] };
        sendEdit({ kind: "flex_day", day: menu.day, on: !on });
        state.calDayMenu = null;
        state.calSaid = !on ? "Flexible: anything with a time that you're more than 15 minutes late for moves on by itself."
          : "Flexible's off for that day.";
        drawCalendar();
      });
    item("+30: what's still to come, half an hour later", "Ctrl+Z puts them back", () => { state.calDayMenu = null; shiftDay(menu.day, 30); });
    item("+15: a quarter of an hour later", "Ctrl+Z puts them back", () => { state.calDayMenu = null; shiftDay(menu.day, 15); });
    card.append(list);
    document.body.append(card);
  }
}
document.addEventListener("click", (ev) => {
  if ((state.calInfo || state.calDayMenu) && !ev.target.closest(".pop-card, .tg-item, .plan-line, .day-menu-btn")) {
    state.calInfo = null; state.calDayMenu = null; drawCalendar();
  }
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && (state.calInfo || state.calDayMenu)) { state.calInfo = null; state.calDayMenu = null; drawCalendar(); }
});

function timesDrop(target, day, onHours) {
  const at = (event) => dropTime(event.clientY - target.getBoundingClientRect().top);
  target.dataset.pasteDay = day;               // 2026-10-19b: Ctrl+V lands here
  if (onHours) target.dataset.pasteHours = "1";
  target.addEventListener("dragover", (event) => {
    if (!state.calDrag) return;
    event.preventDefault();
    if (onHours) snapMark(target, day, event.clientY - target.getBoundingClientRect().top);   // 2026-10-19d
    // 2026-10-18f: a "Do 1 from" card is a copy. A "move" here made the
    // browser refuse the drop, so dragging one did nothing at all.
    event.dataTransfer.dropEffect = state.calDrag.from === BANK_PICK ? "copy" : "move";
    target.classList.add("over");
  });
  target.addEventListener("dragleave", (event) => {
    if (!target.contains(event.relatedTarget)) { target.classList.remove("over"); snapOff(); }
  });
  target.addEventListener("drop", (event) => {
    event.preventDefault();
    snapOff();
    const held = state.calDrag;
    state.dragging = false; state.calDrag = null; state.calStale = false;
    if (!held) return;
    if (held.event) { eventDropped(held.event, day, onHours ? at(event) : ""); return; }   // 2026-10-18
    if (held.many) { moveMany(held, day); return; }    // 2026-10-19l: all the picked ones come along
    if (onHours) { placeAt(held, day, at(event)); return; }
    if (held.from !== day) { moveLine(held, day); return; }
    if (held.timed) sendTime(day, held.text, "");
  });
  if (onHours) {
    // Picked, then pressed somewhere on the hours: there, at that time.
    target.addEventListener("click", (event) => {
      if (Date.now() - (state.boxedAt || 0) < 400) return;     // 2026-10-19: a box, not a click
      if (event.target !== target || !state.calPick) return;
      placeAt(state.calPick, day, at(event));
    });
  }
}

// 2026-10-19: "cant extend amount of time a task holds by drag". A task's
// bottom edge pulls longer or shorter, in quarter hours, like an event's.
function taskPull(block, item, day) {
  const grip = el("div", "tg-resize");
  grip.title = "Pull to make it longer or shorter";
  block.append(grip);
  grip.addEventListener("mousedown", (event) => event.preventDefault());   // not a drag of the task
  grip.addEventListener("click", (event) => event.stopPropagation());
  grip.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    block.draggable = false;
    const y0 = event.clientY;
    const tall0 = parseFloat(block.style.height) || 22;
    const step = HOUR_PX / 4;
    let moved = false;
    grip.setPointerCapture(event.pointerId);
    const move = (ev) => {
      const dy = ev.clientY - y0;
      if (!moved && Math.abs(dy) < 4) return;
      moved = true;
      state.dragging = true;               // no redraw under her hand
      block.classList.add("pulling");
      const tall = Math.max(step - 2, tall0 + Math.round(dy / step) * step);
      block.style.height = tall + "px";
      const span = block.querySelector(".tg-item-time");
      const mins = Math.max(15, Math.round((item.end - item.start + Math.round(dy / step) * 15) / 15) * 15);
      if (span) span.textContent = clockWords(hhmm(item.start)) + " to " + clockWords(hhmm(item.start + mins));
    };
    const up = (ev) => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      grip.removeEventListener("pointercancel", up);
      block.classList.remove("pulling");
      block.draggable = true;
      state.dragging = false;
      state.calStale = false;
      if (!moved) return;
      const quarters = Math.round((ev.clientY - y0) / step);
      const mins = Math.max(15, item.end - item.start + quarters * 15);
      sendTime(day, item.line.raw, timeSpan(item.start, item.start + mins));
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
    grip.addEventListener("pointercancel", up);
  });
}

function timedBlock(item, day, past) {
  const top = item.start / 60 * HOUR_PX;
  const tall = Math.max(22, (item.end - item.start) / 60 * HOUR_PX - 2);
  const width = 100 / item.lanes;
  const isEvent = item.kind === "event";
  // 2026-10-19d: "i also want the time for when tasks occurs". Tall enough
  // for two lines: the name on top (wrapping), the time under it.
  const short = (item.end - item.start) / 60 * HOUR_PX < 36;
  const block = el(past ? "div" : "button", "tg-item" + (isEvent ? " event" : "") + (short ? " short" : ""));
  if (!past) block.type = "button";
  // 2026-10-18b: an event she coloured keeps its colour; a subject line its subject's.
  if (isEvent && eventColour(item.event.color)) { block.classList.add("coloured"); block.style.setProperty("--ev", item.event.color); }
  if (!isEvent && item.line) applySubject(block, item.line);
  if (!isEvent && item.line && ghostPick(day, item.line.raw)) block.classList.add("moving");   // 2026-10-18f
  block.style.top = top + "px";
  block.style.height = tall + "px";
  block.style.left = "calc(" + (item.lane * width) + "% + 2px)";
  block.style.width = "calc(" + width + "% - 4px)";
  const when = clockWords(hhmm(item.start)) + (isEvent && item.event.end ? " to " + clockWords(item.event.end)
    : !isEvent ? " to " + clockWords(hhmm(item.end)) : "");   // 2026-10-19d: start and end
  block.append(el("span", "tg-item-name", isEvent ? item.label : lineLabel(item.label)), el("span", "tg-item-time", when));
  if (item.lanes > 1) block.classList.add("narrow");        // 2026-10-19: the name first
  // 2026-10-19e: the icons came off the task; a click opens its card.
  if (!isEvent) {
    block.dataset.day = day; block.dataset.raw = item.line.raw;
    if ((state.calMulti || []).some((m) => m.key === day + "|" + item.line.raw)) block.classList.add("multi");
  }
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
  block.title = "Drag to another time or day. Drag it to the top to take its time off. Pull its bottom to make it longer.";
  taskPull(block, item, day);                // 2026-10-19
  block.addEventListener("click", (ev) => {
    // 2026-10-20c: "i cant MASS DRAG STUFF". Shift or Ctrl click picks several
    // on the hours too; drag one of them and they all come.
    if ((ev.shiftKey || ev.ctrlKey || ev.metaKey) && item.line && !item.line.repeat) { state.calInfo = null; toggleMulti(raw, day); return; }
    state.calPick = picked ? null : { text: raw, from: day, timed: true };
    state.calSaid = "";
    state.calInfo = picked ? null : { day, raw, line: item.line, timed: true, start: item.start, end: item.end,
                                      rect: block.getBoundingClientRect() };   // 2026-10-19e
    drawCalendar();
  });
  block.addEventListener("dragstart", (event) => {
    state.dragging = true;
    state.calDrag = { text: raw, from: day, timed: true };
    state.calDrag.many = dragAll(state.calDrag);       // 2026-10-19l
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
  const cells = calendarCells(days, found, state.moves, state.exams, state.tasks, now, 0, state.swaps, locksNow(found), state.pendingDays);
  const times = mergedTimes(found, state.timesWaiting, nowMs);
  const events = eventsNow(found, nowMs);          // 2026-10-17b: with her edits
  const cols = cells.map((cell) => ({ cell, ...timeColumn(cell.lines, cell.day, times, events) }));
  const wrap = el("div", "tg");
  wrap.style.setProperty("--days", String(days.length));
  wrap.style.setProperty("--hour", HOUR_PX + "px");
  if (HOUR_PX > 48) wrap.classList.add("zoomed");           // 2026-10-19c
  const head = el("div", "tg-row tg-head");
  head.append(el("div", "tg-gutter"));
  cols.forEach(({ cell }) => {
    const h = el("div", "tg-dayhead" + (cell.today ? " today" : "") + (cell.past ? " past" : "") +
      (state.calSwap === cell.day ? " swapping" : ""));
    h.append(el("span", "plan-name", cell.name), el("span", "tg-date", String(cell.date)));
    // 2026-10-19e: "now its TOO CLUTTERED". Swap, Flexible and +30 are in
    // one little menu on the day; only a swap in progress shows its button.
    if (!cell.past) h.append(state.calSwap ? swapButton(cell) : dayMenuButton(cell, found));
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
  // 2026-10-19c: zoomed in, every half hour (or quarter) has its label.
  const per = HOUR_PX >= 192 ? 4 : HOUR_PX >= 96 ? 2 : 1;
  for (let m = 0; m < 24 * 60; m += 60 / per) {
    const lab = el("div", "tg-hour" + (m % 60 ? " part" : ""), m ? clockWords(hhmm(m)) : "");
    if (per > 1) lab.style.height = (HOUR_PX / per) + "px";
    labels.append(lab);
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
    if (!cell.past) boxSelect(col, wrap);       // 2026-10-19
    body.append(col);
  });
  scroll.append(body);
  // 2026-10-19d: "the large/small button for the size to be increasable and
  // in the bottom right corner of the calendar". Floating, with more sizes.
  const zoom = el("div", "tg-zoom");
  const zo = iconButton("zoomout", "Zoom out (Ctrl + scroll works too)", () => zoomHours(-1));
  const zi = iconButton("zoomin", "Zoom in (Ctrl + scroll works too)", () => zoomHours(1));
  zo.disabled = HOUR_PX <= ZOOMS[0];
  zi.disabled = HOUR_PX >= ZOOMS[ZOOMS.length - 1];
  zoom.append(zo, el("span", "tg-zoom-size", Math.round(HOUR_PX / 48 * 100) + "%"), zi);
  wrap.append(head, top, scroll, zoom);
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
// goes on that day; the laptop puts it there in a few seconds.
function pickToDay(pick, to, at) {
  const now = new Date();
  state.calPick = null;
  if (to === BANK || to === BANK_PICK) return Promise.resolve(false);
  const problem = moveProblem(pick.text, BANK_PICK, to, now);
  if (problem) { state.calSaid = problem; drawCalendar(); return Promise.resolve(false); }
  // 2026-10-18f: it shows on the day (and at its hour) straight away.
  // 2026-10-19c: "do [x] from": x cards, half an hour apart on the hours.
  const count = Math.max(1, Math.min(10, Number(pick.count) || 1));
  const had = pickCount(allDays(state.alldays), to, pick.text);
  // The names the laptop will give them ("(2)", "(3)" when there's one
  // already), each at its own time, so the faded ones sit where they'll be.
  const base = String(pick.text).replace(/\s\(\d+\)$/, "");
  const nameOf = (i) => (had === 0 && count === 1 ? base : base + " (" + (had + i + 1) + ")");
  const span = timeParts(at);
  const length = span && span.end !== null ? span.end - span.start : 30;
  const ghosts = Array.from({ length: count }, (_, i) => ({ text: nameOf(i), to, had: had + i, atMs: Date.now() }));
  state.picksWaiting = state.picksWaiting.concat(ghosts);
  if (at) {
    ghosts.forEach((g, i) => {
      const s = (span ? span.start : minutesOf(at)) + i * length;
      const when = span && span.end !== null ? timeSpan(s, s + length) : hhmm(s);
      state.timesWaiting = state.timesWaiting.filter((t) => t.key !== to + "|" + g.text);
      state.timesWaiting.push({ key: to + "|" + g.text, at: when, atMs: Date.now() });
    });
  }
  state.calSaid = (count > 1 ? count + " \u00d7 " : "") + "\u201c" + lineLabel(pick.text) + "\u201d " + (count > 1 ? "are" : "is") +
    " on " + dayHead(to, now) + (at ? " from about " + clockWords(at) : "") +
    ". Faded till the laptop has " + (count > 1 ? "them" : "it") + " (a few seconds while the tutor is open).";
  drawCalendar();
  return sendEdit({ kind: "bank_pick", text: pick.text, from: BANK, to, time: at || "", count }).then((sent) => {
    if (sent) return true;
    state.picksWaiting = state.picksWaiting.filter((p) => !ghosts.includes(p));
    state.calSaid = "Couldn't send that. Are you online?";
    drawCalendar();
    return false;
  });
}
function ghostPick(day, raw) {
  return state.picksWaiting.some((p) => p.to === day && p.text === raw);
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
  // 2026-10-20b: "ability to also hide task bank".
  const bankHidden = Boolean(recall("tutor-bank-hidden", false));
  const bankTop = el("div", "plan-check-top");
  const bankFold = button(bankHidden ? "Show" : "Hide", "plan-check-fold", () => { keep("tutor-bank-hidden", !bankHidden); drawCalendar(); });
  bankFold.title = bankHidden ? "Show the task bank" : "Hide the task bank";
  bankTop.append(el("p", "plan-head", "Task bank"), bankFold);
  bankBox.append(bankTop);
  if (bankHidden) { bankBox.classList.add("bank-hidden"); box.append(bankBox); return; }
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
          if (open) card.append(pickCard(pickName(tab.name, group), true));    // 2026-10-19c
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
  if (tabs.length) grid.prepend(generalPick(tabs));       // 2026-10-19c
  if (tabs.length) bankBox.append(grid);
  calDrop(bankBox, BANK, pick);
  box.append(bankBox);
}

// "complete a task from [list] (optional if minimum worth x mins)": drag
// it onto a day (or press it, then Move here). The least is optional.
function pickCard(name, compact, count) {
  const least = compact ? "0" : state.bankLeast[name] || "0";
  const text = pickLine(name, least);
  const n = Math.max(1, Number(count) || 1);
  const card = el("div", "bank-pick" + (compact ? " small" : ""));
  const picked = state.calPick && state.calPick.from === BANK_PICK && state.calPick.text === text &&
    (Number(state.calPick.count) || 1) === n;
  const label = compact ? "Do 1 from here" : "Do " + n + " from " + lineLabel("do 1 from [" + name + "]").replace(/^Do 1 from /, "");
  const go = el("button", "plan-line bank-pick-line" + (picked ? " picked" : ""), label);
  go.type = "button";
  const tint = subjectColour(String(name).split("/")[0].trim());        // 2026-10-19c: a sublist too
  if (tint) { go.classList.add("subj"); go.style.setProperty("--subj", tint); }
  go.draggable = true;
  go.title = "Drag onto a day: that day gets \u201c" + text + "\u201d. Tick it there and the tutor asks which one you did.";
  go.setAttribute("aria-pressed", String(Boolean(picked)));
  go.addEventListener("click", () => {
    state.calPick = picked ? null : { text, from: BANK_PICK, count: n };
    state.calSaid = "";
    drawCalendar();
  });
  go.addEventListener("dragstart", (event) => {
    state.dragging = true;
    state.calDrag = { text, from: BANK_PICK, count: n };
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", text);
  });
  go.addEventListener("dragend", () => {
    state.dragging = false;
    state.calDrag = null;
    document.querySelectorAll(".plan-day.over").forEach((d) => d.classList.remove("over"));
    if (state.calStale) { state.calStale = false; drawCalendar(); }
  });
  if (compact) { go.title = "Drag onto a day: \u201c" + lineLabel(text) + "\u201d. Ticked there, the tutor asks which one from this list you did."; card.append(go); return card; }
  card.append(go, chipRow("bank-least", "At least worth", PICK_LEASTS, least, (value) => {
    state.bankLeast = { ...state.bankLeast, [name]: value };
    drawCalendar();
  }));
  return card;
}

// 2026-10-19c: "a general next to task bank that have drop downs for do [x]
// from [subjectname] and [list- optional]". One card at the front of the
// bank: how many, which subject, which of its little lists (or any). Drag
// it (or press it, then a day) like any "Do 1 from" card.
function generalPick(tabs) {
  const card = el("section", "bank-sub bank-general");
  card.append(el("p", "bank-sub-name", "Do some from\u2026"));
  const names = tabs.map((t) => t.name);
  const g = state.genPick = Object.assign({ n: 1, list: names[0] || "", sub: "" }, state.genPick || {});
  if (!names.includes(g.list)) { g.list = names[0] || ""; g.sub = ""; }
  const tab = tabs.find((t) => t.name === g.list);
  const subs = [...new Set(((tab && tab.lines) || []).map((l) => String(l.group || "").trim()).filter(Boolean))];
  if (!subs.includes(g.sub)) g.sub = "";
  const pickOne = (label, values, current, onPick) => {
    const s = document.createElement("select");
    s.setAttribute("aria-label", label);
    s.title = label;
    values.forEach(([v, w]) => { const o = el("option", "", w); o.value = v; if (String(v) === String(current)) o.selected = true; s.append(o); });
    s.addEventListener("change", () => { onPick(s.value); keep("tutor-gen-pick", state.genPick); drawCalendar(); });
    return s;
  };
  const row = el("div", "gen-row");
  row.append(el("span", "muted", "Do"),
    pickOne("How many", [1, 2, 3, 4, 5].map((v) => [v, String(v)]), g.n, (v) => { g.n = Number(v) || 1; }),
    el("span", "muted", "from"),
    pickOne("Subject", names.map((v) => [v, v]), g.list, (v) => { g.list = v; g.sub = ""; }));
  card.append(row);
  if (subs.length) {
    const row2 = el("div", "gen-row");
    row2.append(el("span", "muted", "list"), pickOne("Which list in it (optional)", [["", "Any"]].concat(subs.map((v) => [v, v])), g.sub, (v) => { g.sub = v; }));
    card.append(row2);
  }
  if (g.list) {
    const one = pickCard(pickName(g.list, g.sub), true, g.n);
    one.classList.remove("small");
    const b = one.querySelector("button");
    b.textContent = "Do " + g.n + " from " + lineLabel(pickLine(pickName(g.list, g.sub), 0)).replace(/^Do 1 from /, "");
    b.title = "Drag onto a day (or an hour): " + g.n + (g.n > 1 ? " cards" : " card") + ". Ticked there, the tutor asks which one you did.";
    card.append(one);
  }
  const colour = subjectColour(g.list);
  if (colour) { card.classList.add("subj"); card.style.setProperty("--subj", colour); }
  return card;
}

// One line on the calendar or in the bank: drag it, or press it to pick it.
function calLine(line, dayId, past, pick) {
  const head = line.kind === "head";
  // 2026-10-19c: "no option on website to say a task is done either". A done
  // line can be pressed to untick it.
  if (line.done && !past && !line.sub && !head && dayId !== BANK) {
    const done = button(lineLabel(line.text), "plan-line done", () => markDone(dayId, line.raw, false));
    done.title = "Done. Press to untick it.";
    applySubject(done, line);
    return done;
  }
  if (deleting(dayId, line.raw)) {                    // 2026-10-18e
    const gone = el("p", "plan-line deleting", (line.sub ? "> " : "") + line.text);
    gone.title = "Deleting. The laptop takes it off in a few seconds.";
    return gone;
  }
  const can = !past && !line.done && !line.sub;
  const picked = pick && pick.text === line.raw && pick.from === dayId;
  const item = el(can ? "button" : "p", "plan-line" + (head ? " head" : "") + (line.done ? " done" : "") +
    (line.sub ? " sub" : "") + (line.optional ? " optional" : "") + (line.fun ? " fun" : "") +
    (line.bold ? " bold" : "") + (line.moving || ghostPick(dayId, line.raw) ? " moving" : "") + (picked ? " picked" : "") +
    (line.repeat ? " repeat" : "") + (line.locked ? " locked" : ""),
    (line.sub ? "> " : "") + line.text);
  if (line.locked) item.prepend(icon("lock"));
  if (!line.head) applySubject(item, line);      // 2026-10-18b
  if (!head && !line.sub) {                      // 2026-10-19
    if (item.firstChild && item.firstChild.nodeType === 3) item.firstChild.textContent = lineLabel(line.text);
    else if (item.lastChild && item.lastChild.nodeType === 3) item.lastChild.textContent = lineLabel(line.text);
    if (can && dayId !== BANK) { item.dataset.day = dayId; item.dataset.raw = line.raw; }

  }
  if (line.repeat) item.title = "Comes back every day. It lands on this day's list on the day.";
  if (!can) return item;
  item.type = "button";
  // 2026-10-17: a repeat can be pressed (to stop it), not dragged.
  item.draggable = !line.repeat;
  item.setAttribute("aria-pressed", String(Boolean(picked)));
  item.title = head ? "Drag it to another day and the lines under it go too"
    : "Drag to another day or the bank, or press to pick it (and lock it to this day)";
  if ((state.calMulti || []).some((m) => m.key === dayId + "|" + line.raw)) item.classList.add("multi");
  item.addEventListener("click", (ev) => {
    // 2026-10-18c: shift-click picks several at once (to repeat or bank them).
    if ((ev.shiftKey || ev.ctrlKey || ev.metaKey) && !line.repeat) { toggleMulti(line.raw, dayId); return; }   // 2026-10-20c: Ctrl too
    state.calPick = picked ? null : { text: line.raw, from: dayId, repeat: Boolean(line.repeat) };
    state.calDelete = null;
    state.calSaid = "";
    state.calRepeat = null;
    // 2026-10-19e: "i click on it and a description of tasks like google".
    state.calInfo = picked || dayId === BANK ? null : { day: dayId, raw: line.raw, line, timed: false, rect: item.getBoundingClientRect() };
    drawCalendar();
  });
  item.addEventListener("dragstart", (event) => {
    if (line.repeat) { event.preventDefault(); return; }
    state.dragging = true;
    state.calDrag = { text: line.raw, from: dayId };
    state.calDrag.many = dragAll(state.calDrag);       // 2026-10-19l
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
  if (dayId !== BANK) target.dataset.pasteDay = dayId;    // 2026-10-19b: Ctrl+V lands here
  target.addEventListener("dragover", (event) => {
    if (!state.calDrag || state.calDrag.from === dayId) return;
    if (state.calDrag.from === BANK_PICK && dayId === BANK) return;   // 2026-10-16m
    if (state.calDrag.event && dayId === BANK) return;                 // 2026-10-18
    event.preventDefault();
    event.dataTransfer.dropEffect = state.calDrag.from === BANK_PICK ? "copy" : "move";   // 2026-10-18f
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
    if (held && held.many) moveMany(held, dayId);      // 2026-10-19l
    else if (held) moveLine(held, dayId);
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
    state.calSaid = "Set on every list. The laptop takes it in a few seconds.";
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
  state.calSaid = "Splitting into " + parts.n + " \u00d7 \u201c" + parts.one + "\u201d. The laptop does it in a few seconds.";
  drawCalendar();
  return sendEdit({ kind: "line_split", day: pick.from, text: pick.text, n: parts.n, one: parts.one });
}

// 2026-10-19l: drag one of the picked tasks and the rest come with it.
function dragAll(held) {
  if (!held || !state.calMulti || !state.calMulti.length) return null;
  if (!state.calMulti.some((m) => m.key === held.from + "|" + held.text)) return null;
  const picked = state.calMulti.filter((m) => m.from !== BANK && m.from !== BANK_PICK);
  return picked.length ? picked.map((m) => ({ text: m.text, from: m.from })) : null;
}

// 2026-10-19l: several picked tasks dropped on one day, together.
function moveMany(held, dayId) {
  const list = (held.many || []).filter((m) => m.from !== dayId);
  state.calMulti = [];
  state.calMultiRepeat = false;
  state.calSaid = "Moving " + list.length + (list.length === 1 ? " task" : " tasks") + ".";
  list.forEach((m) => moveLine(m, dayId));
  drawCalendar();
}

// 2026-10-18c: shift-click several tasks, then repeat them or bank them.
function toggleMulti(text, from) {
  const key = from + "|" + text;
  const has = state.calMulti.some((m) => m.key === key);
  state.calMulti = has ? state.calMulti.filter((m) => m.key !== key)
    : state.calMulti.concat([{ key, text, from }]);
  state.calPick = null;
  state.calSaid = "";
  drawCalendar();
}

function multiBar() {
  const n = state.calMulti.length;
  const wrap = el("div", "multi-wrap");
  const row = el("div", "plan-bar multi-bar");
  row.append(el("p", "plan-title", n + (n === 1 ? " task" : " tasks") + " picked. Shift-click or drag a box to add more."));
  row.append(button("Repeat them", "", () => { state.calMultiRepeat = !state.calMultiRepeat; drawCalendar(); }));
  row.append(button("Put them in the bank", "quiet", () => {
    const picked = state.calMulti.filter((m) => m.from !== BANK);
    state.calMulti = [];
    state.calMultiRepeat = false;
    state.calSaid = "Putting " + picked.length + " in the bank. The laptop takes them in a few seconds.";
    picked.forEach((m) => moveLine({ text: m.text, from: m.from }, BANK));
    drawCalendar();
  }));
  // 2026-10-19c: tick them all off.
  const md = button("Mark done", "", () => {
    const picked = state.calMulti.filter((m) => m.from !== BANK && m.from !== BANK_PICK);
    state.calMulti = [];
    picked.forEach((m) => markDone(m.from, m.text, true, true));
    remember("Tick " + picked.length + " tasks", () => picked.forEach((m) => markDone(m.from, m.text, false, true)),
      () => picked.forEach((m) => markDone(m.from, m.text, true, true)));
    state.calSaid = "Ticked off " + picked.length + (picked.length === 1 ? " task." : " tasks.");
    drawCalendar();
  });
  md.prepend(icon("tick"));
  row.append(md);
  // 2026-10-19: delete the picked ones together (asks once).
  const sure = state.calMultiDelete;
  const del = button(sure ? "Yes, delete " + (n === 1 ? "it" : "all " + n) : "Delete them", sure ? "danger" : "quiet", () => {
    if (!sure) { state.calMultiDelete = true; drawCalendar(); return; }
    const picked = state.calMulti.filter((m) => m.from !== BANK && m.from !== BANK_PICK);
    state.calMulti = [];
    state.calMultiDelete = false;
    picked.forEach((m) => deleteLine(m.from, m.text));
    state.calSaid = "Deleted " + picked.length + (picked.length === 1 ? " task" : " tasks") +
      ". The laptop takes them off in a few seconds while the tutor is open.";
    drawCalendar();
  });
  del.prepend(icon("bin"));
  row.append(del);
  row.append(button(sure ? "Keep them" : "Clear", "quiet", () => {
    if (sure) { state.calMultiDelete = false; drawCalendar(); return; }
    state.calMulti = []; state.calMultiRepeat = false; state.calMultiDelete = false; drawCalendar();
  }));
  wrap.append(row);
  if (state.calMultiRepeat) wrap.append(multiRepeatForm());
  return wrap;
}

function multiRepeatForm() {
  const form = el("div", "plan-bar repeat-form");
  const every = document.createElement("input");
  every.type = "number"; every.min = "1"; every.max = "60"; every.value = "1";
  every.className = "repeat-every";
  every.setAttribute("aria-label", "Every how many");
  const unit = document.createElement("select");
  unit.setAttribute("aria-label", "Hours, days or weeks");
  [["hour", "hours"], ["day", "days"], ["week", "weeks"]].forEach(([v, w]) => {
    const o = el("option", "", w); o.value = v; if (v === "day") o.selected = true; unit.append(o);
  });
  const until = document.createElement("input");
  until.type = "date"; until.min = isoDay(new Date());
  until.title = "Leave it empty to keep it going until you stop it";
  form.append(el("span", "muted", "Every"), every, unit, el("span", "muted", "from today until"), until);
  form.append(button("Repeat them all", "", () => {
    const n = Math.max(1, Math.min(60, Math.round(Number(every.value) || 1)));
    const today = isoDay(new Date());
    const list = state.calMulti.slice();
    state.calMulti = [];
    state.calMultiRepeat = false;
    state.calSaid = "Repeating " + list.length + " " + (list.length === 1 ? "task" : "tasks") + " " +
      repeatWords({ every: n, unit: unit.value }) + (until.value ? " until " + dayHead(until.value, new Date()) : "") +
      ". The laptop sets them up in a few seconds.";
    drawCalendar();
    list.forEach((m) => sendEdit({ kind: "repeat_add", day: m.from === BANK || m.from === BANK_PICK ? today : m.from,
      text: m.text, until: until.value || "", times: 1, one: "", every: n, unit: unit.value }));
  }), button("Cancel", "quiet", () => { state.calMultiRepeat = false; drawCalendar(); }));
  return form;
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
      (until.value ? " until " + dayHead(until.value, new Date()) : "") + ". The laptop sets it up in a few seconds.";
    drawCalendar();
    sendEdit({ kind: "repeat_add", day: pick.from, text: pick.text, until: until.value || "",
               times, one: times > 1 ? parts.one : "", every: n, unit: unit.value });
  }), button("Cancel", "quiet", () => { state.calRepeat = null; drawCalendar(); }));
  return form;
}

function stopRepeat(text) {
  text = String(text).replace(/\s+\(every [^)]*\)$/, "");    // an hourly one's label
  state.calPick = null;
  state.calSaid = "Stopped. \u201c" + text + "\u201d won't come back (the laptop takes it in a few seconds).";
  drawCalendar();
  return sendEdit({ kind: "repeat_stop", text });
}

function swapDays(one, two) {
  state.calSwap = null;
  const now = new Date();
  // 2026-10-16e: "ive clicked swap here, tasks didnt swap". It waited for
  // the laptop with nothing to show. Now it's swapped here at once (locked
  // lines stay), and the laptop does the same in a few seconds.
  const found = allDays(state.alldays);
  state.swaps = state.swaps.concat([{ one, two, atMs: Date.now(),
    before: { one: swapSig(found, one), two: swapSig(found, two) } }]);
  state.calSaid = "Swapped " + dayHead(one, now) + " and " + dayHead(two, now) +
    ". Locked tasks stayed put. The laptop takes it in a few seconds while the tutor is open.";
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

// 2026-10-18e: delete a task off its day. The "> bits" under it go too.
// 2026-10-19c: tick a task off (or back on) from the calendar, the same way
// the Tasks page does.
function markDone(day, text, done, quiet) {
  if (!quiet) remember((done ? "Tick " : "Untick ") + "\u201c" + text + "\u201d",
    () => markDone(day, text, !done, true), () => markDone(day, text, done, true));
  tickDay({ day, raw: text, done: !done });
  state.calPick = null;
  if (!quiet) state.calSaid = (done ? "Ticked off \u201c" : "Unticked \u201c") + lineLabel(text) + "\u201d.";
  drawCalendar();
}

function askDelete(pick) {
  state.calDelete = dayKey(pick.from, pick.text);
  state.calSaid = "Delete \u201c" + pick.text + "\u201d off " + dayHead(pick.from, new Date()) + "?";
  drawCalendar();
}
function deleteLine(day, text) {
  const key = dayKey(day, text);
  const hadTime = mergedTimes(allDays(state.alldays), state.timesWaiting, Date.now())[key] || "";
  remember("Delete \u201c" + text + "\u201d",                                  // 2026-10-19b
    () => putBack(day, text, hadTime), () => deleteLine(day, text));
  state.delWaiting.set(key, Date.now());
  state.calDelete = null;
  state.calPick = null;
  state.calSaid = "Deleted \u201c" + text + "\u201d. The laptop takes it off in a few seconds while the tutor is open.";
  drawCalendar();
  sendEdit({ kind: "day_del", day, text }).then((sent) => {
    if (sent) return;
    state.delWaiting.delete(key);
    state.calSaid = "Couldn't send that. Are you online?";
    drawCalendar();
  });
}
function deleting(day, text) {
  const at = state.delWaiting.get(dayKey(day, text));
  return Boolean(at) && Date.now() - at < 120000;
}

// ---- 2026-10-19b: "i also want shortcuts like ctrl c,v, and z/x/y etc to
// work". On the calendar, with tasks picked (pressed, shift-clicked or boxed):
// Ctrl+C copies them, Ctrl+X cuts them, Ctrl+V puts them on the day (and
// hour) the mouse is over, Delete asks to delete them, Esc lets go. Ctrl+Z
// undoes what was last done here (a move, a time, a pull, a delete, a
// paste) and Ctrl+Y (or Ctrl+Shift+Z) does it again. Never while typing.
const undoStack = [], redoStack = [];
let replaying = false;
function remember(words, undo, redo) {
  if (replaying) return;
  undoStack.push({ words, undo, redo });
  if (undoStack.length > 50) undoStack.shift();
  redoStack.length = 0;
}
function replay(from, to, doing) {
  const step = from.pop();
  if (!step) { state.calSaid = doing === "undo" ? "Nothing to undo." : "Nothing to redo."; drawCalendar(); return; }
  replaying = true;
  try { (doing === "undo" ? step.undo : step.redo)(); } finally { replaying = false; }
  to.push(step);
  state.calSaid = (doing === "undo" ? "Undone: " : "Done again: ") + step.words + ".";
  drawCalendar();
}
// 2026-10-20c: "it doesnt even have i can quickly make another task what im
// doing now bc sometimes i have to reply again". A line on today, starting
// now, as long as she picks (15 minutes unless she says).
let doingNowMins = 15;
function doingNowRow(done) {
  const row = el("div", "doing-now");
  const input = document.createElement("input");
  input.placeholder = "What are you doing right now? (e.g. reply to Jaya again)";
  input.setAttribute("aria-label", "What you're doing right now");
  const lengths = el("div", "doing-now-len");
  [5, 10, 15, 30, 45, 60].forEach((m) => {
    const chip = button(m + " min", "smart-chip" + (m === doingNowMins ? " on" : ""), () => {
      doingNowMins = m;
      lengths.querySelectorAll(".smart-chip").forEach((c) => c.classList.toggle("on", c === chip));
      input.focus();
    });
    lengths.append(chip);
  });
  const add = () => {
    const text = input.value.trim().slice(0, 160);
    if (!text) { input.focus(); return; }
    const now = new Date();
    const day = isoDay(now);
    const start = Math.floor((now.getHours() * 60 + now.getMinutes()) / 5) * 5;
    const at = timeSpan(start, start + doingNowMins);
    state.timesWaiting = state.timesWaiting.filter((t) => t.key !== day + "|" + text);
    state.timesWaiting.push({ key: day + "|" + text, at, atMs: Date.now() });
    putBack(day, text, at);
    const words = "\u201c" + text + "\u201d is on today from " + clockWords(hhmm(start)) + " for " + doingNowMins + " minutes.";
    state.calSaid = words;
    page.said = words;
    done();
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
  row.append(input, lengths, button("Add", "", add));
  setTimeout(() => input.focus(), 0);
  return row;
}

function putBack(day, text, at) {
  // still showing (the laptop hasn't taken it off yet): it counts as gone.
  const still = deleting(day, text) ? 1 : 0;
  state.delWaiting.delete(dayKey(day, text));
  const ghost = { text, to: day, had: Math.max(0, pickCount(allDays(state.alldays), day, text) - still), atMs: Date.now() };
  state.picksWaiting = state.picksWaiting.concat([ghost]);
  sendEdit({ kind: "day_add", day, text });
  if (at) sendEdit({ kind: "line_time", day, text, time: at });
}
let calClip = null;
let pointerAt = { x: -1, y: -1 };
document.addEventListener("pointermove", (event) => { pointerAt = { x: event.clientX, y: event.clientY }; }, { passive: true });
function pickedNow() {
  if (state.calMulti.length) return state.calMulti.map((m) => ({ text: m.text, from: m.from }));
  return state.calPick && state.calPick.from !== BANK_PICK && !state.calPick.repeat
    ? [{ text: state.calPick.text, from: state.calPick.from }] : [];
}
function pasteSpot() {
  const under = document.elementsFromPoint(pointerAt.x, pointerAt.y).find((n) => n.dataset && n.dataset.pasteDay);
  if (!under) return null;
  const at = under.dataset.pasteHours ? dropTime(pointerAt.y - under.getBoundingClientRect().top) : "";
  return { day: under.dataset.pasteDay, at };
}
function pasteLines(lines, cut) {
  const spot = pasteSpot();
  if (!spot) { state.calSaid = "Point the mouse at a day (or an hour), then press Ctrl+V."; drawCalendar(); return; }
  const now = isoDay(new Date());
  if (spot.day < now) { state.calSaid = "That day's gone, so nothing can go on it."; drawCalendar(); return; }
  const found = allDays(state.alldays);
  const added = [];
  lines.forEach((l) => {
    if (cut && l.from) {
      if (l.from === spot.day) { if (spot.at) sendTime(spot.day, l.text, spot.at); return; }
      replaying = true;                     // one undo step for the lot, below
      try { if (spot.at) placeAt({ text: l.text, from: l.from }, spot.day, spot.at); else moveLine({ text: l.text, from: l.from }, spot.day); }
      finally { replaying = false; }
      added.push(l);
      return;
    }
    state.picksWaiting = state.picksWaiting.concat([{ text: l.text, to: spot.day, had: pickCount(found, spot.day, l.text), atMs: Date.now() }]);
    sendEdit({ kind: "day_add", day: spot.day, text: l.text });
    if (spot.at) {
      state.timesWaiting.push({ key: spot.day + "|" + l.text, at: spot.at, atMs: Date.now() });
      sendEdit({ kind: "line_time", day: spot.day, text: l.text, time: spot.at });
    }
    added.push(l);
  });
  if (!added.length) { drawCalendar(); return; }
  const n = added.length;
  const what = (cut ? "Moved " : "Pasted ") + (n === 1 ? "\u201c" + added[0].text + "\u201d" : n + " tasks");
  remember(what, cut
    ? () => added.forEach((l) => moveLine({ text: l.text, from: spot.day }, l.from))
    : () => added.forEach((l) => deleteLine(spot.day, l.text)),
  () => pasteBack(added, cut, spot));
  state.calMulti = [];
  state.calPick = null;
  state.calSaid = what + " on " + dayHead(spot.day, new Date()) + (spot.at ? " at about " + clockWords(spot.at) : "") +
    ". It's faded till the laptop has it (a few seconds while the tutor is open).";
  drawCalendar();
}
function pasteBack(lines, cut, spot) {
  lines.forEach((l) => {
    if (cut) { if (spot.at) placeAt({ text: l.text, from: l.from }, spot.day, spot.at); else moveLine({ text: l.text, from: l.from }, spot.day); return; }
    sendEdit({ kind: "day_add", day: spot.day, text: l.text });
    if (spot.at) sendEdit({ kind: "line_time", day: spot.day, text: l.text, time: spot.at });
  });
}
function calendarShortcut(event) {
  if ($("tab-calendar").hidden || typingInCalendar()) return;
  const active = document.activeElement;
  if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return;
  const ctrl = event.ctrlKey || event.metaKey;
  const key = String(event.key || "").toLowerCase();   // 2026-10-20c: Chrome's autofill sends a keydown with no key
  if (ctrl && key === "z" && !event.shiftKey) { event.preventDefault(); replay(undoStack, redoStack, "undo"); return; }
  if (ctrl && (key === "y" || (key === "z" && event.shiftKey))) { event.preventDefault(); replay(redoStack, undoStack, "redo"); return; }
  if (ctrl && (key === "c" || key === "x")) {
    const picked = pickedNow().filter((p) => p.from !== BANK);
    if (!picked.length) return;            // nothing picked: the browser's own copy
    event.preventDefault();
    calClip = { lines: picked, cut: key === "x", text: picked.map((p) => p.text).join("\n") };
    try { navigator.clipboard.writeText(calClip.text).catch(() => {}); } catch (error) { /* fine */ }
    state.calSaid = (key === "x" ? "Cut " : "Copied ") + (picked.length === 1 ? "\u201c" + picked[0].text + "\u201d" : picked.length + " tasks") +
      ". Point at a day or an hour and press Ctrl+V.";
    drawCalendar();
    return;
  }
  if (ctrl && key === "enter") {          // 2026-10-19c: tick them off
    const picked = pickedNow().filter((p) => p.from !== BANK);
    if (!picked.length) return;
    event.preventDefault();
    if (picked.length === 1) markDone(picked[0].from, picked[0].text, true);
    else { state.calMulti = []; picked.forEach((p) => markDone(p.from, p.text, true, true));
      remember("Tick " + picked.length + " tasks", () => picked.forEach((p) => markDone(p.from, p.text, false, true)),
        () => picked.forEach((p) => markDone(p.from, p.text, true, true)));
      state.calSaid = "Ticked off " + picked.length + " tasks."; drawCalendar(); }
    return;
  }
  if ((key === "delete" || key === "backspace") && !ctrl) {
    const picked = pickedNow();
    if (!picked.length) return;
    event.preventDefault();
    if (state.calMulti.length) { state.calMultiDelete = true; drawCalendar(); }
    else askDelete(state.calPick);
  }
}
document.addEventListener("keydown", calendarShortcut);
// Ctrl+V: what she copied here, or lines copied from anywhere else (each
// line one task).
document.addEventListener("paste", (event) => {
  if ($("tab-calendar").hidden) return;
  const active = document.activeElement;
  if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return;
  const text = (event.clipboardData && event.clipboardData.getData("text")) || "";
  event.preventDefault();
  if (calClip && (!text || text.trim() === calClip.text.trim())) {
    const clip = calClip;
    if (clip.cut) calClip = null;          // a cut is pasted once
    pasteLines(clip.lines, clip.cut);
    return;
  }
  const lines = text.split(/\r?\n/).map((t) => t.trim()).filter(Boolean).slice(0, 30).map((t) => ({ text: t.slice(0, 300) }));
  if (lines.length) pasteLines(lines, false);
});

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
    tick: ["M3.5 8.5l3 3 6-7"],      // 2026-10-19c
    close: ["M4 4l8 8", "M12 4l-8 8"],   // 2026-10-19e
    repeat: ["M3 7a5 5 0 0 1 9-2.5", "M12.5 2.5v2.5h-2.5", "M13 9a5 5 0 0 1-9 2.5", "M3.5 13.5V11H6"],   // 2026-10-19d
    split: ["M8 2.5v4", "M8 6.5L4 13", "M8 6.5l4 6.5"],
    clockoff: ["M8 2.5a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11", "M8 5v3l2 1.5", "M3 13L13 3"],
    zoomin: ["M7 3a4 4 0 1 0 0 8a4 4 0 1 0 0-8", "M10 10l3.5 3.5", "M5 7h4", "M7 5v4"],   // 2026-10-19c
    zoomout: ["M7 3a4 4 0 1 0 0 8a4 4 0 1 0 0-8", "M10 10l3.5 3.5", "M5 7h4"],
    bin: ["M3 4.5h10", "M6.5 4.5V3h3v1.5", "M4.5 4.5l.7 8.5h5.6l.7-8.5", "M7 7v4", "M9 7v4"],   // 2026-10-18e
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

function zoomHours(by) {
  const at = ZOOMS.indexOf(HOUR_PX);
  const next = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (at < 0 ? 0 : at) + by))];
  if (next === HOUR_PX) return;
  const topMinutes = (state.calScrollTop || 0) / HOUR_PX * 60;   // keep the same time at the top
  setHourPx(next);
  keep("tutor-cal-zoom", String(next));
  state.calScrollTop = Math.round(topMinutes / 60 * next);
  state.calSaid = next === 48 ? "Whole hours." : next === 96 ? "Zoomed in: every half hour." : "Zoomed in: every quarter hour.";
  drawCalendar();
}
document.addEventListener("wheel", (event) => {
  if (!(event.ctrlKey || event.metaKey) || !event.target.closest || !event.target.closest(".tg-scroll")) return;
  event.preventDefault();
  zoomHours(event.deltaY < 0 ? 1 : -1);
}, { passive: false });

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
  const loaded = allDays(state.alldays);
  state.picksWaiting = settlePicks(state.picksWaiting, loaded, Date.now());   // 2026-10-18f
  const found = withPicks(loaded, state.picksWaiting);
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
  // 2026-10-20c: "i cant see monday or sunday this week". With past days
  // shown, a week (or two) starts on this week's Sunday.
  const weekStart = addDayIso(isoDay(now), -now.getDay());
  const anchor = state.calAnchor || (!state.calHidePast && (state.calView === "week" || state.calView === "two") ? weekStart : isoDay(now));
  const inView = calendarDays(anchor, state.calView);
  // 2026-10-18c: "an option to hide past days". If every day in view has
  // gone, they're shown anyway so there's something to look at.
  const todayIso = isoDay(now);
  const fromToday = inView.filter((d) => d >= todayIso);
  const days = state.calHidePast && fromToday.length ? fromToday : inView;
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
    // 2026-10-19c: zoom the hours in and out (Ctrl + mouse wheel on them works too).
    // 2026-10-19d: zoom is at the bottom right of the hours now.
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
  // 2026-10-20c: "i can quickly make another task what im doing now".
  const nowBtn = button(state.nowOpen ? "Close" : "+ Doing now", "quiet doing-now-go", () => { state.nowOpen = !state.nowOpen; drawCalendar(); });
  nowBtn.title = "Put what you're doing right now on today, at this time";
  bar.append(back, todayBtn, on, el("p", "plan-title", calendarTitle(days, state.calView, anchor)), views, nowBtn, tools);
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
    const past = chipRow("ring-switch", "Past days", [["show", "Show"], ["hide", "Hide past"]],
      state.calHidePast ? "hide" : "show", (value) => {
        state.calHidePast = value === "hide"; keep("tutor-cal-hide-past", state.calHidePast); drawCalendar();
      });
    past.title = "Hide the days that have gone, so the week starts today";
    more.append(el("span", "muted", "Past days"), past);
    box.append(bar, more);
    bar.dataset.more = "1";
  }
  if (!bar.dataset.more) box.append(bar);
  if (state.nowOpen) box.append(doingNowRow(() => { state.nowOpen = false; drawCalendar(); }));   // 2026-10-20c
  if (state.calEventForm) box.append(eventForm(days, now));
  const pick = state.calPick;
  // 2026-10-19b: what she was just told wins over "Moving ..." (Copied, Delete ...?).
  const said = el("p", "muted plan-said", pick && !state.calSaid
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
  } else if (pick && pick.from !== BANK && pick.from !== BANK_PICK && state.calRepeat && state.calRepeat.text === pick.text) {
    // 2026-10-19d: "id like the edit things for each task to be like a hover
    // one". Done, lock, repeat, split, time off and delete are icons on the
    // task itself now; only the repeat form still opens here.
    box.append(repeatForm(pick, splitLine(pick.text)));
  } else if (false) {
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
    const tb = button("Done", "", () => markDone(pick.from, pick.text, true));     // 2026-10-19c
    tb.prepend(icon("tick"));
    tb.title = "Tick it off (Ctrl+Enter)";
    row.prepend(tb);
    const rb = button("Repeat", "quiet", () => {
      state.calRepeat = state.calRepeat ? null : { text: pick.text, from: pick.from };
      drawCalendar();
    });
    rb.title = "A fresh one every day from this day";
    row.append(rb);
    // 2026-10-18e: "theres not delete fiunction". Asks once, then sends.
    const sure = state.calDelete === dayKey(pick.from, pick.text);
    const db = button(sure ? "Yes, delete it" : "Delete", sure ? "danger" : "quiet",
      () => sure ? deleteLine(pick.from, pick.text) : askDelete(pick));
    db.prepend(icon("bin"));
    db.title = sure ? "Takes it off this day for good" : "Take it off this day";
    row.append(db);
    if (sure) row.append(button("Keep it", "quiet", () => { state.calDelete = null; drawCalendar(); }));
    box.append(row);
    if (state.calRepeat && state.calRepeat.text === pick.text) box.append(repeatForm(pick, parts));
  }
  if (state.calMulti.length) box.append(multiBar());                      // 2026-10-18c
  if (state.calEventPick) box.append(eventEditor(state.calEventPick));   // 2026-10-17b
  // 2026-10-19d: "Take its time off" is the clock icon on the task now.
  if (state.calLayout === "times" && state.calView !== "month") {
    drawTimes(box, days, found, now, pick);
    drawBank(box, found, pick);
    drawPlanCheck(box, found);             // 2026-10-18
    box.append(el("p", "muted", "Drag a task onto an hour to give it a rough time, or to the top to take it off. " +
      "Meals and prayers stay on Today. Days that have gone can't be changed."));
    try { drawInfoCard(found); } catch (error) { /* never stops the calendar */ }   // 2026-10-19e
    return;
  }
  const grid = el("div", "plan-grid " + state.calView);
  const cells = calendarCells(days, found, state.moves, state.exams, state.tasks, now,
                              state.calView === "month" ? 4 : (state.calFew || 0), state.swaps, locksNow(found), state.pendingDays);
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
  try { drawInfoCard(allDays(state.alldays)); } catch (error) { /* never stops the calendar */ }   // 2026-10-19e
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
      el("p", "muted", auto.sending ? "Telling the laptop. A few seconds while the tutor is open."
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
  if (waiting || moving) top.append(el("p", "muted", "Sending that to the laptop. A few seconds while the tutor is open."));
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

// ------------------------------------------------------------ 2026-10-19i
// The Day page, her "Power Page": "ok incorperate this to the website ...
// somehow". Like her notebook page: the North Star at the top, habits and
// mood, the half hours down the left, Tasks / Notes / Carry over on the
// right. Tasks, ticks and times are her real ones (the laptop's); the star,
// habits, mood, productivity, notes and what's urgent live in pages/<day>.
const page = { day: "", held: null, typingAt: null, chip: null, said: "", notesTimer: null, notesDirty: false };
// 2026-10-19q: "hwo do i refresh without losnig progress?" The smart plan's answers are kept on this device.
page.smart = (() => { const s = recall("tutor-smart", null);
  return s && typeof s === "object" && s.answers && typeof s.answers === "object" ? { view: s.view === "plan" ? "plan" : "ask", answers: s.answers,
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(String(s.deadline || "")) ? s.deadline : smartDefaults(new Date()).deadline,
    start: /^\d{4}-\d{2}-\d{2}$/.test(String(s.start || "")) ? s.start : smartDefaults(new Date()).start,
    light: Array.isArray(s.light) ? s.light : smartDefaults(new Date()).light,
    gone: s.gone && typeof s.gone === "object" ? s.gone : {}, said: "" } : null; })();
function smartSave() { keep("tutor-smart", page.smart ? { ...page.smart, busy: false } : null); }

function pageDayNow() {
  const today = isoDay(new Date());
  if (!page.day) page.day = new Date().getHours() >= 19 ? addDayIso(today, 1) : today;
  return page.day;
}
function addDayIso(day, by) {
  const d = new Date(day + "T12:00:00");
  d.setDate(d.getDate() + by);
  return isoDay(d);
}
function pageOf(day) { return pageData(state.pages[day]); }
function savePage(day, patch) {
  state.pages[day] = { ...(state.pages[day] || {}), ...patch };
  drawPage();
  if (!cloud) return Promise.resolve(false);
  return setDoc(doc(cloud.db, cloud.base + "pages/" + day), { ...patch, at: isoNow(new Date()) }, { merge: true })
    .then(() => true).catch(() => { page.said = "Couldn't save that. Are you online?"; drawPage(); return false; });
}
function pageLines(day) {
  const found = allDays(state.alldays);
  if (!found) return [];
  return calendarCells([day], found, state.moves, state.exams, state.tasks, new Date(), 0,
                       state.swaps, locksNow(found), state.pendingDays)[0].lines;
}
function pageTimes() { return mergedTimes(allDays(state.alldays), state.timesWaiting, Date.now()); }
function pageHold(line) {
  page.held = page.held && page.held.raw === line.raw ? null : { raw: line.raw, day: page.day };
  page.said = page.held ? "Now press a time on the left for “" + lineLabel(line.raw) + "”." : "";
  drawPage();
}
function pagePlace(raw, minute) {
  const day = page.day;
  page.held = null; page.chip = null;
  page.said = "“" + lineLabel(raw) + "” at " + clockWords(hhmm(minute)) + ".";
  Promise.resolve(placeAt({ text: raw, from: day }, day, hhmm(minute))).then(drawPage);
  drawPage();
}
function pageAddAt(text, minute) {
  const words = String(text || "").trim();
  if (!words) return;
  putBack(page.day, words, minute === null ? "" : hhmm(minute));
  page.said = "Added “" + words + "”" + (minute === null ? "." : " at " + clockWords(hhmm(minute)) + ".") +
    " It shows once the laptop has it.";
  page.typingAt = null;
  drawPage();
}

function pageStarCard(day, lines, data) {
  // 2026-10-19n: "id like to add a few north stars". Up to PAGE_MOST_STARS,
  // each with its own tick and an x to take it off.
  const card = el("div", "page-card page-star");
  const head = el("div", "page-star-head");
  const stars = data.stars || [];
  head.append(el("span", "page-star-icon", "\u2605"), el("span", "page-label", stars.length > 1 ? "North Stars" : "North Star"));
  card.append(head);
  const open = lines.filter((l) => l.kind === "line" && !l.repeat);
  const save = (list) => savePage(day, { stars: list, star: list.length ? list[0].text : "",
                                         starDone: list.length ? list[0].done : false });
  stars.forEach((s, i) => {
    const line = open.find((l) => l.raw === s.text);
    const done = line ? line.done : s.done;
    const row = el("div", "page-star-row" + (done ? " done" : ""));
    const tick = button("", "box" + (done ? " ticked" : ""), () => {
      if (line) markDone(day, line.raw, !line.done, true);
      save(stars.map((o, j) => (j === i ? { text: o.text, done: !done } : o)));
    });
    tick.setAttribute("aria-label", (done ? "Untick " : "Tick ") + s.text);
    row.append(tick, el("span", "page-star-words", lineLabel(s.text)));
    const off = button("\u00d7", "quiet", () => save(stars.filter((o, j) => j !== i)));
    off.title = "Take it off the North Stars";
    off.setAttribute("aria-label", "Take " + s.text + " off the North Stars");
    row.append(off);
    card.append(row);
  });
  const room = stars.length < PAGE_MOST_STARS;
  if (stars.length && !page.starPicking) {
    if (stars.some((s) => !s.done)) card.append(el("p", "muted", "What matters most. Do these first."));
    if (room) card.append(button("+ Add a North Star", "quiet", () => { page.starPicking = true; drawPage(); }));
    return card;
  }
  if (!room) { page.starPicking = false; return card; }
  card.append(el("p", "muted", stars.length ? "Add another one (up to " + PAGE_MOST_STARS + ")." :
    "The thing that would make " + (day === isoDay(new Date()) ? "today" : "this day") + " a win. Pick it, then do it first."));
  const add = (words) => {
    page.starPicking = false;
    if (stars.some((s) => s.text.toLowerCase() === words.toLowerCase())) { drawPage(); return; }
    save(stars.concat([{ text: words, done: false }]));
  };
  const chips = el("div", "page-star-picks");
  open.filter((l) => !l.done && !stars.some((s) => s.text === l.raw)).slice(0, 12).forEach((l) => {
    const chip = button(lineLabel(l.raw), "quiet", () => add(l.raw));
    applySubject(chip, l);
    chips.append(chip);
  });
  card.append(chips);
  const form = el("form", "page-inline");
  const field = el("input");
  field.placeholder = "Or type it";
  field.setAttribute("aria-label", "North Star");
  form.append(field, el("button", "", "Add"));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const words = field.value.trim();
    if (!words) return;
    if (!open.some((l) => l.raw === words)) putBack(day, words, "");
    add(words);
  });
  card.append(form);
  if (page.starPicking) card.append(button("Cancel", "quiet", () => { page.starPicking = false; drawPage(); }));
  return card;
}

function dotsRow(label, value, onPick) {
  const row = el("div", "page-dots");
  row.append(el("span", "page-dots-label", label));
  const group = el("div", "page-dots-set");
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-label", label);
  for (let n = 1; n <= 5; n += 1) {
    const dot = button("", "page-dot" + (n <= value ? " on" : ""), () => onPick(n === value ? 0 : n));
    dot.setAttribute("role", "radio");
    dot.setAttribute("aria-checked", String(n === value));
    dot.setAttribute("aria-label", label + " " + n + " of 5");
    group.append(dot);
  }
  row.append(group);
  return row;
}

function pageTrackCard(day, data) {
  const card = el("div", "page-card page-track");
  card.append(el("span", "page-label", "Tracking"));
  const habits = pageHabits(state.pages.setup);
  const list = el("div", "page-habits");
  habits.forEach((h) => {
    const on = Boolean(data.habits[h]);
    const item = button("", "page-habit" + (on ? " on" : ""), () => savePage(day, { habits: { ...data.habits, [h]: !on } }));
    item.append(el("span", "box" + (on ? " ticked" : "")), el("span", "", h));
    item.setAttribute("aria-pressed", String(on));
    list.append(item);
  });
  if (page.editHabits) {
    const form = el("form", "page-inline");
    const field = el("input");
    field.placeholder = "A habit (keep it small)";
    form.append(field, el("button", "", "Add"));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const words = field.value.trim();
      if (!words || habits.length >= PAGE_MOST_HABITS) return;
      saveHabits(habits.concat([words]));
    });
    const edit = el("div", "page-habit-edit");
    habits.forEach((h) => edit.append(button(h + " ×", "quiet", () => saveHabits(habits.filter((x) => x !== h)))));
    if (habits.length < PAGE_MOST_HABITS) {
      PAGE_HABIT_IDEAS.filter((i) => !habits.includes(i)).slice(0, 3)
        .forEach((i) => edit.append(button("+ " + i, "quiet", () => saveHabits(habits.concat([i])))));
    }
    card.append(edit);
    if (habits.length < PAGE_MOST_HABITS) card.append(form);
    else card.append(el("p", "muted", PAGE_MOST_HABITS + " is plenty. Fewer is easier to keep."));
    card.append(button("Done", "quiet", () => { page.editHabits = false; drawPage(); }));
  } else {
    if (!habits.length) list.append(el("span", "muted", "No habits yet."));
    list.append(button(habits.length ? "Edit" : "Pick a few", "quiet page-habit-change",
      () => { page.editHabits = true; drawPage(); }));
  }
  card.append(list);
  card.append(dotsRow("Mood", data.mood, (n) => savePage(day, { mood: n })),
              dotsRow("Productivity", data.prod, (n) => savePage(day, { prod: n })));
  return card;
}
function saveHabits(list) {
  state.pages.setup = { habits: list };
  drawPage();
  if (cloud) setDoc(doc(cloud.db, cloud.base + "pages/setup"), { habits: list, at: isoNow(new Date()) }, { merge: true })
    .catch(() => { page.said = "Couldn't save that. Are you online?"; drawPage(); });
}

function pageBlocksCard(day, lines, times, events) {
  const card = el("div", "page-card page-blocks");
  const now = new Date();
  const isToday = day === isoDay(now);
  const col = timeColumn(lines.filter((l) => !l.repeat), day, times, events);
  const slots = pageSlots(col.timed);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const gaps = new Set(pageGaps(col.timed, isToday ? nowMin : 0));
  // 2026-10-19n: once a half hour's over, what she ticked off in it shows there.
  const did = day <= isoDay(now) ? pageDoneBySlot(state.history, day, now.getTime()) : {};
  const over = (m) => day < isoDay(now) || (isToday && m + 30 <= nowMin);
  card.append(el("span", "page-label", "Time blocks"));
  const grid = el("div", "page-slots");
  const early = Object.keys(did).map(Number).filter((m) => m < slots[0]).sort((x, y) => x - y);
  if (early.length) {
    const before = el("div", "page-did-early");
    before.append(el("span", "page-slot-time", "Earlier"));
    const list = el("div", "page-slot-body");
    early.forEach((m) => did[m].forEach((t) => list.append(el("div", "page-did", "\u2713 " + lineLabel(t) + "  " + hhmm(m)))));
    before.append(list);
    grid.append(before);
  }
  slots.forEach((m) => {
    const ticked = over(m) ? (did[m] || []) : [];
    const slot = el("div", "page-slot" + (isToday && nowMin >= m && nowMin < m + 30 ? " now" : "") +
      (gaps.has(m) && !ticked.length ? " gap" : "") + (page.held ? " droppable" : ""));
    slot.append(el("span", "page-slot-time", hhmm(m)));
    const body = el("div", "page-slot-body");
    ticked.forEach((t) => body.append(el("div", "page-did", "\u2713 " + lineLabel(t))));
    col.timed.filter((t) => t.start >= m && t.start < m + 30).forEach((t) => {
      if (t.kind === "event") {
        const chip = el("div", "page-block event");
        if (t.event.color) chip.style.setProperty("--subj", t.event.color);
        chip.append(el("span", "grow", t.label), el("span", "page-block-when", hhmm(t.start) + "–" + hhmm(t.end)));
        body.append(chip);
        return;
      }
      const line = t.line;
      const open = page.chip === line.raw;
      const chip = el("div", "page-block" + (line.done ? " done" : "") + (open ? " open" : "") +
        ((pageOf(day).stars || []).some((s) => s.text === line.raw) ? " star" : ""));   // 2026-10-19n
      applySubject(chip, line);
      chip.draggable = true;
      chip.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("text/plain", line.raw);
        event.dataTransfer.effectAllowed = "move";
      });
      const tick = button("", "box" + (line.done ? " ticked" : ""), (event) => {
        event.stopPropagation();
        markDone(day, line.raw, !line.done, true);
        drawPage();
      });
      tick.setAttribute("aria-label", (line.done ? "Untick " : "Tick ") + line.raw);
      const name = button(lineLabel(line.raw), "page-block-name", (event) => {
        event.stopPropagation();
        page.chip = open ? null : line.raw;
        drawPage();
      });
      chip.append(tick, name, el("span", "page-block-when", hhmm(t.start) + "–" + hhmm(t.end)));
      body.append(chip);
      if (open) {
        const tools = el("div", "page-block-tools");
        const at = times[day + "|" + line.raw];
        tools.append(
          button("+25% time", "quiet", () => { page.chip = null; sendTime(day, line.raw, longerBy(at, 0.25)); drawPage(); }),
          button("Move", "quiet", () => { page.chip = null; pageHold(line); }),
          button("Take its time off", "quiet", () => { page.chip = null; sendTime(day, line.raw, ""); drawPage(); }));
        body.append(tools);
      }
    });
    // A block that started earlier and is still going: a thin bar with its name.
    col.timed.filter((t) => t.start < m && t.end > m).forEach((t) => {
      const cont = el("div", "page-cont", "\u2502 " + (t.kind === "event" ? t.label : lineLabel(t.line.raw)));
      if (t.kind === "line") applySubject(cont, t.line);
      body.append(cont);
    });
    if (page.typingAt === m) {
      const form = el("form", "page-inline");
      const field = el("input");
      field.placeholder = "What at " + clockWords(hhmm(m)) + "?";
      form.append(field, el("button", "", "Add"));
      form.addEventListener("submit", (event) => { event.preventDefault(); pageAddAt(field.value, m); });
      field.addEventListener("keydown", (event) => { if (event.key === "Escape") { page.typingAt = null; drawPage(); } });
      body.append(form);
      setTimeout(() => field.focus(), 0);
    }
    slot.append(body);
    slot.addEventListener("click", (event) => {
      if (event.target.closest(".page-block, .page-block-tools, form")) return;
      if (page.held) { pagePlace(page.held.raw, m); return; }
      page.chip = null;
      page.typingAt = page.typingAt === m ? null : m;
      drawPage();
    });
    slot.addEventListener("dragover", (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; slot.classList.add("over"); });
    slot.addEventListener("dragleave", () => slot.classList.remove("over"));
    slot.addEventListener("drop", (event) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData("text/plain");
      if (raw) pagePlace(raw, m);
    });
    grid.append(slot);
  });
  card.append(grid);
  const left = col.timed.filter((t) => t.kind === "line").length;
  const tips = [];
  if (gaps.size) tips.push(gaps.size === 1 ? "One empty half hour in there. Put something fun or something to learn in it, so scrolling doesn't fill it."
    : gaps.size + " empty half hours between blocks. Fill them with something fun or something to learn, so scrolling doesn't.");
  if (left) tips.push("Not sure how long something takes? Press it and give it 25% more.");
  else tips.push("Press a half hour to write something in, or drag a task here from Tasks.");
  tips.forEach((t) => card.append(el("p", "muted page-tip", t)));
  return card;
}

function pageTaskList(day, lines, times) {
  const card = el("div", "page-card page-tasks");
  card.append(el("span", "page-label", "Tasks"));
  const list = el("div", "page-task-list");
  const shown = lines.filter((l) => l.kind === "line" && !l.repeat);
  if (!shown.length) list.append(el("p", "muted", "Nothing here yet. Brain dump everything below."));
  shown.slice().sort((a, b) => Number(a.done) - Number(b.done)).forEach((line) => {
    const at = times[day + "|" + line.raw];
    const held = page.held && page.held.raw === line.raw;
    const item = el("div", "page-task" + (line.done ? " done" : "") + (held ? " held" : "") + (line.sub ? " sub" : ""));
    applySubject(item, line);
    item.draggable = !line.done;
    item.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", line.raw);
      event.dataTransfer.effectAllowed = "move";
    });
    const tick = button("", "box" + (line.done ? " ticked" : ""), () => { markDone(day, line.raw, !line.done, true); drawPage(); });
    tick.setAttribute("aria-label", (line.done ? "Untick " : "Tick ") + line.raw);
    const name = button(lineLabel(line.text), "page-task-name", () => { if (!line.done) pageHold(line); });
    item.append(tick, name);
    const p = timeParts(at);
    item.append(el("span", "page-task-when", p ? hhmm(p.start) : line.done ? "" : "no time"));
    if ((pageOf(day).stars || []).some((s) => s.text === line.raw)) item.append(el("span", "page-star-icon small", "★"));
    list.append(item);
  });
  card.append(list);
  const form = el("form", "page-inline");
  const field = el("input");
  field.placeholder = "Add a task";
  field.setAttribute("aria-label", "Add a task to this day");
  form.append(field, el("button", "", "Add"));
  form.addEventListener("submit", (event) => { event.preventDefault(); pageAddAt(field.value, null); });
  card.append(form);
  return card;
}

// 2026-10-19o: a bank of fun things to do on a break. Her list lives in
// pages/fun {list}; the starter ideas show until she changes it.
const FUN_STARTERS = [
  "Ten minutes of a dog video",
  "Walk round the garden",
  "Draw a Warrior Cat",
  "Put on a song and dance to it",
  "Make a hot chocolate",
  "Ring Jaya",
  "Read one page of something fun",
  "Stretch like a cat",
  "Count the birds you can see",
  "Think up a new Warrior Cat name",
];
function funList() {
  const f = state.pages.fun;
  return f && Array.isArray(f.list) ? f.list : FUN_STARTERS.slice();
}
function saveFun(list) {
  state.pages.fun = { list };
  if (cloud) setDoc(doc(cloud.db, cloud.base + "pages/fun"), { list, at: isoNow(new Date()) }, { merge: true }).catch(() => {});
  drawPage();
}
function pageFunCard() {
  const list = funList();
  const card = el("div", "page-card page-fun");
  card.append(el("span", "page-label", "Fun stuff"));
  card.append(el("p", "page-said", page.funPick || "Stuck for something? Press Pick one."));
  card.append(button("Pick one", "quiet", () => {
    if (!list.length) return;
    page.funPick = list[Math.floor(Math.random() * list.length)];
    drawPage();
  }));
  const ul = el("ul", "page-fun-list");
  list.forEach((item, i) => {
    const li = el("li", "page-fun-item");
    li.append(el("span", "page-fun-words", item));
    li.append(button("Remove", "quiet page-fun-x", () => saveFun(list.filter((_, j) => j !== i))));
    ul.append(li);
  });
  card.append(ul);
  const row = el("div", "page-inline");
  const input = document.createElement("input");
  input.placeholder = "Add a fun thing";
  input.setAttribute("aria-label", "Add a fun thing");
  const add = () => { const t = input.value.trim(); if (t) saveFun([...list, t.slice(0, 120)]); };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
  row.append(input, button("Add", "quiet", add));
  card.append(row);
  return card;
}

// 2026-10-19o: smart plan. She sees her guessed answers, fixes what's
// wrong, sets a deadline, sees the plan, then Set it up sends it all.
function smartChips(label, options, now, set) {
  const row = el("div", "smart-q");
  row.append(el("span", "smart-q-label", label));
  options.forEach(([value, words]) => {
    const chip = button(words, "smart-chip" + (now === value ? " on" : ""), () => set(value));
    chip.setAttribute("aria-pressed", String(now === value));
    row.append(chip);
  });
  return row;
}

function pageSmartCard(found) {
  const s = page.smart;
  const now = new Date();
  const d0 = smartDefaults(now);
  if (!s.gone) s.gone = {};
  // 2026-10-20b: "YESTERDAY I SAID SOME TASKS ARE DONE ... WHY WONT IT EVER SAVE".
  // Done already is kept for good on this device, not just for one plan.
  const goneForGood = recall("tutor-smart-gone", {});
  const items = smartItems(found, state.tasks, state.exams, subjectNames(), now)
    .filter((it) => !s.gone[it.key] && !goneForGood[it.key])   // 2026-10-19q
    // 2026-10-20c: a task's subject from the bank's lists too, so subjects can be balanced.
    .map((it) => ({ ...it, subject: it.subject || subjectFor({ text: it.text }) || it.list || "" }));
  if (!s.prefs) s.prefs = recall("tutor-smart-prefs", { subjects: {}, words: {}, said: "" });
  const card = el("div", "page-card smart-card");
  card.append(el("span", "page-label", "Smart plan"));
  if (s.said) card.append(el("p", "page-said", s.said));
  const answer = (it) => ({ ...it, ...(s.answers[it.key] || {}) });
  const setA = (it, patch) => { s.answers[it.key] = { ...(s.answers[it.key] || {}), ...patch }; smartSave(); drawPage(); };
  const set = (patch) => { Object.assign(s, patch); smartSave(); drawPage(); };
  // 2026-10-19q: "no option to either do ive already done a task". Ticks it and takes it off the plan.
  const doneAlready = (it) => {
    s.gone[it.key] = true;
    keep("tutor-smart-gone", { ...recall("tutor-smart-gone", {}), [it.key]: true });   // 2026-10-20b
    if (it.from === "day") markDone(it.day, it.text, true);
    else if (it.from === "hw" && it.id) sendEdit({ kind: "tick", task: Number(it.id) });
    s.said = "“" + it.text + "” is done" + (it.from === "bank" ? ". It won't come up in Smart plan again (it's still in the bank)" : ", ticked off") + ".";
    smartSave(); drawPage();
  };
  // 2026-10-20b: the knobs, on both steps, so she can try more or less and see it.
  const knobs = () => {
    const box = el("div", "smart-knobs");
    if (!s.start) s.start = d0.start;
    if (!Array.isArray(s.light)) s.light = d0.light;
    if (!s.budget) s.budget = d0.budget;
    if (!s.dayStart) s.dayStart = d0.dayStart;
    if (!s.dayEnd) s.dayEnd = d0.dayEnd;
    if (!s.spread) s.spread = d0.spread;
    if (s.piece === undefined) s.piece = 0;
    if (s.timeAll === undefined) s.timeAll = true;
    const today = isoDay(now);
    box.append(smartChips("Start from", [[today, "Today"], [addDayIso(today, 1), "Tomorrow"], [addDayIso(today, 2), "Day after"]], s.start,
      (v) => set({ start: v })));
    const easy = el("div", "smart-q");
    easy.append(el("span", "smart-q-label", "Go easy on"));
    [0, 1, 2, 3].map((n) => addDayIso(s.start, n)).forEach((d) => {
      const on = s.light.includes(d);
      const chip = button(dayHead(d, now), "smart-chip" + (on ? " on" : ""), () =>
        set({ light: on ? s.light.filter((x) => x !== d) : s.light.concat([d]) }));
      chip.setAttribute("aria-pressed", String(on));
      easy.append(chip);
    });
    easy.append(el("span", "muted smart-q-hint", "one new thing at most"));
    box.append(easy);
    box.append(smartChips("Work a day", [[120, "2 hours"], [180, "3 hours"], [240, "4 hours"], [300, "5 hours"], [360, "6 hours"], [480, "8 hours"]], s.budget,
      (v) => set({ budget: v })));
    box.append(smartChips("Day starts", [[7 * 60, "7am"], [8 * 60, "8am"], [9 * 60, "9am"], [10 * 60, "10am"], [11 * 60, "11am"]], s.dayStart,
      (v) => set({ dayStart: v })));
    box.append(smartChips("Day ends", [[17 * 60, "5pm"], [18 * 60, "6pm"], [19 * 60, "7pm"], [20 * 60, "8pm"], [21 * 60, "9pm"]], s.dayEnd,
      (v) => set({ dayEnd: v })));
    box.append(smartChips("Each piece", [[0, "Auto"], [15, "15 min"], [20, "20 min"], [30, "30 min"], [45, "45 min"]], s.piece,
      (v) => set({ piece: v })));
    box.append(smartChips("Spread", [["even", "Evenly across the days"], ["early", "Early as I can"]], s.spread,
      (v) => set({ spread: v })));
    box.append(smartChips("Your tasks", [[true, "Give them times too"], [false, "Leave their times"]], s.timeAll,
      (v) => set({ timeAll: v })));
    box.append(el("p", "muted smart-q-hint", "What's already on a day counts towards its time. Today starts from now. A 10 minute break after each one. Nothing goes after the deadline."));
    return box;
  };
  if (s.view === "ask") {
    card.append(el("p", "muted", "I've had a guess at each one. Fix anything that's wrong, pick your deadline, then press Make my plan."));
    const dl = el("label", "smart-deadline");
    dl.append(el("span", "", "Deadline for everything "));
    const pick = document.createElement("input");
    pick.type = "date";
    pick.value = s.deadline;
    pick.min = isoDay(now);
    pick.addEventListener("change", () => { if (pick.value) { s.deadline = pick.value; smartSave(); } });
    dl.append(pick);
    // 2026-10-19q: "or mass add the deadline".
    dl.append(button("Use this date for all", "quiet smart-all", () => {
      items.forEach((raw) => { const it = answer(raw); if (it.must !== false) s.answers[it.key] = { ...(s.answers[it.key] || {}), by: s.deadline }; });
      s.said = "Everything's due " + dayHead(s.deadline, now) + " now.";
      smartSave(); drawPage();
    }));
    card.append(dl);
    card.append(knobs());
    card.append(smartPrefsBox(s, items));                       // 2026-10-20c
    if (!items.length) { card.append(el("p", "muted", "Nothing to plan. Your days and the bank are empty.")); return card; }
    const list = el("div", "smart-list");
    items.forEach((raw) => {
      const it = answer(raw);
      const row = el("div", "smart-item" + (it.must === true ? " must" : it.must === "maybe" ? " maybe" : ""));
      const head = el("div", "smart-item-head");
      head.append(el("span", "smart-item-name", it.text));
      head.append(el("span", "smart-item-where", it.from === "day" ? dayHead(it.day, now) : it.from === "bank" ? "In the bank" : "Homework"));
      head.append(button("Done already", "quiet smart-done", () => doneAlready(it)));
      row.append(head);
      // 2026-10-20b: "which tasks are ok not to do": If there's time goes in only once the musts fit.
      const lvl = smartLevelOf(it, s.prefs);
      const fromSubject = (s.answers[it.key] || {}).must === undefined && lvl !== "normal";
      const shown = fromSubject ? (lvl === "skip" ? false : true) : it.must;
      row.append(smartChips("Needed?", [[true, "Must do"], ["maybe", "If there's time"], [false, "No"]], shown, (v) => setA(it, { must: v })));
      if (fromSubject) row.append(el("p", "muted smart-q-hint", "From your subjects: " + (SMART_LEVELS.find((l) => l[0] === lvl) || ["", lvl])[1]));
      if (shown !== false) {
        row.append(smartChips("What is it?", [["hw", "Homework"], ["test", "Test"], ["other", "Other"]], it.kind, (v) => setA(it, { kind: v })));
        if (it.kind === "test") {
          row.append(smartChips("Confident?", [["yes", "Yes"], ["kinda", "Kinda"], ["no", "No"]], it.confident, (v) => setA(it, { confident: v })));
        }
        const by = el("label", "smart-q");
        by.append(el("span", "smart-q-label", it.kind === "test" ? "Test day" : "Due"));
        const d = document.createElement("input");
        d.type = "date";
        d.value = it.by || "";
        d.addEventListener("change", () => setA(it, { by: d.value }));
        by.append(d, el("span", "muted smart-q-hint", it.by ? "" : "blank = the deadline"));
        row.append(by);
      }
      list.append(row);
    });
    card.append(list);
    const go = el("div", "smart-actions");
    go.append(button("Make my plan", "", () => { s.view = "plan"; s.said = ""; smartSave(); drawPage(); }),
              button("Close", "quiet", () => { page.smart = null; smartSave(); drawPage(); }));
    card.append(go);
    return card;
  }
  // The plan. 2026-10-20: at real times, coloured by subject, with what won't fit said.
  card.append(knobs());
  if (!Array.isArray(s.skip)) s.skip = [];
  const plan = smartPlan(items, s.answers, found, now, s.deadline,
    { start: s.start, light: s.light, budget: s.budget, dayStart: s.dayStart, dayEnd: s.dayEnd, spread: s.spread,
      piece: s.piece, timeAll: s.timeAll, skip: s.skip, prefs: s.prefs, nowMin: now.getHours() * 60 + now.getMinutes() });
  page.smartPlanNow = plan;
  const fresh = plan.steps.filter((st) => st.act === "add" || st.act === "move").length;
  const timed = plan.steps.filter((st) => st.act === "time" && st.at).length;
  if (!plan.steps.length) card.append(el("p", "muted", "Nothing's marked as needed. Go back and pick some."));
  if (plan.changes) card.append(el("p", "page-said", fresh + " new or moved (about " + minutesText(plan.minutes * 60) + ")" +
    (timed ? ", and " + timed + " of your tasks get a time" : "") + ". Up to " + minutesText(s.budget * 60) + " a day."));
  if (plan.late.length) card.append(el("p", "smart-late", "Already past the date: " + plan.late.join(", ") + ". They're on the first day."));
  if (plan.unplaced.length) card.append(el("p", "smart-late", "Won't fit before the deadline: " + plan.unplaced.join(", ") +
    ". Give yourself more time a day, shorter pieces, a later deadline, or make some “If there's time”."));
  if (plan.later && plan.later.length) card.append(el("p", "smart-later", "A bit a day, carried on after the deadline: " + plan.later.join(", ") + "."));
  if (s.skip.length) card.append(button("Put back the " + s.skip.length + " you took out", "quiet", () => set({ skip: [] })));
  Object.keys(plan.days).sort().forEach((day) => {
    const box = el("div", "smart-day");
    const total = plan.load[day] || 0;
    box.append(el("h3", "smart-day-head", dayHead(day, now) + "  ·  " + minutesText(total * 60) + " of " + minutesText(s.budget * 60)));
    plan.days[day].forEach((st) => {
      const line = el("div", "smart-step " + st.act);
      const colour = subjectColour(st.subject) || subjectColour(subjectFor({ text: st.text }));
      if (colour) { line.classList.add("subj"); line.style.setProperty("--subj", colour); }
      const span = timeParts(st.at);
      const own = mergedTimes(allDays(state.alldays), state.timesWaiting, Date.now())[st.id] || "";
      const ownSpan = timeParts(own);
      line.append(el("span", "smart-step-time", span ? clockWords(hhmm(span.start)) : ownSpan ? clockWords(hhmm(ownSpan.start)) : "no time"),
                  el("span", "smart-step-text", st.text),
                  el("span", "smart-step-tag", st.act === "add" ? "New" : st.act === "move" ? "Moved here" : st.act === "time" ? "Gets a time" : "Already here"));
      // 2026-10-20b: take one out of the plan.
      if (st.act !== "keep" || st.at) line.append(button("Skip", "quiet smart-skip", () => set({ skip: s.skip.concat([st.id]) })));
      box.append(line);
    });
    card.append(box);
  });
  const go = el("div", "smart-actions");
  if (plan.changes) {
    const setUp = button(s.busy ? "Setting it up..." : "Set it up", "", () => smartApply(plan));
    setUp.disabled = Boolean(s.busy);   // 2026-10-19s: one press only
    go.append(setUp);
  }
  go.append(button("Back", "quiet", () => { s.view = "ask"; smartSave(); drawPage(); }),
            button("Close", "quiet", () => { page.smart = null; smartSave(); drawPage(); }));
  card.append(go);
  return card;
}

// 2026-10-20c: her subjects and her words. She types what matters ("i HAVE
// to revise bio, english a bit a day") and presses Read it; each subject's
// chips show what it understood and she can change any.
function smartPrefsBox(s, items) {
  const box = el("div", "smart-prefs");
  box.append(el("span", "page-label", "What matters"));
  const words = el("textarea", "smart-words");
  words.placeholder = "Say it like you would to a friend: \u201cI HAVE to revise bio and finish all of DT. I should do physics. English a bit a day. Geo case study soonish. I have to do my Seneca.\u201d";
  words.value = s.prefs.said || "";
  words.setAttribute("aria-label", "What matters this week");
  const save = () => { keep("tutor-smart-prefs", s.prefs); smartSave(); drawPage(); };
  const read = button("Read it", "", () => {
    const got = smartReadWords(words.value, items);
    s.prefs = { subjects: { ...s.prefs.subjects, ...got.subjects }, words: { ...s.prefs.words, ...got.words }, said: words.value };
    const names = Object.keys(got.subjects).concat(Object.keys(got.words));
    s.said = names.length ? "Got it: " + names.map((n) => n + " " + ((SMART_LEVELS.find((l) => l[0] === (got.subjects[n] || got.words[n])) || ["", ""])[1]).toLowerCase()).join(", ") + "."
      : "I couldn't find a subject in that. Try \u201cI have to do bio\u201d.";
    save();
  });
  box.append(words, read);
  const keys = [...new Set(["biology", "chemistry", "physics", "maths", "english", "french", "geography", "dt", "business"]
    .concat(items.map((it) => smartSubjectKey(it.subject)).filter((k) => subjectColour(k))))]
    .filter((k) => items.some((it) => smartSubjectKey(it.subject) === k) || s.prefs.subjects[k]);
  const list = el("div", "smart-subjects");
  keys.forEach((k) => {
    const row = smartChips(k === "dt" ? "DT" : k[0].toUpperCase() + k.slice(1), [["normal", "Normal"]].concat(SMART_LEVELS),
      s.prefs.subjects[k] || "normal", (v) => { s.prefs.subjects = { ...s.prefs.subjects, [k]: v }; save(); });
    row.classList.add("smart-subject");
    const colour = subjectColour(k);
    if (colour) { row.classList.add("subj"); row.style.setProperty("--subj", colour); }
    list.append(row);
  });
  Object.keys(s.prefs.words || {}).forEach((w) => {
    const row = smartChips("\u201c" + w + "\u201d", [["normal", "Normal"]].concat(SMART_LEVELS), s.prefs.words[w],
      (v) => { s.prefs.words = { ...s.prefs.words, [w]: v }; save(); });
    list.append(row);
  });
  box.append(list);
  box.append(el("p", "muted smart-q-hint", "Every subject that isn\u2019t \u201cNot now\u201d gets something every day it has work. Must comes up most. A bit a day is one piece a day."));
  return box;
}

// 2026-10-20: the clean-up for what an earlier smart plan piled on her days.
// She sees the list and presses Remove; nothing goes till she does.
function smartCleanCard(found) {
  const list = smartLeftovers(found, recall("tutor-smart-made", []), new Date());
  if (!list.length && !page.cleanSaid) return null;
  const card = el("div", "page-card smart-clean");
  card.append(el("span", "page-label", "Clean up the smart plan"));
  if (page.cleanSaid) card.append(el("p", "page-said", page.cleanSaid));
  if (!list.length) { card.append(button("OK", "quiet", () => { page.cleanSaid = ""; drawPage(); })); return card; }
  card.append(el("p", "", "The last smart plan put " + list.length + " things on your days (the \u201cHW:\u201d and \u201cGo over\u201d ones). Your real tasks stay where they are."));
  const byDay = {};
  list.forEach((l) => { byDay[l.day] = (byDay[l.day] || 0) + 1; });
  card.append(el("p", "muted", Object.keys(byDay).sort().map((d) => dayHead(d, new Date()) + ": " + byDay[d]).join(" \u00b7 ")));
  const shown = el("details", "smart-clean-list");
  shown.append(el("summary", "", "See them"));
  list.forEach((l) => shown.append(el("div", "muted", dayHead(l.day, new Date()) + ": " + l.text)));
  card.append(shown);
  const go = button(page.cleaning ? "Removing..." : "Remove all " + list.length, "", () => smartClean(list));
  go.disabled = Boolean(page.cleaning);
  card.append(go);
  return card;
}

async function smartClean(list) {
  if (page.cleaning) return;
  page.cleaning = true;
  let done = 0;
  let gone = 0;
  const within = (p) => Promise.race([Promise.resolve(p), new Promise((r) => setTimeout(() => r("slow"), 8000))]);
  for (const l of list) {
    page.cleanSaid = "Removing: " + done + " of " + list.length + ". Keep this page open.";
    drawPage();
    try { if (await within(sendEdit({ kind: "day_del", day: l.day, text: l.text }))) gone += 1; } catch (error) { /* next one */ }
    done += 1;
  }
  page.cleaning = false;
  keep("tutor-smart-made", []);
  page.cleanSaid = "Sent " + gone + " to come off. The laptop takes them off in a minute or so while the tutor is open.";
  drawPage();
}

// 2026-10-19s: "set it up seems to be unresponsive". Each step is two trips
// to the cloud, one after another, and nothing showed till the end. Now it
// says how far it's got straight away, a second press does nothing, and a
// step that hangs or breaks is skipped after 8 seconds instead of stopping it.
async function smartApply(plan) {
  const s = page.smart;
  if (!s || s.busy) return;
  const todo = plan.steps.filter((st) => (st.act === "add" || st.act === "move") || ((st.act === "time" || st.act === "keep") && st.at));   // 2026-10-20b
  s.busy = true;
  let sent = 0;
  let done = 0;
  const failed = [];
  const tell = () => { s.said = "Setting it up: " + done + " of " + todo.length + ". Keep this page open."; drawPage(); };
  tell();
  const within = (p) => Promise.race([Promise.resolve(p), new Promise((r) => setTimeout(() => r("slow"), 8000))]);
  for (const st of todo) {
    let ok = false;
    try {
      if (st.act === "time" || st.act === "keep") ok = await within(sendEdit({ kind: "line_time", day: st.day, text: st.text, time: st.at }));   // 2026-10-20b: only a time
      else if (st.act === "add") ok = await within(sendEdit({ kind: "day_add", day: st.day, text: st.text }));
      else if (st.from === "bank") ok = await within(st.pick ? pickToDay({ text: st.text, from: BANK_PICK }, st.day, st.at || "") : moveLine({ text: st.text, from: BANK }, st.day));
      else ok = await within(moveLine({ text: st.text, from: st.from }, st.day));
      // 2026-10-20: "set it in the actual TIMED CALENDAR".
      if ((st.act === "add" || st.act === "move") && ok && st.at && !(st.from === "bank" && st.pick)) await within(sendEdit({ kind: "line_time", day: st.day, text: st.text, time: st.at }));
      if (ok && st.act === "add") keep("tutor-smart-made", recall("tutor-smart-made", []).concat([{ day: st.day, text: st.text }]).slice(-300));
    } catch (error) {
      console.log("[smart] step failed", st.text, error);
      ok = false;
    }
    if (ok === true || ok === "slow") sent += 1; else failed.push(st.text);
    done += 1;
    tell();
  }
  page.smart = null;
  smartSave();
  page.said = (sent ? "Smart plan's set up: " + sent + " " + (sent === 1 ? "change" : "changes") +
    ". The laptop takes them in a few seconds while the tutor is open." : "Couldn't send the plan. Are you online?") +
    (failed.length ? " Didn't go: " + failed.join(", ") + "." : "");
  drawPage();
}

// 2026-10-20d: her "today". One thing now, big; tick it and the next comes
// up. She can pick whatever she feels like (from today, or from another day,
// which brings it to today), say "Not today" (it goes to tomorrow), or push
// the rest of today later when she's running over. Below, today in loose
// blocks: morning, afternoon, evening, any time.
function pageRollover(found, today) {
  const last = recall("tutor-rolled", null);
  if (last === today) return;
  keep("tutor-rolled", today);
  if (last === null) return;                // the first time ever: it starts from tomorrow, nothing moves today
  const left = nowRollover(found, new Date(), locksNow(found));
  if (!left.length) return;
  left.forEach((l) => moveLine({ text: l.text, from: l.from }, today));
  page.said = "Morning. " + left.length + " from yesterday " + (left.length === 1 ? "is" : "are") + " on today now.";
}

function pageNowCard(day, lines, times, found) {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const card = el("div", "page-card now-card");
  const pick = nowPick(lines, day, times, nowMin, page.nowRaw);
  card.append(el("span", "page-label", "Now"));
  if (!pick) {
    card.append(el("p", "now-name", "Nothing left on today. Well done."));
  } else {
    const colour = subjectColour(subjectFor({ text: pick.raw }));
    if (colour) { card.classList.add("subj"); card.style.setProperty("--subj", colour); }
    card.append(el("p", "now-name", lineLabel(pick.raw)));
    const span = timeParts(times[day + "|" + pick.raw]);
    if (span) card.append(el("p", "muted", "Planned " + clockWords(hhmm(span.start)) + (span.end !== null ? " to " + clockWords(hhmm(span.end)) : "")));
    const row = el("div", "now-actions");
    row.append(
      button("Done", "now-done", () => {
        markDone(day, pick.raw, true, true);
        page.nowRaw = null;
        page.said = "Ticked off “" + lineLabel(pick.raw) + "”. Next one's up.";
        drawPage();
      }),
      button("Pick something else", "quiet", () => { page.nowChoose = !page.nowChoose; drawPage(); }),
      button("Not today", "quiet", () => {
        page.nowRaw = null;
        moveLine({ text: pick.raw, from: day }, addDayIso(day, 1));
        page.said = "“" + lineLabel(pick.raw) + "” is on tomorrow. That's fine.";
        drawPage();
      }));
    const late = el("div", "now-late");
    late.append(el("span", "muted", "Running over?"));
    [15, 30, 60].forEach((m) => late.append(button("+" + m + " min", "quiet", () => {
      shiftDay(day, m);
      page.said = "Everything still to come today is " + m + " minutes later.";
      drawPage();
    })));
    card.append(row, late);
  }
  // Today in blocks; press one to do it now.
  const blocks = nowBlocks(lines, day, times);
  const here = nowBlockOf(nowMin);
  const wrap = el("div", "now-blocks" + (page.nowChoose ? " open" : ""));
  NOW_BLOCKS.concat([["any", "Any time"]]).forEach(([key, label]) => {
    const list = blocks[key] || [];
    if (!list.length) return;
    const b = el("div", "now-block" + (key === here ? " here" : ""));
    b.append(el("p", "now-block-head", label + (key === here ? " (now)" : "")));
    list.forEach((l) => {
      const chip = button(lineLabel(l.raw), "now-chip" + (pick && l.raw === pick.raw ? " on" : ""), () => {
        page.nowRaw = l.raw; page.nowChoose = false; drawPage();
      });
      const c = subjectColour(subjectFor({ text: l.raw }));
      if (c) { chip.classList.add("subj"); chip.style.setProperty("--subj", c); }
      b.append(chip);
    });
    wrap.append(b);
  });
  card.append(wrap);
  // Something from another day: it comes to today.
  if (page.nowChoose) {
    const other = el("details", "now-other");
    other.append(el("summary", "", "Something from another day"));
    ((found && found.days) || []).filter((d) => d.day > day && d.day <= addDayIso(day, 7)).forEach((d) => {
      const open = d.lines.filter((l) => !l.done && String(l.text || "").trim() && !String(l.text).trim().startsWith(">"));
      if (!open.length) return;
      other.append(el("p", "now-block-head", dayHead(d.day, now)));
      open.forEach((l) => {
        const t = String(l.text).trim();
        const chip = button(lineLabel(t), "now-chip", () => {
          moveLine({ text: t, from: d.day }, day);
          page.nowRaw = t; page.nowChoose = false;
          page.said = "“" + lineLabel(t) + "” is on today now.";
          drawPage();
        });
        const c = subjectColour(subjectFor({ text: t }));
        if (c) { chip.classList.add("subj"); chip.style.setProperty("--subj", c); }
        other.append(chip);
      });
    });
    card.append(other);
  }
  return card;
}

function pageNotesCard(day, data) {
  const card = el("div", "page-card page-notes");
  card.append(el("span", "page-label", "Notes"));
  const box = el("textarea", "page-notes-box");
  box.placeholder = "How it went, what you thought about, what you got curious about.";
  box.value = data.notes;
  box.setAttribute("aria-label", "Notes for this day");
  box.addEventListener("input", () => {
    page.notesDirty = true;
    clearTimeout(page.notesTimer);
    page.notesTimer = setTimeout(() => {
      page.notesDirty = false;
      state.pages[day] = { ...(state.pages[day] || {}), notes: box.value };
      if (cloud) setDoc(doc(cloud.db, cloud.base + "pages/" + day), { notes: box.value, at: isoNow(new Date()) }, { merge: true }).catch(() => {});
    }, 800);
  });
  card.append(box);
  return card;
}

function pageCarryCard(day, lines, data) {
  const today = isoDay(new Date());
  const evening = new Date().getHours() >= 18;
  if (!(day < today || (day === today && evening))) return null;
  const left = carryList(lines, data.urgent);
  const card = el("div", "page-card page-carry");
  card.append(el("span", "page-label", "Carry over"));
  if (!left.length) { card.append(el("p", "muted", "Nothing left. Everything got done.")); return card; }
  const next = day < today ? today : addDayIso(day, 1);
  const where = next === today ? "today" : "tomorrow";
  card.append(el("p", "muted", "Mark what's urgent (!) so it goes first, then move it to " + where + "."));
  left.forEach((line) => {
    const item = el("div", "page-task" + (line.urgent ? " urgent" : ""));
    applySubject(item, line);
    const hot = button("!", "page-urgent" + (line.urgent ? " on" : ""), () => {
      const urgent = line.urgent ? data.urgent.filter((u) => u !== line.raw) : data.urgent.concat([line.raw]);
      savePage(day, { urgent });
    });
    hot.setAttribute("aria-pressed", String(line.urgent));
    hot.setAttribute("aria-label", "Urgent");
    item.append(hot, el("span", "page-task-name", lineLabel(line.text)),
      button("To " + where, "quiet", () => { moveLine({ text: line.raw, from: day }, next); drawPage(); }));
    card.append(item);
  });
  card.append(button("Move them all to " + where, "", () => {
    left.forEach((line) => moveLine({ text: line.raw, from: day }, next));
    page.said = left.length + " moved to " + where + ", urgent ones first.";
    drawPage();
  }));
  return card;
}

function drawPage() {
  const box = $("tab-page");
  if (!box) return;
  if (page.notesDirty && box.contains(document.activeElement) &&
      document.activeElement.classList.contains("page-notes-box")) return;   // she's writing
  const keepFocus = document.activeElement && box.contains(document.activeElement) && document.activeElement.tagName === "INPUT"
    ? { value: document.activeElement.value, ph: document.activeElement.placeholder } : null;
  const day = pageDayNow();
  const today = isoDay(new Date());
  const found = allDays(state.alldays);
  box.replaceChildren();
  const bar = el("div", "page-bar");
  bar.append(button("‹", "quiet page-step", () => { page.day = addDayIso(day, -1); page.held = null; page.said = ""; drawPage(); }),
             el("h2", "page-date", dayHead(day, new Date())),
             button("›", "quiet page-step", () => { page.day = addDayIso(day, 1); page.held = null; page.said = ""; drawPage(); }));
  if (day !== today) bar.append(button("Today", "quiet", () => { page.day = today; drawPage(); }));
  // 2026-10-19k: split with the calendar, or pop the planner out into its own small window.
  if (!narrow() && !isPopout()) bar.append(button(page.split ? "Just the page" : "Split view", "quiet page-split",
    () => { page.split = !page.split; selectTab("page"); drawPage(); }));
  if (!isPopout()) bar.append(button("Pop out", "quiet page-popout", () => {
    window.open(location.pathname + "?pop=page", "tutor-day", "popup,width=440,height=800");
  }));
  // 2026-10-20c: Doing now.
  bar.append(button(page.nowOpen ? "Close" : "+ Doing now", "quiet doing-now-go", () => { page.nowOpen = !page.nowOpen; drawPage(); }));
  // 2026-10-19o: smart plan.
  bar.append(button(page.smart ? "Close smart plan" : "Smart plan", "page-smart-go", () => {
    page.smart = page.smart ? null : { view: "ask", answers: {}, ...smartDefaults(new Date()), gone: {}, said: "" };   // 2026-10-19r
    smartSave();
    selectTab("page"); drawPage();
  }));
  bar.querySelectorAll(".page-step")[0].setAttribute("aria-label", "Day before");
  bar.querySelectorAll(".page-step")[1].setAttribute("aria-label", "Day after");
  box.append(bar);
  if (page.nowOpen) box.append(doingNowRow(() => { page.nowOpen = false; drawPage(); }));   // 2026-10-20c
  if (!found) { box.append(el("p", "muted", "Waiting for the laptop. Open the tutor and your days show up here.")); return; }
  const leftovers = smartCleanCard(found);                          // 2026-10-20
  if (leftovers) box.append(leftovers);
  if (page.smart) { box.append(pageSmartCard(found)); return; }   // 2026-10-19o
  const lines = pageLines(day);
  const times = pageTimes();
  const data = pageOf(day);
  // The night before: plan tomorrow, three steps.
  const tomorrow = addDayIso(today, 1);
  if (day === tomorrow) {
    const steps = pageSteps(lines, day, times, data.star);
    if (steps.some((s) => !s.done)) {
      const plan = el("div", "page-card page-plan");
      plan.append(el("span", "page-label", "Plan tomorrow tonight"));
      steps.forEach((s, i) => plan.append(el("div", "page-step-row" + (s.done ? " done" : ""),
        (s.done ? "✓ " : (i + 1) + ". ") + s.words + (s.key === "times" && !s.done && s.left ? " (" + s.left + " to go)" : ""))));
      box.append(plan);
    }
  } else if (day === today && new Date().getHours() >= 19) {
    box.append(button("Plan tomorrow", "page-plan-go", () => { page.day = tomorrow; drawPage(); }));
  }
  if (page.said) box.append(el("p", "page-said", page.said));
  if (day === today) { pageRollover(found, today); box.append(pageNowCard(day, lines, times, found)); }   // 2026-10-20d
  const top = el("div", "page-top");
  top.append(pageStarCard(day, lines, data), pageTrackCard(day, data));
  box.append(top);
  const body = el("div", "page-body");
  const right = el("div", "page-right");
  right.append(pageTaskList(day, lines, times), pageNotesCard(day, data), pageFunCard());   // 2026-10-19o: fun stuff bank
  const carry = pageCarryCard(day, lines, data);
  if (carry) right.append(carry);
  body.append(pageBlocksCard(day, lines, times, eventsNow(found, Date.now())), right);
  box.append(body);
  if (keepFocus) {
    const again = [...box.querySelectorAll("input")].find((i) => i.placeholder === keepFocus.ph);
    if (again) { again.value = keepFocus.value; again.focus(); }
  }
}

function drawAll() {
  drawRewards();
  drawLessons();
  drawToday(); drawSubjects(); drawSchool();
  drawPage();                           // 2026-10-19i
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
  // 2026-10-19k: a pop-out window (?pop=page) is only ever the Day page.
  const popout = isPopout();
  if (popout) key = "page";
  const name = tabName(key);
  if (!name) return;
  // 2026-10-20c: "i cant have the day plan as full screen until i click split
  // then i click just the page". Coming to the Day page from another page
  // always opens it full width; Split view is only while she's on it.
  if (key === "page" && state.tab !== "page") page.split = false;
  state.tab = key;
  if (key === "talk") setTimeout(talkToBottom, 0);     // 2026-10-18
  document.querySelectorAll(TAB_BUTTONS).forEach((other) => {
    const on = other.dataset.tab === key;
    other.setAttribute("aria-selected", String(on));
    other.tabIndex = on ? 0 : -1;
    show("tab-" + other.dataset.tab, on);
    if (on && focus) other.focus();
  });
  // 2026-10-19k: the Day page and the calendar share the screen when split.
  // 2026-10-19n: the width first, so a hiccup below can never leave the
  // Day page squeezed into one thin column.
  document.body.classList.toggle("wide-page", key === "calendar" || key === "page");
  const split = key === "page" && page.split && !page.smart && !narrow() && Boolean($("pair"));   // 2026-10-19q: smart plan gets the whole width
  if ($("pair")) show("pair", key === "page" || key === "calendar");
  show("tab-calendar", key === "calendar" || split);
  document.body.classList.toggle("split-view", split);
  if (split) drawCalendar();
  // A page off the side says its name; one on the top is already lit there.
  $("page-name").textContent = name;
  show("page-name", !tabOnTop(key));
  // 2026-10-10q: the calendar wants the width; every other page is a column.
  document.body.classList.toggle("wide-page", key === "calendar" || key === "page");
  document.body.classList.toggle("popout", popout);
  if (!popout) keep("tutor-tab", key);
}

// 2026-10-19k: opened by the Day page's "Pop out" button, in its own small window.
function isPopout() {
  try { return new URLSearchParams(location.search).get("pop") === "page"; } catch (e) { return false; }
}

// 2026-10-19k: once an hour, a small card asks her to look at her planner.
// It shows at most once an hour and never stacks.
function hourlyLook() {
  if ($("app").hidden) return;                          // not signed in yet
  const now = new Date();
  const hour = isoDay(now) + " " + now.getHours();
  if (recall("tutor-look-hour", "") === hour) return;
  if (document.querySelector(".look-toast")) return;
  keep("tutor-look-hour", hour);
  const card = el("div", "look-toast");
  card.setAttribute("role", "status");
  card.append(el("p", "", "It's " + hhmm(now.getHours() * 60 + now.getMinutes()) + ". Look at your day. What's next?"));
  const row = el("div", "look-toast-row");
  row.append(button("Open my day", "quiet", () => { selectTab("page"); card.remove(); }),
             button("Later", "quiet", () => card.remove()));
  card.append(row);
  document.body.append(card);
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
  setInterval(hourlyLook, 60000);      // 2026-10-19k: the hourly look
  setInterval(() => { if (state.chatWaiting.length) drawTalk(); }, 10000);   // 2026-10-17
  // 2026-10-10q: "Sent" on the notes gives way once the laptop has answered
  // or stopped answering, and a drag that never arrived goes back.
  setInterval(() => { drawNotes(); if (state.moves.length || state.picksWaiting.length) drawCalendarSoft(); }, 15000);
  state.calView = recall("tutor-cal", "three");
  state.calLayout = recall("tutor-cal-layout", "times");
  state.calFew = Number(recall("tutor-cal-few", "0")) || 0;
  state.calHidePast = recall("tutor-cal-hide-past", false) === true;     // 2026-10-18c
  state.calHoursLocked = recall("tutor-cal-hours-lock", "1") !== "0";   // 2026-10-16e
  setHourPx(Number(recall("tutor-cal-zoom", "48")) || 48);                // 2026-10-19c
  { const g = recall("tutor-gen-pick", null); if (g && typeof g === "object") state.genPick = g; }
  state.bankTab = String(recall("tutor-bank-tab", "") || "");          // 2026-10-16m
  try { state.bankShut = new Set(recall("tutor-bank-shut", []) || []); } catch (e) { state.bankShut = new Set(); }
  try { state.bankGroupsOpen = new Set(recall("tutor-bank-groups", []) || []); } catch (e) { state.bankGroupsOpen = new Set(); }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && (state.calPick || state.calMulti.length)) {
      state.calPick = null; state.calMulti = []; state.calMultiDelete = false; drawCalendar();
    }
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
    siteBeat();                           // 2026-10-18e
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
      drawTasks(); drawCalendarSoft(); drawPage();
    }));
    stops.push(onSnapshot(collection(db, base + "pages"), (snap) => {   // 2026-10-19i
      const pages = {};
      snap.docs.forEach((d) => { pages[d.id] = d.data(); });
      state.pages = pages;
      drawPage(); drawToday();
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
