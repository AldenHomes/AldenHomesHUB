/* ============================================================
   Alden Hub — Vision Demo · SHARED DUMMY DATA
   One consistent cast across every demo app. All fake.
   Kept separate from the live Alden Hub production data.
   ============================================================ */
window.ALDEN_DEMO = (function(){

  const DEVELOPMENTS = [
    {code:"AP", name:"Alden Place"},
    {code:"CL", name:"Cliffs"},
    {code:"MM", name:"Mountain Meadows"},
    {code:"ML", name:"Maple Lane"},
  ];

  /* the shared cast of active houses */
  const HOUSES = [
    {id:"h1", comm:"AP", lot:"154", addr:"1028 Stanford Dr", model:"The Hartwell", sqft:2340,
     customer:"Struck Family", stage:"Framing", pct:38,
     settlement:{base:324900,adders:41780,co:2100,coFees:200}, histDate:"2026-02-10"},
    {id:"h2", comm:"ML", lot:"117", addr:"117 Maple Ln", model:"The Coleman", sqft:2986,
     customer:"Lowrie Family", stage:"Drywall", pct:62,
     settlement:{base:311000,adders:38650,co:0,coFees:0}, histDate:"2025-09-15"},
    {id:"h3", comm:"CL", lot:"102", addr:"401 Cannon Way", model:"The Coleman", sqft:2158,
     customer:"Bair Family", stage:"Trim & Paint", pct:81,
     settlement:{base:311000,adders:52300,co:1450,coFees:100}, histDate:"2025-09-15"},
    {id:"h4", comm:"AP", lot:"219", addr:"1059 Percy Ln", model:"The Ashford", sqft:1746,
     customer:"Nolt Family", stage:"Selections", pct:8,
     settlement:{base:298500,adders:22900,co:0,coFees:0}, histDate:"2026-05-20"},
    {id:"h5", comm:"MM", lot:"23", addr:"14 Meadow View", model:"The Stanford", sqft:2510,
     customer:"Weaver Family", stage:"Foundation", pct:22,
     settlement:{base:334000,adders:47600,co:900,coFees:100}, histDate:"2026-04-01"},
  ];

  /* shared vendors / contractors */
  const CONTRACTORS = [
    {id:"c1", name:"D & S Flooring", trade:"Flooring", contact:"Leroy Martin", email:"leroy@dsflooring.example", phone:"717-553-2900"},
    {id:"c2", name:"First Rate Drywall", trade:"Drywall", contact:"Office", email:"office@firstratedrywall.example", phone:"717-664-0484"},
    {id:"c3", name:"Elite Outdoor Expressions", trade:"Railing / Decks", contact:"Ken Nolt", email:"ken@eliteoutdoor.example", phone:"717-354-0524"},
    {id:"c4", name:"Fast Supply LP", trade:"Plumbing supply", contact:"Willie", email:"willie@fastsupply.example", phone:"717-336-3800"},
    {id:"c5", name:"Energy Auditors LLC", trade:"Energy Star", contact:"Admin", email:"admin@paenergyauditors.example", phone:"717-914-8155"},
    {id:"c6", name:"Keystone Framing", trade:"Framing", contact:"Marlin Z.", email:"marlin@keystoneframing.example", phone:"717-555-0142"},
    {id:"c7", name:"Lancaster Electric", trade:"Electrical", contact:"Dave H.", email:"dave@lancasterelectric.example", phone:"717-555-0177"},
    {id:"c8", name:"Summit HVAC", trade:"Heating", contact:"Ryan B.", email:"ryan@summithvac.example", phone:"717-555-0193"},
  ];

  /* schedule items — each ties a contractor to a house on a date range, with confirm state */
  const SCHEDULE = [
    {id:"s1", houseId:"h1", contractorId:"c6", trade:"Framing", start:"2026-08-03", end:"2026-08-08", status:"confirmed", note:"Frame first floor + second floor"},
    {id:"s2", houseId:"h1", contractorId:"c7", trade:"Electrical rough-in", start:"2026-08-11", end:"2026-08-14", status:"pending", note:"Rough-in, coordinate with HVAC"},
    {id:"s3", houseId:"h1", contractorId:"c8", trade:"HVAC rough-in", start:"2026-08-12", end:"2026-08-15", status:"pending", note:"Set trunk lines"},
    {id:"s4", houseId:"h2", contractorId:"c2", trade:"Drywall hang", start:"2026-08-04", end:"2026-08-09", status:"confirmed", note:"Hang whole house"},
    {id:"s5", houseId:"h2", contractorId:"c1", trade:"Flooring", start:"2026-08-18", end:"2026-08-21", status:"pending", note:"LVP main floor, carpet beds"},
    {id:"s6", houseId:"h3", contractorId:"c1", trade:"Flooring", start:"2026-08-05", end:"2026-08-07", status:"confirmed", note:"Hardwood + tile baths"},
    {id:"s7", houseId:"h3", contractorId:"c3", trade:"Deck / railing", start:"2026-08-19", end:"2026-08-20", status:"declined", note:"Rear deck — CONFLICT, sub double-booked"},
    {id:"s8", houseId:"h5", contractorId:"c6", trade:"Framing", start:"2026-08-17", end:"2026-08-22", status:"pending", note:"Full frame"},
    {id:"s9", houseId:"h1", contractorId:"c5", trade:"Energy Star pre-drywall", start:"2026-08-10", end:"2026-08-10", status:"confirmed", note:"Inspection"},
    {id:"s10", houseId:"h2", contractorId:"c1", trade:"Flooring measure", start:"2026-08-03", end:"2026-08-03", status:"confirmed", note:"Final measure"},
  ];

  /* phase-tagged jobsite photos (placeholder colored tiles instead of real images) */
  const PHASES = ["Site","Foundation","Framing","Rough-ins","Insulation","Drywall","Trim","Paint","Flooring","Final"];
  const PHOTOS = [
    {id:"p1", houseId:"h1", phase:"Framing", by:"Alden", caption:"First floor walls up", date:"2026-08-01", hue:28},
    {id:"p2", houseId:"h1", phase:"Foundation", by:"Alden", caption:"Poured & backfilled", date:"2026-07-20", hue:210},
    {id:"p3", houseId:"h1", phase:"Framing", by:"Keystone Framing", caption:"Second floor decking", date:"2026-08-02", hue:35},
    {id:"p4", houseId:"h2", phase:"Drywall", by:"First Rate Drywall", caption:"Hang complete, ready for finish", date:"2026-07-30", hue:190},
    {id:"p5", houseId:"h2", phase:"Rough-ins", by:"Alden", caption:"Electrical + plumbing rough", date:"2026-07-18", hue:150},
    {id:"p6", houseId:"h3", phase:"Trim", by:"Alden", caption:"Interior doors hung", date:"2026-07-29", hue:45},
    {id:"p7", houseId:"h3", phase:"Paint", by:"Alden", caption:"Primer coat main floor", date:"2026-08-01", hue:60},
    {id:"p8", houseId:"h1", phase:"Site", by:"Alden", caption:"Lot cleared & staked", date:"2026-07-10", hue:95},
  ];

  /* plans per house (placeholder PDFs) */
  const PLANS = [
    {id:"pl1", houseId:"h1", name:"Hartwell — Floor Plans Rev C", pages:4, date:"2026-06-15"},
    {id:"pl2", houseId:"h1", name:"Hartwell — Elevations", pages:2, date:"2026-06-15"},
    {id:"pl3", houseId:"h1", name:"Site Plan — Lot 154", pages:1, date:"2026-06-01"},
    {id:"pl4", houseId:"h2", name:"Coleman — Floor Plans Rev B", pages:4, date:"2026-05-20"},
    {id:"pl5", houseId:"h3", name:"Coleman — Floor Plans Rev B", pages:4, date:"2026-05-20"},
  ];

  /* helpers */
  const devName = c => (DEVELOPMENTS.find(d=>d.code===c)||{}).name || c;
  const house = id => HOUSES.find(h=>h.id===id);
  const contractor = id => CONTRACTORS.find(c=>c.id===id);
  const settlement = h => { const s=h.settlement; return s.base+s.adders+s.co+s.coFees; };
  const scheduleForHouse = id => SCHEDULE.filter(s=>s.houseId===id);
  const scheduleForContractor = id => SCHEDULE.filter(s=>s.contractorId===id);
  const photosForHouse = id => PHOTOS.filter(p=>p.houseId===id);
  const plansForHouse = id => PLANS.filter(p=>p.houseId===id);

  return {DEVELOPMENTS, HOUSES, CONTRACTORS, SCHEDULE, PHASES, PHOTOS, PLANS,
    devName, house, contractor, settlement, scheduleForHouse, scheduleForContractor,
    photosForHouse, plansForHouse};
})();
