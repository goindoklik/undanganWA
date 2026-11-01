import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

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

      const { error: insertError } = await db.from("registrations").insert({
        registration_no: registrationNo,
        name,
        whatsapp,
        address,
        inviter,
        inviter_whatsapp: conversation.inviter_whatsapp || null,
        guest_count: 2,
      });
      if (insertError) throw new Error("Gagal menyimpan registrasi");

      await db.from("bot_conversations").update({
        state: "idle",
        updated_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
      }).eq("phone", phone);

      await sendText(phone, `Terima Kasih, Data Sudah Tersimpan.\n\nNo Register: ${registrationNo}\nNama: ${name}\nNo WA: ${whatsapp}\nAlamat: ${address}\n\nUndangan/tiket Anda berlaku untuk 2 orang. Tiket JPG akan dikirim setelah desain tiket dikonfigurasi oleh admin.`);
      return json({ accepted: true, registration_no: registrationNo });
    }

    return json({ ignored: true, reason: "No active registration flow" });
  } catch (error) {
    console.error("Webhook processing failed:", error instanceof Error ? error.message : "unknown");
    return json({ error: "Processing failed" }, 500);
  }
});
