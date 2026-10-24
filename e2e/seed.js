/* Sample data for the Playwright end-to-end run and the Product Guide screenshots.
 * ISOLATED DB ONLY (127.0.0.1:27018) — every person, booking and email here is invented.
 * Reuses big-api's own models from the sibling folder, so passwords are hashed and
 * defaults applied exactly as the real app does. Drops and refills the database each run. */
const path = require("path");
const API = path.resolve(__dirname, "../../big-api");
const URL = process.env.E2E_MONGODB_URL || "mongodb://127.0.0.1:27018/big_e2e";
if (!/^mongodb:\/\/127\.0\.0\.1:27018\//.test(URL)) throw new Error("Refusing: not the isolated e2e database (127.0.0.1:27018)");

const mongoose = require(API + "/node_modules/mongoose");
const Role = require(API + "/src/models/roles");
const Department = require(API + "/src/models/department");
const User = require(API + "/src/models/user");
const Event = require(API + "/src/models/event");
const PassType = require(API + "/src/models/passType");
const Ticket = require(API + "/src/models/ticket");
const ShopCart = require(API + "/src/models/shopcart");
const Tent = require(API + "/src/models/tent");
const Attendance = require(API + "/src/models/attendance");
const EmailLog = require(API + "/src/models/emailLog");
const seedPermissions = require(API + "/src/seeds/permissions.seed");
const seedRoles = require(API + "/src/seeds/roles.seed");
const seedDepartments = require(API + "/src/seeds/departments.seed");

const PW = "Demo@12345";
const day = (iso) => { const d = new Date(iso); d.setUTCHours(0, 0, 0, 0); return d; };

async function seed() {
  await mongoose.connect(URL);
  if (mongoose.connection.host !== "127.0.0.1" || mongoose.connection.port !== 27018) throw new Error("Refusing: unexpected host");
  await mongoose.connection.db.dropDatabase();

  await seedPermissions(); await seedRoles(); await seedDepartments();
  for (const name of ["Operations", "Hospitality"]) await Department.create({ name });
  const R = {}; for (const r of await Role.find()) R[r.name] = r._id;
  const D = {}; for (const d of await Department.find()) D[d.name] = d._id;
  await Department.updateOne({ name: "Box Office" }, { description: "Gate, registration and accommodation desk." });
  await Department.updateOne({ name: "Operations" }, { description: "Site setup, stages and on-ground coordination." });
  await Department.updateOne({ name: "Hospitality" }, { description: "Mess, green rooms and volunteer care." });

  const mk = async (name, email, role, dept, doj, extra = {}) => {
    const u = new User({ name, email, password: PW, role: R[role], dateOfJoining: new Date(doj),
      departments: dept ? [{ department: D[dept] }] : [], permissions: extra.permissions || [] });
    if (extra.inactive) { u.isActive = false; u.deactivatedAt = new Date("2026-10-05"); }
    await u.save(); return u;
  };
  const dir = await mk("Maya Fernandes", "maya.director@example.com", "DIR", null, "2025-06-01");
  await mk("Sam Patel", "sam.admin@example.com", "ADMIN", "General", "2025-07-15");
  const tlOps = await mk("Ravi Kumar", "ravi.ops@example.com", "TL", "Operations", "2025-09-01");
  await mk("Nina Das", "nina.boxoffice@example.com", "TL", "Box Office", "2025-09-01");
  const vols = [];
  vols.push(await mk("Anjali Rao", "anjali@example.com", "VOL", "Operations", "2026-09-20"));
  vols.push(await mk("Tom Mathew", "tom@example.com", "VOL", "Operations", "2026-09-20"));
  vols.push(await mk("Arjun Nair", "arjun@example.com", "VOL", "Operations", "2026-09-25", { permissions: ["box-office:read"] }));
  vols.push(await mk("Lina Joseph", "lina@example.com", "VOL", "Operations", "2026-10-01"));
  await mk("Kavya Menon", "kavya@example.com", "VOL", "Hospitality", "2026-09-28");
  await mk("Rohan Iyer", "rohan@example.com", "VOL", "Logistics", "2026-09-28");
  await mk("Ishaan Bose", "ishaan@example.com", "VOL", "Box Office", "2026-09-22");
  await mk("Meera Pillai", "meera@example.com", "VOL", null, "2026-10-02");
  await mk("Karthik Shenoy", "karthik@example.com", "VOL", "Logistics", "2025-01-10", { inactive: true });

  const ev = await Event.create({ name: "BiG 7.0", description: "Three-day music and arts festival.", startDate: new Date("2027-01-15"), endDate: new Date("2027-01-17"), status: "active", createdBy: dir._id });
  await Event.create({ name: "BiG 6.0", description: "Previous edition.", startDate: new Date("2026-01-16"), endDate: new Date("2026-01-18"), status: "archived", createdBy: dir._id });
  await Event.create({ name: "BiG Night 2.0", description: "One-night winter edition (planning).", startDate: new Date("2027-06-12"), endDate: new Date("2027-06-12"), status: "draft", createdBy: dir._id });
  const P = {};
  for (const [name, category, code] of [["Festival Pass", "festival"], ["Day Pass", "festival"], ["Two-Person Tent", "tent", "TW"], ["Family Tent", "tent", "FA"], ["Parking", "addon"]])
    P[name] = await PassType.create({ event: ev._id, name, category, ...(code ? { code } : {}) });

  const tents = {};
  for (let i = 1; i <= 6; i++) tents["TW" + i] = await Tent.create({ event: ev._id, passType: P["Two-Person Tent"]._id, tent_no: "TW" + i, capcity: 2, occupants: [null, null] });
  for (let i = 1; i <= 3; i++) tents["FA" + i] = await Tent.create({ event: ev._id, passType: P["Family Tent"]._id, tent_no: "FA" + i, capcity: 4, occupants: [null, null, null, null] });

  let order = 70001;
  // [first, last, email, phone, items:[ [passType, attendeeName|null, gender|null, admitted, tent|null] ], spot?, ticketEmailStatus]
  // Vikram Singh = a complete, NOT yet admitted Festival Pass with an unallocated Tent Pass,
  // so Admit, Link Band and Allocate Tent all show (used by tests and the booking-found screenshot).
  const B = [
    ["Asha", "Menon", "asha@example.com", "9800000101", [["Festival Pass", "Asha Menon", "Female", true, "TW1"], ["Festival Pass", "Priya Varma", "Female", true, "TW1"], ["Two-Person Tent"], ["Two-Person Tent"]], false, "sent"],
    ["Karan", "Shah", "karan@example.com", "9800000102", [["Festival Pass", "Karan Shah", "Male", true, null]], false, "sent"],
    ["Divya", "Krishnan", "divya@example.com", "9800000103", [["Festival Pass", "Divya Krishnan", "Female", false, null], ["Festival Pass", null, null, false, null], ["Parking"]], false, "bounced"],
    ["Rahul", "Verma", "rahul@example.com", "9800000104", [["Festival Pass", "Rahul Verma", "Male", true, "TW2"], ["Two-Person Tent"]], false, "not_sent"],
    ["Sana", "Khan", "sana@example.com", "9800000105", [["Festival Pass", "Sana Khan", "Female", true, "FA1"], ["Festival Pass", "Dev Khan", "Male", true, "FA1"], ["Festival Pass", "Zoya Khan", "Female", false, null], ["Family Tent"], ["Family Tent"]], false, "sent"],
    ["Neha", "Joshi", "neha@example.com", "9800000106", [["Day Pass", "Neha Joshi", "Female", false, null]], false, "failed"],
    ["Vikram", "Singh", "vikram@example.com", "9800000107", [["Festival Pass", "Vikram Singh", "Male", false, null], ["Two-Person Tent"]], false, "sent"],
    ["Elena", "Dsouza", "elena@example.com", "9800000108", [["Festival Pass", "Elena Dsouza", "Female", true, null]], true, "sent"],
    ["Aditya", "Rao", "aditya@example.com", "9800000109", [["Festival Pass", "Aditya Rao", "Male", false, null], ["Festival Pass", "Mira Rao", "Female", false, null], ["Parking"]], false, "not_sent"],
    ["Farah", "Ali", "", "9800000110", [["Day Pass", "Farah Ali", "Female", true, null]], true, "no_email"]
  ];
  const prices = { "Festival Pass": 4999, "Day Pass": 1999, "Two-Person Tent": 3499, "Family Tent": 5999, "Parking": 499 };
  const sentAt = (n) => new Date(Date.UTC(2026, 9, 12, 10, n));
  const ERR = { bounced: "Mailbox does not exist", failed: "Mail server did not respond, try again" };
  const T = {};
  for (const [first, last, email, phone, items, spot, status] of B) {
    const oid = order++, ids = [], made = [];
    for (const it of items) {
      const pt = P[it[0]];
      const sc = await ShopCart.create({ item_name: it[0], item_quantity: 1, order_id: oid, admissionId: null, isAdmitted: !!it[3],
        name: it[1] || "", phone_no: it[1] === first + " " + last ? phone : "", email: it[1] === first + " " + last ? email : "", isActive: true,
        gender: it[2] || null, event: ev._id, passType: pt._id, category: pt.category, passTypeName: pt.name });
      ids.push(sc._id); made.push({ it, sc });
    }
    // pair festival passes that have a tent with this booking's tent passes
    const tentPasses = made.filter(m => m.sc.category === "tent");
    for (const m of made.filter(m => m.sc.category === "festival" && m.it[4])) {
      const tp = tentPasses.shift(); if (!tp) break;
      const tent = tents[m.it[4]];
      const slot = tent.occupants.findIndex(o => o === null);
      tent.occupants[slot] = tp.sc._id; tent.markModified("occupants"); await tent.save();
      await ShopCart.updateOne({ _id: m.sc._id }, { allocatedTentId: tent._id, linkedPassId: tp.sc._id });
      await ShopCart.updateOne({ _id: tp.sc._id }, { allocatedTentId: tent._id, linkedPassId: m.sc._id, name: m.sc.name, phone_no: m.sc.phone_no, email: m.sc.email, gender: m.sc.gender });
    }
    const total = items.reduce((s, it) => s + prices[it[0]], 0);
    T[first] = await Ticket.create({ order_id: oid, transaction_id: spot ? "SPOT-" + (1767000000000 + oid) : "TXN" + oid, first_name: first, last_name: last,
      email, phone_no: phone, totalPrice: total, shopcart: ids, event: ev._id,
      ticketEmail: { status, sentAt: ["sent", "bounced"].includes(status) ? sentAt(oid % 60) : null, error: ERR[status] || null } });
  }

  // Ticket email wording for the active event
  await Event.updateOne({ _id: ev._id }, { ticketEmail: { subject: "Your BiG 7.0 tickets are here",
    intro: "Thank you for booking BiG 7.0! Show the QR code below at the gate and our team will get you in quickly." } });

  // Email log (sample) — what Admin › Email Report and each booking's Email history show
  const at = (h, m) => new Date(Date.UTC(2026, 9, 12, h, m));
  const del = (status, t, extra = {}) => ({ status, rank: 1, statusAt: t, lastEventAt: t, ...extra });
  const mkLog = (first, o) => EmailLog.create({ event: ev._id, ticket: T[first]._id, orderId: T[first].order_id,
    recipientName: first + " " + T[first].last_name, to: T[first].email, sentBy: dir._id, ...o });
  const SUBJ = "Your BiG 7.0 tickets are here";
  await mkLog("Asha", { type: "ticket", status: "sent", subject: SUBJ, sentAt: at(10, 1), providerMessageId: "<sample-1@example.com>",
    delivery: del("delivered", at(10, 2), { deliveredAt: at(10, 2), firstOpenedAt: at(11, 15), openCount: 3,
      events: [{ event: "delivered", at: at(10, 2) }, { event: "opened", at: at(11, 15) }] }) });
  await mkLog("Karan", { type: "ticket", status: "sent", subject: SUBJ, sentAt: at(10, 1), providerMessageId: "<sample-2@example.com>",
    delivery: del("delivered", at(10, 3), { deliveredAt: at(10, 3), events: [{ event: "delivered", at: at(10, 3) }] }) });
  await mkLog("Divya", { type: "ticket", status: "sent", subject: SUBJ, sentAt: at(10, 2), providerMessageId: "<sample-3@example.com>",
    delivery: del("bounced", at(10, 4), { reason: "Mailbox does not exist", events: [{ event: "hard_bounce", at: at(10, 4), reason: "Mailbox does not exist" }] }) });
  await mkLog("Sana", { type: "ticket", status: "sent", subject: SUBJ, sentAt: at(10, 2), providerMessageId: "<sample-4@example.com>",
    delivery: del("delivered", at(10, 3), { deliveredAt: at(10, 3), firstOpenedAt: at(13, 40), openCount: 1,
      events: [{ event: "delivered", at: at(10, 3) }, { event: "opened", at: at(13, 40) }] }) });
  await mkLog("Neha", { type: "ticket", status: "failed", subject: SUBJ, error: "Mail server did not respond, try again" });
  await mkLog("Vikram", { type: "ticket", status: "sent", subject: SUBJ, sentAt: at(10, 3), providerMessageId: "<sample-5@example.com>",
    delivery: del("delivered", at(10, 4), { deliveredAt: at(10, 4), events: [{ event: "delivered", at: at(10, 4) }] }) });
  await mkLog("Elena", { type: "ticket", status: "sent", subject: SUBJ, sentAt: at(16, 20), providerMessageId: "<sample-6@example.com>",
    delivery: del("delivered", at(16, 21), { deliveredAt: at(16, 21), events: [{ event: "delivered", at: at(16, 21) }] }) });
  const BODY = "<p>Hi {first_name},</p><p>Gates open at <b>2 pm on Friday</b>. Please bring a photo ID for everyone on booking #{order_id}.</p><ul><li>Carry a refillable water bottle</li><li>Parking opens at noon</li></ul><p>See you at {event}!</p>";
  for (const [i, first] of ["Asha", "Karan", "Sana"].entries())
    await mkLog(first, { type: "custom", status: "sent", subject: "Gate timings for BiG 7.0", body: BODY, includeTicket: false,
      sentAt: new Date(Date.UTC(2026, 9, 13, 9, i)), providerMessageId: `<sample-c${i}@example.com>`,
      delivery: del("delivered", new Date(Date.UTC(2026, 9, 13, 9, i + 1)), { deliveredAt: new Date(Date.UTC(2026, 9, 13, 9, i + 1)),
        events: [{ event: "delivered", at: new Date(Date.UTC(2026, 9, 13, 9, i + 1)) }] }) });
  // Back-date "created" to the send time, so the report reads like a real history
  for (const l of await EmailLog.find())
    await EmailLog.collection.updateOne({ _id: l._id }, { $set: { createdAt: l.sentAt || at(10, 2), updatedAt: l.sentAt || at(10, 2) } });

  // Attendance: Operations volunteers, last 7 days to 2026-10-10
  const slots = ["morning", "afternoon", "night"];
  for (let k = 0; k < 7; k++) {
    const d = day(new Date(Date.UTC(2026, 9, 10 - k)));
    for (const [i, v] of vols.entries()) {
      if (d < day(v.dateOfJoining)) continue;
      for (const [j, s] of slots.entries()) {
        if ((i + j + k) % 3 === 2) continue;           // some gaps
        const dept = (v.name === "Arjun Nair" && s === "afternoon" && k === 0) ? D["Box Office"] : D["Operations"];
        await Attendance.create({ user: v._id, department: dept, date: d, slot: s, markedBy: tlOps._id });
      }
    }
  }

  const summary = `${await User.countDocuments()} users, ${await Ticket.countDocuments()} bookings, ${await ShopCart.countDocuments()} passes, ${await Tent.countDocuments()} tents`;
  await mongoose.disconnect();
  // Ids the tests and screenshots need (e.g. to pick the active event, open a booking).
  const ids = { eventId: String(ev._id), tickets: Object.fromEntries(Object.entries(T).map(([k, t]) => [k, String(t._id)])) };
  require("fs").mkdirSync(path.join(__dirname, ".data"), { recursive: true });
  require("fs").writeFileSync(path.join(__dirname, ".data", "ids.json"), JSON.stringify(ids, null, 2));
  return summary;
}

module.exports = { seed, PW };
if (require.main === module) seed().then(s => console.log("Seeded:", s)).catch(e => { console.error(e); process.exit(1); });
