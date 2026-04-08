import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify the caller is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminId = claimsData.claims.sub as string;

    // Check admin role using service role client
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: adminRole } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", adminId)
      .eq("role", "admin")
      .single();

    if (!adminRole) {
      return new Response(JSON.stringify({ error: "Acceso denegado. Se requiere rol de administrador." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "list_users":
        return await listUsers(adminClient);
      case "create_user":
        return await createUser(adminClient, body, adminId);
      case "suspend_user":
        return await suspendUser(adminClient, body, adminId);
      case "reactivate_user":
        return await reactivateUser(adminClient, body, adminId);
      case "reset_password":
        return await resetPassword(adminClient, body, adminId);
      case "change_role":
        return await changeRole(adminClient, body, adminId);
      case "update_profile":
        return await updateProfile(adminClient, body, adminId);
      default:
        return new Response(JSON.stringify({ error: "Acción no válida" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message || "Error interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function listUsers(client: ReturnType<typeof createClient>) {
  // Get all users from auth
  const { data: authUsers, error: authError } = await client.auth.admin.listUsers({ perPage: 1000 });
  if (authError) return jsonResponse({ error: authError.message }, 500);

  // Get profiles and roles
  const { data: profiles } = await client.from("profiles").select("*");
  const { data: roles } = await client.from("user_roles").select("*");

  const users = authUsers.users.map((u) => {
    const profile = profiles?.find((p) => p.user_id === u.id);
    const userRole = roles?.find((r) => r.user_id === u.id);
    return {
      id: u.id,
      email: u.email,
      full_name: profile?.full_name || "",
      status: profile?.status || "active",
      role: userRole?.role || "user",
      created_at: u.created_at,
      last_sign_in: u.last_sign_in_at || profile?.last_sign_in,
      suspended_at: profile?.suspended_at,
      suspension_reason: profile?.suspension_reason,
    };
  });

  return jsonResponse({ users });
}

async function createUser(
  client: ReturnType<typeof createClient>,
  body: { email: string; password: string; full_name: string; role?: string },
  adminId: string
) {
  const { email, password, full_name, role } = body;

  if (!email || !password || !full_name) {
    return jsonResponse({ error: "Email, contraseña y nombre completo son obligatorios" }, 400);
  }

  if (password.length < 8) {
    return jsonResponse({ error: "La contraseña debe tener al menos 8 caracteres" }, 400);
  }

  // Create user in auth
  const { data: newUser, error: createError } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });

  if (createError) {
    return jsonResponse({ error: createError.message }, 400);
  }

  // Update profile name (trigger already created the profile)
  await client
    .from("profiles")
    .update({ full_name })
    .eq("user_id", newUser.user.id);

  // Update role if specified
  if (role && role !== "user") {
    await client
      .from("user_roles")
      .update({ role })
      .eq("user_id", newUser.user.id);
  }

  // Audit log
  await client.from("admin_audit_log").insert({
    admin_id: adminId,
    target_user_id: newUser.user.id,
    action: "user_created",
    details: { email, full_name, role: role || "user" },
  });

  return jsonResponse({ success: true, user_id: newUser.user.id });
}

async function suspendUser(
  client: ReturnType<typeof createClient>,
  body: { user_id: string; reason?: string },
  adminId: string
) {
  const { user_id, reason } = body;
  if (!user_id) return jsonResponse({ error: "user_id es obligatorio" }, 400);
  if (user_id === adminId) return jsonResponse({ error: "No puedes suspenderte a ti mismo" }, 400);

  // Ban user in auth
  const { error: banError } = await client.auth.admin.updateUserById(user_id, {
    ban_duration: "876000h", // ~100 years
  });
  if (banError) return jsonResponse({ error: banError.message }, 500);

  // Update profile
  await client.from("profiles").update({
    status: "suspended",
    suspended_at: new Date().toISOString(),
    suspension_reason: reason || null,
  }).eq("user_id", user_id);

  // Audit log
  await client.from("admin_audit_log").insert({
    admin_id: adminId,
    target_user_id: user_id,
    action: "user_suspended",
    details: { reason: reason || "" },
  });

  return jsonResponse({ success: true });
}

async function reactivateUser(
  client: ReturnType<typeof createClient>,
  body: { user_id: string },
  adminId: string
) {
  const { user_id } = body;
  if (!user_id) return jsonResponse({ error: "user_id es obligatorio" }, 400);

  // Unban user
  const { error: unbanError } = await client.auth.admin.updateUserById(user_id, {
    ban_duration: "none",
  });
  if (unbanError) return jsonResponse({ error: unbanError.message }, 500);

  // Update profile
  await client.from("profiles").update({
    status: "active",
    suspended_at: null,
    suspension_reason: null,
  }).eq("user_id", user_id);

  // Audit log
  await client.from("admin_audit_log").insert({
    admin_id: adminId,
    target_user_id: user_id,
    action: "user_reactivated",
    details: {},
  });

  return jsonResponse({ success: true });
}

async function resetPassword(
  client: ReturnType<typeof createClient>,
  body: { user_id: string; new_password?: string },
  adminId: string
) {
  const { user_id, new_password } = body;
  if (!user_id) return jsonResponse({ error: "user_id es obligatorio" }, 400);

  if (new_password) {
    if (new_password.length < 8) {
      return jsonResponse({ error: "La contraseña debe tener al menos 8 caracteres" }, 400);
    }

    const { error } = await client.auth.admin.updateUserById(user_id, {
      password: new_password,
    });
    if (error) return jsonResponse({ error: error.message }, 500);
  } else {
    // Get user email to send reset link
    const { data: userData } = await client.auth.admin.getUserById(user_id);
    if (!userData?.user?.email) return jsonResponse({ error: "Usuario no encontrado" }, 404);

    const { error } = await client.auth.admin.generateLink({
      type: "recovery",
      email: userData.user.email,
    });
    if (error) return jsonResponse({ error: error.message }, 500);
  }

  // Audit log
  await client.from("admin_audit_log").insert({
    admin_id: adminId,
    target_user_id: user_id,
    action: "password_reset",
    details: { method: new_password ? "temporary_password" : "reset_link" },
  });

  return jsonResponse({ success: true });
}

async function changeRole(
  client: ReturnType<typeof createClient>,
  body: { user_id: string; new_role: string },
  adminId: string
) {
  const { user_id, new_role } = body;
  if (!user_id || !new_role) return jsonResponse({ error: "user_id y new_role son obligatorios" }, 400);
  if (!["admin", "user"].includes(new_role)) return jsonResponse({ error: "Rol no válido" }, 400);

  // Upsert role
  const { error } = await client
    .from("user_roles")
    .upsert({ user_id, role: new_role }, { onConflict: "user_id,role" });

  if (error) {
    // Try update instead
    await client.from("user_roles").update({ role: new_role }).eq("user_id", user_id);
  }

  // Audit log
  await client.from("admin_audit_log").insert({
    admin_id: adminId,
    target_user_id: user_id,
    action: "role_changed",
    details: { new_role },
  });

  return jsonResponse({ success: true });
}

async function updateProfile(
  client: ReturnType<typeof createClient>,
  body: { user_id: string; full_name: string },
  adminId: string
) {
  const { user_id, full_name } = body;
  if (!user_id || !full_name) return jsonResponse({ error: "user_id y full_name son obligatorios" }, 400);

  await client.from("profiles").update({ full_name }).eq("user_id", user_id);

  await client.from("admin_audit_log").insert({
    admin_id: adminId,
    target_user_id: user_id,
    action: "profile_updated",
    details: { full_name },
  });

  return jsonResponse({ success: true });
}
