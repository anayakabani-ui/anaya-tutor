// Everything here is plain logic with no browser and no Firebase in it, so
// it can be tested by itself. app.js does the screen and the cloud.

export const NOT_SUBJECTS = ["tutor group", "assembly", "unscheduled", "eca",
                             "break", "lunch", "registration"];
export const BASICS = ["Breakfast", "Lunch", "Fruit", "Fajr", "Dhuhr", "Asr",
                       "Maghrib", "Isha"];
export const REFLECT_EVERY_SEC = 20 * 60;
export const CHAT_MAX_CHARS = 700000;

export function isoDay(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

// Local time, no zone on the end, the same shape the laptop writes.
export function isoNow(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return isoDay(date) + "T" + pad(date.getHours()) + ":" + pad(date.getMinutes()) +
         ":" + pad(date.getSeconds());
}

export function daysUntil(iso, today) {
  if (!iso) return null;
  const then = new Date(String(iso).slice(0, 10) + "T00:00:00");
  if (isNaN(then)) return null;
  const from = new Date(isoDay(today) + "T00:00:00");
  return Math.round((then - from) / 86400000);
}

// 12 hour time everywhere she reads it, the same as the desktop app.
export function clock12(iso) {
  const when = new Date(iso);
  if (isNaN(when)) return "";
  let hour = when.getHours();
  const tail = hour >= 12 ? "pm" : "am";
  hour = hour % 12 || 12;
  return hour + ":" + String(when.getMinutes()).padStart(2, "0") + tail;
}

export function dayText(iso, today) {
  const left = daysUntil(iso, today);
  if (left === 0) return "today";
  if (left === -1) return "yesterday";
  const when = new Date(String(iso).slice(0, 10) + "T00:00:00");
  if (isNaN(when)) return "";
  return when.getDate() + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul",
    "Aug", "Sep", "Oct", "Nov", "Dec"][when.getMonth()];
}

export function minutesText(seconds) {
  const mins = Math.round((seconds || 0) / 60);
  if (mins < 60) return mins + " min";
  return Math.floor(mins / 60) + " h " + (mins % 60) + " min";
}

export function sizeText(bytes) {
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB";
  return Math.max(1, Math.round((bytes || 0) / 1024)) + " KB";
}

export function inDays(n) {
  if (n === null) return "";
  if (n < 0) return Math.abs(n) + (n === -1 ? " day late" : " days late");
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  return "in " + n + " days";
}

// Her list the way the desktop note shows it: one line a task in her own
// order, a gap between blocks, a temporary list under its own name, and a
// bit of a task indented under it. Ticked ones are left out, as on the note.
// pending is the set of task ids she's just ticked here and the laptop
// hasn't taken yet: shown ticked straight away so the press feels instant.
export function noteLines(tasks, today, pending) {
  const waiting = pending || new Set();
  const open = tasks.filter((t) => !t.done).sort((a, b) =>
    (a.order ?? 999999) - (b.order ?? 999999) || Number(a.id) - Number(b.id));
  const out = [];
  let last = null;
  open.forEach((task) => {
    const key = task.list ? "list:" + task.list : "block:" + (task.block ?? 0);
    if (!task.parent && key !== last) {
      if (last !== null) out.push({ kind: "gap" });
      if (task.list) out.push({ kind: "head", text: task.list });
      last = key;
    }
    const left = daysUntil(task.due, today);
    out.push({ kind: "line", id: String(task.id), text: task.name || "",
               done: waiting.has(String(task.id)), bold: Boolean(task.bold),
               sub: Boolean(task.parent), due: inDays(left),
               soon: left !== null && left <= 1 });
  });
  return out;
}

// Today's note the same way: blank lines are gaps, a line ending in a
// colon is a heading, everything else has a box.
// pending is a Map of line text to the tick she's just given it here.
export function todayLines(lines, pending) {
  const waiting = pending || new Map();
  return (lines || []).map((line) => {
    const text = String(line.text || "").trim();
    if (!text) return { kind: "gap" };
    if (text.endsWith(":")) return { kind: "head", text: text.slice(0, -1) };
    return { kind: "line", text,
             done: waiting.has(text) ? waiting.get(text) : Boolean(line.done),
             group: BASICS.includes(text), optional: Boolean(line.optional) };
  });
}

// A tick she made here stops being "pending" once the laptop's copy agrees
// with it, or after two minutes if the laptop never answers (so a box
// can't stay ticked here forever while the laptop is off).
export function settleTicks(pendingTasks, tasks, pendingToday, lines, madeAt, nowMs) {
  const open = new Set(tasks.filter((t) => !t.done).map((t) => String(t.id)));
  [...pendingTasks].forEach((id) => {
    if (!open.has(id) || nowMs - (madeAt.get("t:" + id) || 0) > 120000) {
      pendingTasks.delete(id);
    }
  });
  const real = new Map((lines || []).map((l) => [String(l.text || "").trim(),
                                                 Boolean(l.done)]));
  [...pendingToday.keys()].forEach((text) => {
    if (real.get(text) === pendingToday.get(text) ||
        nowMs - (madeAt.get("d:" + text) || 0) > 120000) {
      pendingToday.delete(text);
    }
  });
}

// Subjects, the closest deadline first. A subject's place is the nearest
// of its next test and its nearest open homework. Nothing dated goes last.
export function rankSubjects(timetable, exams, tasks, today) {
  const found = new Map();
  const get = (name) => {
    const clean = String(name || "").trim();
    if (!clean || NOT_SUBJECTS.includes(clean.toLowerCase())) return null;
    const key = clean.toLowerCase();
    if (!found.has(key)) {
      found.set(key, { name: clean, exam: null, examInfo: "", due: null,
                       dueName: "", open: 0 });
    }
    return found.get(key);
  };
  timetable.forEach((row) => get(row.subject));
  exams.forEach((exam) => {
    const subject = get(exam.subject);
    const left = daysUntil(exam.date, today);
    if (!subject || left === null || left < 0) return;
    if (subject.exam === null || left < subject.exam) {
      subject.exam = left;
      subject.examInfo = exam.topic || exam.paper || "";
    }
  });
  tasks.forEach((task) => {
    if (task.done) return;
    const subject = get(task.subject);
    if (!subject) return;
    subject.open += 1;
    const left = daysUntil(task.due, today);
    if (left !== null && (subject.due === null || left < subject.due)) {
      subject.due = left;
      subject.dueName = task.name;
    }
  });
  const nearest = (s) => Math.min(s.exam === null ? Infinity : s.exam,
                                  s.due === null ? Infinity : s.due);
  return [...found.values()].sort((a, b) =>
    nearest(a) - nearest(b) || b.open - a.open || a.name.localeCompare(b.name));
}

export function youtubeToday(visits, today) {
  const day = isoDay(today);
  const mine = visits.filter((v) => (v.day || String(v.started).slice(0, 10)) === day)
                     .sort((a, b) => String(a.started).localeCompare(String(b.started)));
  const seconds = mine.reduce((sum, v) => sum + (v.seconds || 0), 0);
  return { visits: mine, seconds };
}

// One question for every full 20 minutes of YouTube today, less the ones
// she's already answered. Only ever one on screen: due is how many are
// owed, and answering one takes it down by one.
export function reflectionDue(visits, reflections, today) {
  const day = isoDay(today);
  const seconds = youtubeToday(visits, today).seconds;
  const answered = reflections.filter((r) =>
    (r.day || String(r.at).slice(0, 10)) === day).length;
  const owed = Math.max(0, Math.floor(seconds / REFLECT_EVERY_SEC) - answered);
  return { due: owed, seconds, answered,
           mark: (answered + 1) * (REFLECT_EVERY_SEC / 60) };
}

// 2026-10-03: the review is about everything now, not only YouTube. The
// laptop writes an "ask" after every 20 minutes she's at it; this finds
// the newest one she hasn't answered. Only today's, and only from the
// last three hours: nobody remembers what they did before that. One at a
// time, however many are waiting.
export const REVIEW_KEEP_MIN = 180;
export function reviewDue(asks, reflections, now) {
  const answered = new Set(reflections.map((r) => String(r.ask || "")));
  const day = isoDay(now);
  const waiting = asks.filter((a) => {
    if (answered.has(String(a.id))) return false;
    if ((a.day || String(a.at).slice(0, 10)) !== day) return false;
    const age = (now - new Date(a.at)) / 60000;
    return age >= 0 && age <= REVIEW_KEEP_MIN;
  }).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return { ask: waiting[0] || null, waiting: waiting.length };
}

export function reviewWords(ask) {
  if (!ask) return "";
  const tube = ask.youtube_seconds >= 60
    ? " YouTube was open for " + minutesText(ask.youtube_seconds) + " of it." : "";
  return "What did you do from " + clock12(ask.from) + " to " + clock12(ask.at) + "?" + tube;
}

export function reviewProblem(note) {
  const text = String(note || "").trim();
  // 2026-10-06j: "ate..." was turned down ("as long as its not 2 letters
  // it should accept this"). Three letters or numbers in all is enough.
  if ((text.match(/[\p{L}\p{N}]/gu) || []).length < 3) {
    return "Say what you actually did, a few words is fine.";
  }
  return "";
}

// How she answered over the last week, for the YouTube tab.
export function reflectionTally(reflections, today, days = 7) {
  const tally = { worth: 0, okay: 0, not: 0 };
  reflections.forEach((r) => {
    const back = daysUntil(r.day || String(r.at).slice(0, 10), today);
    if (back === null || back > 0 || back <= -days) return;
    if (tally[r.answer] !== undefined) tally[r.answer] += 1;
  });
  return tally;
}

// ---- The ring. "analytics drawn as a ring (like a circle timer, not a
// plain pie chart) with total time in the middle and a switch between
// useful time and wasted time." Each answer to the 20 minute question
// covers a stretch of time; this adds those up by what she called it.
export const RING_KEYS = ["worth", "okay", "not"];
// 2026-10-06j: "instead of ok it sohuld be 'mixed' so its like bad AND good".
export const RING_NAMES = { worth: "Useful", okay: "Mixed", not: "Wasted" };

// Minutes one answer stands for: from..to when both are there and sane,
// otherwise the 20 it was asked about.
export function reflectionMinutes(r) {
  const from = new Date(r.from), to = new Date(r.to);
  if (!isNaN(from) && !isNaN(to)) {
    const mins = Math.round((to - from) / 60000);
    if (mins >= 1 && mins <= 90) return mins;
  }
  return 20;
}

export function ringTime(reflections, today, days = 7) {
  const time = { worth: 0, okay: 0, not: 0, total: 0, answers: 0 };
  reflections.forEach((r) => {
    const back = daysUntil(r.day || String(r.at).slice(0, 10), today);
    if (back === null || back > 0 || back <= -days) return;
    if (time[r.answer] === undefined || !RING_KEYS.includes(r.answer)) return;
    const mins = reflectionMinutes(r);
    time[r.answer] += mins; time.total += mins; time.answers += 1;
  });
  return time;
}

// "1h 20m", "45m", "0m".
export function ringWords(minutes) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return m + "m";
  return Math.floor(m / 60) + "h" + (m % 60 ? " " + (m % 60) + "m" : "");
}

// The arcs to draw: for each kind with any time, where it starts and how
// long it is, as fractions of the whole circle, with a small gap between.
export function ringParts(time, gap = 0.018) {
  const live = RING_KEYS.filter((key) => time[key] > 0);
  if (!live.length || !time.total) return [];
  const room = 1 - (live.length > 1 ? gap * live.length : 0);
  let at = 0;
  return live.map((key) => {
    const share = time[key] / time.total;
    const part = { key, share, start: at, length: share * room,
                   percent: Math.round(share * 100) };
    at += share * room + (live.length > 1 ? gap : 0);
    return part;
  });
}

// What the middle of the ring says for the view she's picked.
export function ringMiddle(time, view) {
  if (view === "worth" || view === "not") {
    return { big: ringWords(time[view]), small: RING_NAMES[view].toLowerCase() + " time" };
  }
  return { big: ringWords(time.total), small: "last 7 days" };
}

// ---- 2026-10-04: her time, properly. Two views only: All (which apps
// and sites, and how long) and Useful (how much of it she called useful).
// Over today, a week, or her own number of hours or days.

// The laptop sends one document a day: {day, hours: '{"16":{"YouTube":600}}'}.
export function parseUsage(docs) {
  const rows = [];
  (docs || []).forEach((doc) => {
    let hours = {};
    try { hours = typeof doc.hours === "string" ? JSON.parse(doc.hours) : (doc.hours || {}); }
    catch (error) { hours = {}; }
    Object.entries(hours).forEach(([hour, apps]) => {
      Object.entries(apps || {}).forEach(([label, seconds]) => {
        const n = Number(seconds);
        if (doc.day && n > 0) rows.push({ day: String(doc.day), hour: Number(hour), label, seconds: n });
      });
    });
  });
  return rows;
}

// range: {kind: "today" | "week" | "custom", n, unit: "hours" | "days"}.
export function rangeBounds(range, now) {
  const to = now.getTime();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const kind = range && range.kind;
  if (kind === "week") return { from: midnight - 6 * 86400000, to };
  if (kind === "custom") {
    const n = Math.max(1, Math.min(Number(range.n) || 1, range.unit === "hours" ? 720 : 120));
    if (range.unit === "hours") return { from: to - n * 3600000, to };
    return { from: midnight - (n - 1) * 86400000, to };
  }
  return { from: midnight, to };
}

export function rangeWords(range) {
  if (range && range.kind === "week") return "last 7 days";
  if (range && range.kind === "custom") {
    const n = Math.max(1, Number(range.n) || 1);
    const unit = range.unit === "hours" ? "hour" : "day";
    return "last " + (n === 1 ? unit : n + " " + unit + "s");
  }
  return "today";
}

// Time per app inside the range, biggest first. Usage is kept an hour at
// a time, so an hour counts when any of it falls inside.
export function usageTotals(rows, bounds) {
  const by = new Map();
  let total = 0;
  rows.forEach((r) => {
    const start = new Date(r.day + "T00:00:00").getTime() + r.hour * 3600000;
    if (isNaN(start) || start + 3600000 <= bounds.from || start > bounds.to) return;
    by.set(r.label, (by.get(r.label) || 0) + r.seconds);
    total += r.seconds;
  });
  const apps = [...by.entries()].map(([label, seconds]) => ({ label, seconds }))
    .sort((a, b) => b.seconds - a.seconds || a.label.localeCompare(b.label));
  return { apps, total };
}

// The arcs for the All view: the biggest few by name, the rest together.
export function appParts(totals, most = 5, gap = 0.018) {
  if (!totals.total) return [];
  const named = totals.apps.slice(0, most).map((a) => ({ ...a }));
  const rest = totals.apps.slice(most).reduce((n, a) => n + a.seconds, 0);
  if (rest > 0) named.push({ label: "Everything else", seconds: rest, rest: true });
  const room = 1 - (named.length > 1 ? gap * named.length : 0);
  let at = 0;
  return named.map((a, index) => {
    const share = a.seconds / totals.total;
    const part = { ...a, index, share, start: at, length: share * room, percent: Math.round(share * 100) };
    at += share * room + (named.length > 1 ? gap : 0);
    return part;
  });
}

export function secondsWords(seconds) {
  const m = Math.round(Math.max(0, seconds) / 60);
  if (m < 1 && seconds > 0) return "<1m";
  return ringWords(m);
}

// The Useful view: minutes she called useful, okay and wasted in the
// range, and how many things she ticked off in it.
export function usefulTotals(reflections, history, bounds) {
  const out = { worth: 0, okay: 0, not: 0, total: 0, answers: 0, tasks: 0 };
  (reflections || []).forEach((r) => {
    const at = new Date(r.at || (r.day + "T12:00:00")).getTime();
    if (isNaN(at) || at < bounds.from || at > bounds.to) return;
    if (!RING_KEYS.includes(r.answer)) return;
    const mins = reflectionMinutes(r);
    out[r.answer] += mins; out.total += mins; out.answers += 1;
  });
  out.tasks = doneEvents(history, bounds).length;
  return out;
}

// ---- Task history: every tick, untick, add and removal, with its time.
export const HISTORY_WORDS = { done: "Done", undone: "Unticked", added: "Added",
                               removed: "Removed", renamed: "Renamed" };

// "Done" events in the range, net of unticks: a line ticked, unticked and
// ticked again is one thing done, and one ticked then unticked is none.
export function doneEvents(history, bounds) {
  const state = new Map();
  [...(history || [])].sort((a, b) => String(a.at).localeCompare(String(b.at)) || Number(a.id) - Number(b.id))
    .forEach((h) => {
      const at = new Date(h.at).getTime();
      if (isNaN(at) || at < bounds.from || at > bounds.to) return;
      const key = h.list + "|" + String(h.at).slice(0, 10) + "|" + h.text;
      if (h.what === "done") state.set(key, h);
      else if (h.what === "undone") state.delete(key);
    });
  return [...state.values()];
}

// 2026-10-19n: "timeblocks sohuld fill in AFTER i finish that hour to show
// what i did in that hour taskwise like praying namaz, eeating". What was
// ticked off on that day, by half hour (minutes from midnight), up to now.
export function pageDoneBySlot(history, day, nowMs) {
  const from = new Date(day + "T00:00:00").getTime();
  const to = Math.min(new Date(day + "T23:59:59").getTime(), nowMs);
  const out = {};
  if (isNaN(from) || to < from) return out;
  doneEvents(history, { from, to }).forEach((h) => {
    const d = new Date(h.at);
    const m = d.getHours() * 60 + d.getMinutes();
    const slot = m - (m % 30);
    const text = String(h.text || "").trim();
    if (!text) return;
    out[slot] = out[slot] || [];
    if (!out[slot].includes(text)) out[slot].push(text);
  });
  return out;
}

// which: "main" or "today". Newest day first, newest first inside a day.
export function historyDays(history, which, search) {
  const want = String(search || "").trim().toLowerCase();
  const days = new Map();
  (history || []).filter((h) => h && h.list === which && h.at)
    .filter((h) => !want || (String(h.text) + " " + (HISTORY_WORDS[h.what] || h.what) + " " + h.at)
      .toLowerCase().includes(want))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)) || Number(b.id) - Number(a.id))
    .forEach((h) => {
      const day = String(h.at).slice(0, 10);
      if (!days.has(day)) days.set(day, []);
      days.get(day).push({ at: h.at, what: h.what, words: HISTORY_WORDS[h.what] || h.what, text: String(h.text || "") });
    });
  return [...days.entries()].map(([day, rows]) => ({ day, rows }));
}

// ---- 2026-10-10i: whole saved copies of her list ("save all tasks to
// history ... on the pwa i can go to history and ill be able to revert it
// as i want"). Newest first, with the words each row shows.
export function savedCopies(copies, today) {
  return (copies || []).filter((c) => c && c.at)
    .map((c) => {
      const iso = String(c.at).replace(" ", "T");
      const open = Number(c.open) || 0;
      const lists = String(c.lists || "").split(",").map((n) => n.trim()).filter(Boolean);
      const bits = [open + (open === 1 ? " thing" : " things")];
      if (lists.length) bits.push(lists.length + (lists.length === 1 ? " temporary list" : " temporary lists"));
      return { id: String(c.id), at: iso, when: lessonDayWords(iso, today) + ", " + clock12(iso),
               label: String(c.label || "Saved"), counts: bits.join(", "), lists,
               text: String(c.text || ""), today: String(c.today || ""),
               sameDay: String(c.day || iso.slice(0, 10)) === isoDay(today) };
    })
    .sort((a, b) => b.at.localeCompare(a.at) || Number(b.id) - Number(a.id));
}

// What "Go back to this" says before the second press.
export function goBackWords(copy) {
  return "Your list and temporary lists go back to how they were at " + copy.when +
    (copy.sameDay ? ", and Today with them" : ". Today is left alone (that copy is from another day)") +
    ". How things are now is saved first, so you can come back.";
}

// ---- The day, hour by hour: what was in front and what got done.
export function hourWords(hour) {
  const name = (h) => (h % 12 || 12) + (h % 24 < 12 ? "am" : "pm");
  const a = name(hour), b = name(hour + 1);
  return a.slice(-2) === b.slice(-2) ? a.slice(0, -2) + " to " + b : a + " to " + b;
}

export function dayHours(usageRows, history, day) {
  const hours = new Map();
  const at = (h) => { if (!hours.has(h)) hours.set(h, { hour: h, apps: new Map(), seconds: 0, youtube: 0, tasks: [] }); return hours.get(h); };
  usageRows.filter((r) => r.day === day).forEach((r) => {
    const slot = at(r.hour);
    slot.apps.set(r.label, (slot.apps.get(r.label) || 0) + r.seconds);
    slot.seconds += r.seconds;
    if (r.label === "YouTube") slot.youtube += r.seconds;
  });
  const from = new Date(day + "T00:00:00").getTime();
  doneEvents(history, { from, to: from + 86400000 - 1 }).forEach((h) => {
    at(new Date(h.at).getHours()).tasks.push(h.text);
  });
  const rows = [...hours.values()].sort((a, b) => a.hour - b.hour).map((slot) => ({
    hour: slot.hour, words: hourWords(slot.hour), seconds: slot.seconds, youtube: slot.youtube,
    tasks: slot.tasks,
    apps: [...slot.apps.entries()].map(([label, seconds]) => ({ label, seconds }))
      .sort((a, b) => b.seconds - a.seconds).slice(0, 3) }));
  const best = rows.reduce((top, r) => (r.tasks.length > (top ? top.tasks.length : 0) ? r : top), null);
  return { rows, best: best && best.tasks.length >= 2 ? best.hour : null };
}

// One honest line about an hour.
export function hourLine(row) {
  const bits = [];
  if (row.tasks.length) bits.push(row.tasks.length + (row.tasks.length === 1 ? " task done" : " tasks done"));
  row.apps.forEach((a) => bits.push(a.label + " " + secondsWords(a.seconds)));
  return bits.join(", ");
}

// ---- "Hide optional" and "Done at the bottom", for the website's lists.
const OPTIONAL_TEXT = /\((?:optional|opt)\)\s*$/i;
export function viewLines(lines, view) {
  let out = lines.slice();
  if (view && view.hideOptional) {
    out = out.filter((l) => l.kind !== "line" || !(l.optional || OPTIONAL_TEXT.test(l.text || "")));
  }
  if (view && view.doneLast) {
    const sunk = out.filter((l) => l.kind === "line" && l.done && !l.group);
    out = out.filter((l) => !(l.kind === "line" && l.done && !l.group));
    if (sunk.length) {
      while (out.length && out[out.length - 1].kind === "gap") out.pop();
      if (out.length) out.push({ kind: "gap" });
      out = out.concat(sunk);
    }
  }
  // No two gaps in a row, none at either end.
  out = out.filter((l, i) => !(l.kind === "gap" && (i === 0 || out[i - 1].kind === "gap")));
  while (out.length && out[out.length - 1].kind === "gap") out.pop();
  return out;
}

export function hiddenOptional(lines) {
  return lines.filter((l) => l.kind === "line" && (l.optional || OPTIONAL_TEXT.test(l.text || ""))).length;
}

// Main tasks ticked today, as lines for the bottom of the Tasks tab.
export function doneTodayLines(tasks, today) {
  const day = isoDay(today);
  return tasks.filter((t) => t.done && String(t.done_at || "").slice(0, 10) === day)
    .sort((a, b) => String(a.done_at).localeCompare(String(b.done_at)))
    .map((t) => ({ kind: "line", id: String(t.id), text: t.name || "", done: true,
                   bold: false, sub: false, due: clock12(String(t.done_at).replace(" ", "T")), soon: false, locked: true }));
}

// ------------------------------------------------------------ Gemini chats
const YOU = /^\s*(?:you said|you|me|anaya)\s*:?\s*$/i;
const GEMINI = /^\s*(?:gemini said|gemini|model|show thinking)\s*:?\s*$/i;
const YOU_INLINE = /^\s*you said\s*:?\s+(\S.*)$/i;
const GEMINI_INLINE = /^\s*gemini said\s*:?\s+(\S.*)$/i;
const JUNK = [/^\s*gemini is ai and can make mistakes\.?.*$/i,
              /^\s*gemini can make mistakes.*$/i,
              /^\s*(?:pro|flash|thinking|fast|tools|canvas|deep research)\s*$/i,
              /^\s*conversation with gemini\s*$/i,
              /^\s*(?:new chat|search chats|recents)\s*$/i];

// A chat copied out of Gemini, split into who said what. With no "You
// said" / "Gemini said" lines in it the whole thing is kept as one note,
// never thrown away.
export function parseGeminiChat(raw) {
  const text = String(raw || "").replace(/\r\n?/g, "\n").replace(/ /g, " ");
  const turns = [];
  let who = "";
  let lines = [];
  const close = () => {
    const body = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (body) turns.push({ who: who || "note", text: body });
    lines = [];
  };
  text.split("\n").forEach((line) => {
    if (JUNK.some((rule) => rule.test(line))) return;
    let inline = line.match(YOU_INLINE);
    if (YOU.test(line) || inline) {
      close(); who = "you"; if (inline) lines.push(inline[1]); return;
    }
    inline = line.match(GEMINI_INLINE);
    if (GEMINI.test(line) || inline) {
      close(); who = "gemini"; if (inline) lines.push(inline[1]); return;
    }
    lines.push(line);
  });
  close();
  // Anything before the first "You said" is the page around the chat
  // (her list of other chats). It isn't part of this one.
  if (turns.length > 1 && turns[0].who === "note") turns.shift();
  const assessed = text.match(/=== FINAL ASSESSMENT ===([\s\S]*?)(?:=== END ===|$)/);
  const firstYou = turns.find((t) => t.who === "you");
  const opening = (firstYou || turns[0] || { text: "" }).text.split("\n")[0].trim();
  return {
    turns,
    assessment: assessed ? assessed[1].trim() : "",
    title: opening.length > 60 ? opening.slice(0, 57).trimEnd() + "..." : opening,
  };
}

// The subject a chat is about, from the words in it. Blank if none fits.
export function guessSubject(text, subjects) {
  const low = " " + String(text || "").toLowerCase() + " ";
  let best = "";
  let most = 0;
  subjects.forEach((name) => {
    const word = String(name).toLowerCase();
    if (!word) return;
    const hits = low.split(word).length - 1;
    if (hits > most) { most = hits; best = name; }
  });
  return best;
}

export function chatProblem(raw) {
  const text = String(raw || "").trim();
  if (text.length < 20) return "Paste the chat in first.";
  if (text.length > CHAT_MAX_CHARS) {
    return "That's too long to save in one go. Paste it in two halves.";
  }
  return "";
}

// -------------------------------------------------------------- her files
export const FILE_TYPES = { pdf: "application/pdf", png: "image/png",
  jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
  txt: "text/plain" };

const KIND_ORDER = ["Past paper", "Mark scheme", "Notes"];

// Her REVISION folder as the Papers tab shows it: subjects A to Z, and in
// each one papers, then mark schemes, then notes.
export function groupMaterials(materials) {
  const subjects = new Map();
  materials.forEach((file) => {
    const name = file.subject || "Other";
    if (!subjects.has(name)) subjects.set(name, []);
    subjects.get(name).push(file);
  });
  return [...subjects.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, files]) => ({
      name,
      files: files.sort((a, b) =>
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
        String(a.path).localeCompare(String(b.path))),
    }));
}

// 2026-10-03: the Papers tab, laid out the way she asked. Subject, then
// exam, then four shelves. A paper and its mark scheme are one folder.
export const SHELVES = [
  ["weak", "Recommended: weakness target"],
  ["everything", "Recommended: everything paper"],
  ["general", "General past papers"],
  ["module", "Module booklets"],
  ["holiday", "Holiday booklets"],
];
const SHELF_KEYS = SHELVES.map(([key]) => key);

export function paperTitle(name) {
  return String(name || "").replace(/\.[a-z0-9]+$/i, "")
    .replace(/^Anaya Kabani - /i, "")
    .replace(/\s*\((?:Questions|Mark Scheme)\)\s*$/i, "")
    .replace(/\s+(?:QP|MS)$/i, "").replace(/\s+-\s+Mark Scheme$/i, "")
    .replace(/[-_]{2,}/g, " ").replace(/\s+/g, " ").trim();
}

export function groupPapers(materials) {
  const subjects = new Map();
  materials.forEach((file) => {
    const subject = file.subject || "Other";
    const exam = file.exam || "Term 1 Exam 1";
    if (!subjects.has(subject)) subjects.set(subject, new Map());
    const exams = subjects.get(subject);
    if (!exams.has(exam)) {
      const fresh = { name: exam, notes: [] };
      SHELF_KEYS.forEach((key) => { fresh[key] = new Map(); });
      exams.set(exam, fresh);
    }
    const place = exams.get(exam);
    const shelf = SHELF_KEYS.includes(file.shelf) ? file.shelf : "notes";
    if (shelf === "notes" || !["paper", "scheme", "both"].includes(file.role)) {
      place.notes.push(file);
      return;
    }
    const key = file.pair || file.path;
    if (!place[shelf].has(key)) {
      place[shelf].set(key, { key, title: "", paper: null, scheme: null,
                              marks: 0, minutes: 0 });
    }
    const folder = place[shelf].get(key);
    if (file.role === "scheme") {
      if (!folder.scheme) folder.scheme = file;
    } else if (!folder.paper) {
      folder.paper = file;
      if (file.role === "both") folder.scheme = file;
      folder.marks = file.marks || 0;
      folder.minutes = file.minutes || 0;
    } else {
      // A second paper with the same key (a copy): its own folder.
      place[shelf].set(file.path, { key: file.path, title: paperTitle(file.name),
        paper: file, scheme: file.role === "both" ? file : null,
        marks: file.marks || 0, minutes: file.minutes || 0 });
    }
  });
  const byTitle = (a, b) => a.title.localeCompare(b.title, undefined, { numeric: true });
  return [...subjects.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, exams]) => ({
      name,
      exams: [...exams.values()].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true })).map((exam) => {
        const shelf = (map) => [...map.values()].map((f) => ({
          ...f, title: f.title || paperTitle((f.paper || f.scheme).name) })).sort(byTitle);
        const out = { name: exam.name,
          notes: exam.notes.sort((a, b) =>
            String(a.name).localeCompare(String(b.name), undefined, { numeric: true })) };
        SHELF_KEYS.forEach((key) => { out[key] = shelf(exam[key]); });
        return out;
      }),
    }));
}

// 1.05 minutes a mark (an Edexcel science paper is 1 hour 45 for 100
// marks), to the nearest five. For a paper whose marks she types in.
export function minutesForMarks(marks) {
  const n = Number(marks);
  if (!n || n < 0) return 0;
  return Math.max(5, Math.round(n * 1.05 / 5) * 5);
}

export function clockText(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const pad = (n) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600);
  return (h ? h + ":" + pad(Math.floor(s % 3600 / 60)) : String(Math.floor(s / 60))) +
         ":" + pad(s % 60);
}

// 2026-10-11h: "i want to be abke to have the option to say im gonna do
// the full thing like its proper proper ... itll show the timer against a
// blank screen." What the website sends the tutor on her laptop so its own
// black screen comes up too, on the same clock. ends is when this timer
// stops, as a time the laptop can read wherever it is.
export function examEdit(title, minutes, endsMs) {
  const mins = Math.round(Number(minutes));
  if (!Number.isFinite(mins) || mins < 1 || !Number.isFinite(endsMs)) return null;
  return { kind: "exam", title: String(title || "Past paper").trim().slice(0, 120) || "Past paper",
           minutes: mins, ends: new Date(endsMs).toISOString() };
}

// What the black screen says: the paper, the clock, and one line under it.
export function examWords(timer, nowMs) {
  if (!timer || !timer.proper) return null;
  const left = timerLeft(timer, nowMs);
  const over = left <= 0;
  return { title: over ? "Time's up on " + timer.title + "." : timer.title,
           clock: clockText(left),
           note: over ? "Pens down, then mark it." : "Proper exam. Nothing else on this screen until it's done.",
           over };
}

// A timer that survives a redraw: it only remembers when it ends.
export function timerLeft(timer, nowMs) {
  if (!timer) return 0;
  if (timer.pausedLeft !== null && timer.pausedLeft !== undefined) return timer.pausedLeft;
  return Math.max(0, (timer.endsMs - nowMs) / 1000);
}

// "keep all sciences together - bio, chemistry, and physics."
export const SCIENCES = ["biology", "chemistry", "physics", "science"];
export function isScience(name) {
  return SCIENCES.includes(String(name || "").trim().toLowerCase());
}

// The Papers tab's top level: Sciences as one entry holding its three, in
// its alphabetical place among the others.
export function withSciences(subjects) {
  const science = subjects.filter((s) => isScience(s.name));
  const rest = subjects.filter((s) => !isScience(s.name)).map((s) => ({ ...s }));
  if (!science.length) return rest;
  return rest.concat([{ name: "Sciences", group: science }])
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ----------------------------------------------- this week's weak subject
// The same week numbering as the laptop (ISO: weeks start on Monday).
export function weekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - start) / 86400000 + 1) / 7);
  return d.getUTCFullYear() + "-W" + String(week).padStart(2, "0");
}

const VAGUE = /^(?:i'?m |im |i am )?(?:just |really |so )?(?:bad|rubbish|terrible|weak|awful|not good|struggling)(?: at| in| with)?(?: it| this| that| everything| all of it| the subject)?\W*$|^(?:everything|all of it|all|the whole thing|idk|i don'?t know|dunno|stuff|things)\W*$/i;

// A point she can actually revise. The laptop checks again with the same
// rule, so this is only to tell her straight away.
export function focusPointOk(point, subject) {
  const low = String(point || "").trim().replace(/\s+/g, " ").toLowerCase();
  if ((low.match(/[a-z0-9]{2,}/g) || []).length < 2) return false;
  if (VAGUE.test(low)) return false;
  const bare = low.replace(/\b(?:i'?m|im|i|am|bad|at|in|with|weak|the|all|of|just|really|not|good)\b/g, " ")
    .replace(String(subject || "").trim().toLowerCase(), " ");
  return /[a-z0-9]{3,}/.test(bare);
}

export function focusCheck(subject, text) {
  const lines = String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const good = [];
  const vague = [];
  lines.forEach((line) => {
    if (focusPointOk(line, subject)) {
      if (!good.some((g) => g.toLowerCase() === line.toLowerCase())) good.push(line);
    } else vague.push(line);
  });
  let problem = "";
  if (!String(subject || "").trim()) problem = "Pick the subject first.";
  else if (!lines.length) problem = "Write at least one specific thing, one a line.";
  else if (vague.length) {
    problem = "Too general: \"" + vague[0] + "\". Say the exact thing, like \"reflexive verbs in the past tense\".";
  }
  return { good, vague, problem };
}

export function focusNow(focus, today) {
  return focus && focus.subject && focus.week === weekKey(today) ? focus : null;
}

// ------------------------------------------------------ school (Google)
// Classroom work the way she needs it: late first, then by due date, things
// with no date after, handed in ones out of the way at the bottom.
export function schoolWork(work, today) {
  const rows = work.filter((w) => w.kind !== "material").map((w) => {
    const left = daysUntil(w.due, today);
    const done = ["TURNED_IN", "RETURNED"].includes(w.state);
    return { ...w, left, done,
             bucket: done ? "Handed in" : left === null ? "No due date"
               : left < 0 ? "Late" : left <= 7 ? "This week" : "Later" };
  });
  const order = ["Late", "This week", "Later", "No due date", "Handed in"];
  // Handed in work from long ago is dropped: only what was due in the last
  // two weeks, or has no date and was touched in the last two weeks.
  const recent = (w) => !w.done || (w.left !== null ? w.left >= -14
    : daysUntil(w.updated, today) !== null && daysUntil(w.updated, today) >= -14);
  // Undated work nobody has touched for a month is old, not open.
  const live = (w) => w.done || w.left !== null ||
    (daysUntil(w.updated, today) !== null && daysUntil(w.updated, today) >= -30);
  // Late by more than a month: the teacher has moved on.
  const current = (w) => w.done || w.left === null || w.left >= -30;
  return order.map((name) => ({
    name,
    rows: rows.filter((w) => w.bucket === name && recent(w) && live(w) && current(w))
      .sort((a, b) => (a.left ?? 9999) - (b.left ?? 9999) ||
                      String(a.title).localeCompare(String(b.title))),
  })).filter((bucket) => bucket.rows.length);
}

// Classroom work as extra "tasks" for the Subjects tab, so a subject with
// homework due tomorrow rises even if she hasn't written it on her list.
export function workAsTasks(work) {
  return work.filter((w) => w.kind !== "material" &&
                            !["TURNED_IN", "RETURNED"].includes(w.state))
    .map((w) => ({ name: w.title, subject: w.subject || w.course,
                   due: String(w.due || "").slice(0, 10), done: false }));
}

export function comingEvents(events, today, days = 14) {
  return events.map((e) => ({ ...e, left: daysUntil(e.start, today) }))
    .filter((e) => e.left !== null && e.left >= 0 && e.left <= days)
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
}

export function googleStatus(google) {
  if (!google || !google.ready) {
    return "Google isn't set up on the laptop yet. The steps are in HOW TO CONNECT GOOGLE.txt.";
  }
  if (!google.connected) {
    return "Not connected. On the laptop: right click the tutor's tray icon, Connect Google.";
  }
  const when = google.at ? "Last checked " + clock12(google.at) : "Connected, first check coming";
  return google.error ? when + ". Problem: " + google.error : when + ".";
}

// ---- Her lesson review: what she said she did in each lesson. It lives
// here now; the laptop keeps its own copy and sends every row up.
export function lessonSubjects(rows) {
  return [...new Set(rows.map((r) => String(r.subject || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

// Rows for one subject (or all) that match what she typed, newest day
// first, grouped by day: [{day, rows: [{subject, said}]}].
// 2026-10-07c: her screenshot, "this is uh. odd". Three kinds of row made
// the page read like nonsense, and none of them is a lesson:
//   - source "watch": her answer to the blue sheet's gate question, kept by
//     the laptop as "Second latest lesson: snooze". Never shown.
//   - "not sure": nothing to read back.
//   - one long answer saved under every subject she had that day: shown
//     once, with the subjects together, when no one subject is picked.
export function lessonReal(row) {
  if (!row || !row.day) return false;
  const said = String(row.said || "").trim();
  if (!said) return false;
  if (String(row.source || "") === "watch" || /^second latest lesson:/i.test(said)) return false;
  return !/^(not sure|idk|i don'?t know|nothing)[.!]*$/i.test(said);
}

// 2026-10-07e: the mid September rows. One spoken answer about the whole
// day ("for today maths yeah we did ... then we had chemistry ...") was
// saved whole under every subject she'd had. It's cut where she names each
// subject, and each bit goes under its own. A subject she never names in it
// gets nothing: she didn't say anything about it. Names she didn't have
// that day aren't looked for. Nothing she said is dropped: what comes
// before the first name stays with the first bit.
const LESSON_WORDS = {
  "maths": ["maths", "math", "mathematics"],
  "design technology": ["design technology", "design tech", "dt", "d&t"],
  "pe": ["pe", "p.e", "physical education"],
  "biology": ["biology", "bio"],
  "chemistry": ["chemistry", "chem"],
  "geography": ["geography", "geo"],
  "computer science": ["computer science", "computing", "cs"],
};

function lessonMention(text, subject) {
  const key = String(subject || "").trim().toLowerCase();
  if (!key) return -1;
  const words = LESSON_WORDS[key] || [key];
  let first = -1;
  words.forEach((word) => {
    const safe = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const hit = new RegExp("(^|[^a-z])" + safe + "(?![a-z])", "i").exec(text);
    if (!hit) return;
    const at = hit.index + hit[1].length;
    if (first < 0 || at < first) first = at;
  });
  return first;
}

// [{subject, said}] for one answer saved under several subjects, or null
// when she names none of them (then it's shown once, as before).
export function lessonSplit(said, subjects) {
  const text = String(said || "");
  const found = (subjects || []).map((name) => ({ name, at: lessonMention(text, name) }))
    .filter((one) => one.at >= 0)
    .sort((a, b) => a.at - b.at);
  if (!found.length) return null;
  return found.map((one, i) => ({ subject: one.name,
    said: text.slice(i === 0 ? 0 : one.at, i + 1 < found.length ? found[i + 1].at : text.length).trim() }))
    .filter((one) => one.said);
}

export function lessonDays(rows, subject, search) {
  const want = String(search || "").trim().toLowerCase();
  const days = new Map();
  rows.filter(lessonReal).forEach((r) => {
    if (!days.has(r.day)) days.set(r.day, []);
    const list = days.get(r.day);
    const name = String(r.subject || "");
    const same = list.find((one) => one.said === String(r.said));
    if (same) {
      if (!same.names.includes(name)) same.names.push(name);
    } else {
      list.push({ names: [name], said: String(r.said) });
    }
  });
  const out = [];
  [...days.entries()].sort((a, b) => b[0].localeCompare(a[0])).forEach(([day, list]) => {
    const lines = [];
    list.forEach((one) => {
      const names = one.names.filter(Boolean).sort((a, b) => a.localeCompare(b));
      const parts = names.length > 1 ? lessonSplit(one.said, names) : null;
      if (parts && parts.length) {
        parts.forEach((part) => lines.push({ names: [part.subject], said: part.said }));
      } else {
        lines.push({ names: names.length ? names : [""], said: one.said });
      }
    });
    const kept = lines
      .filter((line) => !subject || line.names.includes(subject))
      .map((line) => ({ subject: subject || line.names.join(", "), said: line.said }))
      .filter((line) => !want || (line.said + " " + line.subject + " " + day).toLowerCase().includes(want))
      .sort((a, b) => a.subject.localeCompare(b.subject));
    if (kept.length) out.push({ day, rows: kept });
  });
  return out;
}

export function lessonDayWords(iso, today) {
  const left = daysUntil(iso, today);
  const when = new Date(String(iso).slice(0, 10) + "T00:00:00");
  if (isNaN(when)) return String(iso);
  const words = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][when.getDay()] + " " +
    when.getDate() + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug",
      "Sep", "Oct", "Nov", "Dec"][when.getMonth()];
  if (left === 0) return "Today, " + words;
  if (left === -1) return "Yesterday, " + words;
  return words;
}

// ---- Dates on her Google Calendar. The laptop does the writing; this is
// what she's shown first, word for word what will be sent.
const CAL_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CAL_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug",
                    "Sep", "Oct", "Nov", "Dec"];

// Why the tutor can't write on her calendar right now, or "".
export function calendarCan(google) {
  if (!google || !google.ready) return "Google isn't set up on the laptop yet.";
  if (!google.connected) {
    return "Google isn't connected. On the laptop: right click the cat, Connect Google.";
  }
  if (!google.write) {
    return "The tutor can only read your calendar at the moment. On the laptop: right click the cat, press Connect Google again and say yes to the calendar box.";
  }
  return "";
}

export function clockWords(clock) {
  const hour = Number(String(clock).slice(0, 2));
  const minute = String(clock).slice(3, 5);
  return (hour % 12 || 12) + (minute === "00" ? "" : ":" + minute) + (hour < 12 ? "am" : "pm");
}

export function hourOn(start) {
  const mins = Math.min(Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) + 60, 23 * 60 + 59);
  return String(Math.floor(mins / 60)).padStart(2, "0") + ":" + String(mins % 60).padStart(2, "0");
}

export function calendarWhen(day, start, end) {
  const when = new Date(String(day) + "T00:00:00");
  if (isNaN(when)) return "";
  const words = CAL_DAYS[when.getDay()] + " " + when.getDate() + " " +
    CAL_MONTHS[when.getMonth()] + " " + when.getFullYear();
  if (!start) return words + ", all day";
  return words + ", " + clockWords(start) + " to " + clockWords(end || hourOn(start));
}

// What's wrong with a date she's typed, or "".
export function calendarProblem(entry, today) {
  const title = String(entry.title || "").trim();
  if (!title) return "Give it a name first.";
  if (title.length > 200) return "That name's too long.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(entry.day || "")) ||
      daysUntil(entry.day, today) === null) return "Pick a date.";
  if (daysUntil(entry.day, today) < 0) return "That date has already gone.";
  if (entry.start && !/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.start)) return "That time doesn't look right.";
  return "";
}

// The exact words for what a press of "Write it" will do.
export function calendarWords(op, entry, old) {
  const fresh = "  " + String(entry.title).trim() + "\n  " + calendarWhen(entry.day, entry.start, entry.end);
  if (op === "add") return "This will be written on your Google Calendar, and nothing else:\n" + fresh;
  const was = "  " + old.title + "\n  " + calendarWhen(old.day, old.start, old.end);
  if (op === "edit") {
    return "This one, which the tutor put there, will be changed, and nothing else. From:\n" + was + "\nTo:\n" + fresh;
  }
  return "This one will be taken off your Google Calendar. The tutor put it there. Nothing else is touched:\n" + was;
}

// Her tests and dated homework that the tutor hasn't put on the calendar.
export function calendarOffers(exams, tasks, made, today) {
  const have = new Set(made.map((m) => String(m.title).toLowerCase() + "|" + m.day));
  const out = [];
  exams.forEach((exam) => {
    const day = String(exam.date || "").slice(0, 10);
    const left = daysUntil(day, today);
    if (left === null || left < 0) return;
    const title = exam.subject + " test" + (exam.topic ? ": " + exam.topic : "");
    out.push({ title, day, kind: "Test" });
  });
  tasks.forEach((task) => {
    const day = String(task.due || "").slice(0, 10);
    const left = daysUntil(day, today);
    if (task.done || left === null || left < 0) return;
    out.push({ title: String(task.name) + " due", day, kind: "Due" });
  });
  return out.filter((o) => !have.has(o.title.toLowerCase() + "|" + o.day))
    .sort((a, b) => a.day.localeCompare(b.day) || a.title.localeCompare(b.title));
}

// One line on how something she said yes to turned out.
export function calendarWriteWords(write) {
  const doing = { add: "Writing", edit: "Changing", remove: "Taking off" }[write.op] || "Doing";
  const did = { add: "Written", edit: "Changed", remove: "Taken off" }[write.op] || "Done";
  if (write.state === "done") return did + ": " + write.title;
  if (write.state === "failed") return "Didn't work: " + write.title + ". " + (write.detail || "");
  return doing + " (waiting for the laptop): " + write.title;
}

export function fileState(file) {
  if (file.too_big) return "Too big for the web app. It's on the laptop.";
  if (!file.ready) return "Still coming up from the laptop";
  return "";
}

// The pieces of a file, put back in order. Null if any piece is missing,
// so half a PDF is never opened.
export function joinChunks(chunks, expected) {
  const sorted = [...chunks].sort((a, b) => a.n - b.n);
  if (expected && sorted.length !== expected) return null;
  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i].n !== i) return null;
  }
  const size = sorted.reduce((sum, c) => sum + c.bytes.length, 0);
  const whole = new Uint8Array(size);
  let at = 0;
  sorted.forEach((c) => { whole.set(c.bytes, at); at += c.bytes.length; });
  return whole;
}

// What the sync button says under it.
export function syncStatus(asked, meta, nowMs) {
  if (!asked) return "";
  if (meta && meta.answered === asked.stamp) {
    return "Synced " + clock12(meta.last_sync);
  }
  if (nowMs - asked.atMs > 75000) {
    return "The laptop isn't answering. Is the tutor open?";
  }
  return "Asked the laptop";
}

// 2026-10-03: the Tasks tab is one text box, like the note on the laptop.
// Two copies of a note are the same when only stray spaces differ.
export function noteSame(a, b) {
  const tidy = (t) => String(t || "").replace(/\r/g, "").split("\n")
    .map((l) => l.replace(/\s+$/, "")).join("\n").replace(/\n+$/, "");
  return tidy(a) === tidy(b);
}

// What the text box should do next. box = {text, base, version, sent}
// where sent is {text, version, atMs} for a save the laptop hasn't taken.
//   "load"     take the laptop's copy (she has nothing unsaved)
//   "send"     her words differ from the laptop's: save them
//   "rebase"   her last save landed and she has typed more since
//   "conflict" the laptop changed AND she has unsaved words
//   "wait"     nothing to do until the laptop answers
//   "none"     all the same
export function noteBoxNext(box, live, nowMs) {
  if (!live || !live.version) return "wait";
  if (box.sent) {
    const typedMore = !noteSame(box.text, box.sent.text);
    if (live.version === box.sent.version && !noteSame(live.text, box.sent.text)) {
      if (typedMore && nowMs - box.sent.atMs > 60000) return "send";
      return "wait";
    }
    if (!typedMore) return "load";
    return noteSame(live.text, box.sent.text) ? "rebase" : "conflict";
  }
  if (!box.version) return "load";
  const dirty = !noteSame(box.text, box.base);
  if (live.version !== box.version) return dirty ? "conflict" : "load";
  return dirty ? "send" : "none";
}

export function noteBoxWords(step, box, nowMs) {
  if (step === "conflict") return "Your list changed on the laptop too. Pick one.";
  if (box.sent) {
    return nowMs - box.sent.atMs > 60000
      ? "Sent, but the laptop hasn't taken it. Is the tutor open?"
      : "Saving to the laptop...";
  }
  if (step === "send") return "Typing...";
  if (step === "wait") return "Waiting for the laptop to send your list.";
  return "Saved.";
}

// ---- 2026-10-05: "it doesnt tell me exactly what i spent time on youtbe".
// A window title, as the name of the video. The bare front page is nothing.
export function videoName(title) {
  const name = String(title || "")
    .replace(/\s*-\s*(Google Chrome|Microsoft\s*Edge|Mozilla Firefox|Brave|Opera)\s*$/i, "")
    .replace(/\s*-\s*YouTube\s*$/i, "")
    .replace(/^\(\d+\)\s*/, "").trim();
  return name.toLowerCase() === "youtube" ? "" : name;
}

// Today's YouTube by video: [{title, seconds}], longest first. A visit's
// time is shared between the videos in it.
export function videosToday(visits, today) {
  const found = new Map();
  youtubeToday(visits, today).visits.forEach((visit) => {
    const names = [];
    (visit.titles || []).forEach((t) => {
      const name = videoName(t);
      if (name && !names.includes(name)) names.push(name);
    });
    const share = Math.floor((visit.seconds || 0) / Math.max(1, names.length));
    names.forEach((name) => found.set(name, (found.get(name) || 0) + share));
  });
  return [...found.entries()].map(([title, seconds]) => ({ title, seconds }))
    .sort((a, b) => b.seconds - a.seconds);
}

// The videos an ask is about. The laptop sends them as text.
export function askVideos(ask) {
  let held = ask && ask.videos;
  if (typeof held === "string") {
    try { held = JSON.parse(held); } catch (error) { held = []; }
  }
  if (!Array.isArray(held)) return [];
  return held.filter((v) => v && v.title).map((v) => ({ title: String(v.title), seconds: Number(v.seconds) || 0 }));
}

// 2026-10-06: what she ticked and where she was in that stretch.
function askList(held) {
  if (typeof held === "string") {
    try { held = JSON.parse(held); } catch (error) { held = []; }
  }
  return Array.isArray(held) ? held : [];
}
export function askTasks(ask) {
  return askList(ask && ask.tasks).filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim());
}
export function askApps(ask) {
  return askList(ask && ask.apps).filter((a) => a && a.name)
    .map((a) => ({ name: String(a.name), seconds: Number(a.seconds) || 0 }));
}

// What she said each video was for, back out of a reflection.
export function reflectionVideos(reflection) {
  let held = reflection && reflection.videos;
  if (typeof held === "string") {
    try { held = JSON.parse(held); } catch (error) { held = []; }
  }
  return Array.isArray(held) ? held.filter((v) => v && v.title) : [];
}

// 2026-10-07: "organize the tabs on the pwa; its all at the top. maybe a
// little sidebar one so i can do like chats etc on the side and its less
// cluttered". 2026-10-07c: "have 'today', 'rewards' and anything else u
// think is useful in the top. the rest get shuffled to the sidebar. maybe
// chats and papers in the top too, yes." So: five along the top, the rest
// down the side in groups. The keys are the old tab keys, so "#lessons" and
// the rest still work.
export const TOP_TABS = [["today", "Today"], ["tasks", "Tasks"], ["rewards", "Rewards"],
                         ["chats", "Chats"], ["papers", "Papers"]];
// 2026-10-10q: Calendar (drag a task to another day) and Notes (the same
// notes as the tutor's Notes tab) are down the side, in a group of their own.
export const TAB_GROUPS = [
  // 2026-10-17: "have the chat like tutor on my laptop", through the laptop.
  // 2026-10-19i: the Day page, her "Power Page", first.
  { name: "Plan", tabs: [["page", "Day page"], ["talk", "Tutor chat"], ["calendar", "Calendar"], ["notes", "Notes"]] },
  { name: "School", tabs: [["school", "School"], ["lessons", "Review"], ["subjects", "Subjects"]] },
  { name: "More", tabs: [["youtube", "YouTube"]] },
];

export function sideKeys() {
  return TAB_GROUPS.flatMap((group) => group.tabs.map((tab) => tab[0]));
}

export function tabKeys() {
  return [...TOP_TABS.map((tab) => tab[0]), ...sideKeys()];
}

export function tabName(key) {
  const found = [...TOP_TABS, ...TAB_GROUPS.flatMap((group) => group.tabs)].find((tab) => tab[0] === key);
  return found ? found[1] : "";
}

export function tabOnTop(key) {
  return TOP_TABS.some((tab) => tab[0] === key);
}

// Which page to open on: the one a link asked for ("#lessons"), else the one
// she was last on, else Today. Anything that isn't a page is Today.
export function startTab(hash, kept) {
  const keys = tabKeys();
  const asked = String(hash || "").replace(/^#/, "");
  if (keys.includes(asked)) return asked;
  return keys.includes(kept) ? kept : "today";
}

// Along the top or down the side with the arrow keys, round the ends, and
// never from one into the other.
export function tabStep(key, by) {
  const keys = tabOnTop(key) ? TOP_TABS.map((tab) => tab[0]) : sideKeys();
  const at = keys.indexOf(key);
  if (at < 0) return keys[0];
  return keys[(at + by + keys.length) % keys.length];
}

// 2026-10-07: the overnight switch on the Rewards page. known is false when
// the laptop hasn't said which way it is (an older build, or not open yet):
// the page then shows no switch. A press she's just made shows at once and
// counts as "sending" until the laptop says the same, or 90 seconds pass.
export function autoPoints(bank, sent, nowMs) {
  const known = Boolean(bank) && typeof bank.auto === "boolean";
  if (!known) return { known: false, on: false, sending: false };
  const live = Boolean(sent) && nowMs - sent.atMs < 90000 && sent.on !== bank.auto;
  return { known: true, on: live ? sent.on : bank.auto, sending: live };
}

export function overnightWords(auto) {
  if (!auto.known) return "Left overnight, only a quarter stays.";
  return auto.on ? "Left overnight, they're saved as points by themselves."
                 : "Left overnight, only a quarter stays.";
}

// 2026-10-07b: a swap is still to use, or used. Her press shows at once and
// counts as "sending" until the laptop's row says the same, or 90 seconds.
export function rewardUse(row, sent, nowMs) {
  const real = Boolean(row && row.used);
  const live = Boolean(sent) && nowMs - sent.atMs < 90000 && sent.used !== real;
  return { used: live ? sent.used : real, when: real ? String(row.used) : "", sending: live };
}

// Swapped so far in two piles: still to use (oldest first, so the one that's
// waited longest is on top) and used (latest first).
export function rewardPiles(rows, sent, nowMs) {
  const waiting = [], used = [];
  (rows || []).forEach((row) => {
    const use = rewardUse(row, (sent || {})[row.id], nowMs);
    (use.used ? used : waiting).push({ ...row, use });
  });
  waiting.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  used.sort((a, b) => String(b.use.when || b.at).localeCompare(String(a.use.when || a.at)));
  return { waiting, used };
}

// ---------------------------------------------------------------------------
// 2026-10-10q: every day's list (the Tasks page), the calendar with drag,
// and her notes. The laptop sends the days as one piece of text in
// live/alldays: {today, days: [{day, lines: [{text, done, optional, fun,
// bold}]}]}. Anything that isn't that shape is no days at all.
export function allDays(live) {
  let held = null;
  try { held = JSON.parse((live && live.data) || "null"); } catch (error) { held = null; }
  if (!held || !Array.isArray(held.days)) return null;
  const days = held.days.filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(String(d.day || "")))
    .map((d) => ({ day: String(d.day), lines: (Array.isArray(d.lines) ? d.lines : [])
      .filter((l) => l && typeof l === "object")
      .map((l) => ({ text: String(l.text || ""), done: Boolean(l.done), optional: Boolean(l.optional),
                     fun: Boolean(l.fun), bold: Boolean(l.bold) })) }))
    .sort((a, b) => a.day.localeCompare(b.day));
  // 2026-10-15c: the task bank, lines off no day at all.
  const bank = (Array.isArray(held.bank) ? held.bank : []).filter((l) => l && typeof l === "object")
    .map((l) => ({ text: String(l.text || ""), done: false, optional: false, fun: false, bold: false,
                   // 2026-10-16m: the list (subject) it's in, and what it's worth.
                   list: String(l.list || "").trim(), minutes: Number(l.minutes) || 0,
                   // 2026-10-16n: her Subjects box lines come with their little heading.
                   group: String(l.group || "").trim(), subjects: l.from === "subjects",
                   // 2026-10-18: a Subjects line already put on a day (for the plan check).
                   planned: /^\d{4}-\d{2}-\d{2}$/.test(String(l.planned || "")) ? String(l.planned) : "" }))
    .filter((l) => l.text.trim());
  // 2026-10-18: "how many i want to finish by what date", per list.
  const goals = {};
  if (held.goals && typeof held.goals === "object") {
    Object.keys(held.goals).forEach((name) => {
      const g = held.goals[name] || {};
      const count = Math.max(0, Math.round(Number(g.count) || 0));
      if (count && /^\d{4}-\d{2}-\d{2}$/.test(String(g.by || ""))) goals[name] = { count, by: String(g.by) };
    });
  }
  // 2026-10-16: rough times on lines ("day|words": "HH:MM") and events.
  const times = {};
  if (held.times && typeof held.times === "object") {
    Object.keys(held.times).forEach((k) => {
      const at = String(held.times[k] || "");
      // 2026-10-19: a task's time can be a span ("10:00-11:30").
      if (/^\d{4}-\d{2}-\d{2}\|/.test(k) && timeParts(at)) times[k] = at;
    });
  }
  const events = (Array.isArray(held.events) ? held.events : []).filter((e) => e && typeof e === "object" &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(e.day || "")) && String(e.title || "").trim())
    .map((e) => ({ id: String(e.id || ""), day: String(e.day), title: String(e.title),
                   start: /^\d{2}:\d{2}$/.test(String(e.start || "")) ? String(e.start) : "",
                   end: /^\d{2}:\d{2}$/.test(String(e.end || "")) ? String(e.end) : "",
                   quiet: Boolean(e.quiet),       // 2026-10-18: keeps the laptop quiet
                   color: eventColour(e.color) }));   // 2026-10-18b: her colour, or ""
  // 2026-10-16b: lines that come back every day, shown ahead of time.
  const repeats = (Array.isArray(held.repeats) ? held.repeats : []).filter((r) => r && String(r.text || "").trim())
    .map((r) => ({ text: String(r.text).trim(), from: String(r.from || "").slice(0, 10),
                   until: String(r.until || "").slice(0, 10),
                   // 2026-10-18: every [x] hours/days/weeks.
                   every: Math.max(1, Math.min(60, Number(r.every) || 1)),
                   unit: ["hour", "day", "week"].includes(String(r.unit || "")) ? String(r.unit) : "day",
                   // 2026-10-17: "3 crochet bracelets" repeating as three lines a day.
                   times: Math.max(1, Math.min(20, Number(r.times) || 1)) }));
  // 2026-10-16e: lines she locked to their day ("day|words"). A swap
  // leaves them where they are.
  const locks = new Set((Array.isArray(held.locks) ? held.locks : []).map(String)
    .filter((k) => /^\d{4}-\d{2}-\d{2}\|/.test(k)));
  // 2026-10-19d: her flexible days.
  const flex = new Set((Array.isArray(held.flex) ? held.flex : []).map(String).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)));
  return { today: String(held.today || ""), days, flex, bank: bank.filter((l) => !l.planned),
           planned: bank.filter((l) => l.planned), goals, times, events, repeats, locks };
}

// ---- 2026-10-16: the times view. "HEAVILY reference google calender's
// thing": hours down the side, timed lines and events where they fall,
// lines with no time along the top, and it opens scrolled to the first
// thing that has a time.
// 2026-10-19c: "option to zoom in on the timings so you can see it like each
// individual half hour". The height of an hour changes with the zoom.
export let HOUR_PX = 48;
export const ZOOMS = [32, 48, 72, 96, 144, 192, 288];   // 2026-10-19d: more sizes
export function setHourPx(px) { HOUR_PX = ZOOMS.includes(Number(px)) ? Number(px) : 48; return HOUR_PX; }
export const timeSnap = () => (HOUR_PX >= 144 ? 15 : 30);
export const CAL_LAYOUTS = [["times", "Times"], ["list", "List"]];

export const minutesOf = (hhmm) => {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
// 2026-10-19: "cant extend amount of time a task holds by drag". A task's
// time is "HH:MM" (half an hour) or "HH:MM-HH:MM" once she's pulled it
// longer or shorter.
export function timeParts(at) {
  const m = /^(\d{2}):(\d{2})(?:-(\d{2}):(\d{2}))?$/.exec(String(at || ""));
  if (!m) return null;
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = m[3] === undefined ? null : Number(m[3]) * 60 + Number(m[4]);
  if (start > 23 * 60 + 59 || (end !== null && (end <= start || end > 24 * 60))) return null;
  return { start, end };
}
// 2026-10-19: how a line reads on the calendar. "do 1 from [BIOLOGY] (1)"
// reads "Do 1 from Biology (1)"; the line itself is never changed.
export function lineLabel(text) {
  const m = /^do 1 from \[([^\]]+)\](.*)$/i.exec(String(text || "").trim());
  if (!m) return String(text || "");
  const [list, sub] = m[1].split("/").map((x) => x.trim());
  const name = /^dt$/i.test(list) ? "DT" : list.charAt(0).toUpperCase() + list.slice(1).toLowerCase();
  const nice = name + (sub ? " / " + sub.toLowerCase() : "");
  return "Do 1 from " + nice + m[2];
}
// 2026-10-19: "id also like to be able to just select an area and it would
// select it". Which boxes a dragged-out area touches.
export function boxHits(area, boxes) {
  return (boxes || []).filter((b) => b.left < area.right && b.right > area.left &&
    b.top < area.bottom && b.bottom > area.top);
}

// 2026-10-19d: "+30" on a day, shown at once: every task with a time on
// that day (from \`from\` minutes on), not ticked, that much later.
export function shiftTimes(times, day, minutes, from, done) {
  const out = {};
  Object.keys(times || {}).forEach((key) => {
    if (!key.startsWith(day + "|") || (done && done.has(key))) return;
    const p = timeParts(times[key]);
    if (!p || p.start < (from || 0)) return;
    const s = Math.max(0, Math.min(23 * 60 + 45, p.start + minutes));
    out[key] = p.end !== null ? timeSpan(s, s + (p.end - p.start)) : hhmm(s);
  });
  return out;
}

export function timeSpan(start, end) {
  const s = Math.max(0, Math.min(23 * 60 + 45, Math.round(start)));
  const e = Math.max(s + 15, Math.min(24 * 60 - 1, Math.round(end)));
  return hhmm(s) + "-" + hhmm(e);
}
export function taskLength(at) {
  const p = timeParts(at);
  return p && p.end !== null ? p.end - p.start : 30;
}

export const hhmm = (minutes) => {
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
};
// A drop at this many pixels down the hours: to the half hour.
export const dropTime = (y) => hhmm(Math.floor(Math.max(0, y) / (HOUR_PX * timeSnap() / 60)) * timeSnap());

// Times waiting to reach the laptop win over what it last said.
export function mergedTimes(found, pending, nowMs) {
  const out = { ...((found && found.times) || {}) };
  (pending || []).forEach((p) => {
    if (nowMs - p.atMs > 120000) return;
    if (p.at) out[p.key] = p.at; else delete out[p.key];
  });
  return out;
}

// One day's column: what has no time (along the top) and what has one.
export function timeColumn(lines, day, times, events) {
  const untimed = [], timed = [];
  (lines || []).forEach((line) => {
    const at = line.kind === "line" || line.kind === "head" ? (times || {})[day + "|" + line.raw] : null;
    const parts = timeParts(at);
    if (!parts || line.sub || line.done) { untimed.push(line); return; }
    const start = parts.start;
    timed.push({ kind: "line", line, start, end: parts.end !== null ? parts.end : start + 30,
                 ranged: parts.end !== null, label: line.text });
  });
  (events || []).filter((e) => e.day === day).forEach((e) => {
    const start = minutesOf(e.start);
    if (start === null) { untimed.unshift({ kind: "event", event: e, text: e.title, raw: e.title }); return; }
    const end = Math.max(start + 30, minutesOf(e.end) || start + 60);
    timed.push({ kind: "event", event: e, start, end, label: e.title });
  });
  timed.sort((a, b) => a.start - b.start || a.end - b.end);
  // Side by side when they overlap. 2026-10-19: "idk what happened??" Two
  // tasks at 5:30 made every task that day half as wide (names cut to
  // "d..."). Now only the ones that really overlap share the width, like
  // Google Calendar: each run of overlapping things has its own lanes.
  let group = [], groupEnd = -1;
  const settle = () => {
    const lanes = [];
    group.forEach((item) => {
      let lane = lanes.findIndex((lastEnd) => lastEnd <= item.start);
      if (lane < 0) { lane = lanes.length; lanes.push(0); }
      lanes[lane] = item.end;
      item.lane = lane;
    });
    group.forEach((item) => { item.lanes = Math.max(1, lanes.length); });
    group = [];
  };
  timed.forEach((item) => {
    if (group.length && item.start >= groupEnd) settle();
    group.push(item);
    groupEnd = Math.max(groupEnd, item.end);
  });
  if (group.length) settle();
  return { untimed, timed };
}

// Where the hours open: the first thing with a time, a little above it.
export function firstScroll(columns, fallbackHour) {
  let first = null;
  (columns || []).forEach((c) => c.timed.forEach((t) => { if (first === null || t.start < first) first = t.start; }));
  const minutes = first === null ? (fallbackHour || 8) * 60 : Math.max(0, first - 30);
  return Math.round(minutes / 60 * HOUR_PX);
}

// 2026-10-16e: "a 'lock' option to say make the earliest time i can
// scroll to eg 6am bc i dont want to scroll up and accidently find myself
// at 12". The hours can't be scrolled above this. Anything she's put
// earlier than it still shows: the lock stops just above that instead.
// 2026-10-16e: "it shoudl just give like highest is 5am ... and a quick
// unlock /lock icon button". One lock, at 5am.
export const CAL_LOCK_HOUR = 5;

// 2026-10-17b: "version of the pwa. just a little thing in the left menu".
// The same number as sw.js's cache: change both together.
export const APP_VERSION = "v80";   // 2026-10-21f: was v79 (21d: was v78, 21c: was v77)

// 2026-10-17b: "in calender, by default, set the height where u will be on
// as where the red bar is". With today showing, it opens with now about an
// hour and a half down from the top; otherwise at the first timed thing.
export function nowScroll(columns, now, fallbackHour) {
  const today = (columns || []).some((c) => c.cell && c.cell.today);
  if (!today || !now) return firstScroll(columns, fallbackHour);
  const minutes = now.getHours() * 60 + now.getMinutes();
  return Math.round(Math.max(0, minutes - 90) / 60 * HOUR_PX);
}

// 2026-10-17b: an event dragged ("drag its time start") or its bottom
// pulled ("extend via a pull its length"). Moves are in 15 minute steps;
// it never ends before it starts, never runs past midnight.
export const EVENT_STEP = 15;
export function eventAfterDrag(start, end, deltaMinutes, mode) {
  const s0 = minutesOf(start);
  if (s0 === null) return null;
  const e0 = minutesOf(end) || s0 + 60;
  const step = Math.round(deltaMinutes / EVENT_STEP) * EVENT_STEP;
  if (mode === "resize") {
    const e = Math.min(24 * 60 - 1, Math.max(s0 + EVENT_STEP, e0 + step));
    return { start: hhmm(s0), end: hhmm(e) };
  }
  const length = e0 - s0;
  const s = Math.min(24 * 60 - 1 - length, Math.max(0, s0 + step));
  return { start: hhmm(s), end: hhmm(s + length) };
}

export function scrollFloor(columns, lockHour) {
  const hour = Number(lockHour) || 0;
  if (hour <= 0) return 0;
  let minutes = hour * 60;
  (columns || []).forEach((c) => (c.timed || []).forEach((t) => {
    if (t.start < minutes + 30) minutes = Math.min(minutes, Math.max(0, t.start - 30));
  }));
  return Math.round(minutes / 60 * HOUR_PX);
}

export const BANK = "bank";
// 2026-10-16m: the "Do 1 from [LIST]" card, dragged out of the bank.
export const BANK_PICK = "bankpick";
export const BANK_OTHER = "Other";
export const PICK_LEASTS = [["0", "Any"], ["5", "5+ min"], ["10", "10+ min"], ["15", "15+ min"], ["20", "20+ min"]];

// 2026-10-16m: "in the task bank itll have those lists that i can open up.
// as in one list, tab, next list. not NEWLINE bc then its just inefficient
// space." The bank's lines in their lists, in the order the lists first
// come. A "> bit" stays in the list of the line above it.
export function bankTabs(lines) {
  const tabs = [];
  let last = BANK_OTHER;
  (lines || []).forEach((l) => {
    const words = String((l && l.text) || "").trim();
    if (!words) return;
    const name = words.startsWith(">") ? last : (String(l.list || "").trim() || BANK_OTHER);
    last = name;
    let tab = tabs.find((t) => t.name === name);
    if (!tab) { tab = { name, lines: [] }; tabs.push(tab); }
    tab.lines.push(l);
  });
  return tabs;
}

// The line the "Do 1 from" card puts on a day. Ticked there, the laptop
// asks which one she did, from the lines worth at least that much.
// 2026-10-19c: "do one from geography but from sublists as well". A
// sublist (a little heading in a subject) rides along after a "/":
// "do 1 from [GEOGRAPHY / RIVERS]".
export function pickName(subject, sub) {
  const s = String(sub || "").trim();
  return String(subject || "").trim() + (s ? " / " + s : "");
}

export function pickLine(name, least) {
  const n = Number(least) || 0;
  return "do 1 from [" + String(name || "").toUpperCase() + "]" + (n ? " (" + n + "+ min)" : "");
}

// 2026-10-18b: "make things subjects colour coded". The same colours as the
// desktop Subjects box (main.py SUBJECT_COLOURS). Keyed by the list name the
// bank uses ("DT" is design technology).
export const SUBJECT_HEX = {
  biology: "#E86AA6", business: "#9AA6AE", chemistry: "#3E9A4A", dt: "#B5302A",
  english: "#7CC76A", french: "#2FA59B", geography: "#9B6BD6", maths: "#4C8DF6",
  physics: "#EE6E66",
};
export function subjectColour(name) {
  const key = String(name || "").trim().toLowerCase();
  return SUBJECT_HEX[key] || SUBJECT_HEX[key === "design technology" ? "dt" : ""] || "";
}

// 2026-10-18b: event colours she can choose. "" is the default look.
export const EVENT_COLOURS = ["#4C8DF6", "#3E9A4A", "#E86AA6", "#9B6BD6", "#EE6E66", "#F2A93B", "#14B8A6", "#9AA6AE"];
export function eventColour(value) {
  const v = String(value || "");
  return /^#[0-9A-Fa-f]{6}$/.test(v) ? v.toUpperCase() : "";
}

export const dayKey = (day, text) => day + "|" + String(text || "").trim();

// One day's lines for a note card. A tick she's just made here (pending,
// keyed by day and words) shows straight away. "> bit" is a bit of the
// line above it.
export function dayLines(lines, day, pending) {
  const waiting = pending || new Map();
  return (lines || []).map((line) => {
    const raw = String(line.text || "").trim();
    if (!raw) return { kind: "gap" };
    if (raw.endsWith(":")) return { kind: "head", text: raw.slice(0, -1), raw, day };
    const sub = raw.startsWith(">");
    const key = dayKey(day, raw);
    return { kind: "line", text: sub ? raw.replace(/^>\s*/, "") : raw, raw, day, sub,
             done: waiting.has(key) ? waiting.get(key) : Boolean(line.done),
             group: false, optional: Boolean(line.optional), fun: Boolean(line.fun),
             bold: Boolean(line.bold) && !line.done };
  });
}

export function dayHead(iso, today) {
  const left = daysUntil(iso, today);
  const when = new Date(String(iso).slice(0, 10) + "T00:00:00");
  if (isNaN(when)) return String(iso);
  const words = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][when.getDay()] +
    " " + when.getDate() + " " + ["January", "February", "March", "April", "May", "June", "July", "August",
      "September", "October", "November", "December"][when.getMonth()];
  if (left === 0) return "Today, " + words;
  if (left === 1) return "Tomorrow, " + words;
  return words;
}

// How many boxes are still open, and on how many days.
export function allDaysCount(found) {
  let open = 0, days = 0;
  ((found && found.days) || []).forEach((d) => {
    const n = dayLines(d.lines, d.day).filter((l) => l.kind === "line" && !l.done).length;
    open += n;
    if (n) days += 1;
  });
  return { open, days, words: open + " open" + (days > 1 ? " over " + days + " days" : "") };
}

// A tick made here on another day stops being "pending" once the laptop's
// copy agrees, or after two minutes if the laptop never answers.
export function settleDays(pending, found, madeAt, nowMs) {
  const real = new Map();
  ((found && found.days) || []).forEach((d) => d.lines.forEach((l) => real.set(dayKey(d.day, l.text), Boolean(l.done))));
  [...pending.keys()].forEach((key) => {
    if (real.get(key) === pending.get(key) || nowMs - (madeAt.get("a:" + key) || 0) > 120000) pending.delete(key);
  });
}

// ---- the calendar. A week is the seven days from the anchor day (today,
// to begin with), so it never opens on days that have gone. A month is a
// real month, its weeks starting on Sunday as her school week does.
// 2026-10-13: "it seems realyy squished. maybe have an option to show only
// a few tasks and then yea or like 3 days at a time". 3 days first.
export const CAL_VIEWS = [["three", "3 days"], ["week", "Week"], ["two", "2 weeks"], ["month", "Month"]];
export const CAL_SPAN = { three: 3, week: 7, two: 14 };
// How many lines a day shows before "and N more". 0 is all of them.
export const CAL_FEW = [["0", "All lines"], ["4", "A few"]];

function atNoon(iso) { return new Date(String(iso).slice(0, 10) + "T12:00:00"); }
function addDays(iso, n) { const d = atNoon(iso); d.setDate(d.getDate() + n); return isoDay(d); }

// The days a view shows. Week: the anchor day and the six after it. Two
// weeks: fourteen. Month: every week that has a day of the anchor's month.
export function calendarDays(anchor, view) {
  const at = atNoon(anchor);
  if (isNaN(at)) return [];
  if (view === "month") {
    const first = new Date(at.getFullYear(), at.getMonth(), 1, 12);
    const last = new Date(at.getFullYear(), at.getMonth() + 1, 0, 12);
    const start = addDays(isoDay(first), -first.getDay());
    const count = first.getDay() + last.getDate() + (6 - last.getDay());
    return Array.from({ length: count }, (_x, i) => addDays(start, i));
  }
  return Array.from({ length: CAL_SPAN[view] || 7 }, (_x, i) => addDays(isoDay(at), i));
}

// < and >: a week, two weeks or a month along.
export function calendarStep(anchor, view, by) {
  const at = atNoon(anchor);
  if (isNaN(at)) return anchor;
  if (view === "month") return isoDay(new Date(at.getFullYear(), at.getMonth() + by, 1, 12));
  return addDays(isoDay(at), by * (CAL_SPAN[view] || 7));
}

export function calendarTitle(days, view, anchor) {
  if (!days.length) return "";
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
                  "October", "November", "December"];
  if (view === "month") { const at = atNoon(anchor); return months[at.getMonth()] + " " + at.getFullYear(); }
  const a = atNoon(days[0]), b = atNoon(days[days.length - 1]);
  const short = (d) => d.getDate() + " " + months[d.getMonth()].slice(0, 3);
  return short(a) + " to " + short(b) + " " + b.getFullYear();
}

// Why a line can't go from one day to another. "" when it can.
// 2026-10-18f: "click add method works just takes AGES and doesnt even
// have anything to show that it was responsive". A "Do 1 from" card put on
// a day shows there at once, faded, till the laptop's copy has one more of
// it than the day had (or two minutes go by). A copy's "(2)" is ignored.
const copyBase = (text) => String(text || "").trim().replace(/\s\(\d+\)$/, "").toLowerCase();
export function pickCount(found, day, text) {
  const d = ((found && found.days) || []).find((x) => x.day === day);
  return d ? d.lines.filter((l) => copyBase(l.text) === copyBase(text)).length : 0;
}
// 2026-10-19c: how many lines with these words there are anywhere (every day
// and the bank). A task added here, then moved before the laptop had it,
// is settled once it's anywhere, so it never shows twice.
export function totalCount(found, text) {
  const lines = [].concat(...((found && found.days) || []).map((d) => d.lines), (found && found.bank) || []);
  return lines.filter((l) => copyBase(l.text) === copyBase(text)).length;
}
export function settlePicks(picks, found, nowMs) {
  return (picks || []).filter((p) => nowMs - p.atMs <= 120000 &&
    (p.hadAll !== undefined ? totalCount(found, p.text) <= p.hadAll : pickCount(found, p.to, p.text) <= p.had));
}
// What the laptop keeps of a typed task: "[10]" on the end is its worth.
export const typedWords = (text) => String(text || "").replace(/\s+/g, " ").trim().replace(/\s*\[\s*\d{1,3}\s*\]\s*$/, "").trim();
export function withPicks(found, picks) {
  if (!found || !(picks || []).length) return found;
  const days = found.days.map((d) => ({ ...d, lines: d.lines.slice() }));
  const bank = ((found && found.bank) || []).slice();
  picks.forEach((p) => {
    if (p.to === BANK) {                   // 2026-10-19c: added to a bank list
      bank.push({ text: p.text, done: false, optional: false, fun: false, bold: false, list: p.list || "", minutes: 0, group: "" });
      return;
    }
    let d = days.find((x) => x.day === p.to);
    if (!d) { d = { day: p.to, lines: [] }; days.push(d); }
    d.lines.push({ text: p.text, done: false, optional: false, fun: false, bold: false });
  });
  days.sort((a, b) => a.day.localeCompare(b.day));
  return { ...found, days, bank };
}

export function moveProblem(text, from, to, today) {
  const now = isoDay(today);
  if (!String(text || "").trim()) return "Nothing to move.";
  if (from === to) return to === BANK ? "It's already in the bank." : "It's already on that day.";
  if (to < now) return "That day's gone, so nothing can go on it.";
  if (from < now) return "That day's gone, so it stays as it was.";
  return "";
}

// Moves she's made here that the laptop hasn't shown yet. One is finished
// when the laptop's copy has the line on the new day and off the old one,
// or after two minutes.
// 2026-10-13: "i cant drag and drop english back to today". Dragged
// there and straight back, the first move was still waiting, so the page
// kept it on the wrong day. A move back cancels the one it undoes.
export function addMove(moves, move) {
  const undoes = (m) => m.text === move.text && m.to === move.from;
  const back = (moves || []).find(undoes);
  const rest = (moves || []).filter((m) => !undoes(m));
  if (back && back.from === move.to) return rest.concat([{ ...move, back: true }]);
  return rest.concat([move]);
}

export function settleMoves(moves, found, nowMs) {
  const has = (day, text) => day === BANK
    ? ((found && found.bank) || []).some((l) => l.text.trim() === text)
    : ((found && found.days) || []).some((d) => d.day === day &&
      d.lines.some((l) => l.text.trim() === text));
  return (moves || []).filter((m) => nowMs - m.atMs <= 120000 && !(has(m.to, m.text) && !has(m.from, m.text)));
}

// The days with her waiting moves already made, so a drop shows at once.
// The "> bits" right under a line go with it, and a heading of hers takes
// the lines under it down to the next gap, as they do on the laptop.
export function withMoves(found, moves) {
  const days = new Map(((found && found.days) || []).map((d) => [d.day, d.lines.slice()]));
  days.set(BANK, ((found && found.bank) || []).slice());
  (moves || []).forEach((m) => {
    const from = days.get(m.from) || [];
    const at = from.findIndex((l) => l.text.trim() === m.text);
    if (at < 0) return;
    const group = m.text.endsWith(":");
    let end = at + 1;
    while (end < from.length) {
      const words = from[end].text.trim();
      if (group ? (!words || words.endsWith(":")) : !words.startsWith(">")) break;
      end += 1;
    }
    const taken = from.splice(at, end - at);
    days.set(m.from, from);
    const into = days.get(m.to) || [];
    days.set(m.to, into.concat(into.length ? [{ text: "", done: false }] : [], taken));
  });
  return days;
}

// ---- 2026-10-16e: swapping two days. "the tasks shouldve TRANSFERRED.
// ALL of it, tho i can 'lock' a few takss individually". Everything on
// one day goes to the other and back, except lines she locked. A "> bit"
// goes (or stays) with the line above it. Blank lines aren't moved.
export function swapSplit(lines, day, locks) {
  const stay = [], go = [];
  let keep = false;
  (lines || []).forEach((l) => {
    const words = String(l.text || "").trim();
    if (!words) return;
    if (!words.startsWith(">")) keep = Boolean(locks && locks.has(dayKey(day, words)));
    (keep ? stay : go).push(l);
  });
  return { stay, go };
}

export function swapSig(found, day) {
  const d = ((found && found.days) || []).find((x) => x.day === day);
  return JSON.stringify(d ? d.lines.map((l) => l.text.trim()).filter(Boolean) : []);
}

// The days with her waiting swaps made, so a swap shows at once.
export function withSwaps(days, swaps, locks) {
  (swaps || []).forEach((sw) => {
    const a = swapSplit(days.get(sw.one) || [], sw.one, locks);
    const b = swapSplit(days.get(sw.two) || [], sw.two, locks);
    const join = (x, y) => x.concat(x.length && y.length ? [{ text: "", done: false }] : [], y);
    days.set(sw.one, join(a.stay, b.go));
    days.set(sw.two, join(b.stay, a.go));
  });
  return days;
}

// A swap waits until either day has changed on the laptop, or two minutes.
export function settleSwaps(swaps, found, nowMs) {
  return (swaps || []).filter((sw) => nowMs - sw.atMs <= 120000 &&
    swapSig(found, sw.one) === sw.before.one && swapSig(found, sw.two) === sw.before.two);
}

export function repeatOnDay(r, day) {
  const every = Math.max(1, Number(r.every) || 1);
  const unit = r.unit || "day";
  if (unit === "hour" || (unit === "day" && every === 1) || !r.from) return true;
  const gap = Math.round((atNoon(day) - atNoon(r.from)) / 86400000);
  return gap >= 0 && gap % (every * (unit === "week" ? 7 : 1)) === 0;
}
export function repeatWords(r) {
  const every = Math.max(1, Number(r.every) || 1);
  const unit = r.unit || "day";
  return every === 1 ? "every " + unit : "every " + every + " " + unit + "s";
}
export function repeatsOn(found, day) {
  return ((found && found.repeats) || []).filter((r) => (!r.from || r.from <= day) && (!r.until || day <= r.until))
    .filter((r) => repeatOnDay(r, day))
    .flatMap((r) => (r.unit === "hour" ? [r.text + " (" + repeatWords(r) + ")"]
                                       : Array(Math.max(1, Number(r.times) || 1)).fill(r.text)));
}

// 2026-10-18: "a total estimated task completition at the bottom; so, say
// if i have [x] tasks in english- i can choose how many i want to finish by
// what date. then itll say with the current plan setup ... u will have [x]
// tasks leftover from whatever lists". For each list with a goal: how many
// of its tasks are on days up to that date (its own lines put on a day, and
// each "do 1 from [LIST]" on a day), and how many short that leaves.
export function planCheck(found, today) {
  const now = isoDay(today);
  const tabs = bankTabs((found && found.bank) || []);
  const planned = (found && found.planned) || [];
  const goals = (found && found.goals) || {};
  const names = [];
  tabs.forEach((t) => names.push(t.name));
  planned.forEach((l) => { const n = l.list || BANK_OTHER; if (!names.includes(n)) names.push(n); });
  Object.keys(goals).forEach((n) => { if (!names.includes(n)) names.push(n); });
  const rows = names.map((name) => {
    const tab = tabs.find((t) => t.name === name);
    const inBank = tab ? tab.lines.filter((l) => !String(l.text).trim().startsWith(">")).length : 0;
    const mine = planned.filter((l) => (l.list || BANK_OTHER) === name);
    const goal = goals[name] || null;
    const by = goal ? goal.by : "";
    const pick = new RegExp("^do 1 from \\[" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\]", "i");
    const cards = ((found && found.days) || []).filter((d) => d.day >= now && (!by || d.day <= by))
      .reduce((n, d) => n + d.lines.filter((l) => !l.done && pick.test(String(l.text).trim())).length, 0);
    const onDays = mine.filter((l) => l.planned >= now && (!by || l.planned <= by)).length + cards;
    const open = inBank + mine.length;
    const want = goal ? Math.min(goal.count, open) : 0;
    return { name, open, inBank, planned: onDays, goal, want, short: goal ? Math.max(0, want - onDays) : 0,
             late: goal && goal.by < now };
  });
  const short = rows.filter((r) => r.short > 0);
  const total = short.reduce((n, r) => n + r.short, 0);
  const anyGoal = rows.some((r) => r.goal);
  return { rows, total,
           words: !anyGoal ? "Set how many you want to finish from a list, and by when."
             : total ? "With the plan as it is, you'll have " + total + " left over: " +
                       short.map((r) => r.name + " " + r.short).join(", ") + "."
             : "With the plan as it is, every goal's covered." };
}

// 2026-10-17: "i want eg 3 crochet bracelets and it should have the option
// to put them into sep tasks - it becomes crochet bracelet and 2 more times
// exact that". A line that starts with a number (2 to 20), or ends "x3",
// can be split. The one is the rest with its plural made single.
const NOT_PLURAL = new Set(["maths", "physics", "business", "economics", "class", "glass", "less", "this", "his",
  "is", "was", "us", "bus", "gas", "news", "series", "species", "chess", "dress", "press", "process", "notes"]);
export function singleOf(words) {
  const parts = String(words || "").trim().split(/\s+/);
  for (let i = 0; i < parts.length; i++) {
    const w = parts[i];
    const low = w.toLowerCase().replace(/[^a-z]/g, "");
    if (low.length < 4 || NOT_PLURAL.has(low) || !/s$/.test(low) || /ss$/.test(low)) continue;
    if (/ies$/.test(low)) parts[i] = w.replace(/ies$/i, "y");
    else if (/(ches|shes|xes|sses)$/.test(low)) parts[i] = w.replace(/es$/i, "");
    else parts[i] = w.replace(/s$/i, "");
    break;
  }
  return parts.join(" ");
}
export function splitLine(text) {
  const raw = String(text || "").trim();
  let found = raw.match(/^(\d{1,2})\s*(?:x\s+)?([a-z].*)$/i);
  if (found) {
    const n = Number(found[1]);
    const one = singleOf(found[2].replace(/^(?:more|x)\s+/i, ""));
    return n >= 2 && n <= 20 && one.length >= 2 ? { n, one } : null;
  }
  found = raw.match(/^(.+?)\s*[x\u00d7]\s*(\d{1,2})$/i);
  if (found) {
    const n = Number(found[2]);
    return n >= 2 && n <= 20 && found[1].trim().length >= 2 ? { n, one: found[1].trim() } : null;
  }
  return null;
}

// 2026-10-17: the tutor's chat off the laptop (live/chat), oldest first.
export function parseChat(held) {
  let rows = [];
  try { rows = JSON.parse(String((held && held.data) || "[]")); } catch (error) { rows = []; }
  return (Array.isArray(rows) ? rows : []).filter((r) => r && String(r.body || "").trim())
    .map((r) => ({ id: Number(r.id) || 0, who: String(r.who || ""), body: String(r.body), stamp: String(r.stamp || "") }));
}

// What she sent from here that the laptop hasn't shown yet. Gone once a
// "You" line with the same words is in the chat after she sent it.
export function chatWaiting(waiting, chat) {
  const mine = (chat || []).filter((m) => m.who === "You");
  return (waiting || []).filter((w) => !mine.some((m) => m.id > (Number(w.since) || 0) &&
    m.body.trim().toLowerCase() === String(w.text).trim().toLowerCase()));
}

// One cell a day: its lines, the tests on it and what's due on it.
// most is how many lines a cell shows (0 for all); the rest are counted.
export function calendarCells(days, found, moves, exams, tasks, today, most, swaps, locks, pending) {
  const now = isoDay(today);
  const held = locks || (found && found.locks) || new Set();
  const lists = withSwaps(withMoves(found, moves), swaps, held);
  const waiting = new Set((moves || []).map((m) => dayKey(m.to, m.text)));
  return days.map((day) => {
    // 2026-10-19c: a tick she's just made here shows at once (pending).
    const real = dayLines(lists.get(day) || [], day, pending).filter((l) => l.kind !== "gap");
    // 2026-10-16b: "id like to see them on future days too, but in a diff
    // colour so i can tell". A repeat not yet on that day's own list.
    const have = new Set(real.map((l) => String(l.raw || l.text).trim().toLowerCase()));
    const all = real.concat(day > now ? repeatsOn(found, day)
      .filter((r) => !have.has(r.toLowerCase()))
      .map((r) => ({ kind: "line", text: r, raw: r, done: false, repeat: true })) : []);
    const shown = most ? all.slice(0, most) : all;
    const when = atNoon(day);
    return { day, past: day < now, today: day === now, date: when.getDate(),
             name: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][when.getDay()],
             month: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][when.getMonth()],
             lines: shown.map((l) => ({ ...l, moving: waiting.has(dayKey(day, l.raw)),
                                        locked: held.has(dayKey(day, String(l.raw || l.text).trim())) })),
             more: all.length - shown.length,
             tests: (exams || []).filter((e) => String(e.date || "").slice(0, 10) === day)
               .map((e) => (e.subject || "Test") + " test"),
             due: (tasks || []).filter((t) => !t.done && String(t.due || "").slice(0, 10) === day)
               .map((t) => t.name || "") };
  });
}

// The same fingerprint the laptop gives a copy of her notes
// (free_note_version in main.py): FNV-1a over the words as UTF-8, and
// their length.
export function noteVersion(text) {
  const bytes = new TextEncoder().encode(String(text || ""));
  let mark = 0x811c9dc5;
  for (const byte of bytes) mark = Math.imul(mark ^ byte, 0x01000193) >>> 0;
  return mark.toString(16).padStart(8, "0") + "-" + bytes.length;
}

// ---- her notes. The box is hers while she's typing. What comes down from
// the laptop goes in the box only when she isn't in the middle of
// something: nothing typed and unsent, and nothing sent that the laptop
// hasn't taken yet (90 seconds at most).
//   box: {text, dirty, base, sent: {text, base, atMs} | null}
//   snap: {text, version} off the laptop, or null
// Returns {set, text, base, sent, words}.
export function notesIncoming(box, snap, nowMs) {
  const keep = { set: false, text: box.text, base: box.base, sent: box.sent || null, words: "" };
  if (!snap) return { ...keep, words: "Waiting for the laptop. Open the tutor and your notes show up here." };
  const theirs = String(snap.text || "");
  const version = String(snap.version || "");
  if (box.dirty) return { ...keep, words: "Typing. It sends when you stop." };
  let sent = box.sent || null;
  if (sent) {
    if (theirs === sent.text) sent = null;                       // the laptop has it
    else if (version === sent.base && nowMs - sent.atMs < 90000) {
      return { ...keep, words: "Sent. The laptop takes it in a few seconds while the tutor is open." };
    } else sent = null;                                          // changed there, or it never answered
  }
  if (theirs === box.text) return { set: false, text: theirs, base: version, sent, words: "Saved on the laptop." };
  return { set: true, text: theirs, base: version, sent,
           words: box.sent ? "The laptop had other notes too, so both are kept." : "Saved on the laptop." };
}

// ---- 2026-10-19i: the Day page ("Power Page"). One page a day like her
// notebook: the North Star (the one thing, done first), a few habits and
// mood / productivity, time blocks every half hour, the day's tasks, notes
// and what carries over. Kept in pages/<day>; habits in pages/setup.
export const PAGE_FROM_HOUR = 7;
export const PAGE_TO_HOUR = 23;
export const PAGE_MOST_HABITS = 5;
export const PAGE_MOST_STARS = 10;   // 2026-10-21: "i can have more than 3 North Stars" (was 3, 19n: "id like to add a few north stars")
export const PAGE_HABIT_IDEAS = ["Read 20 pages", "Exercise", "Outside 20 mins", "Water", "No phone in bed"];

export function pageData(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  const habits = {};
  if (d.habits && typeof d.habits === "object") {
    Object.keys(d.habits).forEach((k) => { if (d.habits[k]) habits[k] = true; });
  }
  const dots = (n) => Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  // 2026-10-19n: up to PAGE_MOST_STARS North Stars. A page saved with one
  // (star, starDone) still reads as that one.
  let stars = Array.isArray(d.stars)
    ? d.stars.map((s) => ({ text: String((s && s.text) || "").trim(), done: Boolean(s && s.done) })) : [];
  if (!stars.length && String(d.star || "").trim()) stars = [{ text: String(d.star).trim(), done: Boolean(d.starDone) }];
  const seenStar = new Set();
  stars = stars.filter((s) => {
    const k = s.text.toLowerCase();
    if (!s.text || seenStar.has(k)) return false;
    seenStar.add(k);
    return true;
  }).slice(0, PAGE_MOST_STARS);
  return { star: stars.length ? stars[0].text : "", starDone: stars.length ? stars[0].done : false, stars, habits,
           mood: dots(d.mood), prod: dots(d.prod), notes: String(d.notes || ""),
           urgent: Array.isArray(d.urgent) ? d.urgent.map(String) : [] };
}

export function pageHabits(raw) {
  const list = raw && Array.isArray(raw.habits) ? raw.habits : [];
  const seen = new Set();
  return list.map((h) => String(h || "").trim()).filter((h) => {
    const k = h.toLowerCase();
    if (!h || seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, PAGE_MOST_HABITS);
}

// The half hours down the side: 7:00 to 23:00, wider if something's outside.
export function pageSlots(timed) {
  let from = PAGE_FROM_HOUR * 60, to = PAGE_TO_HOUR * 60;
  (timed || []).forEach((t) => {
    from = Math.min(from, Math.floor(t.start / 30) * 30);
    to = Math.max(to, Math.ceil(t.end / 30) * 30 - 30);
  });
  const out = [];
  for (let m = from; m <= Math.min(to, 23 * 60 + 30); m += 30) out.push(m);
  return out;
}

// "Don't leave gaps": empty half hours between the first block and the last.
export function pageGaps(timed, fromMinute) {
  const items = (timed || []).filter((t) => t.end > (fromMinute || 0));
  if (items.length < 2) return [];
  const first = Math.max(fromMinute || 0, Math.min(...items.map((t) => t.start)));
  const last = Math.max(...items.map((t) => t.end));
  const gaps = [];
  for (let m = Math.ceil(first / 30) * 30; m + 30 <= last; m += 30) {
    if (!items.some((t) => t.start < m + 30 && t.end > m)) gaps.push(m);
  }
  return gaps;
}

// "Be realistic": a quarter more time, to the quarter hour.
export function longerBy(at, share) {
  const p = timeParts(at);
  if (!p) return "";
  const len = p.end !== null ? p.end - p.start : 30;
  const more = Math.max(15, Math.round(len * (share || 0.25) / 15) * 15);
  return timeSpan(p.start, p.start + len + more);
}

// The night before: dump the tasks, give them times, pick the North Star.
export function pageSteps(lines, day, times, star) {
  const open = (lines || []).filter((l) => l.kind === "line" && !l.done && !l.repeat);
  const timed = open.filter((l) => timeParts((times || {})[day + "|" + l.raw]));
  return [
    { key: "dump", words: "Brain dump the tasks", done: open.length > 0 },
    { key: "times", words: "Give each one a time", done: open.length > 0 && timed.length === open.length,
      left: open.length - timed.length },
    { key: "star", words: "Pick your North Star", done: Boolean(star) },
  ];
}

// What's left over, the urgent ones first.
export function carryList(lines, urgent) {
  const hot = new Set((urgent || []).map((u) => String(u)));
  const open = (lines || []).filter((l) => l.kind === "line" && !l.done && !l.repeat);
  return open.filter((l) => hot.has(l.raw)).concat(open.filter((l) => !hot.has(l.raw)))
    .map((l) => ({ ...l, urgent: hot.has(l.raw) }));
}


// ---- 2026-10-19o: smart planning. "u see what i haev to do, ask what tasks
// MUST i do (u choose - is it hw or not? test upcoming or no? confident or
// no?) and then i say deadline is eg this day, and youll set it up so im all
// ready". smartItems makes the guesses, she fixes them, smartPlan spreads the
// work over the days before each deadline.
// 2026-10-20: rebuilt. "OMG this is awufl. ITS IMPRACTICAL- how much work does
// it expect me to DO?", "where does it keep on getting 'HW YOUNG OMAN'", "no
// balance no variation and THERES NO COLOURS", "wakeup time = time i open
// laptop, and set it in the actual TIMED CALENDAR". Now: her task list only
// counts when a task has a due date (never its "-->" steps or a heading), no
// "HW: " put on the front, a limit of work per day, every piece at a time
// with a break after it, subjects mixed, and what won't fit is said, not
// crammed in.
const SMART_HW = /\b(hw|homework|worksheet|assignment|due|classroom|essay)\b/i;
const SMART_TEST = /\b(revise|revision|test|exam|quiz|mock|flashcards?|past papers?|practice)\b/i;
export const SMART_SESSIONS = { yes: 1, kinda: 2, no: 3 };
export const SMART_MOST = 200;   // 2026-10-20c: was 40 ("theres a lot more tasks than just this")
export const SMART_MINUTES = { hw: 30, test: 25, other: 20 };
export const SMART_BREAK = 10;
export const SMART_PER_DAY = 12;                    // new pieces on one day, at most (2026-10-20b: was 4; the time a day is the real limit)
// What an earlier smart plan put on her days (the clean-up finds these).
export const SMART_MADE = /^(HW: .+|Go over .+ \(\d+ of \d+\))$/;
const SMART_STEP = /^['"‘’]?\s*(-+>|>|→)/;   // "--> create name", a step of the task above

function smartDay(iso, by) {
  const d = new Date(String(iso).slice(0, 10) + "T12:00:00");
  d.setDate(d.getDate() + by);
  return isoDay(d);
}
const SMART_ISO = /^\d{4}-\d{2}-\d{2}$/;

export function smartItems(found, tasks, exams, subjects, today) {
  const now = isoDay(today);
  const out = [];
  const seen = new Set();
  const nextTest = (subject) => {
    if (!subject) return "";
    const key = String(subject).toLowerCase();
    return (exams || []).map((e) => ({ s: String((e && e.subject) || "").toLowerCase(), d: String((e && e.date) || "").slice(0, 10) }))
      .filter((e) => e.s === key && SMART_ISO.test(e.d) && e.d >= now).map((e) => e.d).sort()[0] || "";
  };
  const add = (text, from, day, extra) => {
    const words = String(text || "").trim();
    if (!words || words.startsWith(">") || /^do \d+ from \[/i.test(words)) return;
    if (SMART_MADE.test(words) || /:\s*$/.test(words)) return;   // 2026-10-20
    if (extra && extra.hw && SMART_STEP.test(words)) return;      // 2026-10-20c: only her task list's steps; on a day or in the bank they're real tasks
    const key = words.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const x = extra || {};
    const subject = guessSubject(words, subjects || []) || String(x.subject || "");
    const test = nextTest(subject);
    const left = test ? daysUntil(test, today) : null;
    const kind = x.hw || SMART_HW.test(words) ? "hw"
      : SMART_TEST.test(words) || (left !== null && left <= 21) ? "test" : "other";
    const due = SMART_ISO.test(String(x.due || "")) ? String(x.due) : "";
    const by = due || (kind === "test" ? test : "") || "";
    out.push({ key, text: words, from, day: day || "", subject, list: String(x.list || ""), pick: Boolean(x.pick),
               id: x.id === undefined || x.id === null ? "" : String(x.id),   // 2026-10-19q: homework's id, to tick it
               must: kind !== "other", kind, test: Boolean(test), testDay: test,
               confident: kind === "test" && left !== null && left <= 7 ? "no" : "kinda", by });
  };
  ((found && found.days) || []).filter((d) => d.day >= now).forEach((d) =>
    d.lines.forEach((l) => { if (!l.done && !l.fun) add(l.text, "day", d.day); }));
  ((found && found.bank) || []).forEach((l) => add(l.text, "bank", "", { list: l.list, pick: l.subjects, subject: l.list }));
  // 2026-10-20: only a task with a real due date is homework. Headings and
  // their steps (YOUNG OMAN, "--> create name") stay out.
  (tasks || []).forEach((t) => {
    if (!t || t.done || !SMART_ISO.test(String(t.due || "").slice(0, 10))) return;
    add(t.name, "hw", "", { hw: true, due: String(t.due).slice(0, 10), subject: t.subject, id: t.id });
  });
  const rank = { hw: 0, test: 1, other: 2 };
  return out.sort((a, b) => Number(b.must) - Number(a.must) || (a.by || "9999").localeCompare(b.by || "9999") ||
    rank[a.kind] - rank[b.kind]).slice(0, SMART_MOST);
}

// 2026-10-19r: "id ideally like this all done BEFORE the halfterm", "today- its
// too late. cant have anything for today", "not really add much for tmrw cause
// ive already done that". opts.start: the first day anything goes on.
// opts.light: days that get at most one new thing. The deadline is a cap:
// nothing goes after it.
export const HALF_TERMS = [{ from: "2026-10-16", to: "2026-10-24" }];   // 2026-10-15c: Fri 16 to Sat 24
export function smartDefaults(today) {
  const now = isoDay(today);
  const late = today.getHours() >= 18;
  const start = late ? smartDay(now, 1) : now;
  const term = HALF_TERMS.find((t) => now >= t.from && now <= t.to);
  const deadline = term && term.to > start ? term.to : smartDay(start, 7);
  // 2026-10-20: two hours a day, from 9am (today: from when she's planning).
  // 2026-10-20b: "its not a school day- i ahve from 8am-7pm more or less":
  // in a holiday six hours a day, 8am to 7pm.
  if (term) return { start, deadline, light: late ? [start] : [], budget: 360, dayStart: 8 * 60, dayEnd: 19 * 60,
                     spread: "even", piece: 0, timeAll: true };
  return { start, deadline, light: late ? [start] : [], budget: 120, dayStart: 9 * 60, dayEnd: 21 * 60,
           spread: "even", piece: 0, timeAll: true };
}

// Free time on a day: from `from` on, skipping what already has a time.
function smartFree(busy, from, mins) {
  let at = from;
  const sorted = busy.slice().sort((a, b) => a.start - b.start);
  for (let guard = 0; guard < 50; guard++) {
    const hit = sorted.find((b) => at < b.end && at + mins > b.start);
    if (!hit) break;
    at = hit.end;
  }
  return at + mins <= 23 * 60 ? at : null;
}

// ---- 2026-10-20c: subjects first. "it should have atleast one task from each
// subject each day- and i can say prioritise x subjects", "i can put in a
// chat that oh, i have to do the geo case study soonish, and i have to finish
// all of dt. i HAVE to revise for bio. i should then do physics revision, but
// i HAVE to do my seneca. i SHOULD do english- but its really more lie a bit
// a day rather than it all at once."
// Levels: must (3 shares), soon (2), should (2), daily (one piece every day),
// normal (1), skip (left out unless she says Must do on the task itself).
export const SMART_LEVELS = [["must", "Must"], ["soon", "Soon"], ["should", "Should"], ["daily", "A bit a day"], ["skip", "Not now"]];
const SMART_WEIGHT = { must: 3, soon: 2, should: 2, daily: 1, normal: 1, skip: 0 };
const SMART_ALIASES = { bio: "biology", biol: "biology", chem: "chemistry", phys: "physics", physic: "physics",
  geo: "geography", geog: "geography", eng: "english", lit: "english", lang: "english", math: "maths", maths: "maths",
  dt: "dt", "d&t": "dt", "design technology": "dt", design: "dt", fr: "french", fren: "french", french: "french",
  bus: "business", busi: "business", business: "business" };
export function smartSubjectKey(name) {
  const low = String(name || "").trim().toLowerCase();
  if (!low) return "";
  if (SUBJECT_HEX[low]) return low;
  if (SMART_ALIASES[low]) return SMART_ALIASES[low];
  const hit = Object.keys(SUBJECT_HEX).find((k) => low.startsWith(k) || k.startsWith(low) && low.length >= 3);
  return hit || low;
}
const SMART_STOP = new Set(["have", "need", "should", "must", "then", "really", "more", "like", "rather", "than", "with",
  "that", "this", "just", "also", "finish", "revise", "revision", "soonish", "soon", "time", "once", "every", "each",
  "little", "bit", "day", "days", "all", "and", "but", "the", "for", "into", "from", "what", "want", "gotta", "got"]);
// Her words to levels: { subjects: {biology: "must"}, words: {seneca: "must"} }.
export function smartReadWords(text, items) {
  const subjects = {};
  const words = {};
  const texts = (items || []).map((it) => String(it.text || "").toLowerCase());
  let lastSubjects = [];
  let lastWords = [];
  String(text || "").split(/[.!?;\n]+|,\s*but\s+|\bbut\b/i).forEach((part) => {
    const raw = part.trim();
    if (!raw) return;
    const low = raw.toLowerCase();
    const level = /\b(don'?t need|no need|not now|skip|leave)\b/.test(low) ? "skip"
      : /\b(a bit a day|bit a day|bit each day|a little (?:a|each|every) day|bit by bit|every day|each day|daily)\b/.test(low) ? "daily"
      : /\b(have to|must|need to|got to|gotta|has to)\b/.test(low) || /\bHAVE\b/.test(raw) ? "must"
      : /\b(soon|soonish|before long)\b/.test(low) ? "soon"
      : /\b(should|could|would like|want to)\b/.test(low) ? "should" : "";
    if (!level) {
      const tk = low.replace(/[^a-z&\s]/g, " ").split(/\s+/).filter(Boolean);
      const ks = tk.map((t) => (SUBJECT_HEX[t] ? t : SMART_ALIASES[t] || "")).filter(Boolean);
      if (ks.length) { lastSubjects = ks; lastWords = []; }
      return;
    }
    const tokens = low.replace(/[^a-z&\s]/g, " ").split(/\s+/).filter(Boolean);
    const mineS = [];
    const mineW = [];
    tokens.forEach((t, n) => {
      const two = n + 1 < tokens.length ? t + " " + tokens[n + 1] : "";
      const key = SUBJECT_HEX[t] ? t : SMART_ALIASES[two] || SMART_ALIASES[t] || "";
      if (key) mineS.push(key);
    });
    tokens.forEach((t) => {
      if (t.length < 4 || SMART_STOP.has(t) || SUBJECT_HEX[t] || SMART_ALIASES[t]) return;
      if (texts.some((x) => x.includes(t))) mineW.push(t);
    });
    // "i SHOULD do english- but its really more a bit a day": a part with no
    // subject of its own is about the one just before it.
    const useS = mineS.length || mineW.length ? mineS : lastSubjects;
    const useW = mineS.length || mineW.length ? mineW : lastWords;
    useS.forEach((k) => { subjects[k] = level; });
    useW.forEach((w) => { words[w] = level; });
    lastSubjects = useS;
    lastWords = useW;
  });
  return { subjects, words };
}
// The level a task gets from her subjects and words.
export function smartLevelOf(it, prefs) {
  const p = prefs || {};
  let best = (p.subjects || {})[smartSubjectKey(it.subject)] || "normal";
  const low = String(it.text || "").toLowerCase();
  Object.keys(p.words || {}).forEach((w) => {
    if (low.includes(w) && (SMART_WEIGHT[p.words[w]] || 0) >= (SMART_WEIGHT[best] || 0)) best = p.words[w];
  });
  return best;
}

// steps: {act: "add" | "move" | "keep" | "time", id, text, day, at, mins, subject, from, pick}.
// opts: start, light, budget (minutes of work a day, what's already on the
// day counts), dayStart / dayEnd, nowMin (today), spread ("even" | "early"),
// piece (minutes a piece, 0 = by kind), timeAll, skip, prefs ({subjects, words}).
// must: true, "maybe" (only if there's room), false; a task she hasn't
// answered comes in when its subject is wanted (anything but Not now).
// 2026-10-20c: day by day: every wanted subject gets a piece each day it has
// one to give, then the rest goes by share (Must three times as often as an
// ordinary one), up to an even share of the work a day.
const SMART_GO_OVER = /^Go over (.+) \((\d+) of (\d+)\)$/;
export function smartPlan(items, answers, found, today, deadline, opts) {
  const o = opts || {};
  const prefs = o.prefs || {};
  const todayIso = isoDay(today);
  const now = SMART_ISO.test(String(o.start || "")) && String(o.start) > todayIso ? String(o.start) : todayIso;
  const light = new Set(Array.isArray(o.light) ? o.light : []);
  const skip = new Set(Array.isArray(o.skip) ? o.skip : []);
  const budget = Math.max(30, Math.min(720, Number(o.budget) || 120));
  const dayStart = Math.max(5 * 60, Math.min(14 * 60, Number(o.dayStart) || 9 * 60));
  const dayEnd = Math.max(dayStart + 60, Math.min(23 * 60, Number(o.dayEnd) || 21 * 60));
  const spread = o.spread === "early" ? "early" : "even";
  const piece = Math.max(0, Math.min(120, Number(o.piece) || 0));
  const fallback = SMART_ISO.test(String(deadline || "")) ? String(deadline) : smartDay(now, 7);
  const times = (found && found.times) || {};
  const allDays = (found && found.days) || [];
  const load = {};
  const lineMins = (d, text) => { const p = timeParts(times[d + "|" + text]); return p && p.end !== null ? p.end - p.start : 20; };
  allDays.forEach((d) => { load[d.day] = d.lines.filter((l) => !l.done).reduce((n, l) => n + lineMins(d.day, l.text), 0); });
  const added = {};
  const steps = [];
  const late = [];
  const unplaced = [];
  const range = [];
  for (let d = now; d <= fallback && range.length < 60; d = smartDay(d, 1)) range.push(d);
  const byOf = (it) => {
    const own = SMART_ISO.test(String(it.by || "")) ? String(it.by) : fallback;
    return own > fallback ? fallback : own;
  };
  const place = (it, text, day, act, mins) => {
    const id = day + "|" + text;
    if (skip.has(id)) return;
    steps.push({ act, id, text, day, at: "", mins, subject: it.subject || "", kind: it.kind,
                 from: it.from === "day" ? it.day : it.from, pick: it.pick });
    if (act === "keep") return;
    load[day] = (load[day] || 0) + mins;
    added[day] = (added[day] || 0) + 1;
  };
  const goOvers = (text) => {
    const out = [];
    allDays.filter((d) => d.day >= todayIso).forEach((d) => d.lines.forEach((l) => {
      const m = SMART_GO_OVER.exec(String(l.text || "").trim());
      if (m && m[1] === text && !l.done) out.push({ day: d.day, text: l.text });
    }));
    return out;
  };
  // Which tasks, at what level, cut into pieces.
  const pieces = [];
  (items || []).forEach((raw) => {
    const said = (answers && answers[raw.key]) || {};
    const it = { ...raw, ...said };
    const level = smartLevelOf(it, prefs);
    let want = said.must !== undefined ? it.must : level === "skip" ? false : level !== "normal" ? true : it.must;
    if (want === false) return;
    const optional = want === "maybe";
    const by = byOf(it);
    if (by < now && !optional) late.push(it.text);
    let last = it.kind === "other" ? by : smartDay(by, -1);
    if (last < now) last = now;
    const mins = piece || SMART_MINUTES[it.kind] || 20;
    const subj = smartSubjectKey(it.subject) || "other";
    const base = { it, mins, last, subj, level, optional, weight: SMART_WEIGHT[level] || 1 };
    if (it.from === "day" && it.day >= now && it.day <= last) {
      place(it, it.text, it.day, "keep", lineMins(it.day, it.text));   // already on a day in time: left there
      if (it.kind !== "test") return;
    }
    if (it.kind === "test") {
      const had = goOvers(it.text);
      had.forEach((g) => place(it, g.text, g.day, "keep", lineMins(g.day, g.text)));
      // 2026-10-21: "there are doubles omg! revmove them - only need to do tasks once". One go each
      // (it was 1, 2 or 3 by how confident she was: SMART_SESSIONS).
      const n = SMART_ONCE ? 1 : Math.max(1, SMART_SESSIONS[it.confident] || 2);
      const onDay = it.from === "day" && it.day >= now && it.day <= last;
      for (let i = had.length; i < n - (onDay ? 1 : 0); i++) {
        const isLast = i === n - 1 && !onDay;
        pieces.push({ ...base, text: isLast ? it.text : "Go over " + it.text + " (" + (i + 1) + " of " + n + ")",
                      act: isLast ? (it.from === "hw" ? "add" : "move") : "add", order: i });
      }
      return;
    }
    pieces.push({ ...base, text: it.text, act: it.from === "hw" ? "add" : "move", order: 0 });
  });
  pieces.sort((a, b) => a.last.localeCompare(b.last) || a.order - b.order);
  // Even: every day aims at the same total, what's on it already included
  // (water-filling: a day that's full already gets nothing new).
  const fresh0 = pieces.filter((p) => !p.optional).reduce((n, p) => n + p.mins, 0);
  let level = 0;
  for (let lo = 0, hi = budget, k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2;
    const room = range.reduce((n, d) => n + Math.max(0, mid - (load[d] || 0)), 0);
    if (room >= fresh0) { hi = mid; level = mid; } else lo = mid;
    if (k === 29 && !level) level = budget;
  }
  const target = spread === "early" ? budget : Math.min(budget, Math.max(30, Math.ceil(level / 5) * 5));
  const fits = (d, mins, cap) => (load[d] || 0) + mins <= cap && (load[d] || 0) + mins <= budget &&
    (added[d] || 0) < (light.has(d) ? 1 : SMART_PER_DAY);
  const left = pieces.slice();
  const credit = {};
  range.forEach((d) => {
    const ready = () => left.filter((p) => p.last >= d);
    const takeFor = (subj) => {
      const i = left.findIndex((p) => p.subj === subj && p.last >= d && (p.order === 0 || !steps.some((st) => st.day === d && st.text.startsWith("Go over " + p.it.text))));
      return i < 0 ? null : left.splice(i, 1)[0];
    };
    const put = (p) => { place(p.it, p.text, d, p.act, p.mins); };
    // A piece whose last day is today goes in if it fits the whole day.
    left.filter((p) => p.last === d && !p.optional && p.level !== "daily").slice().forEach((p) => {
      if (fits(d, p.mins, budget)) { left.splice(left.indexOf(p), 1); put(p); }
    });
    // One from every wanted subject (A bit a day ones first), best first.
    const subs = [...new Set(ready().filter((p) => !p.optional).map((p) => p.subj))]
      .sort((a, b) => {
        const pa = left.find((p) => p.subj === a), pb = left.find((p) => p.subj === b);
        return (pb.level === "daily") - (pa.level === "daily") || pb.weight - pa.weight || pa.last.localeCompare(pb.last);
      });
    subs.forEach((sub) => {
      const p = left.find((x) => x.subj === sub && x.last >= d && !x.optional);
      if (p && fits(d, p.mins, target)) { const got = takeFor(sub); if (got) put(got); }
    });
    // Then by share, up to the day's even share.
    for (let guard = 0; guard < 40; guard++) {
      const open = [...new Set(ready().filter((p) => !p.optional && p.level !== "daily").map((p) => p.subj))];
      if (!open.length) break;
      open.forEach((sub) => { credit[sub] = (credit[sub] || 0) + (left.find((p) => p.subj === sub).weight || 1); });
      const sub = open.sort((a, b) => credit[b] - credit[a])[0];
      const p = left.find((x) => x.subj === sub && x.last >= d && !x.optional);
      if (!p || !fits(d, p.mins, target)) break;
      credit[sub] -= 4;
      const got = takeFor(sub);
      if (!got) break;
      put(got);
    }
  });
  // If there's time: wherever there's room left.
  left.filter((p) => p.optional).slice().forEach((p) => {
    const d = range.filter((x) => x <= p.last).find((x) => fits(x, p.mins, budget));
    if (d) { left.splice(left.indexOf(p), 1); place(p.it, p.text, d, p.act, p.mins); }
  });
  // A bit a day: more of it goes only on a day without one; the rest carries on after.
  const later = [];
  left.filter((p) => !p.optional && p.level === "daily").slice().forEach((p) => {
    const d = range.filter((x) => x <= p.last && !steps.some((st) => st.day === x && smartSubjectKey(st.subject) === p.subj && st.act !== "keep"))
      .find((x) => fits(x, p.mins, budget));
    left.splice(left.indexOf(p), 1);
    if (d) place(p.it, p.text, d, p.act, p.mins); else later.push(p.text);
  });
  // Anything left that's needed: any day before its last with room in the whole day.
  left.filter((p) => !p.optional).slice().forEach((p) => {
    const d = range.filter((x) => x <= p.last).sort((a, b) => (load[a] || 0) - (load[b] || 0)).find((x) => fits(x, p.mins, budget));
    if (d) { left.splice(left.indexOf(p), 1); place(p.it, p.text, d, p.act, p.mins); }
    else unplaced.push(p.text);
  });
  // Her lines on those days with no time get one too, if she wants.
  if (o.timeAll !== false) {
    const taken = new Set(steps.map((st) => st.day + "|" + st.text));
    allDays.filter((d) => range.includes(d.day)).forEach((d) => d.lines.forEach((l) => {
      const t = String(l.text || "").trim();
      const id = d.day + "|" + t;
      if (l.done || !t || taken.has(id) || times[id] || skip.has(id) || t.startsWith(">")) return;
      steps.push({ act: "time", id, text: t, day: d.day, at: "", mins: 20, subject: "", kind: "other", from: d.day, pick: false });
    }));
  }
  // Times: from the start of her day (today: from now), a break after each,
  // round what already has a time, no two of one subject back to back, and
  // nothing after the end of her day.
  const events = (found && found.events) || [];
  const days = {};
  steps.forEach((st) => { (days[st.day] = days[st.day] || []).push(st); });
  Object.keys(days).forEach((d) => {
    const busy = [];
    Object.keys(times).forEach((k) => {
      if (!k.startsWith(d + "|")) return;
      const p = timeParts(times[k]);
      if (p) busy.push({ start: p.start, end: p.end !== null ? p.end : p.start + 30 });
    });
    events.filter((e) => e.day === d && e.start).forEach((e) => {
      const p = timeParts(e.start + (e.end ? "-" + e.end : ""));
      if (p) busy.push({ start: p.start, end: p.end !== null ? p.end : p.start + 60 });
    });
    let cursor = dayStart;
    if (d === todayIso && Number.isFinite(Number(o.nowMin))) cursor = Math.max(cursor, Math.ceil((Number(o.nowMin) + 5) / 15) * 15);
    const pool = days[d].filter((st) => st.act !== "keep" || !times[st.id]);
    const order = [];
    while (pool.length) {
      const prev = order.length ? order[order.length - 1].subject : null;
      const i = pool.findIndex((st) => !st.subject || smartSubjectKey(st.subject) !== smartSubjectKey(prev));
      order.push(pool.splice(i < 0 ? 0 : i, 1)[0]);
    }
    order.forEach((st) => {
      const at = smartFree(busy, cursor, st.mins);
      if (at === null || at + st.mins > dayEnd) return;
      st.at = timeSpan(at, at + st.mins);
      busy.push({ start: at, end: at + st.mins });
      cursor = at + st.mins + SMART_BREAK;
    });
    days[d] = days[d].slice().sort((a, b) => (a.at || "99").localeCompare(b.at || "99"));
  });
  const fresh = steps.filter((st) => st.act === "add" || st.act === "move");
  return { steps, late, days, unplaced, later, load, target,
           changes: steps.filter((st) => st.act !== "keep" && (st.act !== "time" || st.at)).length,
           minutes: fresh.reduce((n, st) => n + st.mins, 0) };
}

// 2026-10-20: the clean-up. Lines an earlier smart plan put on her days, from
// today on: anything it remembers making, and anything shaped like it.
export function smartLeftovers(found, made, today) {
  const now = isoDay(today);
  const out = [];
  // 2026-10-20c: only the "HW: " ones and second copies of one line on one
  // day. A "Go over" she set up is her plan now, not mess.
  ((found && found.days) || []).filter((d) => d.day >= now).forEach((d) => {
    const seen = new Set();
    d.lines.forEach((l) => {
      const t = String(l.text || "").trim();
      if (l.done || !t) return;
      if (/^HW: /.test(t) || (seen.has(t) && /^Go over /.test(t))) out.push({ day: d.day, text: t });
      seen.add(t);
    });
  });
  return out;
}


// ---- 2026-10-20d: the Day page is her "today". "i can also pick what i want
// to do- like forcing me to do dt when im feeling math is just wrong", "what
// dont i want to do today? thats should be ok", "it shuffles it to tmrw only
// when i wake up tmrw and some things arent done", "1 with 3 is best": one
// thing at a time, loose blocks (morning, afternoon, evening), no clock.
export const NOW_BLOCKS = [["morning", "Morning", 0, 12 * 60], ["afternoon", "Afternoon", 12 * 60, 17 * 60],
                           ["evening", "Evening", 17 * 60, 24 * 60]];
function nowOpen(lines) {
  return (lines || []).filter((l) => l && l.kind === "line" && !l.done && !l.repeat &&
    !String(l.raw || "").trim().startsWith(">"));
}
export function nowBlockOf(minute) {
  const b = NOW_BLOCKS.find((x) => minute >= x[2] && minute < x[3]);
  return b ? b[0] : "evening";
}
// Her open lines on a day in blocks; a line with no time is "any time".
export function nowBlocks(lines, day, times) {
  const out = { morning: [], afternoon: [], evening: [], any: [] };
  nowOpen(lines).forEach((l) => {
    const p = timeParts((times || {})[day + "|" + l.raw]);
    if (!p) out.any.push(l); else out[nowBlockOf(p.start)].push({ ...l, start: p.start });
  });
  ["morning", "afternoon", "evening"].forEach((k) => out[k].sort((a, b) => a.start - b.start));
  return out;
}
// What's on now: the one she picked if it's still open, else what's timed
// for now, else the next one with a time, else the first with none.
export function nowPick(lines, day, times, nowMin, chosen) {
  const open = nowOpen(lines);
  if (chosen) { const c = open.find((l) => l.raw === chosen); if (c) return c; }
  const timed = open.map((l) => ({ l, p: timeParts((times || {})[day + "|" + l.raw]) })).filter((x) => x.p)
    .sort((a, b) => a.p.start - b.p.start);
  const on = timed.find((x) => x.p.start <= nowMin && (x.p.end !== null ? x.p.end : x.p.start + 30) > nowMin);
  if (on) return on.l;
  const next = timed.find((x) => x.p.start > nowMin);
  if (next) return next.l;
  const free = open.find((l) => !timeParts((times || {})[day + "|" + l.raw]));
  return free || (timed.length ? timed[timed.length - 1].l : null);
}
// Yesterday's leftovers, moved to today once on the first open of a new day.
export function nowRollover(found, today, locks) {
  const now = isoDay(today);
  const d = new Date(now + "T12:00:00");
  d.setDate(d.getDate() - 1);
  const yesterday = isoDay(d);
  const day = ((found && found.days) || []).find((x) => x.day === yesterday);
  if (!day) return [];
  const locked = locks || new Set();
  return day.lines.filter((l) => {
    const t = String(l.text || "").trim();
    return t && !l.done && !t.startsWith(">") && !/^do \d+ from \[/i.test(t) && !locked.has(yesterday + "|" + t);
  }).map((l) => ({ text: String(l.text).trim(), from: yesterday }));
}


// ---- 2026-10-20e: treats. "i want to be able to say if i do this task, i get
// x reward. likie if i do even 3 tasks then i get a zbar." A rule is
// {id, kind: "count", n, reward} (n tasks ticked today) or {id, kind: "task",
// task, reward} (that task ticked). Each is earned once a day.
export function treatRules(raw) {
  // 2026-10-21: two more kinds. "set": after a set she picks (some tasks, or
  // every task of one subject that day). "timer": while doing one task, with a
  // timer; earned only when she says yes, she finished it (the line is ticked).
  const setTasks = (r) => (Array.isArray(r.tasks) ? r.tasks : []).map((t) => String(t || "").trim()).filter(Boolean).slice(0, 30);
  return (Array.isArray(raw) ? raw : []).filter((r) => r && String(r.reward || "").trim() &&
    ((r.kind === "count" && Number(r.n) >= 1) || (r.kind === "task" && String(r.task || "").trim()) ||
     (r.kind === "set" && (setTasks(r).length || String(r.subject || "").trim())) ||
     (r.kind === "timer" && String(r.task || "").trim())))
    .map((r) => ({ id: String(r.id || ""), kind: r.kind, n: Math.max(1, Math.min(50, Math.round(Number(r.n) || 1))),
                   task: String(r.task || "").trim(), reward: String(r.reward).trim().slice(0, 80),
                   day: /^\d{4}-\d{2}-\d{2}$/.test(String(r.day || "")) ? String(r.day) : "",
                   tasks: r.kind === "set" ? setTasks(r) : [],
                   subject: r.kind === "set" ? String(r.subject || "").trim() : "",
                   minutes: r.kind === "timer" ? Math.max(5, Math.min(180, Math.round(Number(r.minutes) || 30))) : 0 }));
}
// 2026-10-21: what a "set" rule counts: its own tasks, or that subject's lines
// on the day (ctx.lines: [{raw, done, subject}]).
function treatSetParts(rule, done, ctx) {
  if (rule.tasks.length) return { all: rule.tasks.length, got: rule.tasks.filter((t) => done.includes(t.toLowerCase())).length };
  const want = rule.subject.toLowerCase();
  const mine = ((ctx && ctx.lines) || []).filter((l) => String(l.subject || "").toLowerCase() === want);
  return { all: mine.length, got: mine.filter((l) => l.done).length };
}
// 2026-10-20k: "its cause im planning for tmrw. it should do it by whatwever
// im on". A rule made on a day's page is for that day (r.day); an older rule
// with no day is for every day, as before.
export function treatsForDay(rules, day) {
  return treatRules(rules).filter((r) => !r.day || r.day === day);
}
// Which rules are earned now that weren't before. doneTexts: today's ticked lines.
export function treatsEarned(rules, doneTexts, got, day, ctx) {
  const have = new Set(got || []);
  const done = (doneTexts || []).map((t) => String(t).trim().toLowerCase());
  // 2026-10-20k: with a day, only that day's rules (and every-day ones) count.
  return (day ? treatsForDay(rules, day) : treatRules(rules)).filter((r) => !have.has(r.id) && treatMet(r, done, ctx));
}
function treatMet(r, done, ctx) {
  if (r.kind === "count") return done.length >= r.n;
  if (r.kind === "set") { const p = treatSetParts(r, done, ctx); return p.all > 0 && p.got >= p.all; }
  return done.includes(r.task.toLowerCase());          // task, and timer (ticked on her yes)
}
export function treatProgress(rule, doneTexts, ctx) {
  const done = (doneTexts || []).map((t) => String(t).trim().toLowerCase());
  if (rule.kind === "count") return Math.min(rule.n, done.length) + " of " + rule.n;
  if (rule.kind === "set") { const p = treatSetParts(rule, done, ctx); return p.all ? p.got + " of " + p.all : "nothing on this day yet"; }
  return done.includes(rule.task.toLowerCase()) ? "done" : "not yet";
}
// How a rule reads on the card.
export function treatWords(r, label) {
  const name = (t) => "\u201c" + (label ? label(t) : t) + "\u201d";
  if (r.kind === "count") return "After " + r.n + " " + (r.n === 1 ? "task" : "tasks");
  if (r.kind === "set") return r.tasks.length ? "After " + r.tasks.map(name).join(", ") : "After all my " + r.subject + " today";
  if (r.kind === "timer") return "While doing " + name(r.task) + " (" + r.minutes + " min timer)";
  return "When " + name(r.task) + " is done";
}

// ---- 2026-10-21: "while doing X". A timer from the Now card; when it ends the
// tutor asks "did you finish X?". The laptop sends what it's holding in
// live/alldays as "doing": {text, day, until "YYYY-MM-DD HH:MM:SS", minutes, asks}.
export const SMART_ONCE = true;     // 2026-10-21: a task is done once, no "Go over X (1 of 2)"
export const DOING_MINUTES = [15, 25, 30, 45, 60];
export const DOING_AGAIN_MIN = 15;
export function doingOf(live) {
  let held = null;
  try { held = JSON.parse((live && live.data) || "null"); } catch (error) { held = null; }
  const d = held && held.doing;
  if (!d || typeof d !== "object" || !String(d.text || "").trim()) return null;
  const until = String(d.until || "");
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(until)) return null;
  return { text: String(d.text).trim(), day: String(d.day || until.slice(0, 10)), until,
           minutes: Math.round(Number(d.minutes) || 0), asks: Math.round(Number(d.asks) || 0) };
}
export function doingLeft(doing, now) {
  if (!doing || !doing.until) return null;
  const [d, t] = doing.until.split(" ");
  const [y, m, dd] = d.split("-").map(Number);
  const [hh, mm, ss] = t.split(":").map(Number);
  const end = new Date(y, m - 1, dd, hh, mm, ss || 0);
  return Math.ceil((end.getTime() - now.getTime()) / 60000);
}
export function doingUntil(now, minutes) {
  const end = new Date(now.getTime() + Math.round(Number(minutes) || 0) * 60000);
  const p = (n) => String(n).padStart(2, "0");
  return end.getFullYear() + "-" + p(end.getMonth() + 1) + "-" + p(end.getDate()) + " " + p(end.getHours()) + ":" + p(end.getMinutes()) + ":" + p(end.getSeconds());
}

// ---- 2026-10-21: the Day page's prayers and meals, and school hours. The
// laptop sends its Muscat prayer times ("prayers": {day: {Fajr: "05:01" ...}}),
// what she's logged ("logged": {"day|Name": "HH:MM"}), and the lessons on
// school days ("school": {day: [{subject, start, end}]}).
export const PAGE_PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
export const PAGE_MEALS = ["Breakfast", "Fruit", "Lunch", "Dinner"];
export function dayExtras(live) {
  let held = null;
  try { held = JSON.parse((live && live.data) || "null"); } catch (error) { held = null; }
  const clock = (v) => /^\d{2}:\d{2}$/.test(String(v || "")) ? String(v) : "";
  const out = { prayers: {}, logged: {}, school: {} };
  if (!held) return out;
  if (held.prayers && typeof held.prayers === "object") Object.keys(held.prayers).forEach((day) => {
    const one = {};
    PAGE_PRAYERS.forEach((n) => { const c = clock(held.prayers[day] && held.prayers[day][n]); if (c) one[n] = c; });
    out.prayers[day] = one;
  });
  if (held.logged && typeof held.logged === "object") Object.keys(held.logged).forEach((k) => {
    const c = clock(held.logged[k]);
    if (c && /^\d{4}-\d{2}-\d{2}\|.+/.test(k)) out.logged[k] = c;
  });
  if (held.school && typeof held.school === "object") Object.keys(held.school).forEach((day) => {
    const list = Array.isArray(held.school[day]) ? held.school[day] : [];
    out.school[day] = list.filter((l) => l && String(l.subject || "").trim())
      .map((l) => ({ subject: String(l.subject).trim(), start: clock(l.start), end: clock(l.end) }));
  });
  return out;
}
// "1:20pm", "1pm", "13:20", "120pm" -> "13:20"; anything else "".
export function parseClock12(text) {
  const s = String(text || "").trim().toLowerCase().replace(/\s+/g, "").replace(/\./g, ":");
  let m = s.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm)?$/);
  if (!m) return "";
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (min > 59) return "";
  if (m[3]) { if (h < 1 || h > 12) return ""; if (m[3] === "pm" && h !== 12) h += 12; if (m[3] === "am" && h === 12) h = 0; }
  else if (h > 23) return "";
  return String(h).padStart(2, "0") + ":" + String(min).padStart(2, "0");
}
// The school day in one line: first start, last end, how many real lessons.
export const SCHOOL_NOT_LESSONS = /break|lunch|tutor group|registration|assembly/i;
export function schoolSummary(list) {
  const real = (list || []).filter((l) => !SCHOOL_NOT_LESSONS.test(l.subject));
  const starts = (list || []).map((l) => l.start).filter(Boolean).sort();
  const ends = (list || []).map((l) => l.end || l.start).filter(Boolean).sort();
  return { from: starts[0] || "", to: ends[ends.length - 1] || "", lessons: real.length,
           subjects: [...new Set(real.map((l) => l.subject))] };
}


// ---- 2026-10-20h: "im using it as like ideally, should try to do, want to
// do and have to do - left being basically least essetnail and right being
// most". The Now card's columns are how much it matters, not the time of
// day. Kept per day in pages/<day> {prio: {line: level}}; a line she hasn't
// placed sits in "Should try to do".
export const NOW_PRIOS = [["ideally", "Ideally"], ["should", "Should try to do"], ["want", "Want to do"], ["have", "Have to do"]];
export const NOW_PRIO_DEFAULT = "should";
function nowLive(lines) {
  return (lines || []).filter((l) => l && l.kind === "line" && !l.done && !l.repeat &&
    !String(l.raw || "").trim().startsWith(">"));
}
export function nowPrioOf(raw, prio) {
  const v = prio && typeof prio === "object" ? prio[raw] : "";
  return NOW_PRIOS.some((p) => p[0] === v) ? v : NOW_PRIO_DEFAULT;
}
export function nowColumns(lines, prio) {
  const out = { ideally: [], should: [], want: [], have: [] };
  nowLive(lines).forEach((l) => out[nowPrioOf(l.raw, prio)].push(l));
  return out;
}
// Now: the one she picked if it's still open, else the first that most has
// to be done (Have to, then Want to, then Should try, then Ideally).
export function nowPickPrio(lines, prio, chosen) {
  const open = nowLive(lines);
  if (chosen) { const c = open.find((l) => l.raw === chosen); if (c) return c; }
  const cols = nowColumns(lines, prio);
  for (const key of ["have", "want", "should", "ideally"]) if (cols[key].length) return cols[key][0];
  return null;
}


// ---- 2026-10-20j: "so clearly it didnt work it out. even tho i literally said
// BIO". A chat called "bio test1 quizzing" went into Other: the guess only read
// the pasted text (a link) and only knew whole names ("Biology"). This reads
// the title too and knows the short ones (bio, chem, geo, dt, eng ...).
export function guessSubjectLoose(text, names) {
  const list = (names || []).filter(Boolean);
  const whole = guessSubject(text, list);
  if (whole) return whole;
  const tokens = String(text || "").toLowerCase().replace(/[^a-z&\s]/g, " ").split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const two = i + 1 < tokens.length ? tokens[i] + " " + tokens[i + 1] : "";
    const key = (two && SMART_ALIASES[two]) || SMART_ALIASES[tokens[i]] || (SUBJECT_HEX[tokens[i]] ? tokens[i] : "");
    if (!key) continue;
    const hit = list.find((n) => smartSubjectKey(n) === key);
    if (hit) return hit;
    return key === "dt" ? "DT" : key[0].toUpperCase() + key.slice(1);
  }
  return "";
}
// Text split into plain bits and links, for showing a link you can press.
export function linkParts(text) {
  const out = [];
  const re = /\bhttps?:\/\/[^\s<>"']+/gi;
  let last = 0;
  let m;
  const s = String(text || "");
  while ((m = re.exec(s))) {
    let url = m[0].replace(/[).,;:!?]+$/, "");
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    out.push({ text: url, href: url });
    last = m.index + url.length;
    re.lastIndex = last;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

// ---- 2026-10-21c: "maybe this could be collapseable? and also id like it to
// show the mini lists". The Day page's Tasks card groups a heading ("draw
// strawberries :", "finish math!!:") with the lines under it, down to the next
// gap or heading, as one mini list. Lines with no heading are loose.
export function pageGroups(lines) {
  const loose = [];
  const groups = [];
  let open = null;
  (lines || []).forEach((l) => {
    if (!l) return;
    if (l.kind === "gap") { open = null; return; }
    if (l.kind === "head") { open = { head: l.text.trim(), raw: l.raw, items: [] }; groups.push(open); return; }
    if (l.kind !== "line" || l.repeat) return;
    if (open) open.items.push(l); else loose.push(l);
  });
  return { loose, groups: groups.filter((g) => g.items.length) };
}

// ---- 2026-10-21f: the calendar's big update. "i want the task bank to be
// moved to the right hand side; i can hide it, move it back to the bottom,
// move it to the right again or even to the left hand side, and i can adjust
// the width of it."
export const BANK_DOCKS = [["left", "Left"], ["bottom", "Bottom"], ["right", "Right"]];
export const BANK_WIDTH = { least: 220, most: 640, start: 340 };
export function bankWhere(saved, screenWidth) {
  const w = Number(screenWidth) || 0;
  if (w && w < 820) return "bottom";           // a phone: no room at the side
  return BANK_DOCKS.some(([v]) => v === saved) ? saved : "right";
}
export function bankWidth(saved, screenWidth) {
  const most = Math.max(BANK_WIDTH.least, Math.min(BANK_WIDTH.most, Math.round((Number(screenWidth) || 1280) * 0.5)));
  const n = Math.round(Number(saved) || BANK_WIDTH.start);
  return Math.max(BANK_WIDTH.least, Math.min(most, n));
}

// "i want to be able to quickly have split task up so i can click on it and
// add subsections and itll just basically pop them on it." Steps live with
// the day's page (pages/<day> {steps: {line: [{t, d}]}}), on the website.
export function stepsOf(pageRaw, raw) {
  const all = pageRaw && typeof pageRaw === "object" && pageRaw.steps && typeof pageRaw.steps === "object" ? pageRaw.steps : {};
  const list = Array.isArray(all[raw]) ? all[raw] : [];
  return list.map((s) => ({ t: String((s && s.t) || "").trim().slice(0, 160), d: Boolean(s && s.d) })).filter((s) => s.t).slice(0, 30);
}
// What she typed (or pasted) as steps: one a line, or split on ";".
export function stepsWords(text) {
  return String(text || "").split(/\r?\n|;/).map((s) => s.replace(/^\s*(?:[-*•>]|\d+[.)])\s*/, "").trim())
    .filter(Boolean).map((s) => s.slice(0, 160)).slice(0, 30);
}
export function stepsLeft(steps) {
  const list = steps || [];
  const next = list.findIndex((s) => !s.d);
  return { done: list.filter((s) => s.d).length, all: list.length, next, nextText: next >= 0 ? list[next].t : "" };
}

// The day's open tasks with a time, earliest first.
export function flowTasks(times, day, done) {
  const out = [];
  Object.keys(times || {}).forEach((key) => {
    if (!key.startsWith(day + "|") || (done && done.has(key))) return;
    const p = timeParts(times[key]);
    if (!p) return;
    out.push({ key, text: key.slice(day.length + 1), start: p.start, end: p.end !== null ? p.end : p.start + 30 });
  });
  return out.sort((x, y) => x.start - y.start || x.end - y.end || (x.text < y.text ? -1 : 1));
}
// Push down whatever is in the way from `cursor` on (only as far as needed:
// a gap takes up the push, so things after a gap stay put).
function pushDownFrom(list, from, cursor, skip, out) {
  let c = cursor;
  for (const t of list) {
    if (skip.has(t.key) || t.start < from) continue;
    if (t.start >= c) break;
    const len = t.end - t.start;
    const s = Math.min(23 * 60 + 45, c);
    out[t.key] = timeSpan(s, s + len);
    c = s + len;
  }
  return out;
}
// "little blue dashes inbetween tasks so if i put a task there, itll move all
// tasks (that are below it) downwards". A new task at `at` for `length`
// minutes: what has to move down for it.
export function insertGap(times, day, at, length, done) {
  const list = flowTasks(times, day, done);
  return pushDownFrom(list, at, at + Math.max(5, Number(length) || 30), new Set(), {});
}
// Where the dashes go on a day: above the first task and under each one.
export function insertMarks(items) {
  const list = (items || []).filter((i) => Number.isFinite(i.start) && Number.isFinite(i.end)).sort((x, y) => x.start - y.start);
  if (!list.length) return [];
  const spots = [list[0].start].concat(list.map((i) => i.end));
  const out = [];
  spots.sort((x, y) => x - y).forEach((m) => { if (m <= 24 * 60 - 15 && !out.some((o) => Math.abs(o - m) < 10)) out.push(m); });
  return out;
}
export const roundDown5 = (m) => Math.floor(m / 5) * 5;
export const roundUp5 = (m) => Math.ceil(m / 5) * 5;

// "it will not be 100% time based- rather, if the task is done, itll move
// onto the next task. until that task is done ... itll extend the time of the
// task." A task she's on that runs past its end grows (5 minutes at a time),
// and what's after it moves down.
export function flowExtend(times, day, text, nowMin, done) {
  const list = flowTasks(times, day, done);
  const me = list.find((t) => t.text === text);
  if (!me || nowMin < me.end) return {};
  const end = Math.min(24 * 60 - 1, roundUp5(nowMin) + 5);
  if (end <= me.end) return {};
  const out = { [me.key]: timeSpan(me.start, end) };
  return pushDownFrom(list, me.start, end, new Set([me.key]), out);
}
// Done: the next task comes up to now, and the ones joined on behind it come
// with it (earlier or later). Something after a gap stays where it is.
export function flowAfterDone(times, day, text, nowMin, done) {
  const list = flowTasks(times, day, done).filter((t) => t.text !== text);
  const all = flowTasks(times, day, null);
  const me = all.find((t) => t.text === text);
  const from = me ? me.start : nowMin;
  const start = roundDown5(nowMin);
  const out = {};
  if (me && start < me.end && start > me.start) out[me.key] = timeSpan(me.start, Math.max(me.start + 15, start));
  const next = list.find((t) => t.start >= from && t.key !== (me && me.key)) || list.find((t) => t.end > nowMin);
  if (!next) return { moved: out, next: "" };
  const delta = start - next.start;
  if (delta === 0) return { moved: out, next: next.text };
  if (delta > 0) {
    out[next.key] = timeSpan(start, start + (next.end - next.start));
    pushDownFrom(list, next.start, start + (next.end - next.start), new Set([next.key]), out);
    return { moved: out, next: next.text };
  }
  // Earlier: the run of tasks joined on behind it comes up too.
  let prevEnd = next.end;
  out[next.key] = timeSpan(next.start + delta, next.end + delta);
  for (const t of list) {
    if (t.key === next.key || t.start < next.start) continue;
    if (t.start > prevEnd) break;
    out[t.key] = timeSpan(t.start + delta, t.end + delta);
    prevEnd = Math.max(prevEnd, t.end);
  }
  return { moved: out, next: next.text };
}
// "you can switch between tasks and that gets put at where u currently are".
// The one she switches to goes at now; the one she was on (not done) carries
// on straight after it with the time it had left; the rest move down.
export function flowSwitch(times, day, cur, to, nowMin, done, toLength) {
  const all = flowTasks(times, day, done);
  const start = roundDown5(nowMin);
  const target = all.find((t) => t.text === to);
  const len = target ? target.end - target.start : Math.max(15, Number(toLength) || 30);
  const out = {};
  out[day + "|" + to] = timeSpan(start, start + len);
  let cursor = start + len;
  const skip = new Set([day + "|" + to]);
  const mine = cur && cur !== to ? all.find((t) => t.text === cur) : null;
  if (mine) {
    const left = Math.max(15, mine.end - Math.max(mine.start, start));
    out[mine.key] = timeSpan(cursor, cursor + left);
    cursor += left;
    skip.add(mine.key);
  }
  return pushDownFrom(all, start, cursor, skip, out);
}
// A break from now: the task she's on gets that much longer, everything
// after now moves down by it.
export function flowBreak(times, day, cur, nowMin, minutes, done) {
  const all = flowTasks(times, day, done);
  const out = {};
  const n = Math.max(1, Number(minutes) || 0);
  all.forEach((t) => {
    if (t.text === cur && t.start <= nowMin && t.end > nowMin) out[t.key] = timeSpan(t.start, t.end + n);
    else if (t.start >= nowMin) out[t.key] = timeSpan(t.start + n, t.end + n);
  });
  return out;
}
