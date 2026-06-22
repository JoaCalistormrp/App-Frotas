import { createClient } from "jsr:@supabase/supabase-js@2";
// @ts-ignore — npm compat layer
import webpush from "npm:web-push@3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

webpush.setVapidDetails(
  `mailto:${Deno.env.get("VAPID_SUBJECT") ?? "admin@example.com"}`,
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401, headers: CORS });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { order_id, order_number } = (await req.json()) as {
    order_id: string;
    order_number: string;
  };

  // Buscar IDs dos utilizadores master e admin
  const { data: masterRoles } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .in("role", ["master", "admin"]);

  if (!masterRoles?.length) {
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const masterIds = masterRoles.map((r: any) => r.user_id as string);

  // Buscar subscriptions push dos masters
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("subscription")
    .in("user_id", masterIds);

  if (!subs?.length) {
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const payload = JSON.stringify({
    title: "⚠️ OS Aguardando Aprovação",
    body: `OS ${order_number} aguarda a sua aprovação.`,
    url: `/admin/maintenance/${order_id}`,
  });

  const results = await Promise.allSettled(
    subs.map((row: any) => webpush.sendNotification(row.subscription, payload))
  );

  const sent  = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  return new Response(JSON.stringify({ sent, failed, total: subs.length }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
