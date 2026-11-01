import { createClient } from "@supabase/supabase-js";
import "./style.css";

const env = import.meta.env;
const supabase = env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY
  ? createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
  : null;
const app = document.querySelector("#app");
let registrations = [];
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
      <div class="side-label">MENU UTAMA</div><button class="nav active" data-view="dashboard">▦ <span>Dashboard</span></button>
      <button class="nav" data-view="registrations">▤ <span>Data Registrasi</span></button>
      <button class="nav" data-view="campaigns">✉ <span>Undangan Acara</span></button>
      <div class="side-bottom"><div class="muted tiny">${esc(currentUser?.email)}</div><button id="logout" class="nav">↪ <span>Keluar</span></button></div>
    </aside>
    <main class="content"><header class="topbar"><div><p class="eyebrow">PANEL ADMINISTRATOR</p><h1 id="page-title">Dashboard</h1></div><div class="avatar">A</div></header><section id="view"></section></main>
  </div>`;
  document.querySelector("#logout").onclick = async () => { await supabase.auth.signOut(); renderLogin(); };
  document.querySelectorAll(".nav[data-view]").forEach(b => b.onclick = () => showView(b.dataset.view));
  showView("dashboard");
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

function dashboardView() {
  const s = stats();
  return `<div class="stats">
    <article class="stat"><span>Total Registrasi</span><strong>${s.total}</strong><small>Seluruh pendaftar</small></article>
    <article class="stat"><span>Registrasi Hari Ini</span><strong>${s.today}</strong><small>Pendaftar baru</small></article>
    <article class="stat"><span>Kuota Tamu</span><strong>${s.guests}</strong><small>2 orang per tiket</small></article>
    <article class="stat"><span>Sudah Hadir</span><strong>${s.attended}</strong><small>Status kehadiran</small></article>
  </div>
  <section class="panel"><div class="panel-head"><div><h2>Registrasi Terbaru</h2><p class="muted">Daftar tamu yang baru mendaftar melalui WhatsApp.</p></div><button class="outline" id="all-reg">Lihat Semua</button></div>
  ${table(registrations.slice(0,8))}</section>`;
}

function table(rows) {
  if (!rows.length) return '<div class="empty">Belum ada data registrasi.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>No. Register</th><th>Nama</th><th>WhatsApp</th><th>Pengundang</th><th>Tanggal</th><th>Status</th></tr></thead><tbody>
  ${rows.map(r => `<tr><td class="mono">${esc(r.registration_no)}</td><td><b>${esc(r.name)}</b><small>${esc(r.address)}</small></td><td>${esc(r.whatsapp)}</td><td>${esc(r.inviter)}</td><td>${date(r.created_at)}</td><td><span class="status ${esc(r.status)}">${esc(r.status)}</span></td></tr>`).join("")}
  </tbody></table></div>`;
}

function registrationsView() {
  return `<section class="panel"><div class="panel-head"><div><h2>Data Registrasi</h2><p class="muted">Maksimal 500 data terbaru ditampilkan.</p></div><button class="primary compact" id="export">Export CSV</button></div>
  <input id="search" class="search" placeholder="Cari nama, nomor WA, alamat atau nomor register...">
  <div id="registration-table">${table(registrations)}</div></section>`;
}

function campaignsView() {
  return `<section class="panel"><h2>Pengaturan Undangan</h2><p class="muted">Kelola kampanye dan file undangan melalui tabel Supabase. Form pengelolaan kampanye akan diaktifkan pada tahap berikutnya.</p>
  <div class="notice">Backend registrasi dan webhook disiapkan. Untuk mengirim undangan massal, kredensial Wablas dan desain JPG perlu dikonfigurasi terlebih dahulu.</div></section>`;
}

async function showView(view) {
  document.querySelectorAll(".nav[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  const title = {dashboard:"Dashboard",registrations:"Data Registrasi",campaigns:"Undangan Acara"}[view];
  document.querySelector("#page-title").textContent = title;
  const target = document.querySelector("#view");
  target.innerHTML = '<div class="loading">Memuat data...</div>';
  try {
    await loadRegistrations();
    target.innerHTML = view === "dashboard" ? dashboardView() : view === "registrations" ? registrationsView() : campaignsView();
    if (view === "dashboard") document.querySelector("#all-reg").onclick = () => showView("registrations");
    if (view === "registrations") {
      document.querySelector("#search").oninput = e => {
        const q = e.target.value.toLowerCase();
        const filtered = registrations.filter(r => [r.registration_no,r.name,r.whatsapp,r.address,r.inviter].some(v => String(v || "").toLowerCase().includes(q)));
        document.querySelector("#registration-table").innerHTML = table(filtered);
      };
      document.querySelector("#export").onclick = exportCsv;
    }
  } catch (e) {
    target.innerHTML = `<div class="notice error">Gagal memuat data. Pastikan akun sudah terdaftar pada tabel admin_users dan kebijakan database sudah diterapkan.</div>`;
  }
}

function exportCsv() {
  const cols = ["registration_no","name","whatsapp","address","inviter","guest_count","attendance_count","status","created_at"];
  const csv = [cols.join(","), ...registrations.map(r => cols.map(k => '"' + String(r[k] ?? "").replace(/"/g,'""') + '"').join(","))].join("\r\n");
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
