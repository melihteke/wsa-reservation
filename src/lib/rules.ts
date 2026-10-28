/**
 * Booking-time helpers for the UI. They mirror the rules in supabase/migrations/0002_functions.sql
 * (create_reservation) so the form only offers valid choices; the database stays the authority.
 */

export type BookingSettings = {
  open_time: string; // "09:00" or "09:00:00"
  close_time: string;
  max_minutes: number;
  step_minutes: number;
  booking_days: number;
  time_zone: string;
};

export const DEFAULT_SETTINGS: BookingSettings = {
  open_time: "09:00",
  close_time: "21:00",
  max_minutes: 180,
  step_minutes: 30,
  booking_days: 2,
  time_zone: "Europe/Amsterdam",
};

export type Interval = { start_at: string | Date; end_at: string | Date };

const pad = (n: number) => String(n).padStart(2, "0");

/** "09:30:00" -> 570 */
export function toMinutes(time: string) {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return h * 60 + m;
}

/** 570 -> "09:30" */
export function fromMinutes(minutes: number) {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** Wall-clock parts of an instant in a time zone. */
export function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  return { year, month, day, hour: get("hour"), minute: get("minute"), second: get("second"), date: `${year}-${pad(month)}-${pad(day)}` };
}

/** The instant at which the wall clock in timeZone shows `date` (YYYY-MM-DD) and `time` (HH:MM). */
export function zonedToUtc(date: string, time: string, timeZone: string) {
  const [y = 0, mo = 1, d = 1] = date.split("-").map(Number);
  const minutes = toMinutes(time);
  const wall = Date.UTC(y, mo - 1, d, Math.floor(minutes / 60), minutes % 60);
  let guess = wall;
  // Two passes settle the offset, including on DST switch days.
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(guess), timeZone);
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    guess += wall - shown;
  }
  return new Date(guess);
}

/** YYYY-MM-DD plus n days (calendar arithmetic, no time zone involved). */
export function addDays(date: string, days: number) {
  const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** Local days that can be booked right now: today, tomorrow, ... */
export function bookingDays(now: Date, settings: BookingSettings) {
  const today = zonedParts(now, settings.time_zone).date;
  return Array.from({ length: settings.booking_days }, (_, i) => addDays(today, i));
}

/** Start times ("HH:MM") still bookable on a local day. */
export function startSlots(day: string, now: Date, settings: BookingSettings) {
  const step = settings.step_minutes;
  const open = toMinutes(settings.open_time);
  const close = toMinutes(settings.close_time);
  const local = zonedParts(now, settings.time_zone);
  let earliest = open;
  if (day < local.date) return [];
  if (day === local.date) {
    const floor = Math.floor((local.hour * 60 + local.minute) / step) * step;
    earliest = Math.max(open, floor);
  }
  const first = Math.ceil(earliest / step) * step;
  const slots: string[] = [];
  for (let m = first; m + step <= close; m += step) slots.push(fromMinutes(m));
  return slots;
}

/** Durations (minutes) allowed for a start time. */
export function durationOptions(start: string, settings: BookingSettings) {
  const room = toMinutes(settings.close_time) - toMinutes(start);
  const max = Math.min(settings.max_minutes, room);
  const options: number[] = [];
  for (let m = settings.step_minutes; m <= max; m += settings.step_minutes) options.push(m);
  return options;
}

const ms = (value: string | Date) => (value instanceof Date ? value.getTime() : new Date(value).getTime());

/** Highest number of intervals in use at the same moment inside [start, end). */
export function peakUsage(intervals: Interval[], start: Date, end: Date) {
  const s = start.getTime();
  const e = end.getTime();
  const points = [s, ...intervals.map((i) => ms(i.start_at)).filter((t) => t > s && t < e)];
  let peak = 0;
  for (const t of points) {
    const count = intervals.filter((i) => ms(i.start_at) <= t && ms(i.end_at) > t).length;
    peak = Math.max(peak, count);
  }
  return peak;
}

/** "1 h 30 min" style label. */
export function formatMinutes(minutes: number, hourLabel = "h", minuteLabel = "min") {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} ${minuteLabel}`;
  return m ? `${h} ${hourLabel} ${m} ${minuteLabel}` : `${h} ${hourLabel}`;
}
