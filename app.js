/* Nicoeats front end. Vanilla JS, hash routing. */
const CATS = {
  natas: {
    title: "Natas", short: "Pastéis de nata", num: "01",
    lede: "Arguably my favorite snack",
    criteria: {
      custard: ["Custard"],
      pastry: ["Pastry"],
      value: ["Value"],
    },
  },
  "carrot-cake": {
    title: "Carrot Cake", short: "Carrot cake", num: "02",
    lede: "I just love a good slice",
    criteria: {
      crumb: ["Crumb"],
      frosting: ["Frosting"],
      value: ["Value"],
    },
  },
  poutine: {
    title: "Poutine", short: "Poutine", num: "03",
    lede: "A weekly necessity",
    criteria: {
      fries: ["Fries"],
      curds: ["Curds"],
      gravy: ["Gravy"],
      value: ["Value"],
      grease: ["Grease", "You need the grease sometimes"],
    },
  },
};
const CAT_KEYS = Object.keys(CATS);
const TICKER = ["Natas", "Carrot Cake", "Poutine", "BBQ coming wallahi", "Cafés"];

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const app = $("#app");

const state = { reviews: [], settings: {}, admin: false, loaded: false };

async function api(path, opts = {}) {
  const res = await fetch("/api" + path, {
    method: opts.method || "GET",
    headers: opts.body ? { "Content-Type": "application/json" } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

async function load() {
  const [reviews, settings, me] = await Promise.all([api("/reviews"), api("/settings"), api("/me")]);
  Object.assign(state, { reviews, settings, admin: me.admin, loaded: true });
}

/* ---------- helpers ---------- */
const published = () => state.reviews.filter((r) => r.published);
const byCat = (c) => published().filter((r) => r.category === c).sort((a, b) => b.overall - a.overall || b.created - a.created);
const fmt = (n) => (Number(n) % 1 === 0 ? Number(n).toFixed(0) : Number(n).toFixed(1));
function verdict(s) {
  return s >= 9 ? "Pilgrimage" : s >= 8 ? "Great" : s >= 6.5 ? "Good" : s >= 5 ? "Fine" : "Skip";
}
const stamp = (score, cls = "") => `<div class="stamp ${cls}" role="img" aria-label="Score ${fmt(score)} out of 10"><b>${fmt(score)}</b><i>${verdict(score)}</i></div>`;
function photo(r) {
  return r.photo
    ? `<div class="photo" data-c="${r.category}"><img src="${esc(r.photo)}" alt="${esc(r.name)}" loading="lazy"></div>`
    : `<div class="photo none" data-c="${r.category}"><span>${esc(r.name.trim()[0] || "?")}</span></div>`;
}
const paragraphs = (t) => String(t || "").split(/\n\s*\n/).filter(Boolean).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d + "T12:00:00");
  return isNaN(dt) ? d : dt.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

function card(r) {
  return `<a class="card" href="#/review/${r.id}" data-c="${r.category}">
    ${photo(r)}${stamp(r.overall, "sm")}
    <h3>${esc(r.name)}</h3>
    <div class="sub">${esc(CATS[r.category].short)}${r.neighborhood ? " · " + esc(r.neighborhood) : ""}</div>
    ${r.headline ? `<p class="hl">${esc(r.headline)}</p>` : ""}
  </a>`;
}
const empty = (t, p) => `<div class="empty"><h3>${t}</h3><p>${p}</p></div>`;

/* ---------- chrome ---------- */
function paintChrome() {
  const items = TICKER.map((t, i) => `<span>${t}</span><b>✺</b>`).join("");
  $(".ticker-track").innerHTML = items + items + items + items;
  const s = state.settings;
  const links = [["instagram", "Instagram", "https://instagram.com/"], ["tiktok", "TikTok", "https://tiktok.com/@"], ["youtube", "YouTube", "https://youtube.com/@"]]
    .filter(([k]) => s[k]).map(([k, n, base]) => `<a href="${esc(linkFor(s[k], base))}" target="_blank" rel="noopener">${n}</a>`).join("");
  $("#foot-social").innerHTML = links;
}
function linkFor(v, base) {
  v = v.trim();
  if (/^https?:\/\//i.test(v)) return v;
  return base + v.replace(/^@/, "");
}
function markNav(route) {
  $$(".top nav a").forEach((a) => a.classList.toggle("on", a.dataset.nav === route));
}

/* ---------- views ---------- */
function viewHome() {
  const all = published();
  const quests = CAT_KEYS.map((k, i) => {
    const list = byCat(k);
    const avg = list.length ? list.reduce((a, r) => a + r.overall, 0) / list.length : null;
    return `<a class="quest" href="#/${k}" data-c="${k}">
      <span class="blob"></span>
      <span class="num">${CATS[k].num} / ${list.length} reviewed</span>
      <h3>${CATS[k].title.replace(" ", "<br>")}</h3>
      <div class="meta">
        <div class="lead">${list[0] ? "Current #1: " + esc(list[0].name) : "First review coming soon"}</div>
        <div class="avg">${avg === null ? "—" : fmt(avg)}<small>avg score</small></div>
      </div>
    </a>`;
  }).join("");
  const latest = [...all].sort((a, b) => b.created - a.created).slice(0, 6);
  const s = state.settings;
  const socials = [["instagram", "Instagram", "https://instagram.com/"], ["tiktok", "TikTok", "https://tiktok.com/@"], ["youtube", "YouTube", "https://youtube.com/@"]]
    .filter(([k]) => s[k]);
  app.innerHTML = `
    <section class="hero">
      <div class="sun y"></div><div class="sun o"></div><div class="dots d1"></div>
      <h1 class="mast" aria-label="Nicoeats"><span class="a">Nico</span><span class="b">Eats</span></h1>
      <div class="hero-cap">
        <p>${esc(s.tagline)}</p>
        <div class="sticker">Est.<br>Little<br>Portugal<br>MTL</div>
      </div>
    </section>
    <div class="wrap">
      <section class="sec"><div class="sec-head"><h2>The three quests</h2><span class="mono">Send Recs</span></div>
        <div class="quests">${quests}</div></section>
      <section class="sec"><div class="sec-head"><h2>Fresh out the oven</h2><span class="mono">${all.length} review${all.length === 1 ? "" : "s"} so far</span></div>
        ${latest.length ? `<div class="grid">${latest.map(card).join("")}</div>` : empty("Nothing yet.", "The tasting notes are still warm. First reviews land soon.")}</section>
      ${socials.length ? `<section class="sec"><div class="sec-head"><h2>Follow along</h2><span class="mono">Videos, bakes, reviews</span></div>
        <div class="social-links">${socials.map(([k, n, b]) => `<a href="${esc(linkFor(s[k], b))}" target="_blank" rel="noopener">${n} ↗</a>`).join("")}</div></section>` : ""}
    </div>`;
}

function viewCat(k) {
  const C = CATS[k];
  const list = byCat(k);
  const rubric = Object.values(C.criteria).map(([t, d]) => `<dt>${t}</dt>${d ? `<dd>${d}</dd>` : ""}`).join("");
  app.innerHTML = `
    <section class="cat-hero" data-c="${k}"><div class="blob"></div>
      <div class="mono">Quest ${C.num} · ${list.length} ranked</div>
      <h1>${C.title.replace(" ", "<br>")}</h1>
      <p class="lede">${C.lede}</p>
    </section>
    <div class="wrap"><section class="sec"><div class="split">
      <div>
        ${list.length ? `<ol class="rank" data-c="${k}">${list.map((r, i) => `<li data-c="${k}"><a href="#/review/${r.id}">
          <span class="n">${i + 1}</span>
          <div><h3>${esc(r.name)}</h3><div class="sub">${esc(r.neighborhood || "Montréal")}${r.price ? " · " + esc(r.price) : ""}</div>${r.headline ? `<div class="hl">${esc(r.headline)}</div>` : ""}</div>
          ${stamp(r.overall, "sm")}</a></li>`).join("")}</ol>` : empty("Empty tray.", "No " + C.short.toLowerCase() + " reviewed yet.")}
      </div>
      <aside class="rubric" data-c="${k}"><h3>How we score</h3><dl>${rubric}</dl>
        <p>Every criterion is scored 0–10 in half points. The overall score is the plain average.</p></aside>
    </div></section>
    <section class="sec"><div class="sec-head"><h2>Where to find them</h2></div><div class="map" id="map"></div></section></div>`;
  drawMap($("#map"), list);
}

function viewReview(id) {
  const r = state.reviews.find((x) => x.id === Number(id));
  if (!r) return notFound();
  const C = CATS[r.category];
  document.title = `${r.name} — ${C.title} | Nicoeats`;
  const bars = Object.entries(C.criteria).map(([k, [t]]) => {
    const v = r.scores[k] ?? 0;
    return `<div class="bar"><span>${t}</span><div class="track"><div class="fill" style="width:${v * 10}%"></div></div><span class="v">${fmt(v)}</span></div>`;
  }).join("");
  app.innerHTML = `<article class="rv" data-c="${r.category}">
    <div class="rv-media">${photo(r)}${stamp(r.overall, "xl")}</div>
    <div class="rv-body">
      <div class="crumbs"><a href="#/${r.category}">${C.title}</a> / ${esc(r.name)}${r.published ? "" : " <b>(DRAFT)</b>"}</div>
      <h1>${esc(r.name)}</h1>
      ${r.headline ? `<p class="hl">${esc(r.headline)}</p>` : ""}
      <div class="facts">
        ${r.neighborhood ? `<span>${esc(r.neighborhood)}</span>` : ""}
        ${r.price ? `<span>${esc(r.price)}</span>` : ""}
        ${r.visited ? `<span>Visited ${esc(fmtDate(r.visited))}</span>` : ""}
        ${r.address ? `<span class="hl2"><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name + " " + r.address)}" target="_blank" rel="noopener" style="text-decoration:none">${esc(r.address)} ↗</a></span>` : ""}
      </div>
      <div class="bars">${bars}</div>
      <div class="prose">${paragraphs(r.body)}</div>
      ${r.companion ? `<div class="companion"><span class="mono">Tasted with ${esc(r.companion)}</span>${r.companion_note ? `<p>${esc(r.companion_note)}</p>` : ""}</div>` : ""}
      ${state.admin ? `<div class="bar-actions"><a class="btn" href="#/admin/edit/${r.id}">Edit this review</a></div>` : ""}
    </div></article>`;
}

function viewMap() {
  let active = "all";
  app.innerHTML = `<div class="wrap"><section class="sec"><div class="sec-head"><h2>The map</h2><span class="mono">Every place we've been, pinned</span></div>
    <div class="chips" id="chips"></div><div class="map tall" id="map"></div></section></div>`;
  const draw = () => {
    $("#chips").innerHTML = ["all", ...CAT_KEYS].map((k) => `<button class="chip" data-k="${k}" aria-pressed="${k === active}">${k === "all" ? "Everything" : CATS[k].title}</button>`).join("");
    $$("#chips .chip").forEach((b) => (b.onclick = () => { active = b.dataset.k; draw(); }));
    drawMap($("#map"), active === "all" ? published() : byCat(active));
  };
  draw();
}

let mapObj = null;
function drawMap(el, list) {
  if (!window.L) { el.innerHTML = '<div class="empty"><p>Map is taking a smoke break.</p></div>'; return; }
  if (mapObj) { mapObj.remove(); mapObj = null; }
  const pts = list.filter((r) => r.lat != null && r.lng != null);
  mapObj = L.map(el, { scrollWheelZoom: false }).setView([45.5185, -73.5850], 13);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19 }).addTo(mapObj);
  const colors = { natas: "#e8cb7e", "carrot-cake": "#dc9a6d", poutine: "#5b8593" };
  pts.forEach((r) => {
    const icon = L.divIcon({ className: "", iconSize: [38, 38], iconAnchor: [19, 19], html: `<div class="pin" style="--c:${colors[r.category]};${r.category === "poutine" ? "color:#f1ebdb" : ""}">${fmt(r.overall)}</div>` });
    const m = L.marker([r.lat, r.lng], { icon }).addTo(mapObj);
    m.bindPopup(`<b>${esc(r.name)}</b>${esc(CATS[r.category].short)} · ${fmt(r.overall)}/10<br><a href="#/review/${r.id}">Read the review →</a>`);
  });
  if (pts.length > 1) mapObj.fitBounds(L.latLngBounds(pts.map((r) => [r.lat, r.lng])), { padding: [50, 50], maxZoom: 15 });
  else if (pts.length === 1) mapObj.setView([pts[0].lat, pts[0].lng], 15);
  setTimeout(() => mapObj && mapObj.invalidateSize(), 50);
}

function viewAbout() {
  const s = state.settings;
  const socials = [["instagram", "Instagram", "https://instagram.com/"], ["tiktok", "TikTok", "https://tiktok.com/@"], ["youtube", "YouTube", "https://youtube.com/@"]].filter(([k]) => s[k]);
  app.innerHTML = `<div class="wrap about"><h1>About<br><span>Nico</span>eats</h1>
    <div><div class="prose">${paragraphs(s.about)}</div>
    ${socials.length ? `<div class="social-links">${socials.map(([k, n, b]) => `<a href="${esc(linkFor(s[k], b))}" target="_blank" rel="noopener">${n} ↗</a>`).join("")}</div>` : ""}</div></div>`;
}

function notFound() {
  app.innerHTML = `<div class="wrap sec">${empty("Not on the menu.", "That page doesn't exist. <a href='#/'>Back to the counter.</a>")}</div>`;
}

/* ---------- admin ---------- */
function viewLogin(msg = "") {
  app.innerHTML = `<div class="login"><h1 style="font:800 4rem/.85 var(--display);font-stretch:75%;text-transform:uppercase;margin:0 0 20px">Chef<br>only.</h1>
    <form class="form" id="lf"><div class="full"><label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" required></div>
    ${msg ? `<div class="full msg err">${esc(msg)}</div>` : ""}
    <div class="full"><button class="btn pink" type="submit">Let me in</button></div></form></div>`;
  $("#lf").onsubmit = async (e) => {
    e.preventDefault();
    try { await api("/login", { method: "POST", body: { password: $("#pw").value } }); await load(); route(); }
    catch (err) { viewLogin(err.message); }
  };
}

function viewAdmin() {
  if (!state.admin) return viewLogin();
  const s = state.settings;
  const rows = [...state.reviews].sort((a, b) => b.created - a.created).map((r) => `<tr data-c="${r.category}">
    <td><span class="tag" data-c="${r.category}">${esc(CATS[r.category].title)}</span>${r.published ? "" : '<span class="tag draft">Draft</span>'}<div class="t">${esc(r.name)}</div></td>
    <td>${stamp(r.overall, "sm")}</td>
    <td style="text-align:right"><a class="btn ghost" href="#/review/${r.id}">View</a> <a class="btn" href="#/admin/edit/${r.id}">Edit</a></td></tr>`).join("");
  app.innerHTML = `<div class="admin"><div class="mono">Logged in</div><h1>Kitchen</h1>
    <div class="bar-actions"><a class="btn pink" href="#/admin/new">+ New review</a><button class="btn ghost" id="out">Log out</button></div>
    ${rows ? `<table class="tbl">${rows}</table>` : empty("No reviews yet.", "Hit “New review” to write the first one.")}
    <h2>Site settings</h2>
    <form class="form" id="sf">
      <div class="full"><label for="s-tag">Tagline (home page)</label><input id="s-tag" type="text" value="${esc(s.tagline)}"></div>
      <div class="full"><label for="s-about">About text</label><textarea id="s-about">${esc(s.about)}</textarea></div>
      <div><label for="s-ig">Instagram handle or URL</label><input id="s-ig" type="text" value="${esc(s.instagram)}" placeholder="nicoeats"></div>
      <div><label for="s-tt">TikTok handle or URL</label><input id="s-tt" type="text" value="${esc(s.tiktok)}" placeholder="nicoeats"></div>
      <div><label for="s-yt">YouTube handle or URL</label><input id="s-yt" type="text" value="${esc(s.youtube)}" placeholder="nicoeats"></div>
      <div class="full"><button class="btn blue" type="submit">Save settings</button><span id="sm"></span></div>
    </form></div>`;
  $("#out").onclick = async () => { await api("/logout", { method: "POST" }); state.admin = false; await load(); location.hash = "#/"; };
  $("#sf").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api("/settings", { method: "PUT", body: { tagline: $("#s-tag").value, about: $("#s-about").value, instagram: $("#s-ig").value, tiktok: $("#s-tt").value, youtube: $("#s-yt").value } });
      await load(); paintChrome(); $("#sm").innerHTML = ' <span class="tag">Saved</span>';
    } catch (err) { $("#sm").innerHTML = ` <span class="tag draft">${esc(err.message)}</span>`; }
  };
}

function resizeImage(file, max = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("Couldn't read that image"));
    img.src = url;
  });
}

function viewEdit(id) {
  if (!state.admin) return viewLogin();
  const existing = id ? state.reviews.find((r) => r.id === Number(id)) : null;
  if (id && !existing) return notFound();
  const r = existing || { category: "natas", name: "", neighborhood: "", address: "", lat: "", lng: "", price: "", visited: new Date().toISOString().slice(0, 10), scores: {}, headline: "", body: "", photo: "", companion: "", companion_note: "", published: true };
  app.innerHTML = `<div class="admin"><div class="mono"><a href="#/admin">← Kitchen</a></div><h1>${existing ? "Edit" : "New"}<br>review</h1>
  <form class="form" id="rf" style="margin-top:24px">
    <div><label for="f-cat">Category</label><select id="f-cat">${CAT_KEYS.map((k) => `<option value="${k}" ${r.category === k ? "selected" : ""}>${CATS[k].title}</option>`).join("")}</select></div>
    <div><label for="f-name">Place name</label><input id="f-name" type="text" required value="${esc(r.name)}"></div>
    <div><label for="f-hood">Neighbourhood</label><input id="f-hood" type="text" value="${esc(r.neighborhood)}" placeholder="Little Portugal"></div>
    <div><label for="f-price">Price</label><input id="f-price" type="text" value="${esc(r.price)}" placeholder="$2.75 each"></div>
    <div class="full"><label for="f-addr">Address</label>
      <div style="display:flex;gap:10px"><input id="f-addr" type="text" value="${esc(r.address)}" placeholder="4200 Rue Saint-Laurent, Montréal"><button type="button" class="btn ghost" id="geo">Locate</button></div>
      <div class="mono" id="geo-msg" style="margin-top:6px;opacity:.7">${r.lat !== "" && r.lat != null ? `Pinned at ${esc(r.lat)}, ${esc(r.lng)}` : "Hit Locate to drop a pin on the map."}</div>
      <input id="f-lat" type="hidden" value="${esc(r.lat ?? "")}"><input id="f-lng" type="hidden" value="${esc(r.lng ?? "")}"></div>
    <div><label for="f-date">Date visited</label><input id="f-date" type="date" value="${esc(r.visited)}"></div>
    <div class="check"><input id="f-pub" type="checkbox" ${r.published ? "checked" : ""}><label for="f-pub" style="margin:0">Published (uncheck to keep as draft)</label></div>
    <div class="full"><span class="lbl">Photo</span><div class="upl"><img id="f-prev" alt="" ${r.photo ? `src="${esc(r.photo)}"` : 'hidden'}><input id="f-file" type="file" accept="image/*"><span id="f-upm" class="mono"></span></div><input id="f-photo" type="hidden" value="${esc(r.photo)}"></div>
    <div class="full"><span class="lbl">Scores (0–10)</span><div class="sliders" id="sliders"></div></div>
    <div class="full"><label for="f-hl">One-line verdict</label><input id="f-hl" type="text" value="${esc(r.headline)}" placeholder="Burnt in all the right places."></div>
    <div class="full"><label for="f-body">The review (blank line = new paragraph)</label><textarea id="f-body">${esc(r.body)}</textarea></div>
    <div><label for="f-comp">Tasted with (optional)</label><input id="f-comp" type="text" value="${esc(r.companion)}" placeholder="Friend's name"></div>
    <div class="full"><label for="f-cn">Their take (optional)</label><textarea id="f-cn" style="min-height:90px">${esc(r.companion_note)}</textarea></div>
    <div class="full" id="ferr"></div>
    <div class="full bar-actions"><button class="btn pink" type="submit">${existing ? "Save changes" : "Publish review"}</button>${existing ? '<button type="button" class="btn danger" id="del">Delete</button>' : ""}</div>
  </form></div>`;

  const scores = { ...r.scores };
  function drawSliders() {
    const cat = $("#f-cat").value;
    $("#sliders").innerHTML = Object.entries(CATS[cat].criteria).map(([k, [t, d]]) =>
      `<div class="slider" title="${esc(d)}"><label for="sc-${k}" style="margin:0">${t}</label><input id="sc-${k}" data-k="${k}" type="range" min="0" max="10" step="0.5" value="${scores[k] ?? 5}"><output>${fmt(scores[k] ?? 5)}</output></div>`).join("") +
      `<div class="live"><span class="mono">Overall (average)</span><div id="live"></div></div>`;
    $$("#sliders input[type=range]").forEach((i) => {
      scores[i.dataset.k] = Number(i.value);
      i.oninput = () => { scores[i.dataset.k] = Number(i.value); i.nextElementSibling.textContent = fmt(i.value); live(); };
    });
    live();
  }
  function live() {
    const keys = Object.keys(CATS[$("#f-cat").value].criteria);
    const o = keys.reduce((a, k) => a + (scores[k] ?? 5), 0) / keys.length;
    $("#live").innerHTML = stamp(Math.round(o * 10) / 10, "sm");
  }
  $("#f-cat").onchange = drawSliders;
  drawSliders();

  $("#geo").onclick = async () => {
    const q = $("#f-addr").value.trim() || $("#f-name").value.trim() + " Montréal";
    $("#geo-msg").textContent = "Looking…";
    try {
      const res = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(q.match(/montr/i) ? q : q + ", Montréal"));
      const j = await res.json();
      if (!j[0]) throw new Error("No match. Try a fuller address.");
      $("#f-lat").value = (+j[0].lat).toFixed(6); $("#f-lng").value = (+j[0].lon).toFixed(6);
      $("#geo-msg").textContent = "Pinned: " + j[0].display_name.slice(0, 80);
    } catch (e) { $("#geo-msg").textContent = e.message; }
  };
  $("#f-file").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    $("#f-upm").textContent = "Uploading…";
    try {
      const data = await resizeImage(f);
      const { url } = await api("/upload", { method: "POST", body: { data } });
      $("#f-photo").value = url; $("#f-prev").src = url; $("#f-prev").hidden = false; $("#f-upm").textContent = "Uploaded";
    } catch (err) { $("#f-upm").textContent = err.message; }
  };
  $("#rf").onsubmit = async (e) => {
    e.preventDefault();
    const body = {
      category: $("#f-cat").value, name: $("#f-name").value, neighborhood: $("#f-hood").value, address: $("#f-addr").value,
      lat: $("#f-lat").value, lng: $("#f-lng").value, price: $("#f-price").value, visited: $("#f-date").value,
      scores, headline: $("#f-hl").value, body: $("#f-body").value, photo: $("#f-photo").value,
      companion: $("#f-comp").value, companion_note: $("#f-cn").value, published: $("#f-pub").checked,
    };
    try {
      const saved = await api(existing ? "/reviews/" + existing.id : "/reviews", { method: existing ? "PUT" : "POST", body });
      await load(); location.hash = "#/review/" + saved.id;
    } catch (err) { $("#ferr").innerHTML = `<div class="msg err">${esc(err.message)}</div>`; }
  };
  const del = $("#del");
  if (del) del.onclick = async () => {
    if (!confirm(`Delete “${existing.name}” for good?`)) return;
    await api("/reviews/" + existing.id, { method: "DELETE" }); await load(); location.hash = "#/admin";
  };
}

/* ---------- router ---------- */
function route() {
  if (!state.loaded) return;
  const parts = (location.hash.replace(/^#\/?/, "") || "").split("/");
  const [a, b, c] = parts;
  document.title = "Nicoeats — Natas, Carrot Cake & Poutine, Montréal";
  markNav(CAT_KEYS.includes(a) || a === "map" || a === "about" ? a : a === "review" && b ? (state.reviews.find((r) => r.id === Number(b)) || {}).category : "");
  if (mapObj) { mapObj.remove(); mapObj = null; }
  if (!a) viewHome();
  else if (CATS[a]) viewCat(a);
  else if (a === "review") viewReview(b);
  else if (a === "map") viewMap();
  else if (a === "about") viewAbout();
  else if (a === "admin") b === "new" ? viewEdit() : b === "edit" ? viewEdit(c) : viewAdmin();
  else notFound();
  window.scrollTo(0, 0);
  app.focus({ preventScroll: true });
}
window.addEventListener("hashchange", route);
load().then(() => { paintChrome(); route(); }).catch(() => {
  app.innerHTML = '<div class="wrap sec"><div class="empty"><h3>Kitchen\'s closed.</h3><p>Couldn\'t reach the server. Try again in a minute.</p></div></div>';
});
