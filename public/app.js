// Mentor Hours front end. Three views from one page: home (/), public board (/b/slug), manage (/m/slug#key).
const $ = (id) => document.getElementById(id);
const path = location.pathname.split("/").filter(Boolean);
const view = path[0] === "b" ? "board" : path[0] === "m" ? "manage" : "home";
const slug = (path[1] || "").toLowerCase();
const key = view === "manage" ? new URLSearchParams(location.hash.slice(1)).get("key") || "" : "";
const MINE = "mentor-hours:bookings"; // slotId -> cancel token, kept in this browser only

const dayFmt = new Intl.DateTimeFormat("en-KE", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Nairobi" });
const timeFmt = new Intl.DateTimeFormat("en-KE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Nairobi" });
const dayKey = (iso) => new Date(new Date(iso).getTime() + 3 * 3600e3).toISOString().slice(0, 10);

let slots = [];
let manager = false;
let current = null;

function status(message, kind = "") {
  const el = $("status");
  el.hidden = !message;
  el.textContent = message || "";
  el.className = `notice ${kind}`;
}

async function api(url, { method = "GET", body, manage = false } = {}) {
  const headers = { "content-type": "application/json" };
  if (manage && key) headers["x-manage-key"] = key;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({ ok: false, message: "The server did not answer properly." }));
  if (!res.ok || data.ok === false) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

function readMine() {
  try { return JSON.parse(localStorage.getItem(MINE) || "{}"); } catch { return {}; }
}
function saveMine(mine) {
  try { localStorage.setItem(MINE, JSON.stringify(mine)); } catch { /* private mode: the copied link still works */ }
}

function el(tag, props = {}, ...kids) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids.filter((k) => k != null && k !== false));
  return node;
}

function render() {
  const mine = readMine();
  const days = $("days");
  days.replaceChildren();
  const upcoming = slots.filter((s) => new Date(s.startsAt).getTime() + s.minutes * 60e3 > Date.now());
  const open = upcoming.filter((s) => !s.taken).length;
  $("count").textContent = upcoming.length ? `${open} open of ${upcoming.length}` : "";
  if (!upcoming.length) {
    days.append(el("p", { className: "empty", textContent: manager ? "No slots yet. Open the first one above." : "No open slots right now. Check back soon." }));
    return;
  }
  const groups = new Map();
  for (const s of upcoming) {
    const k = dayKey(s.startsAt);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  for (const [, list] of groups) {
    const ul = el("ul", { className: "slots" });
    for (const s of list) {
      const start = new Date(s.startsAt);
      const end = new Date(start.getTime() + s.minutes * 60e3);
      const li = el("li", { className: `slot${s.taken ? " taken" : ""}` },
        el("div", { className: "slot-top" },
          el("span", { className: "time", textContent: `${timeFmt.format(start)} to ${timeFmt.format(end)}` }),
          el("span", { className: "hint" }, el("span", { className: "dot", ariaHidden: "true" }), s.taken ? "Taken" : "Open")),
        el("span", { className: "mentor", textContent: s.mentor }),
        s.topic ? el("p", { className: "topic", textContent: s.topic }) : null);
      const actions = el("div", { className: "actions" });
      if (manager) {
        if (s.booking) li.append(el("p", { className: "who" }, el("strong", { textContent: s.booking.name }), ` · ${s.booking.contact}`, s.booking.note ? el("span", { className: "sub", textContent: s.booking.note }) : null));
        actions.append(el("button", { className: "btn", type: "button", textContent: "Remove slot", onclick: () => removeSlot(s) }));
      } else if (mine[s.id]) {
        actions.append(el("button", { className: "btn", type: "button", textContent: "Cancel my booking", onclick: () => cancel(s.id, mine[s.id]) }));
      } else if (!s.taken) {
        actions.append(el("button", { className: "btn btn-primary", type: "button", textContent: "Book", onclick: () => openBook(s) }));
      }
      if (actions.childElementCount) li.append(actions);
      ul.append(li);
    }
    days.append(el("section", { className: "day" }, el("h3", { textContent: dayFmt.format(new Date(list[0].startsAt)) }), ul));
  }
}

async function load() {
  try {
    const data = await api(`/api/boards?slug=${encodeURIComponent(slug)}`, { manage: view === "manage" });
    slots = data.slots;
    manager = data.manager;
    $("title").textContent = data.board.title;
    $("lead").textContent = manager ? `Manage view. Run by ${data.board.host}.` : `Run by ${data.board.host}. Pick an open slot and book it. Times are East Africa Time.`;
    document.title = `${data.board.title} | Mentor Hours`;
    if (data.board.demo && !manager) status("This is the demo board. Bookings here clear after a day.", "");
    $("mentor-list").replaceChildren(...[...new Set(slots.map((s) => s.mentor))].map((m) => el("option", { value: m })));
    render();
  } catch (e) {
    status(e.message, "notice-alert");
  }
}

function openBook(s) {
  current = s;
  const start = new Date(s.startsAt);
  $("book-what").textContent = `${s.mentor}, ${dayFmt.format(start)} at ${timeFmt.format(start)} (${s.minutes} min)${s.topic ? `. ${s.topic}` : ""}`;
  $("book-error").hidden = true;
  $("book-dialog").showModal();
  $("b-name").focus();
}

function icsFor(slot) {
  const fmt = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = new Date(slot.startsAt);
  const end = new Date(start.getTime() + slot.minutes * 60e3);
  const esc = (t) => String(t).replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
  const title = `Office hours with ${slot.mentor}`;
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Mentor Hours//EN", "BEGIN:VEVENT",
    `UID:mentor-hours-${slot.id}@${location.host}`, `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
    `SUMMARY:${esc(title)}`, `DESCRIPTION:${esc(`${slot.board}${slot.topic ? `: ${slot.topic}` : ""}`)}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const gcal = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${fmt(start)}/${fmt(end)}&details=${encodeURIComponent(slot.board)}`;
  return { href: URL.createObjectURL(new Blob([ics], { type: "text/calendar" })), gcal };
}

$("book").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const btn = e.target.querySelector("[type=submit]");
  btn.disabled = true;
  try {
    const data = await api("/api/bookings", { method: "POST", body: { slug, slotId: current.id, name: form.get("name"), contact: form.get("contact"), note: form.get("note") } });
    const mine = readMine();
    mine[data.slot.id] = data.token;
    saveMine(mine);
    $("book-dialog").close();
    e.target.reset();
    const start = new Date(data.slot.startsAt);
    $("done-what").textContent = `${data.slot.mentor}, ${dayFmt.format(start)} at ${timeFmt.format(start)} East Africa Time.`;
    const cal = icsFor(data.slot);
    $("ics").href = cal.href;
    $("gcal").href = cal.gcal;
    $("cancel-link").value = `${location.origin}/b/${slug}#cancel=${data.slot.id}.${data.token}`;
    $("done-dialog").showModal();
    await load();
  } catch (err) {
    $("book-error").textContent = err.message;
    $("book-error").hidden = false;
    if (/booked|gone|started/.test(err.message)) load();
  } finally {
    btn.disabled = false;
  }
});

async function cancel(slotId, token) {
  if (!window.confirm("Cancel this booking? The slot opens for someone else.")) return;
  try {
    await api("/api/bookings", { method: "DELETE", body: { slotId, token } });
    const mine = readMine();
    delete mine[slotId];
    saveMine(mine);
    status("Booking cancelled.");
    await load();
  } catch (e) {
    status(e.message, "notice-alert");
  }
}

async function removeSlot(s) {
  const msg = s.taken ? `Remove this slot? ${s.booking?.name || "Someone"} has booked it. Tell them first.` : "Remove this slot?";
  if (!window.confirm(msg)) return;
  try {
    await api(`/api/slots?slug=${encodeURIComponent(slug)}&id=${s.id}`, { method: "DELETE", manage: true });
    await load();
  } catch (e) {
    status(e.message, "notice-alert");
  }
}

$("book-cancel").addEventListener("click", () => $("book-dialog").close());
$("done-close").addEventListener("click", () => $("done-dialog").close());
document.addEventListener("click", async (e) => {
  const id = e.target.dataset?.copy;
  if (!id) return;
  const input = $(id);
  input.select();
  try { await navigator.clipboard.writeText(input.value); e.target.textContent = "Copied"; } catch { document.execCommand("copy"); }
  setTimeout(() => { e.target.textContent = "Copy"; }, 1500);
});

if (view === "home") {
  $("home").hidden = false;
  $("create").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
      const data = await api("/api/boards", { method: "POST", body: { title: form.get("title"), host: form.get("host") } });
      location.assign(`/m/${data.slug}#key=${data.key}`);
    } catch (err) {
      status(err.message, "notice-alert");
    }
  });
} else {
  $("board").hidden = false;
  if (view === "manage") {
    $("manage-tools").hidden = false;
    $("public-link").value = `${location.origin}/b/${slug}`;
    $("manage-link").value = location.href;
    const tomorrow = new Date(Date.now() + 27 * 3600e3).toISOString().slice(0, 10);
    $("s-date").value = tomorrow;
    $("s-date").min = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
    $("s-time").value = "10:00";
    $("add-slot").addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = Object.fromEntries(new FormData(e.target));
      try {
        await api("/api/slots", { method: "POST", manage: true, body: { slug, ...form, minutes: Number(form.minutes) } });
        status(`Slot added for ${form.mentor}.`);
        await load();
      } catch (err) {
        status(err.message, "notice-alert");
      }
    });
  }
  // A cancel link from the booking screen: /b/slug#cancel=<slotId>.<token>
  const cancelHash = new URLSearchParams(location.hash.slice(1)).get("cancel");
  if (cancelHash) {
    const [id, token] = cancelHash.split(".");
    const mine = readMine();
    mine[id] = token;
    saveMine(mine);
    history.replaceState(null, "", location.pathname);
  }
  load();
}
