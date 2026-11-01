import { createClient } from "@supabase/supabase-js";
import "./style.css";

const env = import.meta.env;
const supabase = env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY
  ? createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
  : null;
const app = document.querySelector("#app");
let registrations = [];
let eventRecords = [];
let currentUser = null;

const esc = (s = "") => String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const date = s => s ? new Date(s).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"}) : "-";

function renderLogin(message = "") {
  app.innerHTML = `
    <main class="login-wrap"><section class="login-card">
      <div class="brand-mark">UW</div><p class="eyebrow">PANEL PENGELOLAAN ACARA</p>
      <h1>Undangan WA</h1><p class="muted">Masuk untuk mengelola registrasi dan tiket tamu.</p>
      ${message ? `<div class="notice">${esc(message)}</div>` : ""}
      <form id="login-form"><label>Email admin<input name="email" type="email" required autocomplete="username"></label>
      <label>Password<input name="password" type="password" required autocomplete="current-password"></label>
      <button class="primary" type="submit">Masuk Dashboard</button></form>
      <p class="tiny muted">Akses hanya untuk akun yang sudah didaftarkan sebagai admin.</p>
    </section></main>`;
  document.querySelector("#login-form").addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.auth.signInWithPassword({ email: fd.get("email"), password: fd.get("password") });
    if (error) renderLogin("Email atau password tidak valid.");
    else await boot();
  });
}

function renderShell() {
  app.innerHTML = `
  <div class="layout">
    <aside class="sidebar"><div class="brand"><span class="brand-mark small">UW</span><span>Undangan WA</span></div>
      <div class="side-label">MENU UTAMA</div>
      <button class="nav active" data-view="events">▦ <span>Data Acara</span></button>
      <button class="nav" data-view="registrations">▤ <span>Data Registrasi</span></button>
      <div class="side-bottom"><div class="muted tiny">${esc(currentUser?.email)}</div><button id="logout" class="nav">↪ <span>Keluar</span></button></div>
    </aside>
    <main class="content"><header class="topbar"><div><p class="eyebrow">PANEL ADMINISTRATOR</p><h1 id="page-title">Data Acara</h1></div><div class="avatar">A</div></header><section id="view"></section></main>
  </div>`;
  document.querySelector("#logout").onclick = async () => { await supabase.auth.signOut(); renderLogin(); };
  document.querySelectorAll(".nav[data-view]").forEach(b => b.onclick = () => showView(b.dataset.view));
  showView("events");
}

async function loadRegistrations() {
  const { data, error } = await supabase.from("registrations").select("*").order("created_at",{ascending:false}).limit(500);
  if (error) throw error;
  registrations = data || [];
}

function stats() {
  const today = new Date().toISOString().slice(0,10);
  return {
    total: registrations.length,
    today: registrations.filter(r => r.created_at?.slice(0,10) === today).length,
    guests: registrations.filter(r => r.status === "registered").reduce((n,r) => n + r.guest_count,0),
    attended: registrations.filter(r => r.status === "attended").length
  };
}

async function loadEvents() {
  const { data, error } = await supabase.from("invite_campaigns")
    .select("id,name,event_title,event_date,venue,is_active,created_at")
    .order("event_date", { ascending: false });
  if (error) throw error;
  eventRecords = data || [];
  return eventRecords;
}

function eventStatus(event) {
  if (!event.event_date) return "Belum dijadwalkan";
  return new Date(event.event_date).getTime() < Date.now() ? "Sudah berlangsung" : "Akan berlangsung";
}

function eventsView(events) {
  return `<section class="panel">
    <div class="panel-head"><div><h2>Data Acara</h2><p class="muted">Seluruh acara yang sudah dan akan berlangsung.</p></div><button class="primary compact" id="add-event">+ Tambah Acara</button></div>
    <div id="event-form-wrap"></div>
    ${events.length ? `<div class="table-wrap"><table><thead><tr><th>Nama Acara</th><th>Waktu Acara</th><th>Pukul</th><th>Tempat</th><th>Registrasi</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
    ${events.map(ev => {
      const d = ev.event_date ? new Date(ev.event_date) : null;
      const count = registrations.filter(r => r.campaign_id === ev.id).length;
      return `<tr><td><b>${esc(ev.event_title || ev.name)}</b></td><td>${d ? d.toLocaleDateString("id-ID",{dateStyle:"long",timeZone:"Asia/Jakarta"}) : "-"}</td><td>${d ? d.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Jakarta"})+" WIB" : "-"}</td><td>${esc(ev.venue || "-")}</td><td>${count} orang</td><td><span class="status">${eventStatus(ev)}</span></td><td><button class="outline compact edit-event" data-id="${ev.id}">Edit</button> <button class="outline compact delete-event" data-id="${ev.id}" ${count ? "disabled title='Acara memiliki data registrasi'" : ""}>Hapus</button></td></tr>`;
    }).join("")}
    </tbody></table></div>` : '<div class="empty">Belum ada acara. Klik Tambah Acara untuk membuat acara pertama.</div>'}
  </section>`;
}

function eventForm(event = null) {
  const editing = Boolean(event);
  let day = "", time = "";
  if (event?.event_date) {
    const parts = new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(event.event_date));
    const get = k => parts.find(p => p.type === k)?.value || "";
    day = `${get("year")}-${get("month")}-${get("day")}`;
    time = new Intl.DateTimeFormat("en-GB", {timeZone:"Asia/Jakarta",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(event.event_date));
  }
  return `<form id="event-form" class="panel" style="margin-bottom:18px">
    <div class="panel-head"><div><h2>${editing ? "Edit Acara" : "Tambah Acara"}</h2><p class="muted">Isi informasi acara yang akan disimpan.</p></div><button type="button" class="outline compact" id="cancel-event">Batal</button></div>
    <label>Nama Acara<input class="search" name="event_title" value="${esc(event?.event_title || event?.name || "")}" placeholder="Contoh: Gathering PilotX" required></label>
    <div class="stats" style="grid-template-columns:repeat(2,minmax(0,1fr))">
      <label>Waktu Acara<input class="search" type="date" name="event_date" value="${day}" required></label>
      <label>Pukul<input class="search" type="time" name="event_time" value="${time}" required></label>
    </div>
    <label>Tempat<input class="search" name="venue" value="${esc(event?.venue || "")}" placeholder="Masukkan lokasi acara" required></label>
    <button class="primary" type="submit">${editing ? "Simpan Perubahan" : "Simpan Acara"}</button><div id="event-feedback"></div>
  </form>`;
}

async function saveEvent(e, eventId = null) {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const event_title = String(fd.get("event_title") || "").trim();
  const day = String(fd.get("event_date") || "");
  const time = String(fd.get("event_time") || "");
  const venue = String(fd.get("venue") || "").trim();
  const feedback = document.querySelector("#event-feedback");
  if (!event_title || !day || !time || !venue) return;
  const event_date = new Date(`${day}T${time}:00+07:00`).toISOString();
  const query = eventId
    ? supabase.from("invite_campaigns").update({name:event_title,event_title,event_date,venue}).eq("id",eventId)
    : supabase.from("invite_campaigns").insert({name:event_title,event_title,event_date,venue,is_active:true});
  const { error } = await query;
  if (error) {
    feedback.innerHTML = '<div class="notice error">Acara gagal disimpan. Silakan coba kembali.</div>';
    return;
  }
  await showView("events");
}

async function deleteEvent(eventId) {
  const hasRegistrations = registrations.some(r => r.campaign_id === eventId);
  if (hasRegistrations) {
    alert("Acara tidak dapat dihapus karena sudah memiliki data registrasi. Data peserta harus tetap terhubung dengan acara.");
    return;
  }
  if (!confirm("Hapus acara ini? Data undangan yang terkait tidak akan dihapus.")) return;
  const { error } = await supabase.from("invite_campaigns").delete().eq("id", eventId);
  if (error) {
    alert("Acara gagal dihapus. Silakan coba kembali.");
    return;
  }
  await showView("events");
}

function table(rows) {
  if (!rows.length) return '<div class="empty">Belum ada data registrasi.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>No. Register</th><th>Nama</th><th>WhatsApp</th><th>Pengundang</th><th>Acara</th><th>Tanggal</th><th>Status</th></tr></thead><tbody>
  ${rows.map(r => `<tr><td class="mono">${esc(r.registration_no)}</td><td><b>${esc(r.name)}</b><small>${esc(r.address)}</small></td><td>${esc(r.whatsapp)}</td><td>${esc(r.inviter)}</td><td>${esc(eventRecords.find(ev => ev.id === r.campaign_id)?.event_title || eventRecords.find(ev => ev.id === r.campaign_id)?.name || "Belum terkait acara")}</td><td>${date(r.created_at)}</td><td><span class="status ${esc(r.status)}">${esc(r.status)}</span></td></tr>`).join("")}
  </tbody></table></div>`;
}

function registrationsView(events) {
  const selected = new URLSearchParams(location.hash.slice(1)).get("event") || "all";
  const eventOptions = events.map(ev => `<option value="${ev.id}" ${selected === ev.id ? "selected" : ""}>${esc(ev.event_title || ev.name)}</option>`).join("");
  return `<section class="panel"><div class="panel-head"><div><h2>Data Registrasi</h2><p class="muted">Pilih acara untuk melihat peserta yang mendaftar pada acara tersebut.</p></div><button class="primary compact" id="export">Export CSV</button></div>
  <label>Filter Acara<select id="event-filter" class="search"><option value="all" ${selected === "all" ? "selected" : ""}>Semua Acara</option>${eventOptions}<option value="none" ${selected === "none" ? "selected" : ""}>Registrasi tanpa acara</option></select></label>
  <input id="search" class="search" placeholder="Cari nama, nomor WA, alamat atau nomor register...">
  <div id="registration-table">${table(filterRegistrations(selected))}</div></section>`;
}

function filterRegistrations(eventId, query = "") {
  return registrations.filter(r => (eventId === "all" || (eventId === "none" ? !r.campaign_id : r.campaign_id === eventId)) &&
    [r.registration_no,r.name,r.whatsapp,r.address,r.inviter].some(v => String(v || "").toLowerCase().includes(query)));
}


async function showView(view) {
  document.querySelectorAll(".nav[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  const title = {events:"Data Acara",registrations:"Data Registrasi"}[view] || "Data Acara";
  document.querySelector("#page-title").textContent = title;
  const target = document.querySelector("#view");
  target.innerHTML = '<div class="loading">Memuat data...</div>';
  try {
    await loadRegistrations();
    const events = await loadEvents();
    target.innerHTML = view === "registrations" ? registrationsView(events) : eventsView(events);
    if (view === "events") {
      document.querySelector("#add-event").onclick = () => {
        document.querySelector("#event-form-wrap").innerHTML = eventForm();
        document.querySelector("#event-form").addEventListener("submit", e => saveEvent(e));
        document.querySelector("#cancel-event").onclick = () => document.querySelector("#event-form-wrap").innerHTML = "";
      };
      document.querySelectorAll(".edit-event").forEach(button => button.onclick = () => {
        const event = events.find(ev => ev.id === button.dataset.id);
        document.querySelector("#event-form-wrap").innerHTML = eventForm(event);
        document.querySelector("#event-form").addEventListener("submit", e => saveEvent(e, event.id));
        document.querySelector("#cancel-event").onclick = () => document.querySelector("#event-form-wrap").innerHTML = "";
        document.querySelector("#event-form-wrap").scrollIntoView({behavior:"smooth",block:"start"});
      });
      document.querySelectorAll(".delete-event").forEach(button => button.onclick = () => deleteEvent(button.dataset.id));
    }
    if (view === "registrations") {
      const filter = document.querySelector("#event-filter");
      filter.onchange = () => {
        document.querySelector("#registration-table").innerHTML = table(filterRegistrations(filter.value, document.querySelector("#search").value.toLowerCase()));
      };
      document.querySelector("#search").oninput = e => {
        document.querySelector("#registration-table").innerHTML = table(filterRegistrations(filter.value, e.target.value.toLowerCase()));
      };
      document.querySelector("#export").onclick = () => exportCsv(filterRegistrations(filter.value, document.querySelector("#search").value.toLowerCase()));
    }
  } catch (e) {
    console.error(e);
    target.innerHTML = '<div class="notice error">Gagal memuat data acara atau registrasi. Pastikan kebijakan akses database mengizinkan admin membaca data.</div>';
  }
}

function exportCsv(rows = registrations) {
  const cols = ["registration_no","name","whatsapp","address","inviter","guest_count","attendance_count","status","created_at"];
  const csv = [cols.join(","), ...rows.map(r => cols.map(k => '"' + String(r[k] ?? "").replace(/"/g,'""') + '"').join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));
  const a = document.createElement("a"); a.href = url; a.download = "data-registrasi-undangan.csv"; a.click(); URL.revokeObjectURL(url);
}

async function boot() {
  if (!supabase) {
    app.innerHTML = '<main class="login-wrap"><section class="login-card"><h1>Konfigurasi belum lengkap</h1><p>Atur VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY pada environment Cloudflare Pages.</p></section></main>';
    return;
  }
  const { data } = await supabase.auth.getSession();
  if (!data.session) return renderLogin();
  currentUser = data.session.user;
  const { data: admin } = await supabase.from("admin_users").select("user_id").eq("user_id",currentUser.id).maybeSingle();
  if (!admin) { await supabase.auth.signOut(); return renderLogin("Akun ini belum memiliki hak akses admin."); }
  renderShell();
}

boot();
