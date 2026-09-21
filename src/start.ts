import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { handleMultiTenantRouting } from "./lib/multi-tenant-routing";

const multiTenantMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    if (request) {
      const redirectResponse = handleMultiTenantRouting(request);
      if (redirectResponse) {
        return redirectResponse;
      }
    }
  } catch {
    // Continua normalmente se getRequest não estiver disponível
  }
  return await next();
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [multiTenantMiddleware, errorMiddleware],
}));
