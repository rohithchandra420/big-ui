/* Sample Music data (stages, acts, slots) for the e2e run and the Product Guide
 * screenshots (called from seed.js). ISOLATED DB ONLY — every act, contact and
 * phone number here is invented. Slots sit around "today" so the Planner shows them. */
const path = require("path");
const API = path.resolve(__dirname, "../../big-api");
const MusicStage = require(API + "/src/models/musicStage");
const MusicAct = require(API + "/src/models/musicAct");
const MusicSlot = require(API + "/src/models/musicSlot");

const MIN = 60000;
/** Local time `offset` days from today at h:m. */
const dayAt = (offset, h = 0, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); d.setDate(d.getDate() + offset); return d; };

async function seedMusic({ ev, dir }) {
  const stage = {};
  for (const [name, amenities, notes] of [
    ["Main Stage", ["sound", "lights", "power", "backstage", "green_room"], "Curfew 11 pm. Load-in from the service road."],
    ["Riverside Stage", ["sound", "power", "shade", "seating"], "Acoustic and small bands."]]) {
    stage[name] = await MusicStage.create({ event: ev._id, name, amenities, notes, createdBy: dir._id });
  }
  const act = {};
  for (const [name, genre, contactName, contactPhone] of [
    ["The Monsoon Static", "Indie rock", "Varun Kale", "9800000601"],
    ["Kavi & the Tidelines", "Folk", "Kavi Rao", "9800000602"],
    ["DJ Saltpan", "Electronic", "Nikita Barve", "9800000603"],
    ["Brass Lantern Collective", "Jazz", "Owen Lobo", "9800000604"],
    ["Seven Hills Choir", "Choral", "Asmita Jain", "9800000605"]]) {
    act[name] = await MusicAct.create({ event: ev._id, name, genre, contactName, contactPhone, createdBy: dir._id });
  }
  // Sound check: 30 minutes, ending 10 minutes before the slot (no clash with the act before)
  const slot = (a, s, start, mins) => MusicSlot.create({ event: ev._id, act: act[a]._id, stage: stage[s]._id,
    start, end: new Date(+start + mins * MIN), soundCheckStart: new Date(+start - 40 * MIN),
    soundCheckEnd: new Date(+start - 10 * MIN), createdBy: dir._id });
  await slot("Seven Hills Choir", "Riverside Stage", dayAt(0, 17, 0), 45);
  await slot("Kavi & the Tidelines", "Riverside Stage", dayAt(0, 18, 30), 60);
  await slot("Brass Lantern Collective", "Main Stage", dayAt(0, 19, 0), 75);
  await slot("The Monsoon Static", "Main Stage", dayAt(0, 21, 0), 90);
  await slot("DJ Saltpan", "Main Stage", dayAt(1, 20, 0), 120);
  await slot("Kavi & the Tidelines", "Riverside Stage", dayAt(1, 16, 0), 60);
  return { stages: Object.keys(stage).length, acts: Object.keys(act).length };
}

module.exports = { seedMusic };
