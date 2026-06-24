import { createFileRoute } from "@tanstack/react-router";
import { translateError } from "@/lib/translate-error";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, CalendarCheck, AlertTriangle, CalendarClock, Send, FileSpreadsheet, Download, Upload, RefreshCw, MessageCircle, Phone, Copy, LifeBuoy, Lock, Unlock, ArrowUp, ArrowDown, ArrowUpDown, MoreVertical } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ComponentType, CSSProperties, SVGProps } from "react";
import * as XLSX from "xlsx";

import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { brl, parseBrlToCents, formatDateBR, todayISO, addDaysISO, formatPhone } from "@/lib/format";
import { getStateFromPhone } from "@/lib/br-states";
import { statusLabel, statusVariant, computeStatus, type ClientStatus } from "@/lib/status";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { sendChargesNow as sendChargesNowFn } from "@/lib/auto-charges.functions";


import { PageHeader } from "@/components/page-header";
import { ActionPillButton } from "@/components/action-pill-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";


export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({ meta: [{ title: "Clientes — Painel VIP" }] }),
  component: ClientesPage,
});

const schema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(120),
  phone: z.string().trim().min(8, "Telefone inválido").max(20),
  iptv_login: z.string().trim().max(80).optional().or(z.literal("")),
  iptv_password: z.string().trim().max(80).optional().or(z.literal("")),
  plan_id: z.string().optional(),
  server_id: z.string().optional(),
  price: z.string().min(1, "Informe o valor"),
  points: z.coerce.number().int().min(1).max(10),
  due_date: z.string().min(1, "Informe o vencimento"),
  auto_charge: z.boolean(),
  notes: z.string().max(500).optional().or(z.literal("")),
  referred_by_code: z.string().trim().max(40).optional().or(z.literal("")),
  allowed_plan_ids: z.array(z.string()).optional(),
});
type FormValues = z.infer<typeof schema>;

type Plan = { id: string; name: string; price_cents: number; duration_days: number; active: boolean };
type Server = { id: string; name: string };
type Client = {
  id: string; name: string; phone: string; email: string | null; doc: string | null;
  iptv_login: string | null; iptv_password: string | null;
  plan_id: string | null; server_id: string | null;
  price_cents: number; due_date: string; status: ClientStatus;
  auto_charge: boolean; notes: string | null;
  referral_code: string | null; referred_by: string | null; bonus_days: number;
  allowed_plan_ids: string[] | null;
  points: number | null;
};

type FilterChip = "todos" | "em_dia" | "a_vencer" | "vencem_hoje" | "vencidos" | "bloqueados";

function ClientesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [q, setQ] = useState("");
  const [chip, setChip] = useState<FilterChip>("todos");
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: number; fail: number; errors: string[] } | null>(null);
  const [nameSort, setNameSort] = useState<"asc" | "desc">("asc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [pageSize, setPageSize] = useState<number>(10);
  const [page, setPage] = useState<number>(1);

  const { data: clients, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("due_date", { ascending: true });
      if (error) throw error;
      return (data as Client[]).map((c) => ({ ...c, status: computeStatus(c.due_date, c.status) }));
    },
  });
  const { data: plans } = useQuery({
    queryKey: ["plans", "active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("id,name,price_cents,duration_days,active").eq("active", true).order("name");
      if (error) throw error;
      return data as Plan[];
    },
  });
  const { data: servers } = useQuery({
    queryKey: ["servers", "select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("servers").select("id,name").order("name");
      if (error) throw error;
      return data as Server[];
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "", phone: "", iptv_login: "", iptv_password: "",
      plan_id: undefined, server_id: undefined, price: "", points: 1, due_date: todayISO(),
      auto_charge: true, notes: "", referred_by_code: "", allowed_plan_ids: [],
    },
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({
      name: "", phone: "", iptv_login: "", iptv_password: "",
      plan_id: undefined, server_id: undefined, price: "", points: 1, due_date: todayISO(),
      auto_charge: true, notes: "", referred_by_code: "", allowed_plan_ids: [],
    });
    setOpen(true);
  };
  const openEdit = (c: Client) => {
    setEditing(c);
    form.reset({
      name: c.name, phone: c.phone,
      iptv_login: c.iptv_login ?? "", iptv_password: c.iptv_password ?? "",
      plan_id: c.plan_id ?? undefined, server_id: c.server_id ?? undefined,
      price: (c.price_cents / 100).toFixed(2).replace(".", ","),
      points: c.points ?? 1,
      due_date: c.due_date, auto_charge: c.auto_charge, notes: c.notes ?? "",
      referred_by_code: "",
      allowed_plan_ids: (c as Client & { allowed_plan_ids?: string[] | null }).allowed_plan_ids ?? [],
    });
    setOpen(true);
  };

  const onPlanChange = (planId: string) => {
    form.setValue("plan_id", planId);
    const p = plans?.find((x) => x.id === planId);
    if (p) {
      form.setValue("price", (p.price_cents / 100).toFixed(2).replace(".", ","));
    }
  };

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!user) throw new Error("Sem sessão");
      let referred_by: string | null | undefined = undefined;
      const refCode = values.referred_by_code?.trim().toUpperCase();
      if (refCode) {
        const { data: ref } = await supabase.from("clients").select("id").eq("referral_code", refCode).maybeSingle();
        if (!ref) throw new Error("Código de indicação não encontrado");
        referred_by = ref.id;
      }
      const payload: {
        name: string; phone: string;
        iptv_login: string | null; iptv_password: string | null;
        plan_id: string | null; server_id: string | null;
        price_cents: number; due_date: string; status: ClientStatus;
        auto_charge: boolean; notes: string | null; user_id: string;
        allowed_plan_ids: string[];
        points: number;
        referred_by?: string | null;
      } = {
        name: values.name.trim(),
        phone: values.phone.trim(),
        iptv_login: values.iptv_login?.trim() || null,
        iptv_password: values.iptv_password?.trim() || null,
        plan_id: values.plan_id || null,
        server_id: values.server_id || null,
        price_cents: parseBrlToCents(values.price),
        due_date: values.due_date,
        status: computeStatus(values.due_date, "ativo"),
        auto_charge: values.auto_charge,
        notes: values.notes?.trim() || null,
        user_id: user.id,
        allowed_plan_ids: values.allowed_plan_ids ?? [],
        points: values.points ?? 1,
      };
      if (referred_by !== undefined) payload.referred_by = referred_by;
      if (editing) {
        const { error } = await supabase.from("clients").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("clients").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Cliente atualizado" : "Cliente cadastrado");
      qc.invalidateQueries({ queryKey: ["clients"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente removido");
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const bulkRemove = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("clients").delete().in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} cliente(s) removido(s)`);
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const [renewTarget, setRenewTarget] = useState<Client | null>(null);
  const renew = useMutation({
    mutationFn: async ({ c, days }: { c: Client; days: number }) => {
      // Sempre conta a partir do vencimento atual (mesmo vencido); usa hoje só se não houver
      const base = c.due_date || todayISO();
      const newDue = addDaysISO(base, days);

      const update: { due_date: string; status: ClientStatus; plan_id?: string; price_cents?: number } = { due_date: newDue, status: computeStatus(newDue, "ativo") };
      // Se o período escolhido for diferente do plano atual, troca para um plano com essa duração
      const currentPlan = (plans ?? []).find((p) => p.id === c.plan_id);
      const monthsFor = (d: number) => Math.max(1, Math.round(d / 30));
      const newMonths = monthsFor(days);
      if (!currentPlan || currentPlan.duration_days !== days) {
        const matching = (plans ?? []).find((p) => p.duration_days === days);
        if (matching) {
          update.plan_id = matching.id;
          update.price_cents = matching.price_cents;
        } else {
          // Sem plano correspondente: ajusta o valor proporcional aos meses escolhidos
          const curMonths = currentPlan ? monthsFor(currentPlan.duration_days) : 1;
          const monthly = Math.round((c.price_cents || 0) / curMonths);
          update.price_cents = monthly * newMonths;
        }
      }
      const { error } = await supabase.from("clients").update(update).eq("id", c.id);
      if (error) throw error;
      // Registra o pagamento da renovação para somar no financeiro
      const { error: payErr } = await supabase.from("payments").insert({
        user_id: user!.id,
        client_id: c.id,
        amount_cents: update.price_cents ?? c.price_cents ?? 0,
        method: "manual",
        notes: `Renovação manual (${days} dias)`,
      });
      if (payErr) throw payErr;
    },
    onSuccess: () => { toast.success("Cliente renovado"); setRenewTarget(null); qc.invalidateQueries({ queryKey: ["clients"] }); },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const toggleBlock = useMutation({
    mutationFn: async (c: Client) => {
      const next: ClientStatus = c.status === "suspenso" || c.status === "cancelado" ? computeStatus(c.due_date, "ativo") : "suspenso";
      const { error } = await supabase.from("clients").update({ status: next }).eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Status atualizado"); qc.invalidateQueries({ queryKey: ["clients"] }); },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const onlyDigits = (s: string) => s.replace(/\D/g, "");
  const intlPhone = (phone: string) => {
    const d = onlyDigits(phone);
    if (!d) return "";
    if (d.length >= 12) return d; // já tem código do país
    if (d.length === 10 || d.length === 11) return "55" + d; // BR sem DDI
    return d;
  };
  const whatsappHref = (c: Client) => {
    const p = intlPhone(c.phone);
    if (!p) return "#";
    const due = new Date(c.due_date + "T00:00:00");
    const dd = String(due.getDate()).padStart(2, "0");
    const mm = String(due.getMonth() + 1).padStart(2, "0");
    const yyyy = due.getFullYear();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today.getTime() - due.getTime()) / 86400000);
    const overdue = Math.max(0, diffDays);
    const identifier = c.iptv_login || c.name;
    const msg = encodeURIComponent(
      `Ola!  ${identifier} seu vencimento é: *${dd}/${mm}/${yyyy}  vencido há ${overdue}* dias. Aguardo contato para renovação`
    );
    return `https://wa.me/${p}?text=${msg}`;
  };
  const telHref = (c: Client) => {
    const p = intlPhone(c.phone);
    return p ? `tel:+${p}` : "#";
  };
  const supportHref = (c: Client) => {
    const p = intlPhone(c.phone);
    const msg = encodeURIComponent(`Olá ${c.name}, como podemos ajudar?`);
    return p ? `https://wa.me/${p}?text=${msg}` : "#";
  };
  const copyCredentials = async (c: Client) => {
    const txt = [c.iptv_login && `Login: ${c.iptv_login}`, c.iptv_password && `Senha: ${c.iptv_password}`].filter(Boolean).join("\n");
    if (!txt) return toast.error("Sem credenciais cadastradas");
    await navigator.clipboard.writeText(txt);
    toast.success("Credenciais copiadas");
  };



  const filtered = useMemo(() => {
    if (!clients) return [];
    const term = q.trim().toLowerCase();
    const today = todayISO();
    const in30 = addDaysISO(today, 30);
    const list = clients.filter((c) => {
      if (chip === "em_dia" && c.status !== "ativo") return false;
      if (chip === "vencidos" && c.status !== "vencido") return false;
      if (chip === "bloqueados" && !(c.status === "suspenso" || c.status === "cancelado")) return false;
      if (chip === "vencem_hoje" && c.due_date !== today) return false;
      if (chip === "a_vencer" && !(c.due_date >= today && c.due_date <= in30)) return false;
      if (!term) return true;
      return (
        c.name.toLowerCase().includes(term) ||
        c.phone.toLowerCase().includes(term) ||
        (c.email ?? "").toLowerCase().includes(term) ||
        (c.iptv_login ?? "").toLowerCase().includes(term)
      );
    });
    const sorted = [...list].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
    );
    if (nameSort === "desc") sorted.reverse();
    return sorted;
  }, [clients, q, chip, nameSort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(
    () => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filtered, currentPage, pageSize],
  );

  const sendChargesNow = useServerFn(sendChargesNowFn);
  const sendCharges = useMutation({
    mutationFn: async (filter: "due_today" | "due_tomorrow" | "advance_5d" | "overdue" | "auto_due_or_overdue") => {
      return await sendChargesNow({ data: { filter } });
    },
    onSuccess: (r) => {
      if (r.total === 0) toast.info("Nenhum cliente elegível para esse filtro");
      else if (r.failed === 0) toast.success(`${r.sent} cobrança(s) enviada(s) via WhatsApp`);
      else toast.warning(`Enviadas: ${r.sent} • Falhas: ${r.failed}${r.errors.length ? " — " + r.errors[0] : ""}`);
    },
    onError: (e: Error) => toast.error(translateError(e)),
  });
  const cobranca = (filter: "due_today" | "due_tomorrow" | "advance_5d" | "overdue" | "auto_due_or_overdue") =>
    sendCharges.mutate(filter);

  const downloadTemplate = () => {
    const headers = [
      "nome", "whatsapp", "vencimento",
      "login_iptv", "senha_iptv",
      "plano", "valor", "servidor", "cobranca_automatica", "observacoes",
    ];
    const example = [
      "João da Silva", "(11) 99999-9999", "31/12/2026",
      "joao123", "senha123",
      "", "49,90", "", "sim", "Cliente exemplo",
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clientes");
    XLSX.writeFile(wb, "modelo-clientes.xlsx");
  };

  const parseDateCell = (v: unknown): string | null => {
    if (v == null || v === "") return null;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const s = String(v).trim();
    const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (br) {
      const [, d, m, y] = br;
      const yyyy = y.length === 2 ? `20${y}` : y;
      return `${yyyy}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return s.slice(0, 10);
    const d2 = new Date(s);
    if (!isNaN(d2.getTime())) return d2.toISOString().slice(0, 10);
    return null;
  };

  const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

  const handleImportFile = async (file: File) => {
    if (!user) { toast.error("Sem sessão"); return; }
    setImporting(true);
    setImportResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      if (rows.length === 0) { toast.error("Planilha vazia"); setImporting(false); return; }

      const planByName = new Map((plans ?? []).map((p) => [p.name.trim().toLowerCase(), p]));
      const serverByName = new Map((servers ?? []).map((s) => [s.name.trim().toLowerCase(), s]));

      const errors: string[] = [];
      const payloads: TablesInsert<"clients">[] = [];

      rows.forEach((r, idx) => {
        const lineNum = idx + 2;
        const name = String(r["nome"] ?? r["name"] ?? "").trim();
        const phone = String(r["whatsapp"] ?? r["telefone"] ?? r["phone"] ?? "").trim();
        if (!name) { errors.push(`Linha ${lineNum}: nome obrigatório`); return; }
        if (!phone) { errors.push(`Linha ${lineNum}: whatsapp obrigatório`); return; }

        const priceRaw = String(r["valor"] ?? r["price"] ?? "").trim();
        const price_cents = priceRaw ? parseBrlToCents(priceRaw) : 0;
        if (!price_cents) { errors.push(`Linha ${lineNum}: valor inválido`); return; }

        const due = parseDateCell(r["vencimento"] ?? r["due_date"]);
        if (!due) { errors.push(`Linha ${lineNum}: vencimento inválido (use DD/MM/AAAA)`); return; }

        const planName = norm(r["plano"]);
        const plan_id = planName ? planByName.get(planName)?.id ?? null : null;
        const serverName = norm(r["servidor"]);
        const server_id = serverName ? serverByName.get(serverName)?.id ?? null : null;

        const autoRaw = norm(r["cobranca_automatica"] ?? r["auto_charge"]);
        const auto_charge = autoRaw === "" ? true : !["nao","não","no","false","0"].includes(autoRaw);

        payloads.push({
          name,
          phone: formatPhone(phone),
          iptv_login: String(r["login_iptv"] ?? r["iptv_login"] ?? "").trim() || null,
          iptv_password: String(r["senha_iptv"] ?? r["iptv_password"] ?? "").trim() || null,
          plan_id,
          server_id,
          price_cents,
          due_date: due,
          status: computeStatus(due, "ativo"),
          auto_charge,
          notes: String(r["observacoes"] ?? r["notes"] ?? "").trim() || null,
          user_id: user.id,
        });
      });

      let ok = 0;
      if (payloads.length) {
        const chunkSize = 100;
        for (let i = 0; i < payloads.length; i += chunkSize) {
          const slice = payloads.slice(i, i + chunkSize);
          const { error } = await supabase.from("clients").insert(slice);
          if (error) {
            errors.push(`Lote ${Math.floor(i/chunkSize)+1}: ${translateError(error)}`);
          } else {
            ok += slice.length;
          }
        }
      }

      setImportResult({ ok, fail: rows.length - ok, errors });
      if (ok > 0) {
        toast.success(`${ok} cliente(s) importado(s)`);
        qc.invalidateQueries({ queryKey: ["clients"] });
      }
      if (ok === 0 && errors.length) toast.error("Nenhum cliente foi importado");
    } catch (e) {
      toast.error(translateError(e as Error));
    } finally {
      setImporting(false);
    }
  };


  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        actions={
          <>
            {selectedIds.size > 0 && (
              <Button variant="destructive" className="rounded-full" onClick={() => setBulkDeleteOpen(true)}>
                <Trash2 className="size-4" /> Excluir selecionados ({selectedIds.size})
              </Button>
            )}
            <ActionPillButton color="cyan" icon={<CalendarClock className="size-4" />} onClick={() => cobranca("advance_5d")}>Cobrar Antecipado (5d)</ActionPillButton>
            <ActionPillButton color="rose" icon={<AlertTriangle className="size-4" />} onClick={() => cobranca("overdue")}>Cobrar Vencidos</ActionPillButton>
            <ActionPillButton color="amber" icon={<CalendarClock className="size-4" />} onClick={() => cobranca("due_tomorrow")}>Cobrar Vencendo Amanhã</ActionPillButton>
            <ActionPillButton color="emerald" icon={<Send className="size-4" />} onClick={() => cobranca("due_today")}>Cobrar vence hoje</ActionPillButton>
            <Button variant="outline" className="rounded-full" onClick={() => { setImportResult(null); setImportOpen(true); }}>
              <FileSpreadsheet className="size-4" /> Importar Excel
            </Button>
            <Button className="btn-premium rounded-full" onClick={openCreate}>
              <Plus className="size-4" /> Novo cliente
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-3 items-center">
            <div className="relative min-w-0">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9 rounded-full" placeholder="Buscar por nome, WhatsApp, login..." value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              {([
                ["todos", "Todos"], ["em_dia", "Em dia"], ["a_vencer", "A vencer"],
                ["vencem_hoje", "Vencem hoje"], ["vencidos", "Vencidos"], ["bloqueados", "Bloqueados"],
              ] as [FilterChip, string][]).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setChip(k)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                    chip === k
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  }`}
                >{label}</button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id))}
                    onCheckedChange={(v) => {
                      if (v) setSelectedIds(new Set(filtered.map((c) => c.id)));
                      else setSelectedIds(new Set());
                    }}
                    aria-label="Selecionar todos"
                  />
                </TableHead>
                <TableHead>
                  <button
                    type="button"
                    onClick={() => setNameSort((s) => (s === "asc" ? "desc" : "asc"))}
                    className="inline-flex items-center gap-1 font-medium hover:text-foreground transition-colors"
                    title="Ordenar por nome"
                  >
                    Nome
                    {nameSort === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
                  </button>
                </TableHead>
                
                <TableHead>Valor</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
              ))}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                    <p>Nenhum cliente encontrado.</p>
                    {clients?.length === 0 && (
                      <Button className="btn-premium rounded-full mt-3" onClick={openCreate}>
                        <Plus className="size-4" /> Cadastrar primeiro cliente
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )}
              {paged.map((c) => (
                <TableRow key={c.id} data-state={selectedIds.has(c.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(c.id)}
                      onCheckedChange={(v) => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (v) next.add(c.id); else next.delete(c.id);
                          return next;
                        });
                      }}
                      aria-label={`Selecionar ${c.name}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{c.name}</TableCell>


                  
                  <TableCell className="tabular-nums">{brl(c.price_cents)}</TableCell>
                  <TableCell>{formatDateBR(c.due_date)}</TableCell>
                  <TableCell><Badge variant={statusVariant[c.status]}>{statusLabel[c.status]}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            title="Ações"
                            aria-label="Ações"
                            className="size-8 inline-flex items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <MoreVertical className="size-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuLabel>Ações</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => setRenewTarget(c)}>
                            <RefreshCw className="size-4" style={{ color: "var(--kpi-emerald)" }} /> Renovar
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <a href={whatsappHref(c)} target="_blank" rel="noreferrer">
                              <MessageCircle className="size-4" style={{ color: "var(--kpi-emerald)" }} /> Mensagem (WhatsApp)
                            </a>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <a href={telHref(c)}>
                              <Phone className="size-4" style={{ color: "var(--kpi-cyan)" }} /> Ligar
                            </a>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => copyCredentials(c)}>
                            <Copy className="size-4" style={{ color: "var(--kpi-cyan)" }} /> Copiar credenciais
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <a href={supportHref(c)} target="_blank" rel="noreferrer">
                              <LifeBuoy className="size-4" style={{ color: "var(--kpi-emerald)" }} /> Suporte
                            </a>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleBlock.mutate(c)}>
                            {c.status === "suspenso" || c.status === "cancelado" ? (
                              <><Unlock className="size-4" style={{ color: "var(--kpi-amber)" }} /> Desbloquear</>
                            ) : (
                              <><Lock className="size-4" style={{ color: "var(--kpi-amber)" }} /> Bloquear</>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openEdit(c)}>
                            <Pencil className="size-4" style={{ color: "var(--kpi-violet)" }} /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteTarget(c)}
                            className="text-[color:var(--kpi-rose)] focus:text-[color:var(--kpi-rose)]"
                          >
                            <Trash2 className="size-4" /> Remover
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>

                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Resultados por página</span>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger className="h-8 w-[80px] rounded-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 25, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="ml-2">{filtered.length} cliente(s)</span>
            </div>
            <Pagination className="mx-0 w-auto justify-end">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    aria-disabled={currentPage <= 1}
                    className={currentPage <= 1 ? "pointer-events-none opacity-50" : ""}
                    onClick={(e) => { e.preventDefault(); if (currentPage > 1) setPage(currentPage - 1); }}
                  />
                </PaginationItem>
                {getPageItems(currentPage, totalPages).map((it, idx) =>
                  it === "..." ? (
                    <PaginationItem key={`e-${idx}`}><PaginationEllipsis /></PaginationItem>
                  ) : (
                    <PaginationItem key={it}>
                      <PaginationLink
                        href="#"
                        isActive={it === currentPage}
                        onClick={(e) => { e.preventDefault(); setPage(it as number); }}
                      >
                        {it}
                      </PaginationLink>
                    </PaginationItem>
                  )
                )}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    aria-disabled={currentPage >= totalPages}
                    className={currentPage >= totalPages ? "pointer-events-none opacity-50" : ""}
                    onClick={(e) => { e.preventDefault(); if (currentPage < totalPages) setPage(currentPage + 1); }}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) remove.mutate(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cliente" : "Novo cliente"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome *</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>WhatsApp *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="(11) 99999-9999"
                        value={field.value}
                        onChange={(e) => field.onChange(formatPhone(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="due_date" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vencimento *</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="iptv_login" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Login IPTV</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="iptv_password" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Senha IPTV</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                  </FormItem>
                )} />

                <FormField control={form.control} name="plan_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plano</FormLabel>
                    <Select value={field.value ?? ""} onValueChange={onPlanChange}>
                      <FormControl><SelectTrigger><SelectValue placeholder="— Sem plano —" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {(!plans || plans.length === 0) && <div className="px-2 py-1.5 text-sm text-muted-foreground">Cadastre um plano antes</div>}
                        {plans?.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name} — {brl(p.price_cents)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="price" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor (R$) *</FormLabel>
                    <FormControl><Input inputMode="decimal" placeholder="49,90" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="points" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pontos (telas)</FormLabel>
                    <Select value={String(field.value ?? 1)} onValueChange={(v) => field.onChange(Number(v))}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {[1,2,3,4,5,6,7,8,9,10].map((n) => (
                          <SelectItem key={n} value={String(n)}>{n} ponto{n > 1 ? "s" : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="server_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Servidor</FormLabel>
                    <Select value={field.value ?? ""} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue placeholder="— Sem servidor —" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {(!servers || servers.length === 0) && <div className="px-2 py-1.5 text-sm text-muted-foreground">Nenhum servidor cadastrado.</div>}
                        {servers?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="allowed_plan_ids" render={({ field }) => (
                <FormItem className="rounded-xl border border-border p-3">
                  <FormLabel>Planos liberados no portal</FormLabel>
                  <p className="text-xs text-muted-foreground -mt-1 mb-2">
                    Marque os planos que este cliente poderá escolher ao renovar pelo portal. Se nenhum for marcado, todos os planos ativos ficam disponíveis.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(plans ?? []).map((p) => {
                      const checked = (field.value ?? []).includes(p.id);
                      return (
                        <label key={p.id} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5 cursor-pointer hover:bg-muted/40">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              const cur = field.value ?? [];
                              field.onChange(v ? [...cur, p.id] : cur.filter((x) => x !== p.id));
                            }}
                          />
                          <span className="text-sm">{p.name} — {brl(p.price_cents)}</span>
                        </label>
                      );
                    })}
                    {(!plans || plans.length === 0) && (
                      <p className="text-xs text-muted-foreground">Cadastre planos antes de definir os liberados.</p>
                    )}
                  </div>
                </FormItem>
              )} />
              <FormField control={form.control} name="auto_charge" render={({ field }) => (
                <FormItem className="flex items-start justify-between rounded-xl border border-border p-3 gap-3">
                  <div className="min-w-0">
                    <FormLabel className="mb-0">Cobrança Automática</FormLabel>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Quando desativada, este cliente é ignorado no envio automático de cobranças vencidas.
                    </p>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" className="btn-premium rounded-full" disabled={save.isPending}>
                  {save.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover {selectedIds.size} cliente(s)?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. Todos os registros selecionados serão excluídos permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkRemove.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); bulkRemove.mutate(Array.from(selectedIds)); }}
              disabled={bulkRemove.isPending}
            >
              {bulkRemove.isPending ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!renewTarget} onOpenChange={(o) => { if (!o) setRenewTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Renovar {renewTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Escolha o período da renovação:</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Mensal", days: 30 },
                { label: "Trimestral", days: 90 },
                { label: "Semestral", days: 180 },
                { label: "Anual", days: 365 },
              ].map((opt) => (
                <Button
                  key={opt.label}
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  disabled={renew.isPending}
                  onClick={() => renewTarget && renew.mutate({ c: renewTarget, days: opt.days })}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setRenewTarget(null)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={(o) => { if (!importing) setImportOpen(o); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar clientes via Excel</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border border-border p-3 text-sm text-muted-foreground space-y-2">
              <p>Baixe o modelo, preencha e envie. Colunas aceitas:</p>
              <p className="text-xs"><strong>nome</strong>, <strong>whatsapp</strong>, <strong>vencimento</strong> (DD/MM/AAAA), login_iptv, senha_iptv, plano, <strong>valor</strong>, servidor, cobranca_automatica (sim/não), observacoes.</p>
              <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={downloadTemplate}>
                <Download className="size-4" /> Baixar modelo
              </Button>
            </div>

            <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-6 cursor-pointer hover:border-primary/50 transition">
              <Upload className="size-6 text-muted-foreground" />
              <span className="text-sm font-medium">{importing ? "Importando..." : "Clique para selecionar arquivo .xlsx"}</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                disabled={importing}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImportFile(f);
                  e.target.value = "";
                }}
              />
            </label>

            {importResult && (
              <div className="rounded-xl border border-border p-3 text-sm space-y-2">
                <p><strong className="text-[color:var(--kpi-emerald)]">{importResult.ok}</strong> importado(s) · <strong className="text-destructive">{importResult.fail}</strong> com erro</p>
                {importResult.errors.length > 0 && (
                  <ul className="text-xs text-muted-foreground max-h-40 overflow-y-auto list-disc pl-4 space-y-0.5">
                    {importResult.errors.slice(0, 50).map((er, i) => <li key={i}>{er}</li>)}
                  </ul>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setImportOpen(false)} disabled={importing}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CircleAction({ title, color, Icon, onClick, href }: { title: string; color: string; Icon: ComponentType<SVGProps<SVGSVGElement>>; onClick?: () => void; href?: string }) {
  const className = "size-7 inline-flex items-center justify-center rounded-full border transition-colors hover:bg-[color-mix(in_oklab,var(--pill-color)_15%,transparent)]";
  const style = { ["--pill-color" as string]: color, borderColor: `color-mix(in oklab, ${color} 55%, transparent)`, color } as CSSProperties;
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" title={title} aria-label={title} className={className} style={style}>
        <Icon className="size-3.5" />
      </a>
    );
  }
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} className={className} style={style}>
      <Icon className="size-3.5" />
    </button>
  );
}

