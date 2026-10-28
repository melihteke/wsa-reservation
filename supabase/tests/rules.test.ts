import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Runs the real migrations in an in-process Postgres (PGlite) with a stubbed Supabase auth schema,
// then exercises every booking rule and the row level security as the roles Supabase uses.
// All bookings use "tomorrow" so the tests don't depend on the time of day they run.

const dir = join(import.meta.dirname, "..");
let db: PGlite;

const users: Record<string, string> = {};

async function addUser(key: string, email: string, name = key) {
  const res = await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values ($1, $2, '{"provider":"google"}') returning id`,
    [email, JSON.stringify({ full_name: name })],
  );
  users[key] = res.rows[0]!.id;
  return users[key]!;
}

async function as<T>(who: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${who ? "authenticated" : "anon"}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [who ? users[who]! : ""]);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

/** timestamptz for a local Amsterdam day offset and HH:MM. */
const at = (day: number, hhmm: string) =>
  `((now() at time zone 'Europe/Amsterdam')::date + ${day} + time '${hhmm}') at time zone 'Europe/Amsterdam'`;

async function book(who: string, equipment: string, day: number, hhmm: string, minutes: number) {
  return as(who, () => db.query<{ id: number }>(`select * from public.create_reservation($1, ${at(day, hhmm)}, $2)`, [equipment, minutes]));
}

async function bookError(who: string, equipment: string, day: number, hhmm: string, minutes: number) {
  try {
    await book(who, equipment, day, hhmm, minutes);
    return "ok";
  } catch (error) {
    return (error as Error).message;
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(join(dir, "tests", "supabase-stub.sql"), "utf8"));
  for (const file of readdirSync(join(dir, "migrations")).sort()) {
    await db.exec(readFileSync(join(dir, "migrations", file), "utf8"));
  }
  await db.exec(`insert into public.allowed_emails (email, role) values ('admin@wsa.nl', 'admin'), ('anna@wsa.nl', 'member'), ('bob@wsa.nl', 'member'), ('cem@wsa.nl', 'member'), ('dirk@wsa.nl', 'member'), ('eva@wsa.nl', 'member')`);
  await addUser("admin", "admin@wsa.nl", "Admin");
  await addUser("super", "melihteke@gmail.com", "Melih");
  for (const name of ["anna", "bob", "cem", "dirk", "eva"]) await addUser(name, `${name}@wsa.nl`);
  await addUser("stranger", "stranger@gmail.com", "Stranger");
}, 60_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec(`delete from public.reservations`);
});

describe("sign-in approval", () => {
  it("approves pre-approved emails with their role and leaves others pending", async () => {
    const { rows } = await db.query<{ email: string; role: string; status: string }>(
      `select email, role, status from public.profiles where email in ('admin@wsa.nl', 'anna@wsa.nl', 'stranger@gmail.com') order by email`,
    );
    expect(rows).toEqual([
      { email: "admin@wsa.nl", role: "admin", status: "approved" },
      { email: "anna@wsa.nl", role: "member", status: "approved" },
      { email: "stranger@gmail.com", role: "member", status: "pending" },
    ]);
  });

  it("does not let pending users book", async () => {
    expect(await bookError("stranger", "sup", 1, "10:00", 60)).toBe("not_approved");
  });

  it("approves a second account with the same email as an approved member", async () => {
    await addUser("anna2", "Anna@wsa.nl", "Anna via GitHub");
    const { rows } = await db.query<{ status: string }>(`select status from public.profiles where id = $1`, [users.anna2]);
    expect(rows[0]!.status).toBe("approved");
  });
});

describe("booking rules", () => {
  it("accepts 30 minutes to 3 hours in 30-minute steps", async () => {
    expect(await bookError("anna", "sup", 1, "10:00", 0)).toBe("invalid_duration");
    expect(await bookError("anna", "sup", 1, "10:00", 45)).toBe("invalid_duration");
    expect(await bookError("anna", "sup", 1, "10:00", 210)).toBe("invalid_duration");
    expect(await bookError("anna", "sup", 1, "10:00", 180)).toBe("ok");
  });

  it("requires a start on a 30-minute boundary", async () => {
    expect(await bookError("anna", "sup", 1, "10:15", 60)).toBe("invalid_start");
    expect(await bookError("anna", "sup", 1, "10:30", 60)).toBe("ok");
  });

  it("only allows today and tomorrow", async () => {
    expect(await bookError("anna", "sup", -1, "10:00", 60)).toBe("start_in_past");
    expect(await bookError("anna", "sup", 2, "10:00", 60)).toBe("outside_booking_window");
  });

  it("keeps bookings inside opening hours (09:00-21:00)", async () => {
    expect(await bookError("anna", "sup", 1, "08:30", 60)).toBe("outside_opening_hours");
    expect(await bookError("anna", "sup", 1, "19:30", 120)).toBe("outside_opening_hours");
    expect(await bookError("anna", "sup", 1, "18:00", 180)).toBe("ok");
  });

  it("follows opening hours changed by an admin", async () => {
    await db.exec(`update public.settings set open_time = '07:00'`);
    try {
      expect(await bookError("anna", "sup", 1, "07:00", 60)).toBe("ok");
    } finally {
      await db.exec(`update public.settings set open_time = '09:00'`);
    }
  });

  it("allows one upcoming or running reservation per member", async () => {
    const first = await book("anna", "sup", 1, "10:00", 60);
    expect(await bookError("anna", "windsurf", 1, "15:00", 60)).toBe("already_has_reservation");
    await as("anna", () => db.query(`select public.cancel_reservation($1)`, [first.rows[0]!.id]));
    expect(await bookError("anna", "windsurf", 1, "15:00", 60)).toBe("ok");
  });

  it("rejects unknown equipment", async () => {
    expect(await bookError("anna", "jetski", 1, "10:00", 60)).toBe("unknown_equipment");
  });

  it("enforces capacity using the peak overlap, not the total overlap", async () => {
    // Kielboot ×2: 10-11 and 11-12 never overlap each other, so a 10-12 booking still fits.
    expect(await bookError("anna", "kielboot", 1, "10:00", 60)).toBe("ok");
    expect(await bookError("bob", "kielboot", 1, "11:00", 60)).toBe("ok");
    expect(await bookError("cem", "kielboot", 1, "10:00", 120)).toBe("ok");
    // 10:30-11:30 now overlaps two boats at 10:30.
    expect(await bookError("dirk", "kielboot", 1, "10:30", 60)).toBe("fully_booked");
    // Right after everyone is back it's free again.
    expect(await bookError("dirk", "kielboot", 1, "12:00", 60)).toBe("ok");
  });

  it("ignores cancelled reservations for capacity", async () => {
    await db.exec(`update public.equipment_types set quantity = 1 where slug = 'kielboot'`);
    try {
      const first = await book("anna", "kielboot", 1, "10:00", 60);
      expect(await bookError("bob", "kielboot", 1, "10:00", 60)).toBe("fully_booked");
      await as("anna", () => db.query(`select public.cancel_reservation($1)`, [first.rows[0]!.id]));
      expect(await bookError("bob", "kielboot", 1, "10:00", 60)).toBe("ok");
    } finally {
      await db.exec(`update public.equipment_types set quantity = 2 where slug = 'kielboot'`);
    }
  });
});

describe("cancelling", () => {
  it("lets members cancel only their own reservations, admins any", async () => {
    const res = await book("anna", "sup", 1, "10:00", 60);
    const id = res.rows[0]!.id;
    await expect(as("bob", () => db.query(`select public.cancel_reservation($1)`, [id]))).rejects.toThrow("not_found");
    await as("admin", () => db.query(`select public.cancel_reservation($1)`, [id]));
    const { rows } = await db.query<{ cancelled: boolean }>(`select cancelled_at is not null as cancelled from public.reservations where id = $1`, [id]);
    expect(rows[0]!.cancelled).toBe(true);
  });

  it("ends a running reservation now instead of cancelling it", async () => {
    const { rows } = await db.query<{ id: number }>(
      `insert into public.reservations (user_id, equipment, start_at, end_at) values ($1, 'sup', now() - interval '1 hour', now() + interval '1 hour') returning id`,
      [users.anna],
    );
    const id = rows[0]!.id;
    await as("anna", () => db.query(`select public.cancel_reservation($1)`, [id]));
    const after = await db.query<{ cancelled: boolean; ended: boolean }>(
      `select cancelled_at is not null as cancelled, end_at <= now() as ended from public.reservations where id = $1`,
      [id],
    );
    expect(after.rows[0]).toEqual({ cancelled: false, ended: true });
  });
});

describe("row level security and visibility", () => {
  it("shows the live board with names to approved members only", async () => {
    await db.query(
      `insert into public.reservations (user_id, equipment, start_at, end_at) values ($1, 'windsurf', now() - interval '30 minutes', now() + interval '1 hour')`,
      [users.anna],
    );
    const member = await as("bob", () => db.query<{ full_name: string; is_mine: boolean }>(`select full_name, is_mine from public.live_board()`));
    expect(member.rows).toEqual([{ full_name: "anna", is_mine: false }]);
    const pending = await as("stranger", () => db.query(`select * from public.live_board()`));
    expect(pending.rows).toEqual([]);
    await expect(as(null, () => db.query(`select * from public.live_board()`))).rejects.toThrow(/permission denied/);
  });

  it("gives anonymous visitors counts only", async () => {
    await db.query(
      `insert into public.reservations (user_id, equipment, start_at, end_at) values ($1, 'windsurf', now() - interval '30 minutes', now() + interval '1 hour')`,
      [users.anna],
    );
    const { rows } = await as(null, () => db.query<{ slug: string; quantity: number; in_use: number }>(`select * from public.public_availability()`));
    expect(rows.find((r) => r.slug === "windsurf")).toEqual({ slug: "windsurf", quantity: 10, in_use: 1 });
    expect(rows.map((r) => r.slug)).toEqual(["laser-pico", "optimist", "kielboot", "waterfiets", "sup", "windsurf"]);
    const summary = await as(null, () => db.query<{ on_water: number }>(`select * from public.club_summary()`));
    expect(summary.rows[0]!.on_water).toBe(1);
    const anonRows = await as(null, () => db.query(`select * from public.reservations`));
    expect(anonRows.rows).toEqual([]);
  });

  it("hides reservations from pending users and blocks direct writes", async () => {
    await book("anna", "sup", 1, "10:00", 60);
    const pending = await as("stranger", () => db.query(`select * from public.reservations`));
    expect(pending.rows).toEqual([]);
    const member = await as("bob", () => db.query(`select * from public.reservations`));
    expect(member.rows).toHaveLength(1);
    await expect(
      as("bob", () => db.query(`insert into public.reservations (user_id, equipment, start_at, end_at) values ($1, 'sup', now(), now() + interval '1 hour')`, [users.bob])),
    ).rejects.toThrow(/permission denied/);
    await expect(as("bob", () => db.query(`update public.profiles set role = 'admin' where id = $1`, [users.bob]))).rejects.toThrow(/permission denied/);
  });

  it("lets members read only their own profile", async () => {
    const { rows } = await as("bob", () => db.query<{ email: string }>(`select email from public.profiles`));
    expect(rows).toEqual([{ email: "bob@wsa.nl" }]);
    const admin = await as("admin", () => db.query(`select email from public.profiles`));
    expect(admin.rows.length).toBeGreaterThan(5);
  });
});

describe("admin", () => {
  it("rejects admin RPCs from members", async () => {
    await expect(as("bob", () => db.query(`select public.admin_add_email('x@y.nl')`))).rejects.toThrow("not_admin");
    await expect(as("bob", () => db.query(`select * from public.admin_member_stats(now() - interval '1 year', now())`))).rejects.toThrow("not_admin");
  });

  it("approves a waiting user by adding their email", async () => {
    await addUser("frank", "frank@gmail.com");
    await as("admin", () => db.query(`select public.admin_add_email(' Frank@Gmail.com ')`));
    const { rows } = await db.query<{ status: string }>(`select status from public.profiles where id = $1`, [users.frank]);
    expect(rows[0]!.status).toBe("approved");
  });

  it("cannot change their own role or status", async () => {
    await expect(as("admin", () => db.query(`select public.admin_update_member($1, 'member', 'approved')`, [users.admin]))).rejects.toThrow("cannot_change_self");
  });

  it("blocking a member cancels their upcoming reservations and removes the pre-approval", async () => {
    await book("eva", "sup", 1, "10:00", 60);
    await as("admin", () => db.query(`select public.admin_update_member($1, 'member', 'blocked')`, [users.eva]));
    const res = await db.query<{ n: number }>(`select count(*)::int as n from public.reservations where user_id = $1 and cancelled_at is null`, [users.eva]);
    expect(res.rows[0]!.n).toBe(0);
    const allowed = await db.query(`select 1 from public.allowed_emails where email = 'eva@wsa.nl'`);
    expect(allowed.rows).toHaveLength(0);
    expect(await bookError("eva", "sup", 1, "12:00", 60)).toBe("not_approved");
  });

  it("reports per-member and per-equipment statistics", async () => {
    await book("anna", "sup", 1, "10:00", 60);
    await book("bob", "windsurf", 1, "10:00", 120);
    const members = await as("admin", () =>
      db.query<{ email: string; reservations: number; by_equipment: Record<string, number> }>(
        `select email, reservations, by_equipment from public.admin_member_stats(now() - interval '1 day', now() + interval '3 days') where reservations > 0 order by email`,
      ),
    );
    expect(members.rows).toEqual([
      { email: "anna@wsa.nl", reservations: 1, by_equipment: { sup: 1 } },
      { email: "bob@wsa.nl", reservations: 1, by_equipment: { windsurf: 1 } },
    ]);
    const equipment = await as("admin", () =>
      db.query<{ slug: string; reservations: number }>(`select slug, reservations from public.admin_equipment_stats(now() - interval '1 day', now() + interval '3 days')`),
    );
    expect(equipment.rows.find((r) => r.slug === "windsurf")!.reservations).toBe(1);
  });

  it("deletes a member with their login", async () => {
    await addUser("gina", "gina@gmail.com");
    await as("admin", () => db.query(`select public.admin_delete_member($1)`, [users.gina]));
    const { rows } = await db.query(`select 1 from auth.users where id = $1`, [users.gina]);
    expect(rows).toHaveLength(0);
  });
});

describe("super admin", () => {
  const rpc = (who: string, sql: string, params: unknown[] = []) => as(who, () => db.query(sql, params));
  const role = async (id: string) =>
    (await db.query<{ role: string; status: string }>(`select role, status from public.profiles where id = $1`, [id])).rows[0];

  it("makes melihteke@gmail.com the first super admin", async () => {
    expect(await role(users.super!)).toEqual({ role: "superadmin", status: "approved" });
    const admin = await rpc("super", `select public.is_admin() as a, public.is_superadmin() as s`);
    expect(admin.rows[0]).toEqual({ a: true, s: true });
  });

  it("can't be blocked, demoted or deleted by an admin", async () => {
    await expect(rpc("admin", `select public.admin_update_member($1, 'member', 'approved')`, [users.super])).rejects.toThrow("protected_superadmin");
    await expect(rpc("admin", `select public.admin_update_member($1, 'superadmin', 'blocked')`, [users.super])).rejects.toThrow("protected_superadmin");
    await expect(rpc("admin", `select public.admin_delete_member($1)`, [users.super])).rejects.toThrow("protected_superadmin");
    expect(await role(users.super!)).toEqual({ role: "superadmin", status: "approved" });
  });

  it("can't be deleted or changed by another super admin either", async () => {
    await addUser("super2", "second.super@gmail.com");
    await rpc("super", `select public.admin_update_member($1, 'superadmin', 'approved')`, [users.super2]);
    expect(await role(users.super2!)).toEqual({ role: "superadmin", status: "approved" });
    await expect(rpc("super2", `select public.admin_delete_member($1)`, [users.super])).rejects.toThrow("protected_superadmin");
    await expect(rpc("super", `select public.admin_update_member($1, 'member', 'approved')`, [users.super2])).rejects.toThrow("protected_superadmin");
  });

  it("only super admins can grant the super admin role", async () => {
    await addUser("hank", "hank@gmail.com");
    await expect(rpc("admin", `select public.admin_update_member($1, 'superadmin', 'approved')`, [users.hank])).rejects.toThrow("superadmin_only");
    await expect(rpc("admin", `select public.admin_add_email('x.super@gmail.com', 'superadmin')`)).rejects.toThrow("superadmin_only");
    await rpc("super", `select public.admin_add_email('new.super@gmail.com', 'superadmin')`);
    await addUser("newsuper", "new.super@gmail.com");
    expect(await role(users.newsuper!)).toEqual({ role: "superadmin", status: "approved" });
  });

  it("lets super admins create admins and members", async () => {
    await addUser("ivy", "ivy@gmail.com");
    await rpc("super", `select public.admin_update_member($1, 'admin', 'approved')`, [users.ivy]);
    expect(await role(users.ivy!)).toEqual({ role: "admin", status: "approved" });
    await rpc("super", `select public.admin_add_email('jo@gmail.com', 'member')`);
    await addUser("jo", "jo@gmail.com");
    expect(await role(users.jo!)).toEqual({ role: "member", status: "approved" });
  });

  it("lets admins block and delete other admins", async () => {
    await addUser("kim", "kim@gmail.com");
    await rpc("super", `select public.admin_update_member($1, 'admin', 'approved')`, [users.kim]);
    await rpc("admin", `select public.admin_update_member($1, 'admin', 'blocked')`, [users.kim]);
    expect(await role(users.kim!)).toEqual({ role: "admin", status: "blocked" });
    await rpc("admin", `select public.admin_delete_member($1)`, [users.kim]);
    expect((await db.query(`select 1 from public.profiles where id = $1`, [users.kim])).rows).toHaveLength(0);
  });

  it("protects super admin pre-approvals from admins", async () => {
    await expect(rpc("admin", `select public.admin_remove_email('melihteke@gmail.com')`)).rejects.toThrow("protected_superadmin");
    await expect(rpc("admin", `select public.admin_add_email('melihteke@gmail.com', 'member')`)).rejects.toThrow("protected_superadmin");
    const { rows } = await db.query<{ role: string }>(`select role from public.allowed_emails where email = 'melihteke@gmail.com'`);
    expect(rows[0]!.role).toBe("superadmin");
  });

  it("blocks direct writes to pre-approvals, even for admins", async () => {
    await expect(rpc("admin", `insert into public.allowed_emails (email, role) values ('sneaky@gmail.com', 'superadmin')`)).rejects.toThrow(/permission denied/);
    await expect(rpc("admin", `delete from public.allowed_emails where email = 'melihteke@gmail.com'`)).rejects.toThrow(/permission denied/);
    const read = await rpc("admin", `select email from public.allowed_emails where email = 'melihteke@gmail.com'`);
    expect(read.rows).toHaveLength(1);
  });

  it("doesn't let admins cancel a super admin's booking", async () => {
    const res = await book("super", "sup", 1, "10:00", 60);
    const id = res.rows[0]!.id;
    await expect(rpc("admin", `select public.cancel_reservation($1)`, [id])).rejects.toThrow("protected_superadmin");
    await rpc("super", `select public.cancel_reservation($1)`, [id]);
  });
});
