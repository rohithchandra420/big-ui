/* Sample Hospitality, staff list and SOS data for the dry-run screenshots.
 * ISOLATED DB ONLY — called from seed.js after the event, users and workshops exist.
 * All people are invented. Dates are built around "today" (India time), so the
 * Serving desk / Today screens always show live meals. */
const path = require("path");
const API = path.resolve(__dirname, "../../big-api");
const User = require(API + "/src/models/user");
const Role = require(API + "/src/models/roles");
const EventStaff = require(API + "/src/models/eventStaff");
const Attendance = require(API + "/src/models/attendance");
const MessPlan = require(API + "/src/models/messPlan");
const Meal = require(API + "/src/models/meal");
const MealServe = require(API + "/src/models/mealServe");
const Guest = require(API + "/src/models/guest");
const MealPass = require(API + "/src/models/mealPass");
const StayType = require(API + "/src/models/stayType");
const StayUnit = require(API + "/src/models/stayUnit");
const Stay = require(API + "/src/models/stay");
const Sos = require(API + "/src/models/sos");
const PublicSettings = require(API + "/src/models/publicSettings");
const { todayLocal, addDays } = require(API + "/src/utils/messTime");

async function seedHospitality({ ev, mk, dir, D }) {
  const today = todayLocal();

  // Hospitality Team Lead + a few more people, all with food and gender set
  const tlHosp = await mk("Anjali Rao", "anjali.hospitality@example.com", "TL", "Hospitality", "2026-09-01");
  await User.updateMany({}, { $set: { gender: "Female", foodPreference: "veg" } });
  await User.updateMany({ name: { $in: ["Tom Mathew", "Arjun Nair", "Ravi Kumar", "Ishaan Bose", "Rohan Iyer", "Sam Patel"] } },
    { $set: { gender: "Male", foodPreference: "non-veg" } });
  // Dates of joining before the mess opens, so everyone counts from day one
  await User.updateMany({ dateOfJoining: { $gt: addDays(today, -3) } }, { $set: { dateOfJoining: addDays(today, -10) } });

  // Staff list (since 1.43): every active TL / VOL works BiG 7.0 — except Meera,
  // who shows "Not on" on the Users page and is refused at the Serving desk.
  const tlVol = await Role.find({ name: { $in: ["TL", "VOL"] } }).select("_id");
  const staff = await User.find({ role: { $in: tlVol.map(r => r._id) }, isActive: { $ne: false }, name: { $ne: "Meera Pillai" } }).select("_id");
  await EventStaff.insertMany(staff.map(u => ({ event: ev._id, user: u._id, addedBy: dir._id })));

  // Mess: yesterday → 3 days ahead, default meal times
  await MessPlan.create({ event: ev._id, opensOn: addDays(today, -1), closesOn: addDays(today, 3) });

  // Attendance today (morning / afternoon) for most staff, so plates are expected
  const people = await User.find({ _id: { $in: staff.map(s => s._id) } }).select("_id name departments");
  for (const [i, u] of people.entries()) {
    const dept = u.departments?.[0]?.department || D["General"];
    if (!dept) continue;
    for (const slot of ["morning", "afternoon"]) {
      if ((i + (slot === "afternoon" ? 1 : 0)) % 4 === 3) continue;   // a few gaps → "not marked"
      await Attendance.create({ user: u._id, department: dept, date: today, slot, markedBy: dir._id });
    }
  }

  // Yesterday: all four meals with kitchen counts + figures (for the Report)
  for (const meal of MessPlan.MEALS) {
    await Meal.create({ event: ev._id, date: addDays(today, -1), meal,
      count: { veg: 9, nonVeg: 5, sentBy: tlHosp._id, sentAt: addDays(today, -1) },
      figures: { vegPrepared: 11, nonVegPrepared: 6, leftoverKg: 1.5, note: "", by: tlHosp._id, at: addDays(today, -1) } });
  }
  // Yesterday's plates (a mix of decisions) + today's breakfast
  const served = people.slice(0, 10);
  for (const meal of MessPlan.MEALS)
    for (const [i, u] of served.entries())
      await MealServe.create({ event: ev._id, date: addDays(today, -1), meal, user: u._id, by: tlHosp._id,
        decision: i === 7 ? "served_flagged" : "served", reason: i === 7 ? "Off-site duty" : "",
        department: u.departments?.[0]?.department || null, food: i % 3 === 0 ? "non-veg" : "veg" });
  for (const u of served.slice(0, 6))
    await MealServe.create({ event: ev._id, date: today, meal: "breakfast", user: u._id, by: tlHosp._id, decision: "served",
      department: u.departments?.[0]?.department || null, food: "veg" });

  // A guest group with a Meal Pass for today and tomorrow
  const guest = await Guest.create({ event: ev._id, name: "Sound crew", nameLower: "sound crew", note: "Echo Rentals", phone: "9800000201", gender: "Male", createdBy: tlHosp._id });
  await MealPass.create({ event: ev._id, guest: guest._id, kind: "range", from: today, to: addDays(today, 1), vegPlates: 3, nonVegPlates: 2, createdBy: tlHosp._id });

  // Stay: a dorm with two units, a few staff booked tonight
  const dorm = await StayType.create({ event: ev._id, name: "Volunteer dorm", nameLower: "volunteer dorm", icon: "bunk_bed" });
  const unitA = await StayUnit.create({ event: ev._id, type: dorm._id, name: "D-01", nameLower: "d-01", beds: 6,
    available: [{ from: addDays(today, -1), to: addDays(today, 4) }] });
  await StayUnit.create({ event: ev._id, type: dorm._id, name: "D-02", nameLower: "d-02", beds: 6,
    available: [{ from: addDays(today, -1), to: addDays(today, 4) }] });
  for (const u of people.filter(p => ["Sana Qureshi", "Lina Joseph", "Kavya Menon"].includes(p.name)))
    await Stay.create({ event: ev._id, unit: unitA._id, user: u._id, gender: "Female", from: addDays(today, -1), to: addDays(today, 3),
      movedInAt: addDays(today, -1), movedInBy: tlHosp._id, createdBy: tlHosp._id });

  // SOS: switched on, alerts to Hospitality, one open SOS near the venue
  await PublicSettings.create({ key: "main", enabled: true, event: ev._id, sosEnabled: true, sosDepartments: [D["Hospitality"]],
    emergency: { contacts: [{ label: "Festival medic", phone: "+919800000301" }], note: "" } });
  await Sos.create({ event: ev._id, lat: 20.9810, lng: 79.3515, accuracy: 25, message: "Friend feeling dizzy near the food court",
    phone: "9800000401", device: "sample-device-1", ipHash: "sample-hash", deleteAt: addDays(today, 60) });

  return { hospitalityTl: "anjali.hospitality@example.com" };
}

module.exports = { seedHospitality };
