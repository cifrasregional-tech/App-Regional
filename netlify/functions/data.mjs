import { getStore } from "@netlify/blobs";

export const config = {
  // URL amigável: /api/data
  path: "/api/data",
};

function jsonResponse(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function badRequest(message) {
  return jsonResponse({ error: message }, 400);
}

function getMonthKey(url) {
  const u = new URL(url);
  const monthKey = u.searchParams.get("monthKey") || "current";
  // Permitimos YYYY-MM ou "current"
  if (monthKey !== "current" && !/^\d{4}-\d{2}$/.test(monthKey)) return null;
  return monthKey;
}

export default async function (request, context) {
  // CORS (mesma origem normalmente, mas deixa amigável para testes)
  if (request.method === "OPTIONS") {
    return new Response("", {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,PUT,OPTIONS",
        "access-control-allow-headers": "content-type, authorization",
        "cache-control": "no-store",
      },
    });
  }

  const monthKey = getMonthKey(request.url);
  if (!monthKey) return badRequest("monthKey inválido. Use YYYY-MM ou omita.");

  const key = `months/${monthKey}.json`;

  // Store site-wide, com leitura forte para refletir publicação imediatamente.
  const store = getStore({ name: "louvorpro", consistency: "strong" });

  if (request.method === "GET") {
    const entry = await store.getWithMetadata(key, { type: "json" });
    if (entry === null) {
      return jsonResponse({ data: null, meta: null }, 200, {
        "access-control-allow-origin": "*",
      });
    }

    return jsonResponse(
      { data: entry.data, meta: entry.metadata || null },
      200,
      { "access-control-allow-origin": "*" }
    );
  }

  if (request.method === "PUT") {
    // Netlify valida o Bearer token do Identity e injeta context.clientContext.user
    const user = context?.clientContext?.user;
    if (!user) {
      return jsonResponse({ error: "Unauthorized" }, 401, {
        "access-control-allow-origin": "*",
      });
    }

    // ✅ Permissão forte: só e-mails permitidos ou roles permitidas podem publicar.
    // Configure no Netlify:
    // - Identity: defina roles "admin" / "editor" para os usuários convidados.
    // - Variável de ambiente (opcional): ADMIN_EMAILS="email1,email2" para whitelisting.
    const email = (user.email || "").toLowerCase();
    const roles = user.app_metadata?.roles || [];
    const allowedRoles = (process.env.EDITOR_ROLES || "admin,editor")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const allowedEmails = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    // Fallback: seu e-mail como dono do app (caso não configure ADMIN_EMAILS)
    if (allowedEmails.length === 0) {
      allowedEmails.push("fabio.tec.audio@hotmail.com");
    }

    const roleOk = roles.some((r) => allowedRoles.includes(r));
    const emailOk = allowedEmails.includes(email);
    if (!roleOk && !emailOk) {
      return jsonResponse({ error: "Forbidden" }, 403, {
        "access-control-allow-origin": "*",
      });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return badRequest("JSON inválido no body.");
    }

    if (!body || typeof body !== "object") {
      return badRequest("Body precisa ser um objeto JSON.");
    }

    // metadata útil para mostrar no Admin
    const meta = {
      updatedAt: new Date().toISOString(),
      updatedBy: user.email || user?.user_metadata?.full_name || "admin",
    };

    await store.setJSON(key, body, { metadata: meta });

    return jsonResponse({ ok: true, meta }, 200, {
      "access-control-allow-origin": "*",
    });
  }

  return jsonResponse({ error: "Method not allowed" }, 405, {
    "access-control-allow-origin": "*",
  });
}
