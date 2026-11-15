/* Sample Venue Map + Workshops data for the e2e run and the Product Guide
 * screenshots (called from seed.js). ISOLATED DB ONLY — every person, place
 * and workshop here is invented. The map sits on an invented open field, far
 * from any real festival site. The event runs yesterday → tomorrow (local
 * time) so the Planner's Now strip, the live map count and no-shows all show. */
const path = require("path");
const API = path.resolve(__dirname, "../../big-api");
const Department = require(API + "/src/models/department");
const Ticket = require(API + "/src/models/ticket");
const ShopCart = require(API + "/src/models/shopcart");
const Band = require(API + "/src/models/band");
const Location = require(API + "/src/models/location");
const Area = require(API + "/src/models/area");
const WorkshopCategory = require(API + "/src/models/workshopCategory");
const WorkshopVenue = require(API + "/src/models/workshopVenue");
const Workshop = require(API + "/src/models/workshop");
const WorkshopSession = require(API + "/src/models/workshopSession");
const WorkshopEntry = require(API + "/src/models/workshopEntry");

const MIN = 60000;
/** Local midnight `offset` days from today. */
const dayAt = (offset, h = 0, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); d.setDate(d.getDate() + offset); return d; };
/** A square shape around [lat, lng], `r` degrees from the middle. */
const square = ([lat, lng], r) => [[lat - r, lng - r], [lat - r, lng + r], [lat + r, lng + r], [lat + r, lng - r]];

async function seedWorkshops({ ev, P, mk, dir, tlBox, D }) {
  // ── department keys (the seeds upsert without the save hook) + a Workshop department
  for (const d of await Department.find({ key: { $exists: false } })) {
    await Department.updateOne({ _id: d._id }, { key: Department.defaultKeyFor(d.name) });   // a built-in key
  }
  const ws = await Department.create({ name: "Workshop", description: "Workshops: venues, schedule, lists and the door." });
  D["Workshop"] = ws._id;
  const tlWs = await mk("Tara Venkatesh", "tara.workshops@example.com", "TL", "Workshop", "2025-10-01");
  const volWs = await mk("Omar Siddiqui", "omar@example.com", "VOL", "Workshop", "2026-09-30");
  await mk("Leela Raman", "leela@example.com", "VOL", "Workshop", "2026-10-03");

  // ── the event runs yesterday → tomorrow
  await ev.updateOne({ startDate: dayAt(-1), endDate: dayAt(1) });

  // ── Venue Map: an invented open field
  const C = [20.9800, 79.3500];
  const at = (dLat, dLng) => [C[0] + dLat, C[1] + dLng];
  await Area.create({ event: ev._id, name: "Festival boundary", kind: "boundary", points: square(C, 0.004), createdBy: dir._id });
  const areaOf = {};
  for (const [name, mid] of [["Lawn Studio", at(0.0022, -0.0022)], ["Riverside Deck", at(-0.0020, -0.0024)], ["Banyan Circle", at(0.0021, 0.0021)]]) {
    areaOf[name] = await Area.create({ event: ev._id, name, kind: "workshop_area", points: square(mid, 0.0005), department: ws._id, createdBy: tlWs._id });
  }
  await Area.create({ event: ev._id, name: "North camping", kind: "camping", points: square(at(0.0028, 0.0002), 0.0007), department: D["Tenting"], createdBy: dir._id });
  await Area.create({ event: ev._id, name: "First aid camp", kind: "medical_camp", points: square(at(-0.0004, 0.0026), 0.0003), department: D["Operations"], createdBy: dir._id });
  await Area.create({ event: ev._id, name: "Main parking", kind: "parking", points: square(at(-0.0029, 0.0018), 0.0007), department: D["Logistics"], createdBy: dir._id });
  await Area.create({ event: ev._id, name: "Service road", kind: "road", points: [at(-0.0039, 0.0008), at(-0.0010, 0.0008), at(0.0010, 0.0011)], department: D["Logistics"], createdBy: dir._id });
  await Area.create({ event: ev._id, name: "Garden path", kind: "path", points: [at(0.0016, -0.0016), at(0.0004, -0.0004), at(0.0014, 0.0015)], department: D["Operations"], createdBy: dir._id });
  const pin = (name, type, [lat, lng], dept, notes = "") => Location.create({ event: ev._id, name, type, lat, lng, department: D[dept], notes, createdBy: dir._id });
  await pin("Main Stage", "stage", at(0.0002, 0.0000), "Operations", "Sound check 4 pm daily.");
  await pin("Water Station 1", "water", at(0.0008, -0.0010), "Operations");
  await pin("Water Station 2", "water", at(-0.0012, 0.0012), "Operations");
  await pin("Toilets — North", "toilets", at(0.0024, 0.0014), "Logistics");
  await pin("Gate A", "gate", at(-0.0038, 0.0008), "Box Office");
  await pin("Artists' entry", "entry", at(-0.0036, -0.0020), "Operations");
  await pin("Info tent", "other", at(-0.0008, -0.0004), "Box Office", "Lost & found, maps, charging.");

  // ── Workshops: categories, venues, workshops
  const cat = {};
  for (const c of [{ name: "Art", colour: "#ea580c", icon: "palette" }, { name: "Music", colour: "#7c3aed", icon: "music_note" }, { name: "Movement", colour: "#0d9488", icon: "directions_run" }]) {
    cat[c.name] = await WorkshopCategory.create(c);
  }
  const venue = {};
  for (const [name, capacity, area, amenities] of [["Lawn Studio", 12, "Lawn Studio", "Shade sail, 12 pottery wheels, wash basin"],
    ["Riverside Deck", 20, "Riverside Deck", "Wooden deck, mats, small sound system"],
    ["Banyan Circle", 20, "Banyan Circle", "Open circle under the tree, drums store"]]) {
    venue[name] = await WorkshopVenue.create({ event: ev._id, name, capacity, amenities, area: areaOf[area]._id, createdBy: tlWs._id });
  }
  const W = {};
  for (const [title, c, facilitators, extra] of [
    ["Clay & Coil Pottery", "Art", ["Anouk Visser"], { itemsRequired: "Clay, wheels, aprons", bringYourOwn: "Old clothes", ageLimit: "10+" }],
    ["Hand Drum Circle", "Music", ["Kofi Asante"], { itemsRequired: "20 djembes", language: "English" }],
    ["Sunrise Flow Yoga", "Movement", ["Lena Moreau"], { bringYourOwn: "Mat and water bottle", language: "English" }],
    ["Block Printing", "Art", ["Tenzin Dorje", "Rhea Saldanha"], { itemsRequired: "Blocks, fabric, dyes" }],
    ["Songwriting Lab", "Music", ["Rhea Saldanha"], { ageLimit: "14+" }]]) {
    W[title] = await Workshop.create({ event: ev._id, title, category: cat[c]._id, facilitators, description: `${title}: an invented sample workshop.`, ...extra, createdBy: tlWs._id });
  }

  // ── Sessions: yesterday (past), one running now, later today, tomorrow
  const now = new Date(); now.setSeconds(0, 0); now.setMinutes(Math.floor(now.getMinutes() / 5) * 5);
  const S = {};
  const sess = (key, title, v, start, end, extra = {}) => WorkshopSession.create({
    event: ev._id, workshop: W[title]._id, venue: venue[v]._id, start, end, createdBy: tlWs._id, ...extra
  }).then(s => (S[key] = s));
  await sess("pastClay", "Clay & Coil Pottery", "Lawn Studio", dayAt(-1, 9, 30), dayAt(-1, 11, 0), { preRegLimit: 8, cutoffAt: dayAt(-1, 9, 45) });
  await sess("pastDrums", "Hand Drum Circle", "Banyan Circle", dayAt(-1, 11, 30), dayAt(-1, 13, 0));
  await sess("pastSongs", "Songwriting Lab", "Riverside Deck", dayAt(-1, 15, 0), dayAt(-1, 16, 30), { facilitatorsOverride: ["Mira Joshi (substitute)"] });
  await sess("now", "Hand Drum Circle", "Banyan Circle", new Date(now - 40 * MIN), new Date(+now + 50 * MIN), { preRegLimit: 12, cutoffAt: new Date(now - 30 * MIN) });
  await sess("later", "Block Printing", "Lawn Studio", new Date(+now + 120 * MIN), new Date(+now + 210 * MIN));
  await sess("tYoga", "Sunrise Flow Yoga", "Riverside Deck", dayAt(1, 7, 0), dayAt(1, 8, 30), { regOpensAt: dayAt(0, 8, 0) });
  await sess("tClay", "Clay & Coil Pottery", "Lawn Studio", dayAt(1, 10, 0), dayAt(1, 11, 30), { preRegLimit: 10 });
  await sess("tSongs", "Songwriting Lab", "Riverside Deck", dayAt(1, 14, 0), dayAt(1, 15, 30));
  await sess("tDrums", "Hand Drum Circle", "Banyan Circle", dayAt(1, 16, 0), dayAt(1, 17, 30), { regManual: false, regManualBy: volWs._id, regManualAt: new Date() });

  // ── 15 more admitted Festival Pass holders, each with a wrist band (invented people)
  const people = ["Aarav Malhotra", "Bianca Lobo", "Chetan Gowda", "Diya Kapoor", "Esha Nambiar", "Farhan Qadri", "Gauri Deshpande",
    "Harsh Vardhan", "Ira Banerjee", "Jai Thakur", "Kiara Dutta", "Laksh Arora", "Mehak Sethi", "Nikhil Pai", "Ojas Kulkarni"];
  let order = 71001, tag = 2000;
  for (const name of people) {
    const [first, last] = name.split(" ");
    const email = `${first.toLowerCase()}@example.com`;
    const sc = await ShopCart.create({ item_name: "Festival Pass", item_quantity: 1, order_id: order, isAdmitted: true, name, email,
      phone_no: "98000" + String(order).slice(-5), isActive: true, event: ev._id, passType: P["Festival Pass"]._id, category: "festival", passTypeName: "Festival Pass" });
    await Ticket.create({ order_id: order, transaction_id: "TXN" + order, first_name: first, last_name: last, email, phone_no: sc.phone_no,
      totalPrice: 4999, shopcart: [sc._id], event: ev._id, ticketEmail: { status: "sent", sentAt: new Date(Date.UTC(2026, 9, 12, 10, order % 60)), error: null } });
    const band = await Band.create({ event: ev._id, code: `BIG7:W${++tag}`, raw: `https://wallet.example/pay?eventid=BIG7&tagid=W${tag}`,
      pass: sc._id, linkedBy: tlBox._id, linkedAt: dayAt(-1, 8, order % 50) });
    await ShopCart.updateOne({ _id: sc._id }, { band: band._id });
    order++;
  }
  const pass = {};
  for (const sc of await ShopCart.find({ event: ev._id, category: "festival", isAdmitted: true, band: { $ne: null } })) pass[sc.name] = sc;
  const names = Object.keys(pass).sort();

  // ── Lists and attendance
  let pos = 0;
  const entry = (s, who, list, o = {}) => WorkshopEntry.create({
    event: ev._id, session: s._id, pass: pass[who]._id, band: pass[who].band, list, position: ++pos,
    addedBy: volWs._id, addedAt: new Date(+s.start - 6 * 3600 * 1000 + pos * MIN),
    attendedAt: o.at || null, attendedBy: o.at ? volWs._id : null, late: !!o.late
  });
  const after = (s, m) => new Date(+s.start + m * MIN);
  // Yesterday's pottery: 8 on the list (6 came, 2 no-shows), 2 waitlisted (1 came after the cut-off), 2 walk-ins (1 late from the list).
  for (const [i, n] of names.slice(0, 8).entries()) await entry(S.pastClay, n, "pre", i < 6 ? { at: after(S.pastClay, i) } : {});
  await entry(S.pastClay, names[8], "wait", { at: after(S.pastClay, 17) });
  await entry(S.pastClay, names[9], "wait");
  await entry(S.pastClay, names[10], "walkin", { at: after(S.pastClay, 20) });
  await entry(S.pastClay, names[11], "walkin", { at: after(S.pastClay, 22), late: true });
  // Yesterday's drums and songwriting.
  for (const [i, n] of names.slice(4, 14).entries()) await entry(S.pastDrums, n, "pre", i < 9 ? { at: after(S.pastDrums, i) } : {});
  await entry(S.pastDrums, names[15], "walkin", { at: after(S.pastDrums, 12) });
  for (const [i, n] of names.slice(10, 15).entries()) await entry(S.pastSongs, n, "pre", { at: after(S.pastSongs, i) });
  // Running now: 12 on the list (9 in), 3 waitlisted (2 in after the cut-off), 2 walk-ins (1 in).
  const nowList = ["Asha Menon", ...names.filter(n => n !== "Asha Menon")];
  for (const [i, n] of nowList.slice(0, 12).entries()) await entry(S.now, n, "pre", i < 9 ? { at: after(S.now, 2 + i) } : {});
  for (const [i, n] of nowList.slice(12, 15).entries()) await entry(S.now, n, "wait", i < 2 ? { at: after(S.now, 12 + i) } : {});
  for (const [i, n] of nowList.slice(15, 17).entries()) await entry(S.now, n, "walkin", i < 1 ? { at: after(S.now, 15) } : {});
  // Coming up: lists filling.
  for (const n of names.slice(0, 6)) await entry(S.later, n, "pre");
  for (const n of names.slice(6, 10)) await entry(S.tYoga, n, "pre");
  for (const n of names.slice(10, 20)) await entry(S.tClay, n, "pre");

  return {
    workshopTl: "tara.workshops@example.com",
    sessions: Object.fromEntries(Object.entries(S).map(([k, s]) => [k, String(s._id)])),
    doorName: "Asha Menon",
    liveArea: "Banyan Circle",
    pastSessionTitle: "Clay & Coil Pottery"
  };
}

module.exports = { seedWorkshops };
