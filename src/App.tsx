import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  PieChart,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";

type RepeatType = "none" | "daily" | "weekly" | "weekdays" | "monthly" | "yearly" | "custom";
type CustomUnit = "day" | "week" | "month" | "year";

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
    category: "gestao",
    startsOn: today,
    startTime: "17:30",
    endTime: "18:00",
    repeatType: "daily",
    customRule: defaultRule,
    active: true,
  },
];

const emptyForm = {
  title: "",
  category: "rotina",
  startsOn: today,
  startTime: "09:00",
  endTime: "10:00",
  repeatType: "none" as RepeatType,
};

export function App() {
  const [items, setItems] = useState<RouteItem[]>(() => readLocal("rota_items", initialItems));
  const [completions, setCompletions] = useState<CompletionMap>(() => readLocal("rota_completions", {}));
  const [form, setForm] = useState(emptyForm);
  const [customRule, setCustomRule] = useState<CustomRule>(defaultRule);
  const [customOpen, setCustomOpen] = useState(false);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(today);
  const [viewMode, setViewMode] = useState<"day" | "week">("day");
  const [syncState, setSyncState] = useState("local");

  useEffect(() => {
    localStorage.setItem("rota_items", JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    localStorage.setItem("rota_completions", JSON.stringify(completions));
  }, [completions]);

  useEffect(() => {
    let cancelled = false;

    async function loadCloudData() {
      if (!supabase) return;
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        await supabase.auth.signInAnonymously();
      }

      const [itemsResponse, completionsResponse] = await Promise.all([
        supabase.from("route_items").select("*").order("start_time"),
        supabase.from("route_completions").select("*"),
      ]);

      if (cancelled) return;
      if (itemsResponse.error || completionsResponse.error) {
        setSyncState("local");
        return;
      }

      const remoteItems = (itemsResponse.data ?? []).map(fromDbItem);
      const remoteCompletions = fromDbCompletions(completionsResponse.data ?? []);
      if (remoteItems.length > 0) {
        setItems(remoteItems);
      }
      setCompletions(remoteCompletions);
      setSyncState("supabase");
    }

    loadCloudData();
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

  const doneToday = dayItems.filter((item) => completions[item.id]?.[selectedDate]).length;
  const todayPercent = dayItems.length ? Math.round((doneToday / dayItems.length) * 100) : 0;
  const performance = useMemo(() => buildPerformance(items, completions, selectedDate), [items, completions, selectedDate]);
  const occupancy = useMemo(() => buildOccupancy(dayItems), [dayItems]);
  const totalMinutes = occupancy.reduce((sum, item) => sum + item.minutes, 0);
  const biggestBlock = occupancy[0];
  const weekDays = useMemo(() => buildWeekDays(selectedDate), [selectedDate]);
  const timeGradient = buildDonutGradient(occupancy, totalMinutes);

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.title.trim()) return;

    const nextItem: RouteItem = {
      id: crypto.randomUUID(),
      title: form.title.trim(),
      category: form.category.trim() || "rotina",
      startsOn: form.startsOn,
      startTime: form.startTime,
      endTime: form.endTime,
      repeatType: form.repeatType,
      customRule,
      active: true,
    };

    setItems((current) => [...current, nextItem]);
    setForm({ ...emptyForm, startsOn: selectedDate });
    setItemModalOpen(false);

    if (supabase) {
      const { error } = await supabase.from("route_items").insert(toDbItem(nextItem));
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

  function chooseRepeatType(repeatType: RepeatType) {
    setForm((current) => ({ ...current, repeatType }));
    if (repeatType === "custom") {
      setCustomOpen(true);
    }
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Checklist</p>
          <h1>Rota do dia</h1>
        </div>
        <div className="top-actions">
          <div className="sync-pill">{syncState === "supabase" ? "Supabase ativo" : "Modo local"}</div>
          <button
            className="primary-button add-item-button"
            type="button"
            onClick={() => {
              setForm((current) => ({ ...current, startsOn: selectedDate }));
              setItemModalOpen(true);
            }}
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
              <h2>{todayPercent}% concluído</h2>
            </div>
            <CheckCircle2 />
          </div>
          <div className="progress-ring" style={{ "--value": `${todayPercent * 3.6}deg` } as React.CSSProperties}>
            <span>{doneToday}/{dayItems.length}</span>
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
            <p className="eyebrow">Agenda</p>
            <h2>{viewMode === "day" ? formatDateLabel(selectedDate) : formatWeekRange(weekDays)}</h2>
          </div>
          <div className="route-controls">
            <div className="segmented-control" aria-label="alternar visualização">
              <button className={viewMode === "day" ? "active" : ""} type="button" onClick={() => setViewMode("day")}>
                Dia
              </button>
              <button className={viewMode === "week" ? "active" : ""} type="button" onClick={() => setViewMode("week")}>
                Semana
              </button>
            </div>
            <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
          </div>
        </div>

        {viewMode === "day" ? (
          <div className="route-list">
            {dayItems.map((item) => {
              const completed = Boolean(completions[item.id]?.[selectedDate]);
              return (
                <article className={`route-item ${completed ? "done" : ""}`} key={item.id}>
                  <button className="check-button" type="button" onClick={() => toggleItem(item.id)}>
                    <CheckCircle2 />
                  </button>
                  <div className="route-time">
                    <Clock3 size={16} />
                    {item.startTime} - {item.endTime}
                  </div>
                  <div className="route-copy">
                    <h3>{item.title}</h3>
                    <p>{item.category} · {repeatLabel(item)}</p>
                  </div>
                  <button className="icon-button" type="button" onClick={() => removeItem(item.id)} aria-label="remover">
                    <Trash2 size={18} />
                  </button>
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

      {itemModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="item-modal">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Novo item</p>
                <h2>Adicionar tarefa</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setItemModalOpen(false)} aria-label="fechar">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={addItem} className="item-form">
              <label>
                Título
                <input
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  placeholder="Ex.: estudo, treino, reunião"
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
                  <input
                    value={form.category}
                    onChange={(event) => setForm({ ...form, category: event.target.value })}
                    placeholder="rotina"
                  />
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
                Adicionar
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

function buildPerformance(items: RouteItem[], completions: CompletionMap, selectedDate: string) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(selectedDate, index - 6);
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

function toggleWeekday(index: number, rule: CustomRule, setRule: (rule: CustomRule) => void) {
  const exists = rule.weekdays.includes(index);
  const weekdays = exists ? rule.weekdays.filter((day) => day !== index) : [...rule.weekdays, index].sort();
  setRule({ ...rule, weekdays: weekdays.length ? weekdays : [index] });
}

function toDbItem(item: RouteItem) {
  return {
    id: item.id,
    title: item.title,
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
    category: item.category,
    startsOn: item.starts_on,
    startTime: item.start_time.slice(0, 5),
    endTime: item.end_time.slice(0, 5),
    repeatType: item.repeat_type,
    customRule: item.custom_rule,
    active: item.active,
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
