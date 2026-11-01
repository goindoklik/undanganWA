import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { Resvg, initWasm } from "npm:@resvg/resvg-wasm@2.6.2";

const resvgWasmUrl = new URL("index_bg.wasm", import.meta.resolve("npm:@resvg/resvg-wasm@2.6.2"));
await initWasm(await Deno.readFile(resvgWasmUrl));

type WablasPayload = {
  id?: string;
  pushName?: string;
  isGroup?: boolean;
  message?: string;
  phone?: string;
  messageType?: string;
  sender?: string;
  isFromMe?: boolean;
  timestamp?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = "62" + digits.slice(1);
  if (digits.startsWith("8")) digits = "62" + digits;
  return digits;
}

function parseForm(message: string) {
  // WhatsApp copy/paste can insert zero-width Unicode characters inside field labels.
  const cleaned = message.replace(/[\u200B-\u200D\uFEFF]/g, "");
  const result: Record<string, string> = {};
  for (const line of cleaned.split(/\r?\n/)) {
    const match = line.match(/^\s*(nama|no\s*wa|alamat|pengundang)\s*:\s*(.*)$/i);
    if (match) {
      const key = match[1].toLowerCase().replace(/\s/g, "");
      result[key === "nowa" ? "whatsapp" : key] = match[2].trim();
    }
  }
  return result;
}

async function sendText(phone: string, message: string) {
  const token = Deno.env.get("WABLAS_TOKEN");
  const secret = Deno.env.get("WABLAS_SECRET_KEY");
  if (!token || !secret) throw new Error("Wablas credentials belum dikonfigurasi");
  const response = await fetch("https://smg.wablas.com/api/v2/send-message", {
    method: "POST",
    headers: {
      Authorization: `${token}.${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ data: [{ phone, message, ref_id: crypto.randomUUID() }] }),
  });
  const raw = await response.text();
  let result: Record<string, unknown> = {};
  try { result = JSON.parse(raw); } catch { /* non-JSON response */ }
  if (!response.ok || result.status !== true) {
    const reason = typeof result.message === "string" ? result.message.slice(0, 240) : "Respons bukan JSON";
    console.error("WABLAS_SEND_TEXT_REJECTED", JSON.stringify({ http_status: response.status, api_status: result.status ?? null, reason }));
    throw new Error(`Wablas menolak pesan (HTTP ${response.status}): ${reason}`);
  }
  console.log("WABLAS_SEND_TEXT_ACCEPTED", JSON.stringify({ http_status: response.status }));
  return result;
}


function xml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]!));
}

function createTicketPng(name: string, phone: string, address: string, registrationNo: string, inviter: string, eventTitle: string, eventDate: string, venue: string) {
  const short = (value: string, max: number) => xml(value.length > max ? value.slice(0, max - 1) + "…" : value);
  const date = new Date(eventDate);
  const dateLabel = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(date);
  const timeLabel = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" }).format(date) + " WIB";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
    <defs>
      <linearGradient id="navy" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#061329"/><stop offset=".55" stop-color="#102b55"/><stop offset="1" stop-color="#061329"/></linearGradient>
      <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff0a4"/><stop offset=".28" stop-color="#d9a72e"/><stop offset=".58" stop-color="#fff2a8"/><stop offset="1" stop-color="#a66b0c"/></linearGradient>
      <linearGradient id="red" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#a90918"/><stop offset=".5" stop-color="#f02d37"/><stop offset="1" stop-color="#9e0718"/></linearGradient>
      <linearGradient id="cream" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff8df"/><stop offset="1" stop-color="#f4d98c"/></linearGradient>
      <filter id="shadow"><feGaussianBlur stdDeviation="7"/></filter>
    </defs>
    <rect width="1200" height="800" rx="28" fill="#020918"/>
    <rect x="14" y="14" width="1172" height="772" rx="24" fill="url(#navy)" stroke="url(#gold)" stroke-width="8"/>
    <path d="M20 20H320L160 110H20Z M20 780H370L170 690H20Z" fill="url(#gold)" opacity=".95"/>
    <path d="M35 145L390 25H780L520 155Z" fill="#1d4e91" opacity=".2"/>
    <g opacity=".45" fill="#5fa7ff"><circle cx="710" cy="80" r="3"/><circle cx="770" cy="110" r="2"/><circle cx="820" cy="60" r="3"/><circle cx="890" cy="130" r="2"/><circle cx="650" cy="155" r="2"/></g>
    <path d="M700 165L790 30L820 165L920 40L900 190L1040 85L960 220Z" fill="#1674e9" opacity=".15"/>
    <text x="72" y="104" fill="#fff" font-family="Arial,sans-serif" font-size="72" font-weight="900" font-style="italic">Pilot<tspan fill="url(#gold)">X</tspan></text>
    <text x="78" y="139" fill="#e8edf8" font-family="Arial,sans-serif" font-size="16" font-weight="700" letter-spacing="4">BERSAMA KITA BISA LEBIH SUKSES</text>
    <text x="1090" y="72" fill="#fff0a4" font-family="Arial,sans-serif" font-size="25" font-style="italic" text-anchor="end">Saatnya Bersama PilotX</text>
    <path d="M70 188L735 188L770 230L735 272H70L35 230Z" fill="#050d1e" stroke="url(#gold)" stroke-width="7"/>
    <text x="400" y="244" fill="url(#gold)" font-family="Georgia,serif" font-size="65" font-weight="900" text-anchor="middle">UNDANGAN BISNIS</text>
    <path d="M92 290H710" stroke="url(#gold)" stroke-width="2"/>
    <path d="M120 300L690 300L665 352L95 352Z" fill="url(#red)"/>
    <text x="390" y="337" fill="#fff" font-family="Arial,sans-serif" font-size="31" font-weight="900" font-style="italic" text-anchor="middle">ACARA OFFLINE BESAR</text>
    <text x="390" y="397" fill="#fff" font-family="Arial,sans-serif" font-size="24" font-weight="700" text-anchor="middle">Saatnya Bergabung, Bangun Jaringan,</text>
    <text x="390" y="428" fill="#fff" font-family="Arial,sans-serif" font-size="24" font-weight="700" text-anchor="middle">Raih Kesempatan Tanpa Batas!</text>
    <rect x="55" y="460" width="710" height="132" rx="24" fill="#07162d" stroke="url(#gold)" stroke-width="6"/>
    <path d="M290 478V574M520 478V574" stroke="#e7c65d" stroke-width="3"/>
    <text x="85" y="510" fill="#ffe27b" font-family="Arial,sans-serif" font-size="18" font-weight="700">TANGGAL</text>
    <text x="85" y="550" fill="#fff" font-family="Arial,sans-serif" font-size="27" font-weight="900">${short(dateLabel.toLocaleUpperCase("id-ID"), 24)}</text>
    <text x="320" y="510" fill="#ffe27b" font-family="Arial,sans-serif" font-size="18" font-weight="700">PUKUL</text>
    <text x="320" y="550" fill="#fff" font-family="Arial,sans-serif" font-size="30" font-weight="900">${short(timeLabel, 14)}</text>
    <text x="550" y="510" fill="#ffe27b" font-family="Arial,sans-serif" font-size="18" font-weight="700">TEMPAT</text>
    <text x="550" y="550" fill="#fff" font-family="Arial,sans-serif" font-size="24" font-weight="900">${short(venue.toLocaleUpperCase("id-ID"), 22)}</text>
    <text x="78" y="640" fill="#fff" font-family="Arial,sans-serif" font-size="21">Kami mengundang Anda untuk hadir dalam acara besar</text>
    <text x="78" y="672" fill="#fff" font-family="Arial,sans-serif" font-size="21">offline PilotX. Perluas jaringan, tambah wawasan,</text>
    <text x="78" y="704" fill="#fff" font-family="Arial,sans-serif" font-size="21">dan raih peluang bisnis yang lebih besar.</text>
    <text x="78" y="750" fill="#ffe27b" font-family="Arial,sans-serif" font-size="20" font-style="italic">Bersama PilotX — Kita tumbuh, kita maju, kita sukses!</text>
    <path d="M800 20V780" stroke="#ffe28a" stroke-width="5" stroke-dasharray="14 12"/>
    <rect x="825" y="35" width="335" height="730" rx="22" fill="url(#cream)" stroke="url(#gold)" stroke-width="5"/>
    <rect x="842" y="52" width="301" height="78" rx="14" fill="url(#gold)"/>
    <text x="992" y="85" fill="#09152b" font-family="Arial,sans-serif" font-size="26" font-weight="900" text-anchor="middle">TIKET UNDANGAN</text>
    <text x="992" y="112" fill="#09152b" font-family="Arial,sans-serif" font-size="15" font-weight="700" text-anchor="middle">${short(eventTitle, 30)}</text>
    <text x="992" y="166" fill="#07152d" font-family="Arial,sans-serif" font-size="19" font-weight="700" text-anchor="middle">NO. REGISTER</text>
    <rect x="850" y="178" width="285" height="52" rx="10" fill="#071a39"/>
    <text x="992" y="214" fill="#fff" font-family="Arial,sans-serif" font-size="27" font-weight="900" text-anchor="middle">${short(registrationNo, 18)}</text>
    <text x="858" y="274" fill="#9a6c14" font-family="Arial,sans-serif" font-size="15" font-weight="700">NAMA</text>
    <text x="858" y="305" fill="#07152d" font-family="Arial,sans-serif" font-size="22" font-weight="900">${short(name, 25)}</text>
    <text x="858" y="350" fill="#9a6c14" font-family="Arial,sans-serif" font-size="15" font-weight="700">NO. WHATSAPP</text>
    <text x="858" y="379" fill="#07152d" font-family="Arial,sans-serif" font-size="20" font-weight="700">${short(phone, 22)}</text>
    <text x="858" y="425" fill="#9a6c14" font-family="Arial,sans-serif" font-size="15" font-weight="700">ALAMAT</text>
    <text x="858" y="454" fill="#07152d" font-family="Arial,sans-serif" font-size="18" font-weight="700">${short(address, 29)}</text>
    <text x="858" y="505" fill="#9a6c14" font-family="Arial,sans-serif" font-size="15" font-weight="700">PENGUNDANG</text>
    <text x="858" y="534" fill="#07152d" font-family="Arial,sans-serif" font-size="19" font-weight="700">${short(inviter, 25)}</text>
    <rect x="848" y="570" width="289" height="58" rx="12" fill="url(#gold)"/>
    <text x="992" y="607" fill="#07152d" font-family="Arial,sans-serif" font-size="23" font-weight="900" text-anchor="middle">BERLAKU UNTUK 2 ORANG</text>
    <rect x="890" y="650" width="205" height="76" rx="12" fill="#071a39"/>
    <text x="992" y="680" fill="#ffe27b" font-family="Arial,sans-serif" font-size="17" font-weight="900" text-anchor="middle">TIKET RESMI</text>
    <text x="992" y="706" fill="#fff" font-family="Arial,sans-serif" font-size="14" text-anchor="middle">Simpan untuk check-in</text>
  </svg>`;
  return new Resvg(svg, { font: { loadSystemFonts: false, defaultFontFamily: "Arial" } }).render().asPng();
}


function base64Bytes(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function imageDimensions(bytes: Uint8Array, contentType: string): { width: number; height: number } {
  if (contentType.includes("png") && bytes.length > 24) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: v.getUint32(16), height: v.getUint32(20) };
  }
  if (contentType.includes("jpeg") || contentType.includes("jpg")) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 255) { i++; continue; }
      const marker = bytes[i + 1], len = (bytes[i + 2] << 8) | bytes[i + 3];
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))
        return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
      if (len < 2) break;
      i += 2 + len;
    }
  }
  return { width: 1200, height: 800 };
}
function xmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
async function createInvitationImage(imageUrl: string, title: string, dateLabel: string, timeLabel: string, venue: string): Promise<Uint8Array> {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error("Gagal mengambil gambar undangan (HTTP " + response.status + ")");
  const contentType = (response.headers.get("content-type") || "image/jpeg").split(";")[0].toLowerCase();
  if (!["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(contentType)) throw new Error("Format gambar undangan harus PNG, JPG, atau WebP");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error("Ukuran gambar undangan kosong atau melebihi 8 MB");
  const dims = imageDimensions(bytes, contentType);
  const scale = Math.min(2400 / dims.width, 2400 / dims.height, 1);
  const w = Math.max(320, Math.round(dims.width * scale)), h = Math.max(320, Math.round(dims.height * scale));
  const band = Math.round(h * 0.32), titleSize = Math.max(20, Math.round(w * 0.034)), detailSize = Math.max(16, Math.round(w * 0.024));
  const dataUri = "data:" + contentType + ";base64," + base64Bytes(bytes);
  const x = Math.round(w * 0.05), y = h - band;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
    '<image href="' + dataUri + '" x="0" y="0" width="' + w + '" height="' + h + '" preserveAspectRatio="none"/>' +
    '<rect x="0" y="' + y + '" width="' + w + '" height="' + band + '" fill="#07152b" fill-opacity="0.90"/>' +
    '<text x="' + x + '" y="' + (y + titleSize * 1.35) + '" fill="#ffe27b" font-family="sans-serif" font-size="' + titleSize + '" font-weight="700">' + xmlText(title.slice(0, 65)) + '</text>' +
    '<text x="' + x + '" y="' + (y + titleSize * 2.55) + '" fill="#ffffff" font-family="sans-serif" font-size="' + detailSize + '">TANGGAL: ' + xmlText(dateLabel.slice(0, 65)) + '</text>' +
    '<text x="' + x + '" y="' + (y + titleSize * 3.65) + '" fill="#ffffff" font-family="sans-serif" font-size="' + detailSize + '">PUKUL: ' + xmlText(timeLabel.slice(0, 35)) + '</text>' +
    '<text x="' + x + '" y="' + (y + titleSize * 4.75) + '" fill="#ffffff" font-family="sans-serif" font-size="' + detailSize + '">TEMPAT: ' + xmlText(venue.slice(0, 85)) + '</text></svg>';
  return new Uint8Array(new Resvg(svg, { font: { loadSystemFonts: false, defaultFontFamily: "sans-serif" } }).render().asPng());
}
async function sendImage(phone: string, imageUrl: string, caption: string, refId: string) {
  const token = Deno.env.get("WABLAS_TOKEN");
  const secret = Deno.env.get("WABLAS_SECRET_KEY");
  if (!token || !secret) throw new Error("Wablas credentials belum dikonfigurasi");
  const response = await fetch("https://smg.wablas.com/api/v2/send-image", {
    method: "POST",
    headers: { Authorization: `${token}.${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data: [{ phone, image: imageUrl, caption, ref_id: refId }] }),
  });
  const raw = await response.text();
  let result: Record<string, unknown> = {};
  try { result = JSON.parse(raw); } catch { /* non-JSON response */ }
  if (!response.ok || result.status !== true) {
    const reason = typeof result.message === "string" ? result.message.slice(0, 240) : "Respons bukan JSON";
    console.error("WABLAS_SEND_IMAGE_REJECTED", JSON.stringify({ http_status: response.status, api_status: result.status ?? null, reason }));
    throw new Error(`Wablas menolak tiket gambar (HTTP ${response.status}): ${reason}`);
  }
  console.log("WABLAS_SEND_IMAGE_ACCEPTED", JSON.stringify({ http_status: response.status }));
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const webhookSecret = Deno.env.get("WABLAS_WEBHOOK_SECRET");
  const suppliedSecret = new URL(req.url).searchParams.get("key");
  if (!webhookSecret || suppliedSecret !== webhookSecret) {
    return json({ error: "Unauthorized webhook" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let payload: WablasPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (payload.isGroup || payload.isFromMe) return json({ ignored: true });
  const phone = normalizePhone(payload.phone || "");
  if (!phone || !payload.id) return json({ error: "Missing sender phone or message id" }, 400);

  const { error: eventError } = await db.from("wablas_inbound_events").insert({
    wablas_message_id: payload.id,
    sender_phone: phone,
    message_type: payload.messageType || "text",
    message_text: payload.message || "",
  });
  if (eventError?.code === "23505") return json({ duplicate: true });
  if (eventError) return json({ error: "Could not record inbound event" }, 500);

  const text = (payload.message || "").trim();
  const normalized = text.toLocaleLowerCase("id-ID");
  const { data: conversation } = await db
    .from("bot_conversations")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();

  try {
    const inviteCommand = text.match(/^undang\s+(?:no\s*wa\s*=\s*)?([0-9+().\s-]+?)(?:\s+dari\s+([0-9+().\s-]+))?$/i);
    if (inviteCommand) {
      const { data: sender } = await db.from("authorized_senders")
        .select("id,phone,display_name,is_active,daily_count,usage_date,last_command_at")
        .eq("phone", phone).maybeSingle();
      if (!sender || !sender.is_active) {
        await sendText(phone, "Maaf, nomor WhatsApp Anda belum terdaftar atau sedang tidak diizinkan menggunakan perintah undangan. Hubungi admin acara.");
        return json({ accepted: false, reason: "sender_not_authorized" });
      }

      const targetPhone = normalizePhone(inviteCommand[1]);
      if (!/^62[0-9]{8,13}$/.test(targetPhone)) {
        await sendText(phone, "Format nomor tujuan tidak valid. Gunakan: Undang no WA = 08xxxxxxxxxx");
        return json({ accepted: true, invalid: "target_phone" });
      }
      if (targetPhone === phone) {
        await sendText(phone, "Nomor tujuan tidak boleh sama dengan nomor pengundang.");
        return json({ accepted: true, invalid: "same_phone" });
      }

      const now = new Date();
      const jakartaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
      const lastCommand = sender.last_command_at ? new Date(sender.last_command_at).getTime() : 0;
      if (lastCommand && now.getTime() - lastCommand < 60_000) {
        await sendText(phone, "Tunggu minimal 60 detik sebelum mengirim perintah undangan berikutnya.");
        return json({ accepted: false, reason: "cooldown" });
      }
      const dailyCount = sender.usage_date === jakartaDate ? Number(sender.daily_count || 0) : 0;
      if (dailyCount >= 5) {
        await sendText(phone, "Batas undangan Anda hari ini sudah mencapai 5 nomor. Silakan coba kembali besok.");
        return json({ accepted: false, reason: "daily_limit" });
      }

      const { data: campaign } = await db.from("invite_campaigns")
        .select("id,event_title,name,event_date,venue,invitation_image_url")
        .eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!campaign || !campaign.invitation_image_url) {
        await sendText(phone, "Undangan belum dapat dikirim karena data acara aktif atau gambar undangan belum tersedia. Hubungi admin.");
        return json({ accepted: false, reason: "campaign_unavailable" });
      }

      const { data: duplicate } = await db.from("invitations").select("id")
        .eq("campaign_id", campaign.id).eq("phone", targetPhone).maybeSingle();
      if (duplicate) {
        await sendText(phone, "Nomor tersebut sudah pernah menerima undangan untuk acara aktif ini.");
        return json({ accepted: false, reason: "duplicate_target" });
      }

      const { error: insertInviteError } = await db.from("invitations").insert({
        campaign_id: campaign.id,
        phone: targetPhone,
        contact_name: "",
        inviter_name: sender.display_name,
        status: "sending"
      });
      if (insertInviteError) throw new Error("Gagal mencatat undangan");

      const eventDate = new Date(campaign.event_date);
      const dateLabel = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(eventDate);
      const timeLabel = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" }).format(eventDate) + " WIB";
      const caption = "HADIR\nTIDAK HADIR";
      try {
        const invitationPng = await createInvitationImage(campaign.invitation_image_url, campaign.event_title || campaign.name || "UNDANGAN ACARA", dateLabel, timeLabel, campaign.venue || "-");
        const invitationPath = "invitations/" + campaign.id + "/" + targetPhone + "-" + Date.now() + ".png";
        const { error: invitationUploadError } = await db.storage.from("undangan-assets").upload(invitationPath, invitationPng, { contentType: "image/png", upsert: false });
        if (invitationUploadError) throw new Error("Gagal menyimpan gambar undangan dengan detail acara");
        const { data: invitationPublic } = db.storage.from("undangan-assets").getPublicUrl(invitationPath);
        const sent = await sendImage(targetPhone, invitationPublic.publicUrl, caption, crypto.randomUUID());
        const messageId = Array.isArray((sent as any).data) ? (sent as any).data[0]?.id || null : null;
        await db.from("invitations").update({ status: "sent", sent_at: now.toISOString(), wablas_message_id: messageId })
          .eq("campaign_id", campaign.id).eq("phone", targetPhone);
        await db.from("authorized_senders").update({
          daily_count: dailyCount + 1, usage_date: jakartaDate, last_command_at: now.toISOString(), updated_at: now.toISOString()
        }).eq("id", sender.id);
        await sendText(phone, `Undangan berhasil dikirim ke ${targetPhone}. Sisa kuota hari ini: ${4 - dailyCount} undangan.`);
        return json({ accepted: true, invited: targetPhone, campaign_id: campaign.id });
      } catch (sendError) {
        await db.from("invitations").update({ status: "failed" }).eq("campaign_id", campaign.id).eq("phone", targetPhone);
        throw sendError;
      }
    }

    if (normalized === "hadir" || normalized === "tidak hadir") {
      const { data: latestInvitation } = await db.from("invitations")
        .select("id,campaign_id,status,contact_name,inviter_name")
        .eq("phone", phone)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!latestInvitation) {
        await sendText(phone, "Kami belum menemukan undangan yang terkait dengan nomor ini.");
        return json({ accepted: false, reason: "invitation_not_found" });
      }

      if (normalized === "tidak hadir") {
        const { error: rsvpError } = await db.from("invitations")
          .update({ status: "not_attending" }).eq("id", latestInvitation.id);
        if (rsvpError) throw new Error("Gagal menyimpan konfirmasi ketidakhadiran");
        await sendText(phone, "Terima kasih. Konfirmasi Anda telah kami catat: TIDAK HADIR.");
        return json({ accepted: true, rsvp: "not_attending" });
      }

      // HADIR langsung mendaftarkan penerima undangan dan mengirim tiket gambar statis.
      const { error: registerError } = await db.from("invitations")
        .update({ status: "registered" }).eq("id", latestInvitation.id);
      if (registerError) throw new Error("Gagal menyimpan status registrasi undangan");

      const ticketUrl = "https://rexjmedyqrdlyeepuiax.supabase.co/storage/v1/object/public/undangan-assets/Tiket.png";
      await sendText(phone, "Terima kasih! Konfirmasi HADIR Anda sudah tercatat dan Anda resmi terdaftar. Berikut tiket undangan Anda. Tiket berlaku untuk 2 orang.");
      await sendImage(phone, ticketUrl, "TIKET UNDANGAN - HADIR (berlaku untuk 2 orang)", "ticket-hadir-" + latestInvitation.id);
      return json({ accepted: true, rsvp: "registered", ticket_url: ticketUrl });
    }

    if (normalized === "daftar") {
      // Associate this registration flow with the invitation/event sent to this WhatsApp number.
      const { data: sentInvitation } = await db.from("invitations")
        .select("id,campaign_id,inviter_name")
        .eq("phone", phone)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      let campaignId = sentInvitation?.campaign_id || null;
      if (!campaignId) {
        const { data: activeCampaign } = await db.from("invite_campaigns")
          .select("id").eq("is_active", true)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        campaignId = activeCampaign?.id || null;
      }
      await db.from("bot_conversations").upsert({
        phone,
        push_name: payload.pushName || null,
        campaign_id: campaignId,
        inviter_name: sentInvitation?.inviter_name || null,
        state: "awaiting_registration",
        updated_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
      });
      await sendText(phone, "Silahkan isi\nNama :\nNo WA:\nAlamat :\nPengundang :\n\nBalas pesan ini dengan data lengkap Anda.");
      return json({ accepted: true, state: "awaiting_registration", campaign_id: campaignId });
    }

    if (conversation?.state === "awaiting_registration") {
      const fields = parseForm(text);
      const name = fields.nama || "";
      const whatsapp = normalizePhone(fields.whatsapp || phone);
      const address = fields.alamat || "";
      const inviter = fields.pengundang || "";

      if (!name || !whatsapp || !address || !inviter) {
        await sendText(phone, "Data belum lengkap. Mohon kirim dengan format:\nNama: ...\nNo WA: ...\nAlamat: ...\nPengundang: ...");
        return json({ accepted: true, invalid: "incomplete_form" });
      }

      const { data: existing } = await db.from("registrations")
        .select("registration_no,ticket_url")
        .eq("whatsapp", whatsapp)
        .eq("status", "registered")
        .maybeSingle();

      if (existing) {
        await sendText(phone, `Nomor WhatsApp ini sudah terdaftar dengan No Register ${existing.registration_no}. Jika tiket belum diterima, silakan hubungi pengundang.`);
        return json({ accepted: true, duplicate_registration: true });
      }

      const { data: registrationNo, error: numberError } = await db.rpc("make_registration_no");
      if (numberError || !registrationNo) throw new Error("Gagal membuat nomor registrasi");

      const { data: saved, error: insertError } = await db.from("registrations").insert({
        registration_no: registrationNo,
        campaign_id: conversation.campaign_id || null,
        name,
        whatsapp,
        address,
        inviter,
        inviter_whatsapp: conversation.inviter_whatsapp || null,
        guest_count: 2,
      }).select("id").single();
      if (insertError || !saved) throw new Error("Gagal menyimpan registrasi");

      const { data: event, error: eventError } = await db.from("invite_campaigns").select("event_title,name,event_date,venue").eq("id", conversation.campaign_id).maybeSingle();
      if (eventError || !event?.event_date || !event?.venue) throw new Error("Data acara untuk tiket tidak ditemukan atau belum lengkap");
      const ticketBytes = createTicketPng(name, whatsapp, address, registrationNo, inviter, event.event_title || event.name || "Undangan Acara", event.event_date, event.venue);
      if (ticketBytes.byteLength > 2 * 1024 * 1024) throw new Error("Ukuran tiket melebihi batas Wablas 2 MB");
      const ticketPath = `tickets/${registrationNo}.png`;
      const { error: uploadError } = await db.storage.from("undangan-assets").upload(ticketPath, ticketBytes, {
        contentType: "image/png",
        upsert: false,
      });
      if (uploadError) throw new Error("Gagal menyimpan file tiket");
      const { data: publicTicket } = db.storage.from("undangan-assets").getPublicUrl(ticketPath);
      const ticketUrl = publicTicket.publicUrl;

      await db.from("registrations").update({ ticket_url: ticketUrl }).eq("id", saved.id);
      await db.from("bot_conversations").update({
        state: "idle",
        updated_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
      }).eq("phone", phone);

      await sendText(phone, `Terima Kasih, Data Sudah Tersimpan.\\nNo Register: ${registrationNo}\\nTiket undangan Anda berlaku untuk 2 orang. Berikut tiket masuk Anda.`);
      await sendImage(phone, ticketUrl, `TIKET MASUK - ${registrationNo} (berlaku untuk 2 orang)`, registrationNo);
      return json({ accepted: true, registration_no: registrationNo, ticket_url: ticketUrl });
    }

    return json({ ignored: true, reason: "No active registration flow" });
  } catch (error) {
    console.error("Webhook processing failed:", error instanceof Error ? error.message : "unknown");
    return json({ error: "Processing failed" }, 500);
  }
});
