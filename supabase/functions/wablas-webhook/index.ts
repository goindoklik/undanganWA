import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { Resvg, initWasm } from "npm:@resvg/resvg-wasm@2.6.2";

const resvgWasmUrl = new URL("index_bg.wasm", import.meta.resolve("npm:@resvg/resvg-wasm@2.6.2"));
await initWasm(await Deno.readFile(resvgWasmUrl));
let poppinsFontBuffersPromise: Promise<Uint8Array[]> | null = null;
async function getPoppinsFontBuffers(): Promise<Uint8Array[]> {
  if (!poppinsFontBuffersPromise) {
    poppinsFontBuffersPromise = Promise.all(["Regular","Medium","SemiBold","Bold","ExtraBold","Black"].map(async (weight) => {
      const response = await fetch("https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-" + weight + ".ttf");
      if (!response.ok) throw new Error("Gagal memuat font Poppins " + weight + ": HTTP " + response.status);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length < 10000) throw new Error("File font Poppins tidak valid: " + weight);
      return bytes;
    })).catch((error) => { poppinsFontBuffersPromise = null; throw error; });
  }
  return await poppinsFontBuffersPromise;
}

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

async function createTicketPng(name: string, phone: string, address: string, registrationNo: string, inviter: string, eventTitle: string, eventDate: string, venue: string) {
  const short = (value: string, max: number) => xml(value.length > max ? value.slice(0, max - 1) + "…" : value);
  const date = new Date(eventDate);
  const dateLabel = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(date);
  // Format tanggal tiket dibuat ringkas agar selalu muat di kolom tanggal.
  const ticketWeekdayLabel = new Intl.DateTimeFormat("id-ID", { weekday: "long", timeZone: "Asia/Jakarta" }).format(date);
  const ticketDateLabel = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(date).replace(".", "").toLocaleUpperCase("id-ID");
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
    <text x="72" y="104" fill="#fff" font-family="Poppins" font-size="72" font-weight="900" font-style="italic">Pilot<tspan fill="url(#gold)">X</tspan></text>
    <text x="78" y="139" fill="#e8edf8" font-family="Poppins" font-size="16" font-weight="700" letter-spacing="4">BERSAMA KITA BISA LEBIH SUKSES</text>
    <text x="1090" y="72" fill="#fff0a4" font-family="Poppins" font-size="25" font-style="italic" text-anchor="end">Saatnya Bersama PilotX</text>
    <path d="M70 188L735 188L770 230L735 272H70L35 230Z" fill="#050d1e" stroke="url(#gold)" stroke-width="7"/>
    <text x="400" y="244" fill="url(#gold)" font-family="Poppins" font-size="65" font-weight="900" text-anchor="middle">UNDANGAN BISNIS</text>
    <path d="M92 290H710" stroke="url(#gold)" stroke-width="2"/>
    <path d="M120 300L690 300L665 352L95 352Z" fill="url(#red)"/>
    <text x="390" y="337" fill="#fff" font-family="Poppins" font-size="31" font-weight="900" font-style="italic" text-anchor="middle">ACARA OFFLINE BESAR</text>
    <text x="390" y="397" fill="#fff" font-family="Poppins" font-size="24" font-weight="700" text-anchor="middle">Saatnya Bergabung, Bangun Jaringan,</text>
    <text x="390" y="428" fill="#fff" font-family="Poppins" font-size="24" font-weight="700" text-anchor="middle">Raih Kesempatan Tanpa Batas!</text>
    <rect x="55" y="460" width="710" height="132" rx="24" fill="#07162d" stroke="url(#gold)" stroke-width="6"/>
    <path d="M290 478V574M520 478V574" stroke="#e7c65d" stroke-width="3"/>
    <text x="85" y="510" fill="#ffe27b" font-family="Poppins" font-size="18" font-weight="700">TANGGAL</text>
    <text x="85" y="542" fill="#fff" font-family="Poppins" font-size="19" font-weight="700">${xml(ticketWeekdayLabel)}</text>
    <text x="85" y="572" fill="#fff" font-family="Poppins" font-size="21" font-weight="900">${short(ticketDateLabel, 14)}</text>
    <text x="320" y="510" fill="#ffe27b" font-family="Poppins" font-size="18" font-weight="700">PUKUL</text>
    <text x="320" y="550" fill="#fff" font-family="Poppins" font-size="30" font-weight="900">${short(timeLabel, 14)}</text>
    <text x="550" y="510" fill="#ffe27b" font-family="Poppins" font-size="18" font-weight="700">TEMPAT</text>
    <text x="550" y="538" fill="#fff" font-family="Poppins" font-size="21" font-weight="900">${short(/^Basecamp\s+PilotX\s+majalengka$/i.test(venue.trim()) ? "Basecamp" : venue.toLocaleUpperCase("id-ID"), 22)}</text>
    <text x="550" y="566" fill="#fff" font-family="Poppins" font-size="18" font-weight="900">${/^Basecamp\s+PilotX\s+majalengka$/i.test(venue.trim()) ? "PilotX majalengka" : ""}</text>
    <text x="78" y="640" fill="#fff" font-family="Poppins" font-size="21">Kami mengundang Anda untuk hadir dalam acara besar</text>
    <text x="78" y="672" fill="#fff" font-family="Poppins" font-size="21">offline PilotX. Perluas jaringan, tambah wawasan,</text>
    <text x="78" y="704" fill="#fff" font-family="Poppins" font-size="21">dan raih peluang bisnis yang lebih besar.</text>
    <text x="78" y="750" fill="#ffe27b" font-family="Poppins" font-size="20" font-style="italic">Bersama PilotX — Kita tumbuh, kita maju, kita sukses!</text>
    <path d="M800 20V780" stroke="#ffe28a" stroke-width="5" stroke-dasharray="14 12"/>
    <rect x="825" y="35" width="335" height="730" rx="22" fill="url(#cream)" stroke="url(#gold)" stroke-width="5"/>
    <rect x="842" y="52" width="301" height="78" rx="14" fill="url(#gold)"/>
    <text x="992" y="85" fill="#09152b" font-family="Poppins" font-size="26" font-weight="900" text-anchor="middle">TIKET UNDANGAN</text>
    <text x="992" y="112" fill="#09152b" font-family="Poppins" font-size="15" font-weight="700" text-anchor="middle">${short(eventTitle, 30)}</text>
    <text x="992" y="166" fill="#07152d" font-family="Poppins" font-size="19" font-weight="700" text-anchor="middle">NO. REGISTER</text>
    <rect x="850" y="178" width="285" height="52" rx="10" fill="#071a39"/>
    <text x="992" y="214" fill="#fff" font-family="Poppins" font-size="27" font-weight="900" text-anchor="middle">${short(registrationNo, 18)}</text>
    <text x="858" y="274" fill="#9a6c14" font-family="Poppins" font-size="15" font-weight="700">NAMA</text>
    <text x="858" y="305" fill="#07152d" font-family="Poppins" font-size="22" font-weight="900">${short(name, 25)}</text>
    <text x="858" y="350" fill="#9a6c14" font-family="Poppins" font-size="15" font-weight="700">NO. WHATSAPP</text>
    <text x="858" y="379" fill="#07152d" font-family="Poppins" font-size="20" font-weight="700">${short(phone, 22)}</text>
    <text x="858" y="425" fill="#9a6c14" font-family="Poppins" font-size="15" font-weight="700">ALAMAT</text>
    <text x="858" y="454" fill="#07152d" font-family="Poppins" font-size="18" font-weight="700">${short(address, 29)}</text>
    <text x="858" y="505" fill="#9a6c14" font-family="Poppins" font-size="15" font-weight="700">PENGUNDANG</text>
    <text x="858" y="534" fill="#07152d" font-family="Poppins" font-size="19" font-weight="700">${short(inviter, 25)}</text>
    <rect x="848" y="570" width="289" height="58" rx="12" fill="url(#gold)"/>
    <text x="992" y="607" fill="#07152d" font-family="Poppins" font-size="17" font-weight="900" text-anchor="middle" textLength="255" lengthAdjust="spacingAndGlyphs">BERLAKU UNTUK 2 ORANG</text>
    <rect x="890" y="650" width="205" height="76" rx="12" fill="#071a39"/>
    <text x="992" y="680" fill="#ffe27b" font-family="Poppins" font-size="17" font-weight="900" text-anchor="middle">TIKET RESMI</text>
    <text x="992" y="706" fill="#fff" font-family="Poppins" font-size="14" text-anchor="middle">Simpan untuk check-in</text>
  </svg>`;
  const fontBuffers = await getPoppinsFontBuffers();
  const png = new Resvg(svg, { font: { fontBuffers, loadSystemFonts: false, defaultFontFamily: "Poppins" } }).render().asPng();
  if (png.length < 1000) throw new Error("Render tiket gagal: PNG kosong");
  return png;
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
    '<text x="' + x + '" y="' + (y + titleSize * 1.35) + '" fill="#ffe27b" font-family="Poppins" font-size="' + titleSize + '" font-weight="700">' + xmlText(title.slice(0, 65)) + '</text>' +
    '<text x="' + x + '" y="' + (y + titleSize * 2.55) + '" fill="#ffffff" font-family="Poppins" font-size="' + detailSize + '">TANGGAL: ' + xmlText(dateLabel.slice(0, 65)) + '</text>' +
    '<text x="' + x + '" y="' + (y + titleSize * 3.65) + '" fill="#ffffff" font-family="Poppins" font-size="' + detailSize + '">PUKUL: ' + xmlText(timeLabel.slice(0, 35)) + '</text>' +
    '<text x="' + x + '" y="' + (y + titleSize * 4.75) + '" fill="#ffffff" font-family="Poppins" font-size="' + detailSize + '">TEMPAT: ' + xmlText(venue.slice(0, 85)) + '</text></svg>';
  const fontBuffers = await getPoppinsFontBuffers();
  const png = new Resvg(svg, { font: { fontBuffers, loadSystemFonts: false, defaultFontFamily: "Poppins" } }).render().asPng();
  if (png.length < 1000) throw new Error("Render gambar undangan gagal: PNG kosong");
  return new Uint8Array(png);
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
    await sendText(phone, (caption ? caption + "\\n\\n" : "") + "Gambar undangan dapat dibuka melalui tautan berikut:\\n" + imageUrl);
    return { status: true, fallback: "image_link", original_http_status: response.status };
  }
  console.log("WABLAS_SEND_IMAGE_ACCEPTED", JSON.stringify({ http_status: response.status }));
  return result;
}


function parseEventInput(input: string) {
  const parts=input.split("#").map(x=>x.trim());
  if(parts.length!==4||parts.some(x=>!x)) throw new Error("Format harus terdiri dari 4 bagian yang dipisahkan tanda #.");
  const [title,dateText,timeText,venue]=parts;
  const dm=dateText.match(/^(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})$/i);
  if(!dm) throw new Error("Format tanggal tidak valid. Contoh: 3 November 2026.");
  const months:Record<string,number>={januari:1,january:1,februari:2,february:2,maret:3,march:3,april:4,mei:5,may:5,juni:6,june:6,juli:7,july:7,agustus:8,august:8,september:9,oktober:10,october:11,november:11,desember:12,december:12};
  const day=Number(dm[1]),month=months[dm[2].toLocaleLowerCase("id-ID")],year=Number(dm[3]);
  if(!month||day<1||day>31) throw new Error("Tanggal acara tidak valid.");
  const tm=timeText.match(/^([01]?\d|2[0-3])[.:]([0-5]\d)(?:\s*WIB)?$/i);
  if(!tm) throw new Error("Format pukul tidak valid. Contoh: 10.00 WIB.");
  const hour=Number(tm[1]),minute=Number(tm[2]);
  const iso=String(year)+"-"+String(month).padStart(2,"0")+"-"+String(day).padStart(2,"0")+"T"+String(hour).padStart(2,"0")+":"+String(minute).padStart(2,"0")+":00+07:00";
  const date=new Date(iso);
  if(Number.isNaN(date.getTime())||date.getDate()!==day) throw new Error("Tanggal atau waktu acara tidak valid.");
  return {title,venue,eventDate:date.toISOString()};
}
function dateLabel(value:string){return new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"long",year:"numeric",timeZone:"Asia/Jakarta"}).format(new Date(value));}
function timeLabel(value:string){return new Intl.DateTimeFormat("id-ID",{hour:"2-digit",minute:"2-digit",hourCycle:"h23",timeZone:"Asia/Jakarta"}).format(new Date(value))+" WIB";}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  const secret=Deno.env.get("WABLAS_WEBHOOK_SECRET"),supplied=new URL(req.url).searchParams.get("key");
  if(!secret||supplied!==secret) return json({error:"Unauthorized webhook"},401);
  const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
  let payload:WablasPayload;
  try{payload=await req.json();}catch{return json({error:"Invalid JSON"},400);}
  if(payload.isGroup||payload.isFromMe) return json({ignored:true});
  const phone=normalizePhone(payload.phone||"");
  if(!phone||!payload.id) return json({error:"Missing sender phone or message id"},400);
  const {error:inboundError}=await db.from("wablas_inbound_events").insert({wablas_message_id:payload.id,sender_phone:phone,message_type:payload.messageType||"text",message_text:payload.message||""});
  if(inboundError?.code==="23505") return json({duplicate:true});
  if(inboundError) return json({error:"Could not record inbound event"},500);
  try{
    const {data:sender,error:senderError}=await db.from("authorized_senders").select("id,phone,display_name,is_active").eq("phone",phone).eq("is_active",true).maybeSingle();
    if(senderError) throw senderError;
    if(!sender) return json({ignored:true,reason:"sender_not_registered"});
    const message=(payload.message||"").trim(),normalized=message.toLocaleLowerCase("id-ID"),now=new Date().toISOString();
    const {data:conv,error:convError}=await db.from("bot_conversations").select("state,campaign_id").eq("phone",phone).maybeSingle();
    if(convError) throw convError;
    const state=conv?.state||"idle";
    const saveState=async(next:string,campaignId:string|null=null)=>{
      const {error}=await db.from("bot_conversations").upsert({phone,push_name:payload.pushName||sender.display_name||null,state:next,campaign_id:campaignId,last_message_at:now,updated_at:now},{onConflict:"phone"});
      if(error) throw error;
    };
    const menu="MENU BOT UNDANGAN\n\n1. Data Acara\n2. Buat Acara\n3. Daftar Hadir\n\nSilakan balas dengan angka 1, 2, atau 3.";
    if(normalized==="menu"){await saveState("idle");await sendText(phone,menu);return json({accepted:true,menu:true});}
    if(state==="await_event_format"){
      let parsed;
      try{parsed=parseEventInput(message);}catch(e){
        await sendText(phone,"Format belum sesuai.\n\nSilakan balas dengan format:\nNama Acara#Waktu Acara#Pukul#Tempat\n\nContoh:\nGathering 03 November 2026#3 November 2026#10.00 WIB#Basecamp Pilotx Majalengka\n\n"+(e instanceof Error?e.message:""));
        return json({accepted:false,reason:"invalid_event_format"});
      }
      const {data:previous,error:prevError}=await db.from("invite_campaigns").select("id,invitation_image_url").eq("is_active",true).order("event_date",{ascending:true}).limit(1).maybeSingle();
      if(prevError) throw prevError;
      const imageUrl=previous?.invitation_image_url||"https://rexjmedyqrdlyeepuiax.supabase.co/storage/v1/object/public/undangan-assets/Undangan.png";
      const {error:offError}=await db.from("invite_campaigns").update({is_active:false}).eq("is_active",true);
      if(offError) throw offError;
      const {data:created,error:createError}=await db.from("invite_campaigns").insert({name:parsed.title,event_title:parsed.title,event_date:parsed.eventDate,venue:parsed.venue,invitation_image_url:imageUrl,is_active:true}).select("id,event_title,event_date,venue,invitation_image_url").single();
      if(createError||!created){if(previous?.id) await db.from("invite_campaigns").update({is_active:true}).eq("id",previous.id);throw createError||new Error("Gagal menyimpan acara.");}
      await saveState("idle",created.id);
      await sendText(phone,"Data sudah di buat");
      try{
        const png=await createInvitationImage(created.invitation_image_url,created.event_title,dateLabel(created.event_date),timeLabel(created.event_date),created.venue);
        const path="event-invitations/"+created.id+"/"+Date.now()+".png";
        const {error:uploadError}=await db.storage.from("undangan-assets").upload(path,png,{contentType:"image/png",upsert:false});
        if(uploadError) throw uploadError;
        const {data:publicImage}=db.storage.from("undangan-assets").getPublicUrl(path);
        await sendImage(phone,publicImage.publicUrl,"UNDANGAN ACARA\n"+created.event_title,"event-"+created.id);
        return json({accepted:true,event_id:created.id,image_sent:true});
      }catch(e){
        console.error("EVENT_INVITATION_IMAGE_FAILED",e instanceof Error?e.message:"unknown");
        await sendText(phone,"Data acara sudah tersimpan, tetapi gambar undangan belum berhasil dikirim.");
        return json({accepted:true,event_id:created.id,image_sent:false});
      }
    }
    if(normalized==="1"){
      const {data:event,error}=await db.from("invite_campaigns").select("id,event_title,name,event_date,venue").eq("is_active",true).gte("event_date",now).order("event_date",{ascending:true}).limit(1).maybeSingle();
      if(error) throw error;
      if(!event){await saveState("idle");await sendText(phone,"Belum ada data acara yang akan berlangsung.");return json({accepted:true,event_found:false});}
      const {count,error:countError}=await db.from("registrations").select("id",{count:"exact",head:true}).eq("campaign_id",event.id).eq("status","registered");
      if(countError) throw countError;
      await saveState("idle",event.id);
      await sendText(phone,"DATA ACARA\n\nNama Acara : "+(event.event_title||event.name)+"\n\nWaktu : "+dateLabel(event.event_date)+"\n\nPukul : "+timeLabel(event.event_date)+"\n\nTempat : "+event.venue+"\n\nYang sudah daftar : "+(count||0)+" orang");
      return json({accepted:true,event_id:event.id,registered_count:count||0});
    }
    if(normalized==="2"){
      await saveState("await_event_format");
      await sendText(phone,"Silahkan Balas dengan Format :\n\nNama Acara#Waktu Acara#Pukul#Tempat\n\nContoh :\nGathering 03 November 2026#3 November 2026#10.00 WIB#Basecamp Pilotx Majalengka");
      return json({accepted:true,state:"await_event_format"});
    }
    if(normalized==="3"){
      const {data:event,error}=await db.from("invite_campaigns").select("id,event_title,name").eq("is_active",true).gte("event_date",now).order("event_date",{ascending:true}).limit(1).maybeSingle();
      if(error) throw error;
      if(!event){await sendText(phone,"Belum ada acara yang akan berlangsung.");return json({accepted:true,event_found:false});}
      const {data:rows,error:rowsError}=await db.from("registrations").select("registration_no,name,created_at").eq("campaign_id",event.id).eq("status","registered").order("created_at",{ascending:true}).limit(100);
      if(rowsError) throw rowsError;
      const lines=(rows||[]).map((r,n)=>(n+1)+". "+r.name+" ("+r.registration_no+")");
      await saveState("idle",event.id);
      await sendText(phone,"DAFTAR HADIR\n"+(event.event_title||event.name)+"\n\n"+(lines.length?lines.join("\n"):"Belum ada peserta yang mendaftar.")+"\n\nJumlah terdaftar: "+(rows||[]).length+" orang"+((rows||[]).length===100?"\nMenampilkan maksimal 100 pendaftar.":""));
      return json({accepted:true,attendee_count:(rows||[]).length});
    }
    await sendText(phone,menu);
    return json({accepted:true,hint:"send_Menu_or_choose_1_2_3"});
  }catch(error){console.error("Webhook processing failed:",error instanceof Error?error.message:"unknown");return json({error:"Processing failed"},500);}
});
