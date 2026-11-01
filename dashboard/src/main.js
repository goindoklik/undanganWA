import { createClient } from "@supabase/supabase-js";
import "./style.css";

const env = import.meta.env;
const supabase = env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY
  ? createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
  : null;
const app = document.querySelector("#app");
let registrations = [];
let eventRecords = [];
let authorizedSenders = [];
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
      <button class="nav" data-view="authorized">♙ <span>Nomor WhatsApp Diizinkan</span></button>
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
    .select("id,name,event_title,event_date,venue,is_active,created_at,invitation_image_url")
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
    <div id="event-form-wrap"></div><div id="event-invitation-wrap"></div>
    ${events.length ? `<div class="table-wrap"><table><thead><tr><th>Nama Acara</th><th>Waktu Acara</th><th>Pukul</th><th>Tempat</th><th>Registrasi</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
    ${events.map(ev => {
      const d = ev.event_date ? new Date(ev.event_date) : null;
      const count = registrations.filter(r => r.campaign_id === ev.id).length;
      return `<tr><td><b>${esc(ev.event_title || ev.name)}</b></td><td>${d ? d.toLocaleDateString("id-ID",{dateStyle:"long",timeZone:"Asia/Jakarta"}) : "-"}</td><td>${d ? d.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Jakarta"})+" WIB" : "-"}</td><td>${esc(ev.venue || "-")}</td><td>${count} orang</td><td><span class="status">${eventStatus(ev)}</span></td><td><a href="#" class="invitation-download" data-id="${ev.id}">Download Undangan</a> <button class="outline compact edit-event" data-id="${ev.id}">Edit</button> <button class="outline compact delete-event" data-id="${ev.id}">Hapus</button></td></tr>`;
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


function invitationDate(value) {
  return new Intl.DateTimeFormat("id-ID", { day:"numeric", month:"long", year:"numeric", timeZone:"Asia/Jakarta" }).format(new Date(value));
}
function invitationTime(value) {
  return new Intl.DateTimeFormat("id-ID", { hour:"2-digit", minute:"2-digit", hourCycle:"h23", timeZone:"Asia/Jakarta" }).format(new Date(value)) + " WIB";
}
function loadInvitationTemplate(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Template undangan tidak dapat dimuat. Periksa koneksi internet."));
    image.src = url;
  });
}
function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  const words = String(text || "").split(/\\s+/);
  let line = "", lines = [];
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines[maxLines - 1];
    while (last && ctx.measureText(last + "…").width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = last + "…";
  }
  lines.forEach((item, index) => ctx.fillText(item, x, y + index * lineHeight));
}
async function buildInvitationDataUrl(event) {
  const templateUrl = "https://cdn.jsdelivr.net/gh/goindoklik/undanganWA@main/Gambar/Undangan.png?v=b7f8d132";
  const image = await loadInvitationTemplate(templateUrl);
  const scale = Math.min(2400 / image.naturalWidth, 2400 / image.naturalHeight, 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(320, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(320, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browser tidak mendukung pembuatan gambar.");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  // Isi tanggal dan pukul tepat di dalam dua kolom informasi pada template.
  // Koordinat mengikuti kanvas asli 1024 x 1536 dan ikut menyesuaikan skala.
  const w = canvas.width, h = canvas.height;
  const sx = w / 1024, sy = h / 1536;
  const eventDate = new Date(event.event_date);
  if (Number.isNaN(eventDate.getTime())) throw new Error("Tanggal acara tidak valid.");

  const weekday = new Intl.DateTimeFormat("id-ID", {
    weekday: "long", timeZone: "Asia/Jakarta"
  }).format(eventDate);
  const dateText = invitationDate(event.event_date);
  const timeText = invitationTime(event.event_date);

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,.65)";
  ctx.shadowBlur = 3 * sx;

  // Kolom tanggal: nama hari dan tanggal rata kiri pada satu garis awal.
  // Posisi kiri disamakan dengan tepi kiri area teks sebelumnya.
  const dateX = 167 * sx;
  ctx.font = "700 " + Math.round(19 * sx) + "px Poppins, Arial, sans-serif";
  ctx.fillText(weekday, dateX, 735 * sy, 205 * sx);
  ctx.font = "600 " + Math.round(18 * sx) + "px Poppins, Arial, sans-serif";
  ctx.fillText(dateText, dateX, 765 * sy, 205 * sx);

  // Kolom waktu: tetap rata tengah di bawah label PUKUL.
  ctx.textAlign = "center";
  ctx.font = "700 " + Math.round(21 * sx) + "px Poppins, Arial, sans-serif";
  ctx.fillText(timeText, 528 * sx, 750 * sy, 145 * sx);

  // Kolom tempat: isi area di bawah label TEMPAT, di sisi kanan ikon lokasi.
  const venueText = String(event.venue || event.event_location || event.location || "").trim();
  if (venueText) {
    const venueX = 741 * sx;
    const venueMaxWidth = 255 * sx;
    let venueFont = Math.round(19 * sx);
    ctx.font = "700 " + venueFont + "px Poppins, Arial, sans-serif";
    // Pisahkan nama tempat agar "Rumah Makan GG Palasah" tampil dalam dua baris.
    const venueLines = venueText === "Rumah Makan GG Palasah"
      ? ["Rumah Makan", "GG Palasah"]
      : [venueText];
    while (venueLines.some(line => ctx.measureText(line).width > venueMaxWidth) && venueFont > Math.round(13 * sx)) {
      venueFont -= 1;
      ctx.font = "700 " + venueFont + "px Poppins, Arial, sans-serif";
    }
    ctx.textAlign = "left";
    if (venueLines.length === 2) {
      ctx.fillText(venueLines[0], venueX, 738 * sy, venueMaxWidth);
      ctx.fillText(venueLines[1], venueX, 762 * sy, venueMaxWidth);
    } else {
      ctx.fillText(venueText, venueX, 750 * sy, venueMaxWidth);
    }
    ctx.textAlign = "center";
  }

  ctx.shadowBlur = 0;
  return canvas.toDataURL("image/png");
}
async function showEventInvitation(eventId) {
  const event = eventRecords.find(item => item.id === eventId);
  const wrap = document.querySelector("#event-invitation-wrap");
  if (!event || !wrap) return;
  wrap.innerHTML = '<section class="panel invitation-panel"><div class="panel-head"><div><h2>Undangan Acara</h2><p class="muted">Gambar undangan dibuat dari data acara ini.</p></div><button type="button" class="outline compact" id="close-invitation">Tutup</button></div><div class="loading">Membuat gambar undangan...</div></section>';
  wrap.scrollIntoView({behavior:"smooth",block:"start"});
  document.querySelector("#close-invitation").onclick = () => { wrap.innerHTML = ""; };
  try {
    const dataUrl = await buildInvitationDataUrl(event);
    wrap.innerHTML = '<section class="panel invitation-panel"><div class="panel-head"><div><h2>Undangan Acara</h2><p class="muted">' + esc(event.event_title || event.name) + '</p></div><button type="button" class="outline compact" id="close-invitation">Tutup</button></div><div class="invitation-preview"><img id="invitation-image" alt="Gambar undangan acara"></div><div class="invitation-actions"><button type="button" class="primary" id="download-invitation">Download Gambar</button><button type="button" class="outline" id="share-invitation">Bagikan ke WhatsApp</button></div><p class="muted invitation-hint">Jika tombol bagikan tidak tersedia di perangkat, download gambar lalu lampirkan secara manual di WhatsApp.</p></section>';
    const img = document.querySelector("#invitation-image");
    img.src = dataUrl;
    document.querySelector("#close-invitation").onclick = () => { wrap.innerHTML = ""; };
    document.querySelector("#download-invitation").onclick = () => {
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = "Undangan-" + String(event.event_title || event.name || "Acara").replace(/[^a-z0-9-_]+/gi, "-") + ".png";
      a.click();
    };
    document.querySelector("#share-invitation").onclick = async () => {
      try {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], "Undangan-" + String(event.event_title || "Acara").replace(/[^a-z0-9-_]+/gi, "-") + ".png", {type:"image/png"});
        if (navigator.canShare && navigator.canShare({files:[file]}) && navigator.share) {
          await navigator.share({title:"Undangan Acara", text:"Undangan " + (event.event_title || event.name), files:[file]});
        } else {
          const message = "Undangan " + (event.event_title || event.name) + "\\n" + invitationDate(event.event_date) + " · " + invitationTime(event.event_date) + "\\n" + (event.venue || "");
          window.open("https://wa.me/?text=" + encodeURIComponent(message), "_blank", "noopener");
          alert("Perangkat ini belum mendukung berbagi gambar langsung. Gambar sudah siap; silakan download lalu lampirkan di WhatsApp.");
        }
      } catch (error) {
        if (error?.name !== "AbortError") alert("Gagal membuka menu berbagi. Silakan download gambar.");
      }
    };
  } catch (error) {
    console.error("Gagal membuat gambar undangan:", error);
    wrap.innerHTML = '<section class="panel"><div class="panel-head"><div><h2>Undangan Acara</h2><p class="muted">Gambar undangan belum berhasil dibuat.</p></div><button type="button" class="outline compact" id="close-invitation">Tutup</button></div><div class="notice error">' + esc(error.message || "Terjadi kesalahan saat membuat gambar.") + '</div><button type="button" class="outline compact" id="retry-invitation">Coba Lagi</button></section>';
    document.querySelector("#close-invitation").onclick = () => { wrap.innerHTML = ""; };
    document.querySelector("#retry-invitation").onclick = () => showEventInvitation(eventId);
  }
}

async function deleteEvent(eventId) {
  const event = eventRecords.find(item => item.id === eventId);
  const eventName = event?.event_title || event?.name || "acara ini";
  const confirmed = confirm(`Hapus "${eventName}" beserta seluruh data registrasi peserta yang terkait? Tindakan ini tidak dapat dibatalkan.`);
  if (!confirmed) return;

  // Hapus semua registrasi berdasarkan campaign_id langsung di database,
  // tidak bergantung pada daftar yang hanya memuat maksimal 500 baris.
  const { error: registrationsError } = await supabase
    .from("registrations")
    .delete()
    .eq("campaign_id", eventId);

  if (registrationsError) {
    console.error("Gagal menghapus registrasi acara:", registrationsError);
    alert("Data registrasi peserta gagal dihapus. Acara tidak jadi dihapus.");
    return;
  }

  const { error: eventError } = await supabase
    .from("invite_campaigns")
    .delete()
    .eq("id", eventId);

  if (eventError) {
    console.error("Gagal menghapus acara:", eventError);
    alert("Registrasi terkait sudah dihapus, tetapi acara gagal dihapus. Silakan coba kembali.");
    await showView("events");
    return;
  }

  alert("Acara dan seluruh data registrasi pesertanya berhasil dihapus.");
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



async function loadAuthorizedSenders() {
  const { data, error } = await supabase.from("authorized_senders")
    .select("id,phone,display_name,is_active,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  authorizedSenders = data || [];
  return authorizedSenders;
}

function authorizedView(rows) {
  return `<section class="panel">
    <div class="panel-head"><div><h2>Nomor WhatsApp Diizinkan</h2><p class="muted">Hanya nomor aktif yang dapat menggunakan perintah Undang.</p></div></div>
    <form id="authorized-form" class="panel" style="padding:16px;margin-bottom:18px">
      <div class="stats" style="grid-template-columns:repeat(2,minmax(0,1fr));margin:0">
        <label>Nama Pengguna<input class="search" name="display_name" placeholder="Nama pengundang" required></label>
        <label>Nomor WhatsApp<input class="search" name="phone" placeholder="08xxxxxxxxxx" inputmode="numeric" required></label>
      </div>
      <button class="primary compact" type="submit">+ Tambah Nomor</button><div id="authorized-feedback"></div>
    </form>
    ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Nama</th><th>Nomor WhatsApp</th><th>Status</th><th>Tanggal Ditambahkan</th><th>Aksi</th></tr></thead><tbody>
      ${rows.map(row => `<tr><td><b>${esc(row.display_name)}</b></td><td class="mono">${esc(row.phone)}</td><td><span class="status ${row.is_active ? "" : "cancelled"}">${row.is_active ? "Aktif" : "Nonaktif"}</span></td><td>${date(row.created_at)}</td><td><button class="outline compact edit-sender" data-id="${row.id}">Edit</button> <button class="outline compact toggle-sender" data-id="${row.id}">${row.is_active ? "Nonaktifkan" : "Aktifkan"}</button> <button class="outline compact delete-sender" data-id="${row.id}">Hapus</button></td></tr>`).join("")}
    </tbody></table></div>` : '<div class="empty">Belum ada nomor WhatsApp yang diizinkan.</div>'}
  </section>`;
}

async function saveAuthorizedSender(e, id = null) {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  let phone = String(fd.get("phone") || "").replace(/\\D/g, "");
  if (phone.startsWith("0")) phone = "62" + phone.slice(1);
  if (phone.startsWith("8")) phone = "62" + phone;
  const display_name = String(fd.get("display_name") || "").trim();
  const feedback = document.querySelector("#authorized-feedback");
  if (!/^62[0-9]{8,13}$/.test(phone) || !display_name) {
    feedback.innerHTML = '<div class="notice error">Masukkan nama dan nomor WhatsApp Indonesia yang valid.</div>';
    return;
  }
  const query = id
    ? supabase.from("authorized_senders").update({ phone, display_name, updated_at: new Date().toISOString() }).eq("id", id)
    : supabase.from("authorized_senders").insert({ phone, display_name, created_by: currentUser.id });
  const { error } = await query;
  if (error) {
    feedback.innerHTML = '<div class="notice error">Gagal menyimpan. Pastikan nomor belum terdaftar.</div>';
    return;
  }
  await showView("authorized");
}

async function wireAuthorizedView() {
  document.querySelector("#authorized-form").onsubmit = e => saveAuthorizedSender(e);
  document.querySelectorAll(".edit-sender").forEach(button => button.onclick = async () => {
    const row = authorizedSenders.find(item => item.id === button.dataset.id);
    const name = prompt("Nama pengundang:", row.display_name);
    if (name === null) return;
    const number = prompt("Nomor WhatsApp:", row.phone);
    if (number === null) return;
    const form = document.createElement("form");
    form.innerHTML = '<input name="display_name"><input name="phone">';
    form.elements.display_name.value = name;
    form.elements.phone.value = number;
    await saveAuthorizedSender({ preventDefault(){}, currentTarget: form }, row.id);
  });
  document.querySelectorAll(".toggle-sender").forEach(button => button.onclick = async () => {
    const row = authorizedSenders.find(item => item.id === button.dataset.id);
    const { error } = await supabase.from("authorized_senders").update({ is_active: !row.is_active, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (error) alert("Status nomor gagal diubah.");
    else await showView("authorized");
  });
  document.querySelectorAll(".delete-sender").forEach(button => button.onclick = async () => {
    if (!confirm("Hapus nomor WhatsApp ini dari daftar izin?")) return;
    const { error } = await supabase.from("authorized_senders").delete().eq("id", button.dataset.id);
    if (error) alert("Nomor gagal dihapus.");
    else await showView("authorized");
  });
}

async function showView(view) {
  document.querySelectorAll(".nav[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  const title = {events:"Data Acara",registrations:"Data Registrasi",authorized:"Nomor WhatsApp Diizinkan"}[view] || "Data Acara";
  document.querySelector("#page-title").textContent = title;
  const target = document.querySelector("#view");
  target.innerHTML = '<div class="loading">Memuat data...</div>';
  try {
    await loadRegistrations();
    const events = await loadEvents();
    if (view === "authorized") await loadAuthorizedSenders();
    target.innerHTML = view === "authorized" ? authorizedView(authorizedSenders) : (view === "registrations" ? registrationsView(events) : eventsView(events));
    if (view === "authorized") wireAuthorizedView();
    if (view === "events") {
      document.querySelector("#add-event").onclick = () => {
        document.querySelector("#event-form-wrap").innerHTML = eventForm();
        document.querySelector("#event-form").addEventListener("submit", e => saveEvent(e));
        document.querySelector("#cancel-event").onclick = () => document.querySelector("#event-form-wrap").innerHTML = "";
      };
      document.querySelectorAll(".invitation-download").forEach(link => link.onclick = async event => {
        event.preventDefault();
        const item = eventRecords.find(ev => ev.id === link.dataset.id);
        if (!item) return;
        const originalText = link.textContent;
        link.textContent = "Menyiapkan...";
        link.style.pointerEvents = "none";
        try {
          const dataUrl = await buildInvitationDataUrl(item);
          const a = document.createElement("a");
          a.href = dataUrl;
          a.download = "Undangan-" + String(item.event_title || item.name || "Acara").replace(/[^a-z0-9-_]+/gi, "-") + ".png";
          document.body.appendChild(a);
          a.click();
          a.remove();
        } catch (error) {
          console.error("Gagal mengunduh undangan:", error);
          alert(error.message || "Gambar undangan gagal dibuat.");
        } finally {
          link.textContent = originalText;
          link.style.pointerEvents = "";
        }
      });
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
