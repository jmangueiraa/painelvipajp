import { useEffect, useRef, useState } from "react";
import { translateError } from "@/lib/translate-error";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  LayoutDashboard, Users, Package, Server, Wallet, RefreshCw, Settings, Crown, Camera, ShieldCheck, Inbox, ShoppingBag, Store, KeyRound, Bell, Smartphone,
} from "lucide-react";
import { useIsAdmin } from "@/hooks/use-is-admin";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Clientes", url: "/clientes", icon: Users },
  { title: "Planos", url: "/planos", icon: Package },
  { title: "Servidores", url: "/servidores", icon: Server },
  { title: "Financeiro", url: "/financeiro", icon: Wallet },
  { title: "Renovação", url: "/renovacao", icon: RefreshCw },
  { title: "Solicitações", url: "/solicitacoes", icon: Inbox },
  { title: "Loja - Produtos", url: "/loja/produtos", icon: Store },
  { title: "Loja - Clientes", url: "/loja/clientes", icon: ShoppingBag },
  { title: "Cadastrar API", url: "/cadastrar-api", icon: KeyRound },
  { title: "Notificações Push", url: "/notificacoes-push", icon: Bell },
  { title: "Portal dos Clientes", url: "/portal-clientes", icon: Smartphone },
  { title: "Configurações", url: "/configuracoes", icon: Settings },

];

function SidebarAvatar({ collapsed }: { collapsed: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [signed, setSigned] = useState<string>("");

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!profile?.avatar_url) { setSigned(""); return; }
      const { data } = await supabase.storage.from("avatars").createSignedUrl(profile.avatar_url, 60 * 60);
      if (!cancelled) setSigned(data?.signedUrl ?? "");
    }
    load();
    return () => { cancelled = true; };
  }, [profile?.avatar_url]);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error("Sem sessão");
      if (!file.type.startsWith("image/")) throw new Error("Selecione uma imagem");
      if (file.size > 5 * 1024 * 1024) throw new Error("Imagem muito grande (máx 5MB)");
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, {
        upsert: true,
        contentType: file.type,
      });
      if (upErr) throw upErr;
      if (profile?.avatar_url) {
        await supabase.storage.from("avatars").remove([profile.avatar_url]).catch(() => {});
      }
      const { error } = await supabase.from("profiles").update({ avatar_url: path }).eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Foto atualizada");
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  return (
    <button
      type="button"
      onClick={() => fileRef.current?.click()}
      title="Alterar foto de perfil"
      className="size-9 shrink-0 rounded-xl relative group overflow-hidden flex items-center justify-center shadow-[var(--shadow-glow)]"
      style={{ backgroundImage: signed ? undefined : "var(--gradient-primary)" }}
      disabled={upload.isPending}
    >
      {signed ? (
        <img src={signed} alt="Foto de perfil" className="size-full object-cover" />
      ) : (
        <Crown className="size-4 text-primary-foreground" />
      )}
      <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <Camera className="size-4 text-white" />
      </span>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload.mutate(f);
          e.target.value = "";
        }}
      />
      {collapsed ? null : null}
    </button>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isAdmin } = useIsAdmin();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border/40">
        <div className="flex items-center gap-2 px-2 py-2">
          <SidebarAvatar collapsed={collapsed} />
          {!collapsed && (
            <div className="flex flex-col leading-tight min-w-0">
              <span className="font-bold text-sidebar-foreground truncate">Painel VIP</span>
              <span className="text-[10px] text-sidebar-foreground/60 uppercase tracking-widest">Gestão recorrente</span>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = pathname === item.url || pathname.startsWith(item.url + "/");
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                      <Link to={item.url} className="flex items-center gap-2">
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Administração</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith("/admin/assinantes")}
                    tooltip="Assinantes"
                  >
                    <Link to="/admin/assinantes" className="flex items-center gap-2">
                      <ShieldCheck className="size-4" />
                      <span>Assinantes</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
