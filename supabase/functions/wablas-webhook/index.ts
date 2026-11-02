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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expectedSecret = Deno.env.get("WABLAS_WEBHOOK_SECRET");
  const suppliedSecret = new URL(req.url).searchParams.get("key");
  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    return json({ error: "Unauthorized webhook" }, 401);
  }

  // Bot dinonaktifkan sementara untuk pembangunan ulang dari nol.
  // Tidak ada perintah yang diproses, pesan otomatis dikirim, atau data acara
  // dan peserta yang diubah oleh webhook ini.
  try {
    await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  return json({ accepted: true, bot_disabled: true, message: "Bot sedang dinonaktifkan untuk pembangunan ulang." });
});
