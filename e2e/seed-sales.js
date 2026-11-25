/* Sample sales-system bookings, Early Check-In states and sync history for the
 * e2e run and the Product Guide screenshots (called from seed.js).
 * ISOLATED DB ONLY — every person, Booking ID and payment reference here is invented.
 * Nothing is ever sent: the isolated API has no mail server and no sales system. */
const crypto = require("crypto");
const path = require("path");
const API = path.resolve(__dirname, "../../big-api");
const Ticket = require(API + "/src/models/ticket");
const ShopCart = require(API + "/src/models/shopcart");
const Event = require(API + "/src/models/event");
const { SalesSyncState, SalesSyncLog } = require(API + "/src/models/salesSync");

const DAY = 24 * 3600 * 1000;
/** A time given in India time ('YYYY-MM-DD', h, m) as a Date. */
const ist = (d, h, m) => new Date(new Date(d + "T00:00:00Z").getTime() + (h * 60 + m - 330) * 60000);
const hashOf = (token) => crypto.createHash("sha256").update(token).digest("hex");

async function seedSalesBookings({ ev, P, T, tlBox, dir }) {
  const now = Date.now();

  // ── the event takes the sales system's bookings; its Early Check-In wording
  await Event.updateOne({ _id: ev._id }, {
    salesSync: true,
    checkinEmail: { subject: "BiG 7.0: tell us who is coming",
      intro: "Please add the name, phone, email and gender of everyone on your booking, so entry at the gate is quick." }
  });

  // [key, reference, first, last, email, phone, kind, paidAt, items: [passType, name|null, gender|null], extra]
  const X = [
    ["Ritu", "BLM-24031", "Ritu", "Chawla", "ritu@example.com", "9800000501", "online", ist("2026-10-20", 18, 42),
      [["Festival Pass", "Ritu Chawla", "Female"], ["Festival Pass", null, null]], {}],
    ["RituStay", "BLM-24032", "Ritu", "Chawla", "ritu@example.com", "9800000501", "online", ist("2026-10-20", 18, 47),
      [["Two-Person Tent", null, null]], { linkedReferences: ["BLM-24031"] }],
    ["Joel", "BLM-24040", "Joel", "Fernandes", "joel@example.com", "9800000502", "offline", ist("2026-10-22", 11, 5),
      [["Festival Pass", "Joel Fernandes", "Male"], ["Parking", null, null]], {}],
    ["Hari", "BLM-24050", "Hari", "Prasad", "hari@example.com", "9800000503", "guest_list", null,
      [["Festival Pass", "Hari Prasad", "Male"]], {}],
    ["Pooja", "BLM-24045", "Pooja", "Iyengar", "pooja@example.com", "9800000504", "online", ist("2026-10-21", 9, 30),
      [["Day Pass", "Pooja Iyengar", "Female"]], { cancelled: true }]
  ];
  const prices = { "Festival Pass": 4999, "Day Pass": 1999, "Two-Person Tent": 3499, "Family Tent": 5999, "Parking": 499 };
  const out = {};
  let n = 0;
  for (const [key, reference, first, last, email, phone, kind, paidAt, items, extra] of X) {
    const ids = [];
    for (const [ptName, name, gender] of items) {
      const pt = P[ptName];
      const holder = name === first + " " + last;
      const sc = await ShopCart.create({ item_name: ptName, item_quantity: 1, order_id: null, isAdmitted: false,
        name: name || "", phone_no: holder ? phone : "", email: holder ? email : "", gender: gender || null,
        isActive: !extra.cancelled, event: ev._id, passType: pt._id, category: pt.category, passTypeName: pt.name,
        bookingId: reference, externalLineId: `L-${reference}-${++n}` });
      ids.push(sc._id);
    }
    out[key] = await Ticket.create({ order_id: null, transaction_id: null, first_name: first, last_name: last, email, phone_no: phone,
      totalPrice: items.reduce((s, [pt]) => s + prices[pt], 0), shopcart: ids, event: ev._id,
      reference, kind, paidAt, source: "external",
      paymentOrderId: kind === "guest_list" ? reference : `order_SAMPLE${reference.slice(-5)}`,
      paymentId: kind === "online" ? `pay_SAMPLE${reference.slice(-5)}` : null,
      sourceUpdatedAt: paidAt || ist("2026-10-23", 10, 0),
      ...(extra.linkedReferences ? { linkedReferences: extra.linkedReferences } : {}),
      bookingStatus: extra.cancelled ? "cancelled" : "paid",
      ...(extra.cancelled ? { cancelledAt: ist("2026-10-25", 16, 10), cancelledPassIds: ids } : {}),
      ticketEmail: { status: extra.cancelled ? "not_sent" : "sent", sentAt: extra.cancelled ? null : ist("2026-10-23", 10, 5), error: null } });
  }

  // ── Early Check-In: one live link with a known secret (for the participant form
  // screenshot), plus each other status. Only the hash is stored, as the app does.
  const checkinToken = crypto.randomBytes(32).toString("base64url");
  const sent = (t, status, sentAt, expiresAt, extra = {}) => Ticket.collection.updateOne({ _id: t._id }, { $set: {
    earlyCheckin: { status, sentAt, expiresAt, submittedAt: null, error: null, sentBy: tlBox._id,
      tokenHash: hashOf(extra.token || crypto.randomBytes(32).toString("base64url")), ...extra.set } } });
  await sent(out.Ritu, "sent", new Date(now - 2 * DAY), new Date(now + 12 * DAY), { token: checkinToken });
  await sent(T.Aditya, "sent", new Date(now - 3 * DAY), new Date(now + 11 * DAY));
  await sent(T.Divya, "sent", new Date(now - 20 * DAY), new Date(now - 6 * DAY));            // shows Expired
  await sent(out.Joel, "submitted", new Date(now - 4 * DAY), new Date(now + 10 * DAY), { set: { submittedAt: new Date(now - 3 * DAY) } });
  await Ticket.updateOne({ _id: T.Neha._id }, { earlyCheckin: { status: "failed", error: "Mail server did not respond, try again" } });

  // ── Sales sync history (no personal data: Booking IDs and counts only)
  const ago = (h) => new Date(now - h * 3600 * 1000);
  const L = [
    { via: "pull", kind: "pull", by: dir._id, at: ago(50), counts: { fetched: 9, created: 4, updated: 0, skipped: 5 },
      bookings: { created: ["BLM-24031", "BLM-24032", "BLM-24040", "BLM-24045"] } },
    { via: "webhook", kind: "booking.paid", at: ago(30), counts: { fetched: 1, created: 1 }, bookings: { created: ["BLM-24050"] }, sourceEventId: "evt_sample_101" },
    { via: "webhook", kind: "booking.updated", at: ago(26), counts: { fetched: 1, updated: 1 }, bookings: { updated: ["BLM-24031"] }, sourceEventId: "evt_sample_102" },
    { via: "webhook", kind: "booking.cancelled", at: ago(20), counts: { fetched: 1, cancelled: 1 }, bookings: { cancelled: ["BLM-24045"] }, sourceEventId: "evt_sample_103" },
    { via: "webhook", kind: "booking.paid", at: ago(6), counts: { fetched: 1, errors: 1 }, unknownCodes: ["vip-lounge"],
      problems: [{ reference: "BLM-24061", messages: ["Pass type not on this event yet"] }], sourceEventId: "evt_sample_104",
      alert: { users: 3, devices: 2, delivered: 2, held: false } },
    { via: "pull", kind: "pull", by: tlBox._id, at: ago(2), counts: { fetched: 6, skipped: 5, errors: 1 }, unknownCodes: ["vip-lounge"],
      problems: [{ reference: "BLM-24061", messages: ["Pass type not on this event yet"] }] }
  ];
  for (const l of L) await SalesSyncLog.create({ event: ev._id, ...l });
  await SalesSyncState.create({ event: ev._id, cursor: ago(2), pending: ["BLM-24061"], retryFrom: ago(7),
    waiting: [{ reference: "BLM-24061", messages: ["Pass type not on this event yet"],
      unknown: [{ externalCode: "vip-lounge", name: "VIP Lounge", category: "addon_pass", beds: 1 }], via: "pull", at: ago(2) }],
    lastPullAt: ago(2), lastWebhookAt: ago(6), lastAlertAt: ago(6) });

  return { extIds: Object.fromEntries(Object.entries(out).map(([k, t]) => [k, String(t._id)])), checkinToken };
}

module.exports = { seedSalesBookings };
