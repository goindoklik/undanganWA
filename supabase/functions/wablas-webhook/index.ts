import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { Resvg } from "npm:@resvg/resvg-js@2.6.2";
import { PNG } from "npm:pngjs@7.0.0";
import jpeg from "npm:jpeg-js@0.4.4";
import { Buffer } from "node:buffer";

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
  const result: Record<string, string> = {};
  for (const line of message.split(/\r?\n/)) {
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
  const response = await fetch("https://wablas.com/api/v2/send-message", {
    method: "POST",
    headers: {
      Authorization: `${token}.${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ data: [{ phone, message, ref_id: crypto.randomUUID() }] }),
  });
  const result = await response.json();
  if (!response.ok || result.status !== true) {
    throw new Error("Wablas gagal menerima pesan");
  }
  return result;
}


function xml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]!));
}

function createTicketPng(name: string, phone: string, address: string, registrationNo: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
    <rect width="1200" height="675" fill="#101d38"/>
    <rect x="22" y="22" width="1156" height="631" rx="28" fill="none" stroke="#c9a75e" stroke-width="3"/>
    <text x="600" y="112" fill="#e8c77a" font-family="Inter" font-size="42" font-weight="700" text-anchor="middle">UNDANGAN KHUSUS</text>
    <text x="600" y="166" fill="#ffffff" font-family="Inter" font-size="26" text-anchor="middle">TIKET MASUK ACARA</text>
    <path d="M100 205 H1100" stroke="#9d8550" stroke-width="2"/>
    <text x="100" y="255" fill="#e8c77a" font-family="Inter" font-size="19">NO REGISTER</text>
    <text x="100" y="312" fill="#ffffff" font-family="Inter" font-size="43" font-weight="700">${xml(registrationNo)}</text>
    <text x="100" y="378" fill="#e8c77a" font-family="Inter" font-size="18">NAMA</text>
    <text x="100" y="416" fill="#ffffff" font-family="Inter" font-size="27" font-weight="700">${xml(name.slice(0,42))}</text>
    <text x="100" y="468" fill="#e8c77a" font-family="Inter" font-size="18">NO WA</text>
    <text x="100" y="505" fill="#ffffff" font-family="Inter" font-size="23">${xml(phone)}</text>
    <text x="650" y="378" fill="#e8c77a" font-family="Inter" font-size="18">ALAMAT</text>
    <text x="650" y="416" fill="#ffffff" font-family="Inter" font-size="23">${xml(address.slice(0,48))}</text>
    <rect x="100" y="545" width="1000" height="58" rx="12" fill="#c9a75e"/>
    <text x="600" y="583" fill="#101d38" font-family="Inter" font-size="27" font-weight="700" text-anchor="middle">BERLAKU UNTUK 2 ORANG</text>
  </svg>`;
  const pngBytes = new Resvg(svg).render().asPng();
  const bitmap = PNG.sync.read(Buffer.from(pngBytes));
  return jpeg.encode({ data: bitmap.data, width: bitmap.width, height: bitmap.height }, 88).data;
}

async function sendImage(phone: string, imageUrl: string, caption: string, refId: string) {
  const token = Deno.env.get("WABLAS_TOKEN");
  const secret = Deno.env.get("WABLAS_SECRET_KEY");
  if (!token || !secret) throw new Error("Wablas credentials belum dikonfigurasi");
  const response = await fetch("https://wablas.com/api/v2/send-image", {
    method: "POST",
    headers: { Authorization: `${token}.${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data: [{ phone, image: imageUrl, caption, ref_id: refId }] }),
  });
  const result = await response.json();
  if (!response.ok || result.status !== true) throw new Error("Wablas gagal menerima tiket gambar");
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
    if (normalized === "daftar") {
      await db.from("bot_conversations").upsert({
        phone,
        push_name: payload.pushName || null,
        state: "awaiting_registration",
        updated_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
      });
      await sendText(phone, "Silahkan isi\nNama :\nNo WA:\nAlamat :\nPengundang :\n\nBalas pesan ini dengan data lengkap Anda.");
      return json({ accepted: true, state: "awaiting_registration" });
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
        name,
        whatsapp,
        address,
        inviter,
        inviter_whatsapp: conversation.inviter_whatsapp || null,
        guest_count: 2,
      }).select("id").single();
      if (insertError || !saved) throw new Error("Gagal menyimpan registrasi");

      const ticketBytes = createTicketPng(name, whatsapp, address, registrationNo);
      if (ticketBytes.byteLength > 2 * 1024 * 1024) throw new Error("Ukuran tiket melebihi batas Wablas 2 MB");
      const ticketPath = `tickets/${registrationNo}.jpg`;
      const { error: uploadError } = await db.storage.from("undangan-assets").upload(ticketPath, ticketBytes, {
        contentType: "image/jpeg",
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
