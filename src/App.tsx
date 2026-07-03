import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LogOut,
  Pencil,
  PieChart,
  Plus,
  Tag,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";

type RepeatType = "none" | "daily" | "weekly" | "weekdays" | "monthly" | "yearly" | "custom";
type CustomUnit = "day" | "week" | "month" | "year";
type AuthMode = "login" | "signup" | "forgot";

type CustomRule = {
  interval: number;
  unit: CustomUnit;
  weekdays: number[];
  ends: "never" | "on" | "after";
  endDate?: string;
  occurrences?: number;
};

type RouteItem = {
  id: string;
  title: string;
  description: string;
  category: string;
  startsOn: string;
  startTime: string;
  endTime: string;
  repeatType: RepeatType;
  customRule: CustomRule;
  active: boolean;
};

type CompletionMap = Record<string, Record<string, boolean>>;

type DbItem = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  starts_on: string;
  start_time: string;
  end_time: string;
  repeat_type: RepeatType;
  custom_rule: CustomRule;
  active: boolean;
};

type DbCompletion = {
  item_id: string;
  completed_on: string;
  completed: boolean;
};

type RouteCategory = {
  id: string;
  name: string;
  color: string;
  active: boolean;
};

type DbCategory = {
  id: string;
  name: string;
  color: string;
  active: boolean;
};

const weekLabels = ["D", "S", "T", "Q", "Q", "S", "S"];
const fullWeekLabels = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const donutColors = ["#7c3aed", "#a855f7", "#c084fc", "#8b5cf6", "#d8b4fe", "#6d28d9"];
const today = toDateInput(new Date());

const defaultRule: CustomRule = {
  interval: 1,
  unit: "week",
  weekdays: [new Date(`${today}T12:00:00`).getDay()],
  ends: "never",
  occurrences: 13,
};

const initialItems: RouteItem[] = [
  {
    id: crypto.randomUUID(),
    title: "Planejar prioridades",
    description: "",
    category: "planejamento",
    startsOn: today,
    startTime: "08:30",
    endTime: "09:00",
    repeatType: "weekdays",
    customRule: defaultRule,
    active: true,
  },
  {
    id: crypto.randomUUID(),
    title: "Execução focada",
    description: "",
    category: "trabalho",
    startsOn: today,
    startTime: "09:00",
    endTime: "11:00",
    repeatType: "weekdays",
    customRule: defaultRule,
    active: true,
  },
  {
    id: crypto.randomUUID(),
    title: "Revisão do dia",
    description: "",
    category: "gestão",
    startsOn: today,
    startTime: "17:30",
    endTime: "18:00",
    repeatType: "daily",
    customRule: defaultRule,
    active: true,
  },
];

const defaultCategories: RouteCategory[] = [
  { id: crypto.randomUUID(), name: "rotina", color: "#7c3aed", active: true },
  { id: crypto.randomUUID(), name: "trabalho", color: "#8b5cf6", active: true },
  { id: crypto.randomUUID(), name: "planejamento", color: "#a855f7", active: true },
  { id: crypto.randomUUID(), name: "gestão", color: "#c084fc", active: true },
  { id: crypto.randomUUID(), name: "estudo", color: "#6d28d9", active: true },
  { id: crypto.randomUUID(), name: "saúde", color: "#d8b4fe", active: true },
];

const emptyForm = {
  title: "",
  description: "",
  category: "rotina",
  startsOn: today,
  startTime: "09:00",
  endTime: "10:00",
  repeatType: "none" as RepeatType,
};

export function App() {
  const [items, setItems] = useState<RouteItem[]>(() => readLocal("rota_items", initialItems).map(withItemDefaults));
  const [categories, setCategories] = useState<RouteCategory[]>(() => readLocal("rota_categories", defaultCategories));
  const [completions, setCompletions] = useState<CompletionMap>(() => readLocal("rota_completions", {}));
  const [form, setForm] = useState(emptyForm);
  const [newCategory, setNewCategory] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [customRule, setCustomRule] = useState<CustomRule>(defaultRule);
  const [customOpen, setCustomOpen] = useState(false);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(today);
  const [viewMode, setViewMode] = useState<"day" | "week">("day");
  const [sectionMode, setSectionMode] = useState<"checklist" | "categories">("checklist");
  const [syncState, setSyncState] = useState("local");
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [isAnonymousUser, setIsAnonymousUser] = useState(true);

  useEffect(() => {
    localStorage.setItem("rota_items", JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    localStorage.setItem("rota_categories", JSON.stringify(categories));
  }, [categories]);

  useEffect(() => {
    localStorage.setItem("rota_completions", JSON.stringify(completions));
  }, [completions]);

  async function ensureCloudSession() {
    if (!supabase) return null;
    const { data: sessionData } = await supabase.auth.getSession();
    let session = sessionData.session;
    if (!session) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) {
        setSyncState("local");
        return null;
      }
      session = data.session;
    }
    applySessionState(session);
    return session;
  }

  async function loadCloudData(options: { mergeLocal?: boolean } = {}) {
    if (!supabase) return;
    const session = await ensureCloudSession();
    if (!session) return;

    const [itemsResponse, completionsResponse, categoriesResponse] = await Promise.all([
      supabase.from("route_items").select("*").order("start_time"),
      supabase.from("route_completions").select("*"),
      supabase.from("route_categories").select("*").order("name"),
    ]);

    if (itemsResponse.error || completionsResponse.error) {
      setSyncState("local");
      return;
    }

    let remoteItems = (itemsResponse.data ?? []).map(fromDbItem);
    let remoteCompletions = fromDbCompletions(completionsResponse.data ?? []);
    let remoteCategories = categoriesResponse.error ? [] : (categoriesResponse.data ?? []).map(fromDbCategory);

    if (options.mergeLocal || remoteItems.length === 0) {
      const merged = await mergeLocalIntoCloud(remoteItems, remoteCategories, remoteCompletions);
      remoteItems = merged.items;
      remoteCategories = merged.categories;
      remoteCompletions = merged.completions;
    }

    if (remoteItems.length > 0) {
      setItems(remoteItems);
    }
    setCompletions(remoteCompletions);

    if (!categoriesResponse.error && remoteCategories.length > 0) {
      setCategories(remoteCategories);
    }

    setSyncState("supabase");
  }

  async function mergeLocalIntoCloud(remoteItems: RouteItem[], remoteCategories: RouteCategory[], remoteCompletions: CompletionMap) {
    if (!supabase) {
      return { items: remoteItems, categories: remoteCategories, completions: remoteCompletions };
    }

    const nextCategories = [...remoteCategories];
    const knownCategories = new Set(nextCategories.map((category) => categoryKey(category.name)));
    const categoriesToInsert = categories
      .filter((category) => !knownCategories.has(categoryKey(category.name)))
      .map((category) => ({ ...category, id: crypto.randomUUID() }));

    if (categoriesToInsert.length) {
      const { error } = await supabase.from("route_categories").insert(categoriesToInsert.map(toDbCategory));
      if (!error) {
        nextCategories.push(...categoriesToInsert);
      }
    }

    const nextItems = [...remoteItems];
    const remoteByKey = new Map(nextItems.map((item) => [itemMergeKey(item), item]));
    const itemIdMap = new Map<string, string>();
    const itemsToInsert: RouteItem[] = [];

    items.forEach((item) => {
      const match = remoteByKey.get(itemMergeKey(item));
      if (match) {
        itemIdMap.set(item.id, match.id);
        return;
      }
      const copy = { ...item, id: crypto.randomUUID() };
      itemIdMap.set(item.id, copy.id);
      itemsToInsert.push(copy);
      nextItems.push(copy);
      remoteByKey.set(itemMergeKey(copy), copy);
    });

    if (itemsToInsert.length) {
      const { error } = await supabase.from("route_items").insert(itemsToInsert.map(toDbItem));
      if (error) {
        setSyncState("local");
      }
    }

    const nextCompletions: CompletionMap = { ...remoteCompletions };
    const completionRows = Object.entries(completions).flatMap(([oldItemId, days]) => {
      const itemId = itemIdMap.get(oldItemId);
      if (!itemId) return [];
      return Object.entries(days).map(([completedOn, completed]) => {
        nextCompletions[itemId] = { ...nextCompletions[itemId], [completedOn]: completed };
        return { item_id: itemId, completed_on: completedOn, completed };
      });
    });

    if (completionRows.length) {
      await supabase.from("route_completions").upsert(completionRows, { onConflict: "item_id,completed_on" });
    }

    return {
      items: nextItems.sort((a, b) => a.startTime.localeCompare(b.startTime)),
      categories: nextCategories.sort((a, b) => a.name.localeCompare(b.name)),
      completions: nextCompletions,
    };
  }

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      await loadCloudData();
      if (cancelled) return;
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const dayItems = useMemo(
    () =>
      items
        .filter((item) => item.active && occursOn(item, selectedDate))
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [items, selectedDate],
  );

  const weekDays = useMemo(() => buildWeekDays(selectedDate), [selectedDate]);
  const performanceDates = useMemo(
    () => (viewMode === "week" ? weekDays : buildTrailingDays(selectedDate)),
    [selectedDate, viewMode, weekDays],
  );
  const performanceSummaryDates = useMemo(
    () => (viewMode === "week" ? weekDays : [selectedDate]),
    [selectedDate, viewMode, weekDays],
  );
  const performance = useMemo(() => buildPerformance(items, completions, performanceDates), [items, completions, performanceDates]);
  const performanceSummary = useMemo(
    () => buildPerformanceSummary(items, completions, performanceSummaryDates),
    [items, completions, performanceSummaryDates],
  );
  const occupancy = useMemo(() => buildOccupancy(dayItems), [dayItems]);
  const totalMinutes = occupancy.reduce((sum, item) => sum + item.minutes, 0);
  const biggestBlock = occupancy[0];
  const timeGradient = buildDonutGradient(occupancy, totalMinutes);
  const activeCategories = useMemo(
    () => categories.filter((category) => category.active).sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

  function moveSelectedDate(direction: -1 | 1) {
    setSelectedDate((current) => addDays(current, direction * (viewMode === "week" ? 7 : 1)));
  }

  function openAuth(mode: AuthMode) {
    setAuthMode(mode);
    setAuthMessage("");
    setAuthPassword("");
    setAuthOpen(true);
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setAuthMessage("Supabase não está configurado.");
      return;
    }
    setAuthLoading(true);
    setAuthMessage("");

    try {
      if (authMode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(authEmail, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setAuthMessage("Enviamos o link de recuperação para o seu e-mail.");
        return;
      }

      if (authMode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
        applySessionState(data.session);
        await loadCloudData({ mergeLocal: true });
        setAuthOpen(false);
        return;
      }

      const session = await ensureCloudSession();
      const anonymous = isAnonymousSession(session);
      const result = anonymous
        ? await supabase.auth.updateUser({ email: authEmail, password: authPassword })
        : await supabase.auth.signUp({ email: authEmail, password: authPassword });

      if (result.error) throw result.error;
      const { data } = await supabase.auth.getSession();
      applySessionState(data.session);
      await loadCloudData({ mergeLocal: true });
      setAuthMessage("Cadastro criado. Se for solicitado, confirme seu e-mail.");
      setAuthOpen(false);
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Não foi possível concluir a autenticação.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setCurrentUserEmail("");
    setIsAnonymousUser(true);
    await loadCloudData({ mergeLocal: true });
  }

  function applySessionState(session: Session | null) {
    setCurrentUserEmail(session?.user.email ?? "");
    setIsAnonymousUser(isAnonymousSession(session));
  }

  const categoryCounts = useMemo(
    () =>
      items.reduce<Record<string, number>>((acc, item) => {
        const key = categoryKey(item.category);
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {}),
    [items],
  );

  function openNewItemModal() {
    setEditingItemId(null);
    setCustomRule(defaultRule);
    setForm((current) => ({ ...emptyForm, startsOn: selectedDate, category: current.category || activeCategories[0]?.name || "rotina" }));
    setItemModalOpen(true);
  }

  function openEditItemModal(item: RouteItem) {
    setEditingItemId(item.id);
    setForm({
      title: item.title,
      description: item.description,
      category: item.category,
      startsOn: item.startsOn,
      startTime: item.startTime,
      endTime: item.endTime,
      repeatType: item.repeatType,
    });
    setCustomRule(item.customRule);
    setItemModalOpen(true);
  }

  function closeItemModal() {
    setEditingItemId(null);
    setItemModalOpen(false);
  }

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.title.trim()) return;
    const currentItem = editingItemId ? items.find((item) => item.id === editingItemId) : null;

    const nextItem: RouteItem = {
      id: editingItemId ?? crypto.randomUUID(),
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category || activeCategories[0]?.name || "rotina",
      startsOn: form.startsOn,
      startTime: form.startTime,
      endTime: form.endTime,
      repeatType: form.repeatType,
      customRule,
      active: currentItem?.active ?? true,
    };

    setItems((current) => (editingItemId ? current.map((item) => (item.id === editingItemId ? nextItem : item)) : [...current, nextItem]));
    setForm({ ...emptyForm, startsOn: selectedDate, category: activeCategories[0]?.name || "rotina" });
    closeItemModal();

    if (supabase) {
      const query = editingItemId
        ? supabase.from("route_items").update(toDbItem(nextItem)).eq("id", editingItemId)
        : supabase.from("route_items").insert(toDbItem(nextItem));
      const { error } = await query;
      setSyncState(error ? "local" : "supabase");
    }
  }

  async function toggleItem(itemId: string, dateValue = selectedDate) {
    const currentValue = Boolean(completions[itemId]?.[dateValue]);
    const nextValue = !currentValue;
    setCompletions((current) => ({
      ...current,
      [itemId]: {
        ...current[itemId],
        [dateValue]: nextValue,
      },
    }));

    if (supabase) {
      const { error } = await supabase.from("route_completions").upsert(
        {
          item_id: itemId,
          completed_on: dateValue,
          completed: nextValue,
        },
        { onConflict: "item_id,completed_on" },
      );
      setSyncState(error ? "local" : "supabase");
    }
  }

  async function removeItem(itemId: string) {
    setItems((current) => current.filter((item) => item.id !== itemId));
    setCompletions((current) => {
      const next = { ...current };
      delete next[itemId];
      return next;
    });

    if (supabase) {
      const { error } = await supabase.from("route_items").delete().eq("id", itemId);
      setSyncState(error ? "local" : "supabase");
    }
  }

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newCategory.trim();
    if (!name) return;
    if (categories.some((category) => category.name.toLowerCase() === name.toLowerCase())) {
      setNewCategory("");
      return;
    }

    const nextCategory: RouteCategory = {
      id: crypto.randomUUID(),
      name,
      color: donutColors[categories.length % donutColors.length],
      active: true,
    };

    setCategories((current) => [...current, nextCategory]);
    setNewCategory("");

    if (supabase) {
      const { error } = await supabase.from("route_categories").insert(toDbCategory(nextCategory));
      setSyncState(error ? "local" : "supabase");
    }
  }

  function startEditCategory(category: RouteCategory) {
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.name);
  }

  function cancelEditCategory() {
    setEditingCategoryId(null);
    setEditingCategoryName("");
  }

  async function saveCategory(categoryId: string) {
    const name = editingCategoryName.trim();
    const category = categories.find((current) => current.id === categoryId);
    if (!category || !name) return;
    if (categories.some((current) => current.id !== categoryId && categoryKey(current.name) === categoryKey(name))) return;

    const oldName = category.name;
    const itemIdsToUpdate = items.filter((item) => categoryKey(item.category) === categoryKey(oldName)).map((item) => item.id);
    setCategories((current) => current.map((item) => (item.id === categoryId ? { ...item, name } : item)));
    setItems((current) => current.map((item) => (categoryKey(item.category) === categoryKey(oldName) ? { ...item, category: name } : item)));
    setForm((current) => (categoryKey(current.category) === categoryKey(oldName) ? { ...current, category: name } : current));
    cancelEditCategory();

    if (supabase) {
      const categoryResponse = await supabase.from("route_categories").update({ name }).eq("id", categoryId);
      let itemsError = null;
      if (itemIdsToUpdate.length) {
        const itemsResponse = await supabase.from("route_items").update({ category: name }).in("id", itemIdsToUpdate);
        itemsError = itemsResponse.error;
      }
      setSyncState(categoryResponse.error || itemsError ? "local" : "supabase");
    }
  }

  async function removeCategory(categoryId: string) {
    const category = categories.find((current) => current.id === categoryId);
    const nextCategories = categories.filter((current) => current.id !== categoryId);
    setCategories(nextCategories);
    if (editingCategoryId === categoryId) {
      cancelEditCategory();
    }
    if (category && form.category === category.name) {
      setForm((current) => ({ ...current, category: nextCategories[0]?.name || "rotina" }));
    }

    if (supabase) {
      const { error } = await supabase.from("route_categories").delete().eq("id", categoryId);
      setSyncState(error ? "local" : "supabase");
    }
  }

  function chooseRepeatType(repeatType: RepeatType) {
    setForm((current) => ({ ...current, repeatType }));
    if (repeatType === "custom") {
      setCustomOpen(true);
    }
  }

  const userIsLoggedIn = Boolean(currentUserEmail && !isAnonymousUser);

  function renderAuthCard(showClose: boolean) {
    return (
      <section className="auth-card">
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Conta</p>
            <h2>{authMode === "forgot" ? "Recuperar senha" : authMode === "signup" ? "Criar cadastro" : "Entrar"}</h2>
          </div>
          {showClose && (
            <button className="icon-button" type="button" onClick={() => setAuthOpen(false)} aria-label="fechar">
              <X size={18} />
            </button>
          )}
        </div>

        <div className="segmented-control auth-tabs" aria-label="alternar acesso">
          <button className={authMode === "login" ? "active" : ""} type="button" onClick={() => openAuth("login")}>
            Login
          </button>
          <button className={authMode === "signup" ? "active" : ""} type="button" onClick={() => openAuth("signup")}>
            Cadastro
          </button>
        </div>

        <form className="auth-form" onSubmit={submitAuth}>
          <label>
            E-mail
            <input
              type="email"
              value={authEmail}
              onChange={(event) => setAuthEmail(event.target.value)}
              placeholder="seuemail@exemplo.com"
              required
            />
          </label>

          {authMode !== "forgot" && (
            <label>
              Senha
              <input
                type="password"
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                placeholder="mínimo de 6 caracteres"
                minLength={6}
                required
              />
            </label>
          )}

          {authMessage && <p className="auth-message">{authMessage}</p>}

          <button className="primary-button" type="submit" disabled={authLoading}>
            {authLoading ? "Aguarde..." : authMode === "forgot" ? "Enviar link" : authMode === "signup" ? "Cadastrar" : "Entrar"}
          </button>
        </form>

        <button className="link-button" type="button" onClick={() => openAuth(authMode === "forgot" ? "login" : "forgot")}>
          {authMode === "forgot" ? "Voltar ao login" : "Esqueceu sua senha?"}
        </button>
      </section>
    );
  }

  if (!userIsLoggedIn) {
    return (
      <main className="auth-shell">
        <img className="auth-logo" src="/rota-do-dia-logo.png" alt="Rota do dia" />
        {renderAuthCard(false)}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div className="brand-block">
          <img className="app-logo" src="/rota-do-dia-logo.png" alt="Rota do dia" />
        </div>
        <div className="top-actions">
          <button className="ghost-button account-button" type="button" onClick={() => openAuth("login")}>
            <UserRound size={18} />
            {currentUserEmail || "Entrar / cadastrar"}
          </button>
          {currentUserEmail && !isAnonymousUser && (
            <button className="icon-button account-logout" type="button" onClick={signOut} aria-label="sair da conta">
              <LogOut size={18} />
            </button>
          )}
          <button
            className="primary-button add-item-button"
            type="button"
            onClick={openNewItemModal}
          >
            <Plus size={18} />
            Cadastrar item
          </button>
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="panel progress-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Performance</p>
              <h2>{performanceSummary.percent}% concluído</h2>
            </div>
            <CheckCircle2 />
          </div>
          <div className="progress-ring" style={{ "--value": `${performanceSummary.percent * 3.6}deg` } as React.CSSProperties}>
            <span>{performanceSummary.done}/{performanceSummary.total}</span>
          </div>
          <div className="mini-bars" aria-label="desempenho dos últimos sete dias">
            {performance.map((item) => (
              <div className="mini-bar" key={item.date}>
                <span style={{ height: `${Math.max(item.percent, 6)}%` }} />
                <small>{item.label}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="panel time-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Tempo</p>
              <h2>{formatMinutes(totalMinutes)}</h2>
            </div>
            <PieChart />
          </div>
          <div className="time-donut-layout">
            <div className="time-donut" style={{ "--segments": timeGradient } as React.CSSProperties}>
              <span>{formatMinutes(totalMinutes)}</span>
            </div>
            <div className="time-list">
              {occupancy.map((entry, index) => (
                <div className="time-legend-row" key={entry.category}>
                  <i style={{ background: donutColors[index % donutColors.length] }} />
                  <div>
                    <strong>{entry.category}</strong>
                    <span>{formatMinutes(entry.minutes)}</span>
                  </div>
                </div>
              ))}
              {!occupancy.length && <p className="muted">Sem horários cadastrados para este dia.</p>}
            </div>
          </div>
          {biggestBlock && <p className="insight">Maior bloco: {biggestBlock.category}.</p>}
        </article>
      </section>

      <section className="route-section">
        <div className="route-toolbar">
          <div>
            <p className="eyebrow">{sectionMode === "checklist" ? "Agenda" : "Categorias"}</p>
            <h2>{sectionMode === "checklist" ? (viewMode === "day" ? formatDateLabel(selectedDate) : formatWeekRange(weekDays)) : "Pré-cadastros"}</h2>
          </div>
          <div className="route-controls">
            <div className="segmented-control section-tabs" aria-label="alternar seção">
              <button className={sectionMode === "checklist" ? "active" : ""} type="button" onClick={() => setSectionMode("checklist")}>
                Checklist
              </button>
              <button className={sectionMode === "categories" ? "active" : ""} type="button" onClick={() => setSectionMode("categories")}>
                Categorias
              </button>
            </div>
            {sectionMode === "checklist" && (
              <>
                <div className="segmented-control" aria-label="alternar visualização">
                  <button className={viewMode === "day" ? "active" : ""} type="button" onClick={() => setViewMode("day")}>
                    Dia
                  </button>
                  <button className={viewMode === "week" ? "active" : ""} type="button" onClick={() => setViewMode("week")}>
                    Semana
                  </button>
                </div>
                <div className="date-navigation">
                  <button className="icon-button date-arrow" type="button" onClick={() => moveSelectedDate(-1)} aria-label="período anterior">
                    <ChevronLeft size={18} />
                  </button>
                  <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
                  <button className="icon-button date-arrow" type="button" onClick={() => moveSelectedDate(1)} aria-label="próximo período">
                    <ChevronRight size={18} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {sectionMode === "categories" ? (
          <div className="categories-manager">
            <form className="category-form" onSubmit={addCategory}>
              <label>
                Nova categoria
                <input
                  value={newCategory}
                  onChange={(event) => setNewCategory(event.target.value)}
                  placeholder="Ex.: cliente, estudo, treino"
                />
              </label>
              <button className="primary-button" type="submit">
                <Plus size={18} />
                Adicionar categoria
              </button>
            </form>
            <div className="category-list">
              {activeCategories.map((category) => {
                const isEditing = editingCategoryId === category.id;
                const taskCount = categoryCounts[categoryKey(category.name)] ?? 0;

                return (
                  <article className="category-item" key={category.id}>
                    <div className="category-info">
                      <i style={{ background: category.color }} />
                      <Tag size={16} />
                      {isEditing ? (
                        <input
                          className="category-edit-input"
                          value={editingCategoryName}
                          onChange={(event) => setEditingCategoryName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              saveCategory(category.id);
                            }
                            if (event.key === "Escape") {
                              cancelEditCategory();
                            }
                          }}
                        />
                      ) : (
                        <div className="category-copy">
                          <strong>{category.name}</strong>
                          <span>{formatTaskCount(taskCount)}</span>
                        </div>
                      )}
                    </div>
                    <div className="category-actions">
                      {isEditing ? (
                        <>
                          <button className="icon-button" type="button" onClick={() => saveCategory(category.id)} aria-label="salvar categoria">
                            <Check size={18} />
                          </button>
                          <button className="icon-button" type="button" onClick={cancelEditCategory} aria-label="cancelar edição">
                            <X size={18} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="icon-button" type="button" onClick={() => startEditCategory(category)} aria-label="editar categoria">
                            <Pencil size={18} />
                          </button>
                          <button className="icon-button" type="button" onClick={() => removeCategory(category.id)} aria-label="remover categoria">
                            <Trash2 size={18} />
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : viewMode === "day" ? (
          <div className="route-list">
            {dayItems.map((item) => {
              const completed = Boolean(completions[item.id]?.[selectedDate]);
              return (
                <article className={`route-item ${completed ? "done" : ""}`} key={item.id}>
                  <button className={`check-button ${completed ? "checked" : ""}`} type="button" onClick={() => toggleItem(item.id)} aria-label="marcar item">
                    {completed && <Check size={18} />}
                  </button>
                  <div className="route-time">
                    <Clock3 size={16} />
                    {item.startTime} - {item.endTime}
                  </div>
                  <div className="route-copy">
                    <h3>{item.title}</h3>
                    {item.description && <p className="route-description">{item.description}</p>}
                    <p className="route-meta">{item.category} · {repeatLabel(item)}</p>
                  </div>
                  <div className="item-actions">
                    <button className="icon-button" type="button" onClick={() => openEditItemModal(item)} aria-label="editar item">
                      <Pencil size={18} />
                    </button>
                    <button className="icon-button" type="button" onClick={() => removeItem(item.id)} aria-label="remover">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </article>
              );
            })}
            {!dayItems.length && (
              <div className="empty-state">
                <CalendarDays />
                <p>Nenhum item para esta data.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="week-board">
            {weekDays.map((dateValue) => {
              const itemsForDay = items
                .filter((item) => item.active && occursOn(item, dateValue))
                .sort((a, b) => a.startTime.localeCompare(b.startTime));

              return (
                <div className={`week-column ${dateValue === selectedDate ? "selected" : ""}`} key={dateValue}>
                  <button className="week-day-header" type="button" onClick={() => setSelectedDate(dateValue)}>
                    <span>{weekdayShort(dateValue)}</span>
                    <strong>{fromDateInput(dateValue).getDate()}</strong>
                  </button>
                  <div className="week-items">
                    {itemsForDay.map((item) => {
                      const completed = Boolean(completions[item.id]?.[dateValue]);
                      return (
                        <button
                          className={`week-item ${completed ? "done" : ""}`}
                          key={`${dateValue}-${item.id}`}
                          type="button"
                          onClick={() => toggleItem(item.id, dateValue)}
                        >
                          <span>{item.startTime} - {item.endTime}</span>
                          <strong>{item.title}</strong>
                          {item.description && <small className="week-description">{item.description}</small>}
                          <small>{item.category}</small>
                        </button>
                      );
                    })}
                    {!itemsForDay.length && <p className="week-empty">Livre</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {authOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          {renderAuthCard(true)}
        </div>
      )}

      {itemModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="item-modal">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{editingItemId ? "Editar item" : "Novo item"}</p>
                <h2>{editingItemId ? "Editar tarefa" : "Adicionar tarefa"}</h2>
              </div>
              <button className="icon-button" type="button" onClick={closeItemModal} aria-label="fechar">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={saveItem} className="item-form">
              <label>
                Título
                <input
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  placeholder="Ex.: estudo, treino, reunião"
                />
              </label>
              <label>
                Descrição
                <textarea
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder="Detalhes do que precisa ser feito"
                  rows={3}
                />
              </label>
              <div className="form-row">
                <label>
                  Data
                  <input
                    type="date"
                    value={form.startsOn}
                    onChange={(event) => setForm({ ...form, startsOn: event.target.value })}
                  />
                </label>
                <label>
                  Categoria
                  <div className="select-wrap">
                    <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                      {activeCategories.map((category) => (
                        <option key={category.id} value={category.name}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown />
                  </div>
                </label>
              </div>
              <div className="form-row">
                <label>
                  Início
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={(event) => setForm({ ...form, startTime: event.target.value })}
                  />
                </label>
                <label>
                  Fim
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={(event) => setForm({ ...form, endTime: event.target.value })}
                  />
                </label>
              </div>
              <label>
                Repetição
                <div className="select-wrap">
                  <select value={form.repeatType} onChange={(event) => chooseRepeatType(event.target.value as RepeatType)}>
                    <option value="none">Não se repete</option>
                    <option value="daily">Todos os dias</option>
                    <option value="weekly">Semanalmente</option>
                    <option value="weekdays">Dias úteis</option>
                    <option value="monthly">Mensalmente</option>
                    <option value="yearly">Anualmente</option>
                    <option value="custom">Personalizar...</option>
                  </select>
                  <ChevronDown />
                </div>
              </label>
              {form.repeatType === "custom" && (
                <button className="ghost-button" type="button" onClick={() => setCustomOpen(true)}>
                  Recorrência personalizada
                </button>
              )}
              <button className="primary-button" type="submit">
                <Plus size={18} />
                {editingItemId ? "Salvar" : "Adicionar"}
              </button>
            </form>
          </section>
        </div>
      )}

      {customOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="custom-modal">
            <h2>Recorrência personalizada</h2>
            <div className="inline-controls">
              <span>Repetir a cada:</span>
              <input
                type="number"
                min="1"
                value={customRule.interval}
                onChange={(event) => setCustomRule({ ...customRule, interval: Number(event.target.value) || 1 })}
              />
              <select
                value={customRule.unit}
                onChange={(event) => setCustomRule({ ...customRule, unit: event.target.value as CustomUnit })}
              >
                <option value="day">dia</option>
                <option value="week">semana</option>
                <option value="month">mês</option>
                <option value="year">ano</option>
              </select>
            </div>

            <div className="weekday-picker">
              <span>Repetir:</span>
              <div>
                {weekLabels.map((label, index) => (
                  <button
                    className={customRule.weekdays.includes(index) ? "active" : ""}
                    key={`${label}-${index}`}
                    type="button"
                    onClick={() => toggleWeekday(index, customRule, setCustomRule)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="ends-group">
              <span>Termina em</span>
              <label>
                <input
                  checked={customRule.ends === "never"}
                  name="ends"
                  type="radio"
                  onChange={() => setCustomRule({ ...customRule, ends: "never" })}
                />
                Nunca
              </label>
              <label>
                <input
                  checked={customRule.ends === "on"}
                  name="ends"
                  type="radio"
                  onChange={() => setCustomRule({ ...customRule, ends: "on" })}
                />
                Em
                <input
                  disabled={customRule.ends !== "on"}
                  type="date"
                  value={customRule.endDate ?? today}
                  onChange={(event) => setCustomRule({ ...customRule, endDate: event.target.value })}
                />
              </label>
              <label>
                <input
                  checked={customRule.ends === "after"}
                  name="ends"
                  type="radio"
                  onChange={() => setCustomRule({ ...customRule, ends: "after" })}
                />
                Após
                <input
                  disabled={customRule.ends !== "after"}
                  min="1"
                  type="number"
                  value={customRule.occurrences ?? 13}
                  onChange={(event) => setCustomRule({ ...customRule, occurrences: Number(event.target.value) || 1 })}
                />
                ocorrências
              </label>
            </div>

            <div className="modal-actions">
              <button className="ghost-button" type="button" onClick={() => setCustomOpen(false)}>
                Cancelar
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  setForm((current) => ({ ...current, repeatType: "custom" }));
                  setCustomOpen(false);
                }}
              >
                Concluir
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function readLocal<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function withItemDefaults(item: RouteItem): RouteItem {
  return {
    ...item,
    description: item.description ?? "",
  };
}

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromDateInput(value: string) {
  return new Date(`${value}T12:00:00`);
}

function addDays(value: string, days: number) {
  const date = fromDateInput(value);
  date.setDate(date.getDate() + days);
  return toDateInput(date);
}

function buildWeekDays(value: string) {
  const date = fromDateInput(value);
  const start = addDays(value, -date.getDay());
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function buildTrailingDays(value: string) {
  return Array.from({ length: 7 }, (_, index) => addDays(value, index - 6));
}

function formatWeekRange(days: string[]) {
  if (!days.length) return "";
  const first = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(fromDateInput(days[0]));
  const last = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(fromDateInput(days[6]));
  return `${first} - ${last}`;
}

function weekdayShort(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(fromDateInput(value)).replace(".", "");
}

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(fromDateInput(value));
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}min`;
  if (!rest) return `${hours}h`;
  return `${hours}h ${rest}min`;
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function duration(item: RouteItem) {
  const start = timeToMinutes(item.startTime);
  const end = timeToMinutes(item.endTime);
  return Math.max(end - start, 0);
}

function daysBetween(start: string, end: string) {
  const startDate = fromDateInput(start);
  const endDate = fromDateInput(end);
  return Math.floor((endDate.getTime() - startDate.getTime()) / 86400000);
}

function monthsBetween(start: string, end: string) {
  const startDate = fromDateInput(start);
  const endDate = fromDateInput(end);
  return (endDate.getFullYear() - startDate.getFullYear()) * 12 + endDate.getMonth() - startDate.getMonth();
}

function occursOn(item: RouteItem, dateValue: string) {
  if (dateValue < item.startsOn || !item.active) return false;

  const date = fromDateInput(dateValue);
  const start = fromDateInput(item.startsOn);
  const dayDiff = daysBetween(item.startsOn, dateValue);

  if (item.repeatType === "none") return dateValue === item.startsOn;
  if (item.repeatType === "daily") return true;
  if (item.repeatType === "weekly") return date.getDay() === start.getDay();
  if (item.repeatType === "weekdays") return date.getDay() >= 1 && date.getDay() <= 5;
  if (item.repeatType === "monthly") return date.getDate() === start.getDate();
  if (item.repeatType === "yearly") return date.getDate() === start.getDate() && date.getMonth() === start.getMonth();

  const rule = item.customRule;
  if (rule.ends === "on" && rule.endDate && dateValue > rule.endDate) return false;
  if (rule.ends === "after" && rule.occurrences && dayDiff > rule.occurrences * Math.max(rule.interval, 1) * 7) return false;

  if (rule.unit === "day") return dayDiff % Math.max(rule.interval, 1) === 0;
  if (rule.unit === "week") {
    const weekDiff = Math.floor(dayDiff / 7);
    return weekDiff % Math.max(rule.interval, 1) === 0 && rule.weekdays.includes(date.getDay());
  }
  if (rule.unit === "month") {
    const monthDiff = monthsBetween(item.startsOn, dateValue);
    return monthDiff % Math.max(rule.interval, 1) === 0 && date.getDate() === start.getDate();
  }
  const yearDiff = date.getFullYear() - start.getFullYear();
  return yearDiff % Math.max(rule.interval, 1) === 0 && date.getDate() === start.getDate() && date.getMonth() === start.getMonth();
}

function buildPerformance(items: RouteItem[], completions: CompletionMap, dates: string[]) {
  return dates.map((date) => {
    const due = items.filter((item) => occursOn(item, date));
    const done = due.filter((item) => completions[item.id]?.[date]).length;
    const percent = due.length ? Math.round((done / due.length) * 100) : 0;
    return {
      date,
      percent,
      label: new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(fromDateInput(date)).replace(".", ""),
    };
  });
}

function buildPerformanceSummary(items: RouteItem[], completions: CompletionMap, dates: string[]) {
  const summary = dates.reduce(
    (acc, date) => {
      const due = items.filter((item) => occursOn(item, date));
      const done = due.filter((item) => completions[item.id]?.[date]).length;
      return {
        done: acc.done + done,
        total: acc.total + due.length,
      };
    },
    { done: 0, total: 0 },
  );

  return {
    ...summary,
    percent: summary.total ? Math.round((summary.done / summary.total) * 100) : 0,
  };
}

function buildOccupancy(items: RouteItem[]) {
  const grouped = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = (acc[item.category] ?? 0) + duration(item);
    return acc;
  }, {});

  return Object.entries(grouped)
    .map(([category, minutes]) => ({ category, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
}

function buildDonutGradient(occupancy: Array<{ category: string; minutes: number }>, totalMinutes: number) {
  if (!totalMinutes) return "#eadcff 0deg 360deg";

  let cursor = 0;
  const segments = occupancy.map((entry, index) => {
    const start = cursor;
    const end = cursor + (entry.minutes / totalMinutes) * 360;
    cursor = end;
    return `${donutColors[index % donutColors.length]} ${start}deg ${end}deg`;
  });

  return segments.join(", ");
}

function repeatLabel(item: RouteItem) {
  if (item.repeatType === "none") return "não se repete";
  if (item.repeatType === "daily") return "todos os dias";
  if (item.repeatType === "weekly") return `semanal: cada ${fullWeekLabels[fromDateInput(item.startsOn).getDay()]}`;
  if (item.repeatType === "weekdays") return "segunda a sexta";
  if (item.repeatType === "monthly") return "mensalmente";
  if (item.repeatType === "yearly") return "anualmente";
  return `a cada ${item.customRule.interval} ${unitLabel(item.customRule.unit)}`;
}

function unitLabel(unit: CustomUnit) {
  if (unit === "day") return "dia(s)";
  if (unit === "week") return "semana(s)";
  if (unit === "month") return "mês(es)";
  return "ano(s)";
}

function categoryKey(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function itemMergeKey(item: RouteItem) {
  return [categoryKey(item.title), item.startsOn, item.startTime, item.endTime].join("|");
}

function isAnonymousSession(session: Session | null) {
  return Boolean(!session?.user.email || (session.user as { is_anonymous?: boolean }).is_anonymous);
}

function formatTaskCount(count: number) {
  return `${count} ${count === 1 ? "tarefa" : "tarefas"}`;
}

function toggleWeekday(index: number, rule: CustomRule, setRule: (rule: CustomRule) => void) {
  const exists = rule.weekdays.includes(index);
  const weekdays = exists ? rule.weekdays.filter((day) => day !== index) : [...rule.weekdays, index].sort();
  setRule({ ...rule, weekdays: weekdays.length ? weekdays : [index] });
}

function toDbItem(item: RouteItem) {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    category: item.category,
    starts_on: item.startsOn,
    start_time: item.startTime,
    end_time: item.endTime,
    repeat_type: item.repeatType,
    custom_rule: item.customRule,
    active: item.active,
  };
}

function fromDbItem(item: DbItem): RouteItem {
  return {
    id: item.id,
    title: item.title,
    description: item.description ?? "",
    category: item.category,
    startsOn: item.starts_on,
    startTime: item.start_time.slice(0, 5),
    endTime: item.end_time.slice(0, 5),
    repeatType: item.repeat_type,
    customRule: item.custom_rule,
    active: item.active,
  };
}

function toDbCategory(category: RouteCategory) {
  return {
    id: category.id,
    name: category.name,
    color: category.color,
    active: category.active,
  };
}

function fromDbCategory(category: DbCategory): RouteCategory {
  return {
    id: category.id,
    name: category.name,
    color: category.color,
    active: category.active,
  };
}

function fromDbCompletions(rows: DbCompletion[]) {
  return rows.reduce<CompletionMap>((acc, row) => {
    acc[row.item_id] = {
      ...acc[row.item_id],
      [row.completed_on]: row.completed,
    };
    return acc;
  }, {});
}
