import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ListChecks,
  PieChart,
  Plus,
  Trash2,
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
  const [selectedDate, setSelectedDate] = useState(today);
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

    if (supabase) {
      const { error } = await supabase.from("route_items").insert(toDbItem(nextItem));
      setSyncState(error ? "local" : "supabase");
    }
  }

  async function toggleItem(itemId: string) {
    const currentValue = Boolean(completions[itemId]?.[selectedDate]);
    const nextValue = !currentValue;
    setCompletions((current) => ({
      ...current,
      [itemId]: {
        ...current[itemId],
        [selectedDate]: nextValue,
      },
    }));

    if (supabase) {
      const { error } = await supabase.from("route_completions").upsert(
        {
          item_id: itemId,
          completed_on: selectedDate,
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
        <div className="sync-pill">{syncState === "supabase" ? "Supabase ativo" : "Modo local"}</div>
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

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Tempo</p>
              <h2>{formatMinutes(totalMinutes)}</h2>
            </div>
            <PieChart />
          </div>
          <div className="time-list">
            {occupancy.map((entry) => (
              <div className="time-row" key={entry.category}>
                <div>
                  <strong>{entry.category}</strong>
                  <span>{formatMinutes(entry.minutes)}</span>
                </div>
                <div className="track">
                  <span style={{ width: `${totalMinutes ? (entry.minutes / totalMinutes) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
            {!occupancy.length && <p className="muted">Sem horarios cadastrados para este dia.</p>}
          </div>
          {biggestBlock && <p className="insight">Maior bloco: {biggestBlock.category}.</p>}
        </article>

        <article className="panel form-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Novo item</p>
              <h2>Adicionar tarefa</h2>
            </div>
            <Plus />
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
        </article>
      </section>

      <section className="route-section">
        <div className="route-toolbar">
          <div>
            <p className="eyebrow">Agenda</p>
            <h2>{formatDateLabel(selectedDate)}</h2>
          </div>
          <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
        </div>

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
      </section>

      <section className="panel all-items">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Checklist</p>
            <h2>Itens cadastrados</h2>
          </div>
          <ListChecks />
        </div>
        <div className="compact-grid">
          {items.map((item) => (
            <div className="compact-item" key={item.id}>
              <strong>{item.title}</strong>
              <span>{item.startTime} - {item.endTime} · {repeatLabel(item)}</span>
            </div>
          ))}
        </div>
      </section>

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
