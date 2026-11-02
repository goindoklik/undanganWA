import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type WablasPayload = {
  id?: string; phone?: string; message?: string; pushName?: string;
  messageType?: string; isGroup?: boolean; isFromMe?: boolean;
};
type EventRow = {
  id: string; name: string; event_title: string; event_date: string | null;
  venue: string | null; is_active: boolean;
};

const MONTHS: Record<string, string> = {
  januari:"01", februari:"02", maret:"03", april:"04", mei:"05", juni:"06",
  juli:"07", agustus:"08", september:"09", oktober:"10", november:"11", desember:"12",
};
const normalizePhone = (value: string) => {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = "62" + digits.slice(1);
  else if (digits.startsWith("8")) digits = "62" + digits;
  return digits;
};
const escapeXml = (value: string) => value.replace(/[&<>"']/g, (c) =>
  ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&apos;" }[c]!)
);
const slugForDate = (value: string) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone:"Asia/Jakarta", day:"2-digit", month:"2-digit", year:"2-digit",
    hour:"2-digit", minute:"2-digit", hourCycle:"h23",
  }).formatToParts(new Date(value));
  const get = (key: string) => parts.find((p) => p.type === key)?.value || "";
  return get("day") + get("month") + get("year") + get("hour") + get("minute");
};
const formatDate = (value: string) => new Intl.DateTimeFormat("id-ID", {
  day:"2-digit", month:"long", year:"numeric", timeZone:"Asia/Jakarta",
}).format(new Date(value));
const formatTime = (value: string) => new Intl.DateTimeFormat("id-ID", {
  hour:"2-digit", minute:"2-digit", hourCycle:"h23", timeZone:"Asia/Jakarta",
}).format(new Date(value)) + " WIB";
const formatWeekday = (value: string) => new Intl.DateTimeFormat("id-ID", {
  weekday:"long", timeZone:"Asia/Jakarta",
}).format(new Date(value));

function parseEventInput(input: string) {
  const parts = input.split("#").map((part) => part.trim());
  if (parts.length !== 4 || parts.some((part) => !part)) return null;
  const [title, dateText, timeText, venue] = parts;
  const dateMatch = dateText.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/i);
  const timeMatch = timeText.match(/^(\d{1,2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) return null;
  const day = Number(dateMatch[1]);
  const month = MONTHS[dateMatch[2].toLowerCase()];
  const year = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (!month || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const local = new Date(Date.UTC(year, Number(month) - 1, day, hour - 7, minute));
  const check = new Date(Date.UTC(year, Number(month) - 1, day));
  if (check.getUTCDate() !== day || check.getUTCMonth() !== Number(month) - 1) return null;
  return { title, venue, event_date: local.toISOString() };
}
function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

async function createInvitationSvg(event: EventRow) {
  if (!event.event_date) throw new Error("Tanggal acara belum diisi.");
  const templateUrl = "https://cdn.jsdelivr.net/gh/goindoklik/undanganWA@main/Gambar/Undangan.png?v=b7f8d132";
  const response = await fetch(templateUrl);
  if (!response.ok) throw new Error("Template gambar undangan tidak dapat diambil.");
  const template = bytesToBase64(new Uint8Array(await response.arrayBuffer()));
  const venue = event.venue || "";
  const venueLines = venue === "Rumah Makan GG Palasah" ? ["Rumah Makan", "GG Palasah"] : [venue];
  const venueSvg = venueLines.length === 2
    ? '<text x="741" y="738" font-size="19" text-anchor="start">' + escapeXml(venueLines[0]) + '</text><text x="741" y="762" font-size="19" text-anchor="start">' + escapeXml(venueLines[1]) + '</text>'
    : '<text x="741" y="750" font-size="19" text-anchor="start">' + escapeXml(venue) + '</text>';
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1536" viewBox="0 0 1024 1536">
    <image x="0" y="0" width="1024" height="1536" xlink:href="data:image/png;base64,${template}"/>
    <g fill="#fff" font-family="Poppins,Arial,sans-serif" font-weight="700" text-anchor="start" filter="url(#shadow)">
      <text x="167" y="735" font-size="19">${escapeXml(formatWeekday(event.event_date))}</text>
      <text x="167" y="765" font-size="18" font-weight="600">${escapeXml(formatDate(event.event_date))}</text>
      <text x="528" y="750" font-size="21" text-anchor="middle">${escapeXml(formatTime(event.event_date))}</text>
      ${venueSvg}
    </g>
    <defs><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceAlpha" stdDeviation="2"/><feOffset dx="0" dy="1" result="offset"/><feComponentTransfer><feFuncA type="linear" slope=".7"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  </svg>`;
}

let resvgInit: Promise<void> | null = null;
async function renderInvitationPng(svg: string): Promise<Uint8Array> {
  const { initWasm, Resvg } = await import("npm:@resvg/resvg-wasm@2.6.2");
  if (!resvgInit) {
    resvgInit = (async () => {
      const wasmResponse = await fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm");
      if (!wasmResponse.ok) throw new Error("Mesin pembuat PNG undangan gagal dimuat.");
      await initWasm(wasmResponse);
    })();
  }
  await resvgInit;
  const renderer = new Resvg(svg, { fitTo:{ mode:"original" }, font:{ defaultFontFamily:"Arial" } });
  return renderer.render().asPng();
}

async function uploadInvitationToDrive(event: EventRow, png: Uint8Array) {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Koneksi Google Drive belum lengkap. Periksa GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, dan GOOGLE_REFRESH_TOKEN.");
  }
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method:"POST", headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({ client_id:clientId, client_secret:clientSecret, refresh_token:refreshToken, grant_type:"refresh_token" }),
  });
  const token = await tokenResponse.json();
  if (!tokenResponse.ok || !token.access_token) throw new Error("Google Drive menolak token. Periksa koneksi Google Drive.");
  const fileName = "Undangan-" + (event.event_title || event.name || "Acara")
    .replace(/[^a-z0-9-_]+/gi, "-") + ".png";
  const boundary = "uw_" + crypto.randomUUID().replaceAll("-", "");
  const metadata = { name:fileName, mimeType:"image/png", parents:["1b5TmeQ16QWwWCTz6fCG5mIXw_hJ55B35"] };
  const encoder = new TextEncoder();
  const head = encoder.encode("--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata) + "\r\n--" + boundary + "\r\nContent-Type: image/png\r\n\r\n");
  const tail = encoder.encode("\r\n--" + boundary + "--");
  const body = new Uint8Array(head.length + png.length + tail.length);
  body.set(head, 0);
  body.set(png, head.length);
  body.set(tail, head.length + png.length);
  const uploadResponse = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", {
    method:"POST",
    headers:{ Authorization:"Bearer " + token.access_token, "Content-Type":"multipart/related; boundary=" + boundary },
    body,
  });
  const file = await uploadResponse.json();
  if (!uploadResponse.ok || !file.id) throw new Error("Upload gambar undangan ke Google Drive gagal: " + String(file.error?.message || "unknown"));
  const permission = await fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(file.id) + "/permissions", {
    method:"POST", headers:{ Authorization:"Bearer " + token.access_token, "Content-Type":"application/json" },
    body:JSON.stringify({ type:"anyone", role:"reader" }),
  });
  if (!permission.ok) {
    await fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(file.id), {
      method:"DELETE", headers:{ Authorization:"Bearer " + token.access_token },
    });
    throw new Error("Gambar terunggah tetapi izin tautan publik Google Drive gagal dibuat.");
  }
  return "https://drive.google.com/uc?export=download&id=" + encodeURIComponent(file.id);
}

async function sendWablas(phone: string, message: string, refId: string) {
  const token = Deno.env.get("WABLAS_TOKEN");
  const secretKey = Deno.env.get("WABLAS_SECRET_KEY");
  if (!token || !secretKey) throw new Error("Konfigurasi Wablas belum lengkap.");
  const response = await fetch("https://smg.wablas.com/api/v2/send-message", {
    method:"POST",
    headers:{ Authorization:token + "." + secretKey, "Content-Type":"application/json", Accept:"application/json" },
    body:JSON.stringify({ data:[{ phone, message, ref_id:refId }] }),
  });
  const result = await response.json();
  if (!response.ok || result.status !== true) {
    throw new Error("Wablas gagal menerima pesan: " + String(result.message || response.status));
  }
  return result;
}

async function showNextEventChoice(admin: ReturnType<typeof createClient>, phone: string, remaining: string[]) {
  if (!remaining.length) {
    await admin.from("bot_conversations").upsert({ phone, state:"idle", campaign_id:null, pending_campaign_ids:[], last_message_at:new Date().toISOString(), updated_at:new Date().toISOString() });
    return;
  }
  const nextId = remaining[0];
  const rest = remaining.slice(1);
  const { data:event, error } = await admin.from("invite_campaigns")
    .select("id,name,event_title,event_date,venue,is_active").eq("id", nextId).eq("is_active", true).maybeSingle();
  if (error || !event) return showNextEventChoice(admin, phone, rest);
  const { count } = await admin.from("registrations").select("id", { count:"exact", head:true }).eq("campaign_id", event.id);
  await admin.from("bot_conversations").upsert({
    phone, state:"awaiting_download_choice", campaign_id:event.id, pending_campaign_ids:rest,
    last_message_at:new Date().toISOString(), updated_at:new Date().toISOString(),
  });
  const msg = `**Nama Acara**  : ${event.event_title || event.name}\n\n**Waktu Acara**  : ${event.event_date ? formatDate(event.event_date) : "-"}\n\n**Pukul**  : ${event.event_date ? formatTime(event.event_date) : "-"}\n\n**Tempat**  : ${event.venue || "-"}\n\n**Registrasi**  : ${count || 0} orang\n\nApakah Mau Download Undangan ?\n\nY / N`;
  await sendWablas(phone, msg, "event-choice-" + event.id + "-" + crypto.randomUUID());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers:corsHeaders });
  if (req.method !== "POST") return json({ error:"Method not allowed" }, 405);
  const expectedSecret = Deno.env.get("WABLAS_WEBHOOK_SECRET");
  const suppliedSecret = new URL(req.url).searchParams.get("key");
  if (!expectedSecret || suppliedSecret !== expectedSecret) return json({ error:"Unauthorized webhook" }, 401);

  let payload: WablasPayload;
  try { payload = await req.json(); } catch { return json({ error:"Invalid JSON" }, 400); }
  if (payload.isFromMe || payload.isGroup || !payload.phone || !payload.id) return json({ accepted:true, ignored:true });
  const phone = normalizePhone(payload.phone);
  const message = String(payload.message || "").trim();
  if (!phone || !message || (payload.messageType && payload.messageType.toLowerCase() !== "text")) return json({ accepted:true, ignored:true });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error:"Konfigurasi database server belum lengkap." }, 500);
  const admin = createClient(supabaseUrl, serviceKey);

  const { error:logError } = await admin.from("wablas_inbound_events").insert({
    wablas_message_id:payload.id, sender_phone:phone, message_type:payload.messageType || "text", message_text:message,
  });
  if (logError) {
    if (logError.code === "23505") return json({ accepted:true, duplicate:true });
    return json({ error:"Pesan gagal dicatat." }, 500);
  }

  const { data:sender } = await admin.from("authorized_senders")
    .select("phone,display_name,is_active").eq("phone", phone).eq("is_active", true).maybeSingle();
  if (!sender) return json({ accepted:true, unauthorized:true });

  const now = new Date().toISOString();
  const { data:conversation } = await admin.from("bot_conversations").select("*").eq("phone", phone).maybeSingle();
  const state = conversation?.state || "idle";
  const command = message.toLowerCase();

  try {
    if (command === "menu") {
      await admin.from("bot_conversations").upsert({ phone, state:"idle", campaign_id:null, pending_campaign_ids:[], push_name:payload.pushName || null, last_message_at:now, updated_at:now });
      await sendWablas(phone, "Menu Perintah Bot\n\n1. Data Acara yang akan berlangsung\n2. Buat Acara", "menu-" + crypto.randomUUID());
      return json({ accepted:true, command:"menu" });
    }

    if (command === "2" && state !== "await_event_format") {
      await admin.from("bot_conversations").upsert({ phone, state:"await_event_format", campaign_id:null, pending_campaign_ids:[], push_name:payload.pushName || null, last_message_at:now, updated_at:now });
      await sendWablas(phone, "Silahkan buat acara baru dengan Format\n**Nama Acara**#**Waktu Acara**#**Pukul**#**Tempat**\ncontoh : **Acara Offline PilotX**#05 November 2026#15:00#RM Sederhana Majalengka", "event-format-" + crypto.randomUUID());
      return json({ accepted:true, command:"create_event_prompt" });
    }

    if (command === "1") {
      const { data:events, error } = await admin.from("invite_campaigns")
        .select("id,name,event_title,event_date,venue,is_active")
        .eq("is_active", true).gte("event_date", now).order("event_date", { ascending:true });
      if (error) throw error;
      if (!events?.length) {
        await sendWablas(phone, "Belum ada acara yang akan berlangsung.", "events-empty-" + crypto.randomUUID());
      } else {
        await showNextEventChoice(admin, phone, events.map((event:EventRow) => event.id));
      }
      return json({ accepted:true, command:"list_events", count:events?.length || 0 });
    }

    if (state === "awaiting_download_choice" && (command === "y" || command === "n")) {
      const pending = Array.isArray(conversation?.pending_campaign_ids) ? conversation.pending_campaign_ids : [];
      if (command === "y" && conversation?.campaign_id) {
        const { data:event } = await admin.from("invite_campaigns").select("id,event_date").eq("id", conversation.campaign_id).maybeSingle();
        if (event?.event_date) {
          const url = "https://undanganwa.pages.dev/acara/" + slugForDate(event.event_date);
          await sendWablas(phone, "Silahkan Download :\n\n" + url, "event-download-" + event.id);
        }
      } else {
        await sendWablas(phone, "Terima Kasih\n\nSelamat Melanjutkan Aktifitas Anda", "event-skip-" + crypto.randomUUID());
      }
      await showNextEventChoice(admin, phone, pending);
      return json({ accepted:true, command:command === "y" ? "download_link" : "skip_event" });
    }

    if (state === "await_event_format") {
      const parsed = parseEventInput(message);
      if (!parsed) {
        await sendWablas(phone, "Format belum sesuai. Silahkan kirim dengan format:\nNama Acara#Waktu Acara#Pukul#Tempat\nContoh: Acara Offline PilotX#05 November 2026#15:00#RM Sederhana Majalengka", "event-format-invalid-" + crypto.randomUUID());
        return json({ accepted:true, command:"invalid_event_format" });
      }
      const { data:event, error:insertError } = await admin.from("invite_campaigns").insert({
        name:parsed.title, event_title:parsed.title, event_date:parsed.event_date, venue:parsed.venue, is_active:true,
      }).select("id,name,event_title,event_date,venue,is_active").single();
      if (insertError || !event) throw new Error("Data acara gagal disimpan ke database.");
      let driveUrl = "";
      try {
        const svg = await createInvitationSvg(event as EventRow);
        const png = await renderInvitationPng(svg);
        driveUrl = await uploadInvitationToDrive(event as EventRow, png);
        const { error:updateError } = await admin.from("invite_campaigns").update({ invitation_image_url:driveUrl }).eq("id", event.id);
        if (updateError) throw new Error("Gambar tersimpan di Drive tetapi tautannya gagal disimpan ke acara.");
      } catch (driveError) {
        const eventUrl = "https://undanganwa.pages.dev/acara/" + slugForDate(event.event_date);
        await sendWablas(phone, "Data acara sudah dibuat, tetapi gambar undangan gagal disimpan ke Google Drive.\n" + String((driveError as Error)?.message || "Silakan periksa koneksi Google Drive.") + "\n\nLink Halaman Acara:\n" + eventUrl, "event-drive-error-" + event.id);
        await admin.from("bot_conversations").upsert({ phone, state:"idle", campaign_id:null, pending_campaign_ids:[], last_message_at:new Date().toISOString(), updated_at:new Date().toISOString() });
        return json({ accepted:true, event_id:event.id, drive_saved:false });
      }
      const eventUrl = "https://undanganwa.pages.dev/acara/" + slugForDate(event.event_date);
      const confirmation = "Data Sudah Tersimpan\n\nNama Acara: " + event.event_title +
        "\nWaktu Acara: " + formatDate(event.event_date) +
        "\nPukul: " + formatTime(event.event_date) +
        "\nTempat: " + event.venue +
        "\n\nLink Halaman Acara:\n" + eventUrl;
      await admin.from("bot_conversations").upsert({ phone, state:"idle", campaign_id:null, pending_campaign_ids:[], last_message_at:new Date().toISOString(), updated_at:new Date().toISOString() });
      await sendWablas(phone, confirmation, "event-created-" + event.id);
      return json({ accepted:true, event_id:event.id, drive_saved:Boolean(driveUrl), invitation_url:driveUrl });
    }

    if (state === "await_event_format") return json({ accepted:true, awaiting:"event_format" });
    await admin.from("bot_conversations").upsert({ phone, state:"idle", push_name:payload.pushName || null, last_message_at:now, updated_at:now });
    return json({ accepted:true, unrecognized:true });
  } catch (error) {
    console.error("Wablas bot processing failed:", error);
    try { await sendWablas(phone, "Maaf, perintah belum dapat diproses. Silakan coba kembali.", "bot-error-" + crypto.randomUUID()); } catch { /* avoid leaking gateway details */ }
    return json({ error:"Bot processing failed" }, 500);
  }
});
