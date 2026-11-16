/* ============================================================
   PERMITS (owner, 2026-10-26) — the "Permits" card, on house.html (the home on screen, global `job`) and in the Permits app
   (permits.html sets window.PERMIT_JOB and has a #permitsMount box; it also uses window.Permits for the list and settings).
   At the Cliffs (Cornwall Borough) the order is: water & sewer application → once approved, the zoning permit application →
   once zoning is approved, the building permit. Each step has Submitted / Approved dates (and a permit # where there is one),
   saved on the home as jobs/{id}.permits = { ws:{sent,ok}, zoning:{sent,ok,no}, building:{sent,ok,no}, forms:{ ws:{…}, zoning:{…} } }.
   FILL OUT TO COMPLETION (owner, 2026-10-26: "fill out all the forms in the alden hub to completion then just download pdf to print or
   to email out"): "Fill out" opens a form screen with a box for EVERY blank on the borough's form (FORMS below). Each box starts with
   what the hub knows (`def`: the home, Alden's details in settings/permits.company, the development, sizes typed for that home only — never from the home style, owner 2026-11-16 — today's date); anything typed is saved for that home in permits.forms[form][key] ('' = left blank on
   purpose). Choices (Residential / Commercial …, Yes / No) are pick lists that circle or tick the form. The applicant's signature is
   drawn once in the Permits app → Settings (settings/permits.signature, a PNG) and added per form with a tick box. "Download PDF" /
   "Open to print" write it all onto the borough's own blank PDF (forms/…, public forms) in the browser with pdf-lib.
   Positions are PDF points from the bottom left, measured from the blank forms' text and checked against the office's filled CL 113
   applications. To add a development: its blank forms in forms/, an entry in PERMIT_DEVS, and its fields in FORMS.
   ============================================================ */
(function(){
  const PDFLIB = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
  // developments with permit forms set up (borough info is public)
  const PERMIT_DEVS = {
    CL: { borough: 'Cornwall Borough', city: 'Lebanon PA', zip: '17042', subdivision: 'Cliffs', forms: { ws: 'cornwall-ws', zoning: 'cornwall-zoning' } },
    /* MOUNTAIN MEADOWS (owner, 2026-11-16, from the office's "MM Permitting Check List" and the MM 69 permits): Tulpehocken Township,
       Berks County. Sewer (TTSS, no form), driveway, zoning, then the building permit (Commonwealth Code Inspection Service reviews). */
    MM: { borough: 'Tulpehocken Township', city: 'Myerstown PA', zip: '17067', subdivision: 'Mountain Meadows', zone: 'VC',
      forms: { drive: 'tulpe-drive', zoning: 'tulpe-zoning', building: 'tulpe-building' },
      checks: [
        { id: 'ttss', to: 'TTSS', amt: '$150 + tapping fee', what: 'Sewer: application + tapping fee — can be one check (Phase 2 was $4,571.55 total as of 7/18/23)' },
        { id: 'drive', to: 'Tulpehocken Township', amt: '$75', what: 'Driveway permit' },
        { id: 'zoning', to: 'Tulpehocken Township', amt: '$150', what: 'Zoning permit' },
        { id: 'rec', to: 'Tulpehocken Township', amt: '$2,500', what: 'Recreation fee — its own separate check, due when applying for each new build' },
      ],
      bring: ['Driveway: a sketch of the driveway (lot lines, where it meets the street)', 'Zoning: copy of the deed + the plot plan',
        'Building: 2 sets of plans + 2 sets of truss drawings and layout (paper preferred; can be emailed to tulpytwp@comcast.net)'],
      note: 'Building permit: Commonwealth Code gives the cost once the plans are reviewed — paid when the permit is picked up. Commonwealth does the final inspection; the township mails the zoning use & occupancy certificate.',
      steps: [
        { id: 'sewer', t: 'Sewer permit (TTSS)', hint: 'Application to connect, sent to TTSS. No form in the hub — record the dates.', no: true },
        { id: 'drive', t: 'Driveway permit', hint: 'To Tulpehocken Township, with a sketch of the driveway.', form: 'drive', no: true },
        { id: 'zoning', t: 'Zoning permit', hint: 'To Tulpehocken Township, with the deed and plot plan (and the recreation fee check).', form: 'zoning', no: true },
        { id: 'building', t: 'Building permit', hint: 'To the township; Commonwealth Code reviews the plans.', form: 'building', no: true },
      ] },
  };
  const stepsOf = dev=>dev ? (dev.steps || STEPS_FORMS) : OTHER_STEPS;
  // "100 Freeman Dr, Lebanon PA 17042" → its parts (for forms that ask street / city / state / zip separately)
  const addr = s=>{ const m = String(s || '').match(/^(.*?),\s*(.*?),?\s+([A-Z]{2})\.?\s+(\d{5})/); return m ? { street: m[1], city: m[2], state: m[3], zip: m[4] } : { street: String(s || ''), city: '', state: '', zip: '' }; };
  const ft = v=>v === '' || v == null ? '' : /^\d+(\.\d+)?$/.test(String(v)) ? v + "'" : String(v);
  const YND = (ys)=>[['Yes', 0], ['No', 1], ["Don't know", 2]].map(([v, i])=>({ v, mark: ys[i] }));
  const STEPS_FORMS = [
    { id: 'ws', t: 'Water & sewer application', hint: 'First. The zoning application goes in once this is approved.', form: 'ws' },
    { id: 'zoning', t: 'Zoning permit', hint: 'After water & sewer is approved.', form: 'zoning', no: true },
    { id: 'building', t: 'Building permit', hint: 'After zoning is approved.', no: true },
  ];
  // a development without forms in the hub yet: one line to track the dates
  const OTHER_STEPS = [{ id: 'building', t: 'Permits', hint: 'This development\'s permit forms aren\'t in the hub yet — track the dates here.', no: true }];

  /* Every blank on each form. p = page in the finished PDF; x, y = where the text starts; s = text size; def(c) = the hub's answer.
     type 'choice': opts each circle (ring: x, y, width, height) or tick (mark: x, y) their spot. type 'sig': the applicant's signature. */
  const FORMS = {
    'cornwall-ws': { title: 'Water & Sewer application', pages: 3, files: ['forms/cornwall-water.pdf', 'forms/cornwall-sewer.pdf'], fields: [
      { sec: 'Water service — the property' },
      { k: 'street', l: 'Street address', p: 0, x: 80, y: 606, def: c=>c.street },
      { k: 'city', l: 'City and state', p: 0, x: 358, y: 606, def: c=>c.dev.city },
      { k: 'zip', l: 'Zip', p: 0, x: 448, y: 606, def: c=>c.dev.zip },
      { k: 'subdiv', l: 'Subdivision', p: 0, x: 80, y: 572, def: c=>c.dev.subdivision },
      { k: 'lot', l: 'Lot number', p: 0, x: 158, y: 572, def: c=>c.lot },
      { k: 'upi', l: 'UPI', p: 0, x: 235, y: 572, s: 9, def: c=>c.inf.parcel },
      { k: 'zdist', l: 'Zoning district', p: 0, x: 358, y: 572, s: 9 },
      { k: 'cval', l: 'Construction est. value', p: 0, x: 448, y: 572, s: 9 },
      { k: 'use', l: 'Use of structure', p: 0, x: 150, y: 542, def: ()=>'New single-family dwelling' },
      { k: 'units', l: 'If residential, number of dwelling units', p: 0, x: 250, y: 519, def: ()=>'1' },
      { k: 'edus', l: 'If nonresidential, number of EDUs', p: 0, x: 230, y: 496 },
      { sec: 'Water service — property owner' },
      { k: 'oname', l: 'Property owner(s)', p: 0, x: 160, y: 485, def: c=>c.co.name },
      { k: 'oaddr', l: 'Address', p: 0, x: 115, y: 462, def: c=>c.co.address },
      { k: 'owork', l: 'Work phone', p: 0, x: 133, y: 439, def: c=>c.co.phone },
      { k: 'ocell', l: 'Home / cell phone', p: 0, x: 312, y: 439, s: 9 },
      { k: 'oemail', l: 'E-mail', p: 0, x: 434, y: 439, s: 9, def: c=>c.co.email },
      { sec: 'Water service — contractor' },
      { k: 'cname', l: 'Contractor', p: 0, x: 125, y: 416, def: c=>c.co.name },
      { k: 'lic', l: 'State contractor license no.', p: 0, x: 458, y: 416, def: c=>c.co.license },
      { k: 'caddr', l: 'Address', p: 0, x: 115, y: 404, def: c=>c.co.address },
      { k: 'cwork', l: 'Work phone', p: 0, x: 133, y: 381, def: c=>c.co.phone },
      { k: 'ccell', l: 'Home / cell phone', p: 0, x: 302, y: 381, s: 9 },
      { k: 'cemail', l: 'E-mail', p: 0, x: 432, y: 381, s: 9, def: c=>c.co.email },
      { sec: 'Water service — signatures (page 2)' },
      { k: 'wdate1', l: 'Date', p: 1, x: 102, y: 573, def: c=>c.date },
      { k: 'wsig1', l: 'Signature of property owner', type: 'sig', p: 1, x: 335, y: 570 },
      { k: 'wname1', l: 'Print property owner name', p: 1, x: 325, y: 550, def: c=>c.co.applicant || c.co.name },
      { k: 'wdate2', l: 'Second owner: date', p: 1, x: 102, y: 527 },
      { k: 'wname2', l: 'Second owner: print name', p: 1, x: 325, y: 504 },
      { sec: 'Sewer application' },
      { k: 'sname', l: 'I, (applicant)', p: 2, x: 52, y: 654, def: c=>c.co.applicant || c.co.name },
      { k: 'btype', l: 'Type of building', type: 'choice', p: 2, def: ()=>'Residential', opts: [
        { v: 'Residential', mark: [150, 601] }, { v: 'Commercial', mark: [256, 601] }, { v: 'Industrial', mark: [364, 601] },
        { v: 'Apartments', mark: [78, 584] }, { v: 'Restaurant', mark: [230, 584] }, { v: 'Other', mark: [330, 584] }] },
      { k: 'aunits', l: 'Apartments: number of units', p: 2, x: 159, y: 584, s: 9 },
      { k: 'bother', l: 'Other (type of building)', p: 2, x: 395, y: 584, s: 9 },
      { k: 'saddr1', l: 'Service address — line 1', p: 2, x: 150, y: 551, def: c=>c.street + (c.lot ? '   Lot ' + c.lot : '') },
      { k: 'saddr2', l: 'Service address — line 2', p: 2, x: 150, y: 533, def: c=>c.dev.city + ' ' + c.dev.zip },
      { k: 'saddr3', l: 'Township / borough', p: 2, x: 150, y: 516, def: c=>c.dev.borough },
      { k: 'bname', l: 'Billing name (if different)', p: 2, x: 212, y: 487, def: c=>c.co.name },
      { k: 'baddr', l: 'Billing address', p: 2, x: 150, y: 470, def: c=>c.co.address },
      { k: 'sdev', l: 'Development', p: 2, x: 172, y: 436, def: c=>c.dev.subdivision },
      { k: 'scomp', l: 'Company', p: 2, x: 160, y: 401, def: c=>c.co.name },
      { k: 'sphone', l: 'Applicant\'s phone number', p: 2, x: 172, y: 367, def: c=>c.co.phone },
      { k: 'ssig', l: 'Signature of applicant', type: 'sig', p: 2, x: 40, y: 322, w: 100 },
      { k: 'sdate', l: 'Date', p: 2, x: 150, y: 321, def: c=>c.date },
    ] },
    'cornwall-zoning': { title: 'Zoning permit application', pages: 1, files: ['forms/cornwall-zoning.pdf'], fields: [
      { sec: 'Land / property owner' },
      { k: 'owner', l: 'Property owner(s)', p: 0, x: 142, y: 628, def: c=>c.co.name },
      { k: 'maddr', l: 'Mailing address', p: 0, x: 130, y: 612, def: c=>c.co.address },
      { k: 'oemail', l: 'Email address', p: 0, x: 120, y: 597, s: 9, def: c=>c.co.email },
      { k: 'ophone', l: 'Phone no.', p: 0, x: 392, y: 597, def: c=>c.co.phone },
      { sec: 'Contractor' },
      { k: 'bname', l: 'Business name', p: 0, x: 128, y: 539, def: c=>c.co.name },
      { k: 'baddr', l: 'Address', p: 0, x: 90, y: 524, def: c=>c.co.address },
      { k: 'bemail', l: 'Email address', p: 0, x: 120, y: 508, s: 9, def: c=>c.co.email },
      { k: 'bphone', l: 'Phone no.', p: 0, x: 388, y: 508, def: c=>c.co.phone },
      { sec: 'Proposed improvement' },
      { k: 'site', l: 'Site address', p: 0, x: 118, y: 465, def: c=>c.street + ', ' + c.dev.city + ' ' + c.dev.zip + (c.lot ? '   Lot ' + c.lot : '') },
      { k: 'parcel', l: 'Tax map / parcel #', p: 0, x: 142, y: 450, def: c=>c.inf.parcel },
      { k: 'ptype', l: 'Property type', type: 'choice', p: 0, def: ()=>'Residential', opts: [
        { v: 'Residential', ring: [168, 438, 35, 9] }, { v: 'Commercial', ring: [261, 438, 36, 9] }, { v: 'Other', ring: [346, 438, 22, 9] }] },
      { k: 'pother', l: 'Other (explain)', p: 0, x: 430, y: 435, s: 9 },
      { k: 'future', l: 'Commercial use in the future?', type: 'choice', p: 0, def: ()=>'No', opts: [
        { v: 'Yes', ring: [467, 423, 12, 9] }, { v: 'No', ring: [505, 423, 11, 9] }] },
      { k: 'desc', l: 'Description of improvement', p: 0, x: 188, y: 391, def: ()=>'New SFD' },
      { k: 'puse', l: 'Proposed use', p: 0, x: 456, y: 391, def: ()=>'Residence' },
      { k: 'cost', l: 'Project cost ($)', p: 0, x: 116, y: 362, money: true, def: c=>c.inf.cost },
      { k: 'len', l: 'Length (ft)', p: 0, x: 82, y: 348, size: 'len', def: c=>c.inf.len },
      { k: 'wid', l: 'Width (ft)', p: 0, x: 216, y: 348, size: 'wid', def: c=>c.inf.wid },
      { k: 'hgt', l: 'Height (ft)', p: 0, x: 358, y: 348, size: 'hgt', def: c=>c.inf.hgt },
      { k: 'sqft', l: 'Total sq ft', p: 0, x: 470, y: 334, size: 'sqft', def: c=>c.inf.sqft },
      { sec: 'Signature' },
      { k: 'sig', l: 'Applicant signature', type: 'sig', p: 0, x: 60, y: 221 },
      { k: 'date', l: 'Date', p: 0, x: 470, y: 222, def: c=>c.date },
    ] },

    /* ---- Tulpehocken Township (MM). Driveway + building are scans, so positions were measured off the page pictures. ---- */
    'tulpe-drive': { title: 'Driveway permit application', pages: 2, files: ['forms/tulpehocken-driveway.pdf'], fields: [
      { sec: 'Fee (the township fills in the permit number)' },
      { k: 'fee', l: 'Fee', p: 0, x: 58, y: 592.5, def: ()=>'$75' },
      { k: 'paid', l: 'Date paid', p: 0, x: 127, y: 592.5, s: 9 },
      { k: 'chk', l: 'Check no.', p: 0, x: 196, y: 592.5, s: 9 },
      { sec: 'Applicant' },
      { k: 'name', l: 'Name of applicant', p: 0, x: 58, y: 549, def: c=>c.co.name },
      { k: 'phone', l: 'Telephone no.', p: 0, x: 400, y: 549, def: c=>c.co.phone },
      { k: 'addr', l: 'Address of applicant', p: 0, x: 58, y: 517, def: c=>{ const a = addr(c.co.address); return [a.street, [a.city, a.state].filter(Boolean).join(' ')].filter(Boolean).join(', '); } },
      { k: 'zip', l: 'Zip code', p: 0, x: 436, y: 517, def: c=>addr(c.co.address).zip },
      { sec: 'The site' },
      { k: 'site', l: 'Site address and physical location', p: 0, x: 58, y: 482, def: c=>c.street + ', ' + c.dev.city + ' ' + c.dev.zip },
      { k: 'subdiv', l: 'Subdivision / lot number', p: 0, x: 186, y: 467.5, s: 9.5, def: c=>'MM ' + c.lot },
      { k: 'lotsize', l: 'Lot size', p: 0, x: 298, y: 467.5, s: 9.5 },
      { sec: 'The driveway' },
      { k: 'slopeEx', l: 'Slope of existing grade (%)', p: 0, x: 272, y: 443, s: 9.5 },
      { k: 'slopePr', l: 'Slope of proposed grade (%)', p: 0, x: 272, y: 432, s: 9.5 },
      { k: 'dwWidth', l: 'Width of proposed driveway (ft)', p: 0, x: 170, y: 421, s: 9.5 },
      { k: 'roadSlope', l: 'Slope of road within 100 ft (%)', p: 0, x: 262, y: 410, s: 9.5 },
      { k: 'roadW', l: 'Width of roadway (ft)', p: 0, x: 131, y: 399, s: 9.5 },
      { k: 'shoulder', l: 'Width of shoulder (ft)', p: 0, x: 259, y: 399, s: 9.5 },
      { k: 'speed', l: 'Speed limit of road (mph)', p: 0, x: 134, y: 388, s: 9.5, def: ()=>'25' },
      { k: 'sightExL', l: 'Existing sight distance — left (ft)', p: 0, x: 302, y: 377, s: 9.5 },
      { k: 'sightExR', l: 'Existing sight distance — right (ft)', p: 0, x: 302, y: 366, s: 9.5 },
      { k: 'sightPrL', l: 'Proposed sight distance — left (ft)', p: 0, x: 302, y: 355, s: 9.5 },
      { k: 'sightPrR', l: 'Proposed sight distance — right (ft)', p: 0, x: 302, y: 344, s: 9.5 },
      { k: 'inter', l: 'Distance to closest intersection (ft)', p: 0, x: 175, y: 332.5, s: 9.5 },
      { k: 'propLine', l: 'Distance to nearest property line (ft)', p: 0, x: 272, y: 321.5, s: 9.5 },
      { k: 'storm1', l: 'Stormwater / erosion control', p: 0, x: 58, y: 298, def: ()=>'Per approved LDP' },
      { k: 'storm2', l: 'Stormwater — second line', p: 0, x: 58, y: 280 },
      { sec: 'Verification (page 2)' },
      { k: 'vname', l: 'I, (name)', p: 1, x: 68, y: 643, s: 9.5, def: c=>c.co.applicant || c.co.name },
      { k: 'sig', l: 'Applicant\'s signature', type: 'sig', p: 1, x: 300, y: 589, w: 140 },
      { k: 'date', l: 'Date', p: 1, x: 452, y: 589, s: 9.5, def: c=>c.date },
    ] },
    'tulpe-zoning': { title: 'Zoning permit application', pages: 3, files: ['forms/tulpehocken-zoning.pdf'], fields: [
      { sec: 'Applicant' },
      { k: 'name', l: 'Name of applicant', p: 0, x: 34, y: 500, def: c=>c.co.name },
      { k: 'phone', l: 'Telephone no.', p: 0, x: 376, y: 500, def: c=>c.co.phone },
      { k: 'maddr', l: 'Mailing address', p: 0, x: 34, y: 464, def: c=>{ const a = addr(c.co.address); return [a.street, [a.city, a.state].filter(Boolean).join(' ')].filter(Boolean).join(', '); } },
      { k: 'zip', l: 'Zip code', p: 0, x: 448, y: 464, def: c=>addr(c.co.address).zip },
      { sec: 'The property' },
      { k: 'loc', l: 'Physical location of property', p: 0, x: 34, y: 428, def: c=>c.street + ', ' + c.dev.city + ' ' + c.dev.zip + (c.lot ? ' (Lot ' + c.lot + ')' : '') },
      { k: 'dbook', l: 'Deed book volume', p: 0, x: 109, y: 416, s: 9 },
      { k: 'dpage', l: 'Deed page', p: 0, x: 178, y: 416, s: 9 },
      { k: 'parcel', l: 'Tax parcel identification no.', p: 0, x: 331, y: 415, s: 9.5, def: c=>c.inf.parcel },
      { k: 'subdiv', l: 'Subdivision / lot number', p: 0, x: 34, y: 376, s: 9.5, def: c=>c.dev.subdivision + (c.lot ? ' Lot ' + c.lot : '') },
      { k: 'sewage', l: 'Sewage permit no.', p: 0, x: 198, y: 376, s: 9.5 },
      { k: 'lotsize', l: 'Lot size', p: 0, x: 296, y: 376, s: 9.5 },
      { k: 'storm', l: 'Stormwater controls to be installed', p: 0, x: 34, y: 322, def: ()=>'Per approved LDP' },
      { k: 'desc', l: 'Description of construction (type & materials)', p: 0, x: 34, y: 262, s: 10, def: ()=>'New single family dwelling' },
      { k: 'dims', l: 'Dimensions', p: 0, x: 34, y: 226, s: 9.5, def: c=>c.inf.len && c.inf.wid ? ft(c.inf.len) + ' x ' + ft(c.inf.wid) : '' },
      { k: 'area', l: 'Area (sq ft)', p: 0, x: 124, y: 226, s: 9.5, size: 'sqft', def: c=>c.inf.sqft },
      { k: 'stories', l: 'No. stories / height', p: 0, x: 196, y: 226, s: 9.5, def: c=>c.inf.hgt ? ft(c.inf.hgt) : '' },
      { k: 'cost', l: 'Value of construction ($)', p: 0, x: 340, y: 226, s: 9.5, money: true, def: c=>c.inf.cost },
      { k: 'zdist', l: 'Zoning district', p: 0, x: 34, y: 189, s: 9.5, def: c=>c.dev.zone },
      { k: 'setReq', l: 'Building setback — required', p: 0, x: 199, y: 201, s: 9 },
      { k: 'sideReq', l: 'Side yard, each — required', p: 0, x: 343, y: 201, s: 9 },
      { k: 'rearReq', l: 'Rear yard — required', p: 0, x: 449, y: 201, s: 9 },
      { k: 'setProv', l: 'Building setback — provided', p: 0, x: 199, y: 189, s: 9 },
      { k: 'sideProv', l: 'Side yard, each — provided', p: 0, x: 343, y: 189, s: 9 },
      { k: 'rearProv', l: 'Rear yard — provided', p: 0, x: 449, y: 189, s: 9 },
      { k: 'septic', l: 'Distance to septic system', p: 0, x: 291, y: 154, s: 9, def: ()=>'N/A - public sewer' },
      { sec: 'Easements' },
      { k: 'qEase', l: 'Property contains easements?', type: 'choice', p: 0, opts: YND([[237, 104], [288, 104], [338, 104]]) },
      { k: 'qSwale', l: 'Swale, ditch, stream on the property?', type: 'choice', p: 0, opts: YND([[263, 82], [312, 82], [364, 82]]) },
      { k: 'qUtil', l: 'Underground utilities / poles?', type: 'choice', p: 0, opts: YND([[328, 60], [377, 60], [427, 60]]) },
      { k: 'qShrub', l: 'Shrubs, plants along the rear? (page 2)', type: 'choice', p: 1, opts: YND([[266, 765], [318, 765], [370, 765]]) },
      { sec: 'Restrictions, variances, environment (page 2)' },
      { k: 'qDeed', l: 'Deed restrictions?', type: 'choice', p: 1, opts: YND([[233, 721], [287, 721], [339, 721]]) },
      { k: 'deedList', l: 'If yes, what restrictions', p: 1, x: 168, y: 701, s: 9 },
      { k: 'qVar', l: 'Zoning variances or relief?', type: 'choice', p: 1, opts: YND([[41, 633], [86, 633], [134, 633]]) },
      { k: 'varWhat', l: 'If yes, what relief', p: 1, x: 334, y: 635, s: 9 },
      { k: 'qRezone', l: 'Property rezoned?', type: 'choice', p: 1, opts: YND([[268, 611], [334, 611], [397, 611]]) },
      { k: 'rezWhat', l: 'If yes, changed to what district', p: 1, x: 240, y: 591, s: 9 },
      { k: 'qSlope', l: 'Steep slopes or contours?', type: 'choice', p: 1, opts: YND([[266, 543], [334, 543], [398, 543]]) },
      { k: 'qFlood', l: 'Floods / flood zone / wetlands?', type: 'choice', p: 1, opts: YND([[356, 521], [416, 521], [471, 521]]) },
      { sec: 'Verification (page 2)' },
      { k: 'vname', l: 'I, (name)', p: 1, x: 45, y: 329, s: 9.5, def: c=>c.co.applicant || c.co.name },
      { k: 'sig', l: 'Applicant\'s signature', type: 'sig', p: 1, x: 36, y: 244, w: 112 },
      { k: 'date', l: 'Date', p: 1, x: 228, y: 244, s: 9.5, def: c=>c.date },
    ] },
    'tulpe-building': { title: 'Building permit application', pages: 2, h: 843, files: ['forms/tulpehocken-building.pdf'], fields: [
      { k: 'muni', l: 'Municipality', p: 0, x: 238, y: 727, def: c=>c.dev.borough },
      { k: 'adate', l: 'Application date', p: 0, x: 146, y: 710, def: c=>c.date },
      { sec: '1. Property information' },
      { k: 'taxmap', l: 'Tax map', p: 0, x: 116, y: 676, s: 9 },
      { k: 'site1', l: 'Site address', p: 0, x: 246, y: 676, def: c=>c.street + (c.lot ? '   (MM Lot ' + c.lot + ')' : '') },
      { k: 'parcel', l: 'Parcel no.', p: 0, x: 120, y: 656, s: 8, def: c=>c.inf.parcel },
      { k: 'site2', l: 'Site address — second line', p: 0, x: 246, y: 652, def: c=>c.dev.city + ' ' + c.dev.zip },
      { k: 'zone', l: 'Zone', type: 'choice', p: 0, def: ()=>'Residential', opts: [
        { v: 'Agricultural', mark: [151, 634] }, { v: 'Commercial', mark: [217, 634] }, { v: 'Conservation', mark: [284, 634] },
        { v: 'Industrial', mark: [343, 634] }, { v: 'Residential', mark: [406, 634] }] },
      { sec: '2. Owner\'s information' },
      { k: 'ofirst', l: 'Owner — first name (or company)', p: 0, x: 85, y: 594, def: c=>c.co.name },
      { k: 'omi', l: 'MI', p: 0, x: 200, y: 594 },
      { k: 'olast', l: 'Last name', p: 0, x: 298, y: 594 },
      { k: 'ophone', l: 'Phone no.', p: 0, x: 461, y: 594, def: c=>c.co.phone },
      { k: 'ostreet', l: 'Street address', p: 0, x: 85, y: 554, def: c=>addr(c.co.address).street },
      { k: 'ocity', l: 'City', p: 0, x: 235, y: 554, def: c=>addr(c.co.address).city },
      { k: 'ostate', l: 'State', p: 0, x: 359, y: 554, def: c=>addr(c.co.address).state },
      { k: 'ozip', l: 'Zip', p: 0, x: 452, y: 554, def: c=>addr(c.co.address).zip },
      { sec: '3. Building permit application' },
      { k: 'desc1', l: 'Description of work', p: 0, x: 88, y: 495, def: c=>'Construct new ' + (c.inf.len && c.inf.wid ? ft(c.inf.len) + ' x ' + ft(c.inf.wid) + ' ' : '') + 'single family dwelling' },
      { k: 'desc2', l: 'Description — line 2', p: 0, x: 88, y: 479, def: c=>[c.job.model ? c.job.model + ' model' : '', c.inf.sqft ? Number(c.inf.sqft).toLocaleString('en-US') + ' sq ft' : '', c.dev.subdivision + (c.lot ? ' Lot ' + c.lot : '')].filter(Boolean).join(', ') },
      { k: 'desc3', l: 'Description — line 3', p: 0, x: 88, y: 463, def: ()=>'See attached plans and plot plan' },
      { k: 'cost', l: 'Estimated cost of construction ($)', p: 0, x: 246, y: 311, money: true, def: c=>c.inf.cost },
      { k: 'start', l: 'Estimated start date (M/D/YY)', p: 0, x: 190, y: 289, slots: [192, 219, 245] },
      { k: 'finish', l: 'Estimated completion date (M/D/YY)', p: 0, x: 462, y: 288, slots: [464, 490, 515] },
      { sec: '4. Certification' },
      { k: 'sig', l: 'Applicant signature', type: 'sig', p: 0, x: 188, y: 182, w: 220 },
      { k: 'sdate', l: 'Date', p: 0, x: 440, y: 183, def: c=>c.date },
      { k: 'aaddr', l: 'Address', p: 0, x: 121, y: 164, def: c=>c.co.address },
      { k: 'aphone', l: 'Phone no.', p: 0, x: 400, y: 164, def: c=>c.co.phone },
      { sec: '5. Contractor information (page 2)' },
      { k: 'cname', l: 'Name of contractor', p: 1, x: 153, y: 735, def: c=>c.co.name },
      { k: 'cphone', l: 'Phone no.', p: 1, x: 424, y: 735, def: c=>c.co.phone },
      { k: 'ceo', l: 'Chief executive officer', p: 1, x: 166, y: 715 },
      { k: 'ceophone', l: 'CEO phone no.', p: 1, x: 426, y: 715 },
      { k: 'charge', l: 'Person in charge of work', p: 1, x: 174, y: 695, def: c=>c.co.applicant },
      { k: 'chphone', l: 'Phone no. (person in charge)', p: 1, x: 427, y: 695, def: c=>c.co.phone },
      { k: 'caddr', l: 'Contractor address', p: 1, x: 152, y: 675, def: c=>addr(c.co.address).street },
      { k: 'ccity', l: 'City', p: 1, x: 102, y: 654, def: c=>addr(c.co.address).city },
      { k: 'cstate', l: 'State', p: 1, x: 352, y: 654, def: c=>addr(c.co.address).state },
      { k: 'czip', l: 'Zip', p: 1, x: 466, y: 654, def: c=>addr(c.co.address).zip },
      { k: 'wcomp', l: 'Proof of workman\'s compensation insurance', p: 1, x: 248, y: 634, s: 9.5, def: ()=>'Certificate attached' },
      { sec: '6. Subcontractors (optional)' },
      ...[583, 553, 523, 493, 463].flatMap((y, i)=>[
        { k: 'sub' + i, l: 'Subcontractor ' + (i + 1), p: 1, x: 85, y, s: 9.5 },
        { k: 'subc' + i, l: 'City, state, zip', p: 1, x: 287, y, s: 9.5 },
        { k: 'subp' + i, l: 'Phone no.', p: 1, x: 442, y, s: 9.5 }]),
    ] },
  };

  /* REQUIRED (owner, 2026-10-26: "marked in red [the] sections that need to be filled out before you can send"): the lines the
     borough marks "(Required)" plus what the office's filled CL 113 applications always had. Empty ones show red; Download / Print
     list what's missing first. Lines left blank on those examples (UPI, zoning district, value, cell phones, second owner) stay optional. */
  const REQUIRED = {
    'cornwall-ws': ['street', 'city', 'zip', 'subdiv', 'lot', 'use', 'units', 'oname', 'oaddr', 'owork', 'cname', 'lic', 'wdate1', 'wsig1', 'wname1',
      'sname', 'btype', 'saddr1', 'saddr2', 'saddr3', 'sphone', 'ssig', 'sdate'],
    'cornwall-zoning': ['owner', 'maddr', 'ophone', 'bname', 'baddr', 'bphone', 'site', 'ptype', 'future', 'desc', 'puse', 'cost', 'len', 'wid', 'hgt', 'sqft', 'sig', 'date'],
    // MM: what the township's zoning checklist calls for, and what the office wrote on MM 69's driveway application
    'tulpe-drive': ['name', 'phone', 'addr', 'zip', 'site', 'subdiv', 'lotsize', 'slopeEx', 'slopePr', 'dwWidth', 'roadSlope', 'roadW', 'shoulder', 'speed',
      'sightExL', 'sightExR', 'sightPrL', 'sightPrR', 'inter', 'propLine', 'storm1', 'vname', 'sig', 'date'],
    'tulpe-zoning': ['name', 'phone', 'maddr', 'zip', 'loc', 'parcel', 'subdiv', 'storm', 'desc', 'dims', 'area', 'stories', 'cost',
      'qEase', 'qSwale', 'qUtil', 'qShrub', 'qDeed', 'qVar', 'qRezone', 'qSlope', 'qFlood', 'vname', 'sig', 'date'],
    'tulpe-building': ['muni', 'adate', 'site1', 'site2', 'zone', 'ofirst', 'ophone', 'ostreet', 'ocity', 'ostate', 'ozip', 'desc1', 'cost',
      'sig', 'sdate', 'aaddr', 'aphone', 'cname', 'cphone', 'caddr', 'ccity', 'cstate', 'czip'],
  };
  Object.entries(REQUIRED).forEach(([id, ks])=>FORMS[id].fields.forEach(f=>{ if(ks.includes(f.k)) f.req = true; }));
  // a choice that needs its own line filled: "Other" needs the explanation, "Apartments" the number of units
  const NEEDS_TEXT = { ptype: { Other: 'pother' }, btype: { Apartments: 'aunits', Other: 'bother' }, qDeed: { Yes: 'deedList' }, qVar: { Yes: 'varWhat' }, qRezone: { Yes: 'rezWhat' } };
  let settings = null, ed = null;   // ed = the form screen that's open { form, step }
  const $ = id=>document.getElementById(id);
  const esc = s=>(s == null ? '' : String(s)).replace(/[&<>"']/g, c=>({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = ()=>{ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const short = s=>{ if(!s) return ''; const [y, m, d] = s.split('-'); return Number(m) + '/' + Number(d) + '/' + y.slice(2); };
  const nice = s=>{ if(!s) return ''; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };
  const J = ()=>window.PERMIT_JOB || (typeof job !== 'undefined' ? job : null);
  const hasJob = ()=>!!J();
  const P = ()=>(hasJob() && J().permits) || {};
  const begun = j=>!!(j && (j.selectionSheet || (j.permits || {}).start));

  /* RED BANNER (owner, 2026-10-26): a home signed through Selections (jobs.selectionSheet) shows a red bar at the top of its page
     while a permit step is waiting on us (next step not submitted yet). It goes away while the borough has it, and when all are done. */
  function banner(dev, steps, p){
    let b = $('permitsBanner');
    const home = $('home');
    if(!b && home){ b = document.createElement('a'); b.id = 'permitsBanner'; b.href = '#permitsCard';
      b.addEventListener('click', ()=>{ if(!pOpen) setOpen(true); });
      b.style.cssText = 'display:none; margin:0 0 14px; padding:12px 16px; border-radius:10px; background:#b3261e; color:#fff; font-weight:700; font-size:15px; text-decoration:none; box-shadow:0 2px 8px rgba(179,38,30,.25);';
      home.insertBefore(b, home.firstChild); }
    if(!b) return;
    const nowIdx = steps.findIndex(s=>!(p[s.id] || {}).ok), st = nowIdx < 0 ? null : steps[nowIdx];
    const due = begun(J()) && st && !(p[st.id] || {}).sent;
    b.style.display = due ? 'block' : 'none';
    if(due) b.innerHTML = `&#9888; Permits need to be sent out${dev ? ': ' + esc(st.t.toLowerCase()) : ''}${st.form && dev ? ' — fill out the form' + (st.form === 'ws' ? 's' : '') + ', check the pages, then send' : ''}. <span style="font-weight:400; text-decoration:underline;">Open Permits</span>`;
  }

  const CSS = `
    .pm-step{display:grid; grid-template-columns:28px minmax(0,1fr); gap:4px 10px; padding:12px 0; border-top:1px solid #eee;}
    .pm-step:first-child{border-top:none;}
    .pm-n{width:26px; height:26px; border-radius:50%; background:#e9ebe4; color:#4c5144; font-weight:800; display:flex; align-items:center; justify-content:center; font-size:13px;}
    .pm-step.ok .pm-n{background:#2f6b45; color:#fff;} .pm-step.now .pm-n{background:#1f3550; color:#fff;}
    .pm-t{font-weight:700;} .pm-h{font-size:12.5px; color:#777; margin-top:2px;}
    .pm-row{grid-column:2; display:flex; gap:8px 14px; flex-wrap:wrap; align-items:flex-end; margin-top:8px; font-size:13px;}
    .pm-row label{display:flex; flex-direction:column; gap:3px; font-size:11px; font-weight:700; letter-spacing:.3px; text-transform:uppercase; color:#777;}
    .pm-row input{padding:7px 8px; border:1px solid #d6d2c4; border-radius:6px; font-size:14px; font-family:inherit; text-transform:none; letter-spacing:0; font-weight:400; color:#222;}
    .pm-wrap{display:flex; flex-wrap:wrap; gap:6px 22px; align-items:flex-start;} .pm-steps{flex:1 1 420px; min-width:0;}
    .pm-side{flex:0 1 300px; min-width:240px; background:#faf8f1; border:1px solid #e6e1cf; border-radius:10px; padding:12px 14px; margin-top:10px; font-size:13px;}
    .pm-side-t{font-size:11.5px; font-weight:800; letter-spacing:.5px; text-transform:uppercase; color:#6b7355; display:flex; justify-content:space-between; gap:8px; margin-bottom:6px;}
    .pm-side-t span{text-transform:none; letter-spacing:0; font-weight:700; color:#b3261e;}
    .pm-chk{display:flex; gap:9px; align-items:flex-start; padding:7px 0; border-top:1px solid #ece7d6; cursor:pointer; line-height:1.35;}
    .pm-chk input{margin-top:3px; width:16px; height:16px; flex:none;} .pm-chk small{display:block; color:#777; font-size:12px;}
    .pm-chk.done b, .pm-chk.done > span{color:#8a8a8a;} .pm-chk.done b{text-decoration:line-through;}
    .pm-bring{margin:0; padding-left:18px; color:#444; line-height:1.45;} .pm-side-n{margin-top:10px; font-size:12px; color:#777;}
    .pm-next{background:#f3f5ee; border:1px solid #dfe3d3; border-radius:8px; padding:9px 12px; font-size:14px; margin-bottom:6px;}
    #permitsCard.open .tl-arrow{transform:rotate(90deg);}
    .pm-btn{border:1px solid #d6d2c4; background:#fff; border-radius:8px; padding:8px 13px; font-size:13.5px; font-weight:700; font-family:inherit; cursor:pointer; color:#1f3550;}
    .pm-btn.primary{background:#1f3550; border-color:#1f3550; color:#fff;} .pm-btn:disabled{opacity:.55; cursor:default;}
    /* the form screen */
    .pf-ov{position:fixed; inset:0; background:rgba(30,32,34,.45); z-index:400; display:flex; justify-content:center; align-items:flex-start; overflow:auto; padding:16px;}
    .pf-box{background:#fff; border-radius:12px; width:min(860px,100%); box-shadow:0 10px 40px rgba(0,0,0,.25); margin:auto 0;}
    .pf-head{position:sticky; top:0; background:#fff; border-bottom:1px solid #eee; padding:14px 18px; display:flex; gap:10px; align-items:center; flex-wrap:wrap; border-radius:12px 12px 0 0; z-index:1;}
    .pf-head h2{margin:0; font-size:18px; color:#1f3550; flex:1 1 240px;}
    .pf-body{padding:6px 18px 18px;}
    .pf-sec{font-size:12px; font-weight:800; letter-spacing:.5px; text-transform:uppercase; color:#6b7355; margin:18px 0 6px; padding-top:10px; border-top:1px solid #eee;}
    .pf-sec:first-child{border-top:none;}
    .pf-grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:10px 14px;}
    .pf-f{display:flex; flex-direction:column; gap:3px; font-size:12px; font-weight:700; color:#666;}
    .pf-f input, .pf-f select{padding:8px 9px; border:1px solid #d6d2c4; border-radius:6px; font-size:14px; font-family:inherit; color:#222; background:#fff;}
    .pf-f.changed input, .pf-f.changed select{border-color:#c79a2a; background:#fffaf0;}
    .pf-f .pf-x{font-size:11px; font-weight:600; color:#a07a1c; cursor:pointer; background:none; border:none; padding:0; text-align:left; font-family:inherit;}
    .pf-sig{display:flex; gap:8px; align-items:center; font-size:13.5px; font-weight:600; color:#333; padding:8px 0;}
    .pf-sig img{height:30px; border-bottom:1px solid #ccc;}
    .pf-note{font-size:12.5px; color:#777; margin-top:4px;}
    .pf-box.wide{width:min(900px,100%);}
    .pf-needn{font-size:13px; font-weight:800; border-radius:12px; padding:4px 10px;} .pf-needn.bad{background:#fbeae4; color:#b3261e;} .pf-needn.ok{background:#eaf1ec; color:#27573a;}
    .pf-ol input.pf-in.need{background:rgba(220,40,30,.13); border-bottom:2px solid #c62828 !important; box-shadow:0 0 0 1px rgba(198,40,40,.55) !important;}
    .pf-ol input.pf-in.need::placeholder{color:rgba(180,30,30,.55);}
    .pf-ring.need{border:1.5px dashed #c62828;} .pf-mark.need{border:1.5px dashed #c62828; background:rgba(220,40,30,.12);}
    .pf-sigbox.need{border:1.5px dashed #c62828; background:rgba(220,40,30,.1);} .pf-sigbox.need span{color:#b3261e; font-weight:700;}
    .pf-f.need input, .pf-f.need select{border-color:#c62828; background:#fdf1ef;} .pf-f.need{color:#b3261e;} .pf-sig.need{color:#b3261e;}
    .pf-views{display:inline-flex; border:1px solid #d6d2c4; border-radius:20px; overflow:hidden;}
    .pf-views button{border:none; background:#fff; padding:7px 12px; font-size:13px; font-weight:700; font-family:inherit; cursor:pointer; color:#666;}
    .pf-views button.on{background:#1f3550; color:#fff;}
    .pf-pages{display:flex; flex-direction:column; gap:16px; align-items:center; margin-top:10px;}
    .pf-page{position:relative; width:100%; max-width:860px; aspect-ratio:612/792; background:#fff; box-shadow:0 1px 8px rgba(0,0,0,.2); container-type:inline-size;}
    .pf-cv, .pf-ol{position:absolute; inset:0;} .pf-cv canvas{width:100%; height:100%; display:block;}
    .pf-loading{padding:30px; color:#999; font-size:14px;}
    .pf-ol input.pf-in{position:absolute; box-sizing:border-box; border:none !important; border-bottom:1px dashed rgba(31,53,80,.3) !important; background:rgba(255,228,120,.22); color:#0d1f73; font-family:Helvetica,Arial,sans-serif; padding:0 2px !important; margin:0; outline:none; border-radius:2px; box-shadow:none !important; min-height:0; line-height:1;}
    .pf-ol input.pf-in:hover{background:rgba(255,228,120,.38);} .pf-ol input.pf-in:focus{background:rgba(120,170,255,.22); border-bottom:1px solid #1f3550 !important;}
    .pf-ol input.pf-in.changed{background:rgba(255,190,60,.38);}
    .pf-in::placeholder{color:rgba(60,60,60,.28);}
    .pf-ring{position:absolute; border:1.5px dashed rgba(31,53,80,.25); border-radius:50%; background:none; cursor:pointer; padding:0; margin:0;}
    .pf-ring:hover{border-color:rgba(31,53,80,.6);} .pf-ring.on{border:2px solid #1f3d8a;}
    .pf-mark{position:absolute; border:1px dashed rgba(31,53,80,.3); background:rgba(255,228,120,.22); cursor:pointer; color:#0d1f73; font-weight:700; font-size:2.1cqw; padding:0; margin:0; line-height:1; font-family:Helvetica,Arial,sans-serif;}
    .pf-mark.on{border-color:transparent; background:none;}
    .pf-sigbox{position:absolute; border:1px dashed rgba(31,53,80,.35); background:rgba(255,228,120,.2); cursor:pointer; padding:0; margin:0; display:flex; align-items:flex-end; overflow:hidden;}
    .pf-sigbox span{font-size:1.5cqw; color:#8a6d1a; padding:0 0 2px 4px;} .pf-sigbox img{height:100%; display:block;} .pf-sigbox.on{border-color:transparent; background:none;}`;

  /* On the house page (owner, 2026-10-26) the card is the LAST one and starts CLOSED, like the Timeline: its bar shows where the
     permits stand; the red banner, a bell link (#permitsCard) or a click opens it. In the Permits app it's always open. */
  let pOpen = location.hash === '#permitsCard';
  function setOpen(v){ pOpen = v; if(hasJob()) renderPermits(); }
  function card(){
    let c = $('permitsCard');
    if(c) return c;
    const mount = $('permitsMount'), last = $('timelineCard'), before = $('costs'); if(!mount && !last && !before) return null;
    c = document.createElement('div'); c.className = mount ? 'card2' : 'card wide'; c.id = 'permitsCard';
    if(!mount) c.innerHTML = `<button type="button" class="tl-toggle" id="permitsToggle" aria-expanded="false">
        <span class="card-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M9 15l2 2 4-4"/></svg></span>
        <span class="tl-title">Permits</span><span class="tl-hint" id="permitsHint"></span><span class="tl-arrow">&#9654;</span></button>
      <div class="card-body" id="permitsBody" style="display:none;"></div>`;
    else c.innerHTML = `<div class="card-head"><div class="card-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M9 15l2 2 4-4"/></svg></div><h3>Permits</h3></div>
      <div class="card-body" id="permitsBody"></div>`;
    if(!$('pfCss')){ const st = document.createElement('style'); st.id = 'pfCss'; st.textContent = CSS; document.head.appendChild(st); }
    if(mount) mount.appendChild(c); else if(last) last.parentNode.insertBefore(c, last.nextSibling); else before.parentNode.insertBefore(c, before);
    c.addEventListener('click', onCardClick);
    c.addEventListener('change', onCardChange);
    return c;
  }
  // the details typed for this home that the forms start from (sizes, cost, parcel)
  function info(){
    const job = J(), i = { ...(P().info || {}) };
    /* NO SIZES FROM THE HOME STYLE (owner, 2026-11-16: "houses sizes change a fair amount based on how custom they are so we can't
       auto input sizes"): length / width / height / sq ft come only from what was typed for THIS home (permits.info, set whenever a size
       is typed on any of its forms, so the home's other forms pick it up). Nothing is read from settings/permits.models or jobs.size. */
    void job; return i;
  }
  window.renderPermits = function(){
    if(!hasJob()) return;
    const job = J(), dev = PERMIT_DEVS[job.community], STEPS = stepsOf(dev);
    const c = card(); if(!c) return;
    c.style.display = '';
    const p = P();
    banner(dev, STEPS, p);
    const doneIdx = STEPS.filter(s=>(p[s.id] || {}).ok).length;
    const nowIdx = STEPS.findIndex(s=>!(p[s.id] || {}).ok);
    const next = nowIdx < 0 ? 'All permits approved.' : (p[STEPS[nowIdx].id] || {}).sent ? `Waiting on: ${STEPS[nowIdx].t.toLowerCase()} (submitted ${nice(p[STEPS[nowIdx].id].sent)}).` : `Next: ${STEPS[nowIdx].form ? 'fill out and submit' : 'apply for'} the ${STEPS[nowIdx].t.toLowerCase()}.`;
    const tg = $('permitsToggle');
    if(tg){
      c.classList.toggle('open', pOpen); tg.setAttribute('aria-expanded', String(pOpen));
      $('permitsHint').innerHTML = pOpen ? 'Hide' : `<span style="color:${nowIdx >= 0 && !(p[STEPS[nowIdx].id] || {}).sent && begun(job) ? '#b3261e' : 'inherit'}">${esc(next)}</span>`;
      $('permitsBody').style.display = pOpen ? 'block' : 'none';
      // opened from a bell link: the card is drawn after the page loads, so scroll to it once
      if(pOpen && location.hash === '#permitsCard' && !card.scrolled){ card.scrolled = true; setTimeout(()=>c.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400); }
    }
    const nothingYet = !begun(J()) && !STEPS.some(s=>p[s.id] && (p[s.id].sent || p[s.id].ok));
    $('permitsBody').innerHTML = `<div class="pm-next"><b>${esc(next)}</b> <span style="color:#777">${doneIdx} of ${STEPS.length} approved${dev ? ' · ' + esc(dev.borough) : ''}</span></div>
      ${nothingYet ? `<div style="margin:8px 0 4px; padding:10px 12px; background:#f6f5f0; border-radius:8px; font-size:13px;">Not signed through Selections yet. Applying for permits early? <button type="button" class="pm-btn primary" data-pmstart="1" style="margin-left:6px;">Start permits for this home</button></div>`
        : p.start && !J().selectionSheet ? `<div style="margin:6px 0 2px; font-size:12.5px; color:#777;">Permits started ${esc(nice(p.start))} (before Selections). <a href="#" data-pmstop="1" style="color:#777;">Undo</a></div>` : ''}
      <div class="pm-wrap"><div class="pm-steps">
      ${STEPS.map((s, i)=>{ const st = p[s.id] || {};
        return `<div class="pm-step ${st.ok ? 'ok' : i === nowIdx ? 'now' : ''}"><div class="pm-n">${st.ok ? '&#10003;' : i + 1}</div>
          <div><div class="pm-t">${esc(s.t)}</div><div class="pm-h">${esc(s.hint)}</div></div>
          <div class="pm-row">${s.form && dev && dev.forms[s.form] ? `<button type="button" class="pm-btn ${i === nowIdx && !st.sent ? 'primary' : ''}" data-fill="${s.form}">Fill out the form${s.form === 'ws' ? 's' : ''}${(()=>{ const n = missingFor(dev.forms[s.form]).length; return n ? ` · <span style="color:${i === nowIdx && !st.sent ? '#ffd6d2' : '#b3261e'}">${n} to fill in</span>` : ' · ready'; })()}</button>` : ''}
            <label>Submitted<input type="date" data-pm="${s.id}.sent" value="${esc(st.sent || '')}"></label>
            <label>Approved<input type="date" data-pm="${s.id}.ok" value="${esc(st.ok || '')}"></label>
            ${s.no ? `<label>Permit #<input type="text" data-pm="${s.id}.no" value="${esc(st.no || '')}" style="width:130px"></label>` : ''}</div></div>`; }).join('')}
      </div>${dev && dev.checks ? sideBox(dev, p) : ''}</div>`;
    if(ed) renderEditor();
  };
  /* CHECKS TO WRITE (owner, 2026-11-16: "what checks to fill out … show up when you click on a MM house as a reminder on the side"):
     the office's permitting checklist beside the steps — each check (who to, how much, what for) with a "Written" tick saved on the
     home as permits.checks[id] = date, and what has to go in with each application. */
  function sideBox(dev, p){
    const done = p.checks || {}, left = dev.checks.filter(c=>!done[c.id]).length;
    return `<aside class="pm-side"><div class="pm-side-t">Checks to write <span>${left ? left + ' to go' : 'all written'}</span></div>
      ${dev.checks.map(c=>`<label class="pm-chk ${done[c.id] ? 'done' : ''}"><input type="checkbox" data-pmcheck="${c.id}" ${done[c.id] ? 'checked' : ''}>
        <span><b>${esc(c.amt)}</b> to ${esc(c.to)}<small>${esc(c.what)}${done[c.id] ? ' · written ' + esc(nice(done[c.id])) : ''}</small></span></label>`).join('')}
      ${dev.bring ? `<div class="pm-side-t" style="margin-top:12px;">Send along</div><ul class="pm-bring">${dev.bring.map(b=>`<li>${esc(b)}</li>`).join('')}</ul>` : ''}
      ${dev.note ? `<div class="pm-side-n">${esc(dev.note)}</div>` : ''}</aside>`;
  }
  async function save(patch){
    try{ await db.collection('jobs').doc(J().id).set({ permits: patch }, { merge: true }); }
    catch(err){ console.error(err); alert('Could not save — check your connection.'); }
  }
  function onCardChange(e){
    const el = e.target;
    if(el.dataset.pmcheck){ save({ checks: { [el.dataset.pmcheck]: el.checked ? today() : '' } }); return; }
    if(!el.dataset.pm) return;
    const [step, f] = el.dataset.pm.split('.');
    save({ [step]: { [f]: f === 'no' ? el.value.trim().slice(0, 40) : el.value } });
  }
  function onCardClick(e){
    if(e.target.closest('#permitsToggle')){ setOpen(!pOpen); return; }
    if(e.target.closest('[data-pmstart]')){ const d = new Date(); save({ start: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }); return; }
    if(e.target.closest('[data-pmstop]')){ e.preventDefault(); save({ start: '' }); return; }
    const b = e.target.closest('[data-fill]'); if(!b) return;
    const dev = PERMIT_DEVS[J().community];
    ed = { step: b.dataset.fill, form: dev.forms[b.dataset.fill] };
    renderEditor();
  }

  /* ---- the form screen ---- */
  function ctx(){
    const job = J(), co = (settings && settings.company) || {};
    return { job, co, dev: PERMIT_DEVS[job.community], inf: info(), street: job.address || '', lot: job.lot || '', date: short(today()) };
  }
  const saved = form=>((P().forms || {})[form.id] || {});
  function defOf(f, c){
    const v = f.def ? f.def(c) : '';
    if(f.size && v !== '' && v != null) return f.k === 'sqft' ? String(v) : String(v);
    return v == null ? '' : String(v);
  }
  function valOf(f, c, form){ const s = saved(form); return Object.prototype.hasOwnProperty.call(s, f.k) ? s[f.k] : defOf(f, c); }
  // the blanks still empty that must be filled (labels, in form order)
  function missingKeys(formId, c){
    const form = { id: formId, ...FORMS[formId] }, out = [];
    const need = new Set(form.fields.filter(f=>f.req).map(f=>f.k));
    form.fields.forEach(f=>{ if(f.type === 'choice' && NEEDS_TEXT[f.k]){ const k = NEEDS_TEXT[f.k][valOf(f, c, form)]; if(k) need.add(k); } });
    form.fields.forEach(f=>{
      if(f.sec || !need.has(f.k)) return;
      const v = valOf(f, c, form);
      if(f.type === 'sig' ? !((v === true || v === 'yes') && settings && settings.signature) : String(v == null ? '' : v).trim() === '') out.push(f.k);
    });
    return out;
  }
  function missingFor(formId){ try{ return missingKeys(formId, ctx()); } catch(e){ return []; } }
  /* ON THE FORM (owner, 2026-10-26: the list "is a little disorienting if you're used to filling out the paper version"): the form
     screen shows the borough's own pages (drawn with pdf.js) with a box on every blank, a click spot on every circle / X and on each
     signature line — the same positions the PDF is written at. "As a list" keeps the plain list of boxes. */
  const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs', PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
  let pdfjsP = null;
  const pdfjsLib = ()=>pdfjsP || (pdfjsP = import(PDFJS).then(m=>{ m.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; return m; }));
  // a box's place on the page as % (x, top edge, width, height in PDF points; the page is 612 x 792)
  const pos = (x, yTop, w, h, H = 792)=>`left:${(x / 612 * 100).toFixed(3)}%; top:${((H - yTop) / H * 100).toFixed(3)}%; width:${(w / 612 * 100).toFixed(3)}%; height:${(h / H * 100).toFixed(3)}%;`;
  // how wide a blank is: up to the next blank on the same line, or the page's right margin
  function widthOf(f, form){
    const next = form.fields.filter(g=>!g.sec && g.p === f.p && g.type !== 'choice' && g.x > f.x + 5 && Math.abs(g.y - f.y) < 6).map(g=>g.x);
    return Math.max(30, Math.min(next.length ? Math.min(...next) - 8 : 575, 575) - f.x);
  }
  async function drawPages(formId, host){
    const lib = await pdfjsLib(), form = FORMS[formId]; let n = 0;
    for(const file of form.files){
      const doc = await lib.getDocument(file).promise;
      for(let i = 1; i <= doc.numPages; i++, n++){
        const wrap = host.querySelector(`[data-page="${n}"] .pf-cv`); if(!wrap || !wrap.isConnected) return;
        const page = await doc.getPage(i), dpr = Math.min(2, window.devicePixelRatio || 1);
        const vp = page.getViewport({ scale: Math.max(1, wrap.clientWidth / 612) * dpr });
        const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
        await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        wrap.replaceChildren(cv);
      }
    }
  }
  // the boxes on each page: made once, then kept up to date (so typing is never interrupted)
  function buildOverlays(form){
    for(let p = 0; p < form.pages; p++){
      const H = form.h || 792, ol = document.querySelector(`#pfPages [data-page="${p}"] .pf-ol`); if(!ol) continue;
      ol.innerHTML = form.fields.filter(f=>!f.sec && f.p === p).map(f=>{
        if(f.type === 'choice') return f.opts.map(o=>o.ring
          ? `<button type="button" class="pf-ring" data-choice="${f.k}|${esc(o.v)}" title="${esc(f.l)}: ${esc(o.v)}" style="${pos(o.ring[0] - o.ring[2], o.ring[1] + o.ring[3], o.ring[2] * 2, o.ring[3] * 2, H)}"></button>`
          : `<button type="button" class="pf-mark" data-choice="${f.k}|${esc(o.v)}" title="${esc(f.l)}: ${esc(o.v)}" style="${pos(o.mark[0] - 3, o.mark[1] + 13, 16, 15, H)}"></button>`).join('');
        if(f.type === 'sig') return `<button type="button" class="pf-sigbox" data-sig="${f.k}" title="${esc(f.l)}" style="${pos(f.x, f.y + 26, f.w || 190, 30, H)}"></button>`;
        const sz = f.s || 10.5;
        return `<input type="text" class="pf-in" data-pf="${f.k}" title="${esc(f.l)}" placeholder="${esc(f.l)}" autocomplete="off" ${f.money ? 'inputmode="decimal"' : ''} style="${pos(f.x - 2, f.y + sz + 1.5, f.slots ? f.slots[f.slots.length - 1] + 26 - f.x : widthOf(f, form), sz + 5, H)} font-size:${(sz / 612 * 100).toFixed(3)}cqw;">`;
      }).join('');
    }
  }
  function refreshOverlays(form, c){
    const s = saved(form), sig = settings && settings.signature, host = $('pfPages'); if(!host) return;
    const miss = new Set(missingKeys(form.id, c));
    host.querySelectorAll('.need').forEach(x=>x.classList.remove('need'));
    miss.forEach(k=>host.querySelectorAll(`[data-pf="${k}"], [data-sig="${k}"], [data-choice^="${k}|"]`).forEach(x=>x.classList.add('need')));
    needCount(miss.size);
    form.fields.forEach(f=>{
      if(f.sec) return;
      const v = valOf(f, c, form), changed = Object.prototype.hasOwnProperty.call(s, f.k) && String(s[f.k]) !== defOf(f, c);
      if(f.type === 'choice'){ host.querySelectorAll(`[data-choice^="${f.k}|"]`).forEach(b=>{ const on = b.dataset.choice.slice(f.k.length + 1) === v; b.classList.toggle('on', on); if(b.classList.contains('pf-mark')) b.textContent = on ? 'X' : ''; }); return; }
      if(f.type === 'sig'){ const b = host.querySelector(`[data-sig="${f.k}"]`); if(!b) return; const on = (v === true || v === 'yes') && !!sig;
        b.classList.toggle('on', on); b.innerHTML = on ? `<img src="${esc(sig)}" alt="">` : `<span>${sig ? (f.req ? 'Sign here' : 'Click to sign') : 'No signature saved — sign by hand'}</span>`; return; }
      const el = host.querySelector(`[data-pf="${f.k}"]`); if(!el) return;
      el.classList.toggle('changed', changed);
      if(document.activeElement !== el) el.value = f.money && v ? Number(v).toLocaleString('en-US') : v;
    });
  }
  function listBody(form, c){
    const s = saved(form), sig = settings && settings.signature, miss = new Set(missingKeys(form.id, c));
    needCount(miss.size);
    let body = '', grid = [];
    const flush = ()=>{ if(grid.length){ body += `<div class="pf-grid">${grid.join('')}</div>`; grid = []; } };
    form.fields.forEach(f=>{
      if(f.sec){ flush(); body += `<div class="pf-sec">${esc(f.sec)}</div>`; return; }
      const has = Object.prototype.hasOwnProperty.call(s, f.k), v = valOf(f, c, form), changed = has && String(s[f.k]) !== defOf(f, c);
      const undo = changed ? `<button type="button" class="pf-x" data-undo="${f.k}">Use the hub's: ${esc(defOf(f, c) || '(blank)')}</button>` : '';
      if(f.type === 'sig'){
        flush();
        body += `<div class="pf-sig ${miss.has(f.k) ? 'need' : ''}"><label style="display:flex; gap:8px; align-items:center; cursor:${sig ? 'pointer' : 'default'};"><input type="checkbox" data-pf="${f.k}" ${v === true || v === 'yes' ? 'checked' : ''} ${sig ? '' : 'disabled'}> ${esc(f.l)}: add ${esc(c.co.applicant || 'the applicant')}'s signature</label>
          ${sig ? `<img src="${esc(sig)}" alt="">` : '<span class="pf-note">No signature saved yet — draw it in the Permits app → Settings for the forms.</span>'}</div>`;
        return;
      }
      if(f.type === 'choice'){
        grid.push(`<label class="pf-f ${changed ? 'changed' : ''} ${miss.has(f.k) ? 'need' : ''}">${esc(f.l)}${f.req ? ' *' : ''}<select data-pf="${f.k}"><option value="">(none)</option>${f.opts.map(o=>`<option ${o.v === v ? 'selected' : ''}>${esc(o.v)}</option>`).join('')}</select>${undo}</label>`);
        return;
      }
      grid.push(`<label class="pf-f ${changed ? 'changed' : ''} ${miss.has(f.k) ? 'need' : ''}">${esc(f.l)}${f.req ? ' *' : ''}<input type="text" data-pf="${f.k}" value="${esc(f.money && v ? Number(v).toLocaleString('en-US') : v)}" ${f.money ? 'inputmode="decimal"' : ''}>${undo}</label>`);
    });
    flush();
    return body;
  }
  function renderEditor(){
    if(!ed || !hasJob()) return;
    const form = { id: ed.form, ...FORMS[ed.form] }, c = ctx(), view = ed.view || 'form';
    let ov = $('pfOv');
    if(!ov){
      ov = document.createElement('div'); ov.className = 'pf-ov'; ov.id = 'pfOv';
      ov.addEventListener('click', onEdClick); ov.addEventListener('change', onEdChange);
      document.body.appendChild(ov);
      if(!$('pfCss')){ const st = document.createElement('style'); st.id = 'pfCss'; st.textContent = CSS; document.head.appendChild(st); }
    }
    const key = ed.form + '|' + view + '|' + J().id;
    if(ov.dataset.built !== key){
      const missing = !c.co.name || !c.co.address;
      ov.dataset.built = key;
      ov.innerHTML = `<div class="pf-box ${view === 'form' ? 'wide' : ''}"><div class="pf-head"><h2>${esc(form.title)} · ${esc([c.job.community, c.job.lot ? 'Lot ' + c.job.lot : ''].filter(Boolean).join(' '))}</h2>
          <span class="pf-needn" id="pfNeed"></span>
          <span class="pf-views"><button type="button" data-view="form" class="${view === 'form' ? 'on' : ''}">On the form</button><button type="button" data-view="list" class="${view === 'list' ? 'on' : ''}">As a list</button></span>
          <button type="button" class="pm-btn primary" data-act="download">Download PDF</button><button type="button" class="pm-btn" data-act="open">Open to print</button><button type="button" class="pm-btn" data-act="close">Close</button></div>
        <div class="pf-body">${missing ? '<p class="pf-note" style="color:#b3261e; font-weight:700;">Alden\'s details aren\'t set yet — type them in the Permits app → Settings for the forms.</p>' : ''}
          ${view === 'form'
            ? `<p class="pf-note">Fill it in like the paper form: type on any line (the hub has filled in what it knows), click a choice to circle or mark it, click a signature line to sign. Changes are saved for this home; a darker yellow box was changed by hand. The office-use-only parts are left for the borough.</p>
               <div class="pf-pages" id="pfPages">${Array.from({ length: form.pages }, (_, p)=>`<div class="pf-page" data-page="${p}" style="aspect-ratio:612/${form.h || 792}"><div class="pf-cv"><div class="pf-loading">Loading the page…</div></div><div class="pf-ol"></div></div>`).join('')}</div>`
            : `<p class="pf-note">Every blank on the form. Boxes start with what the hub knows; change anything, or fill in what's empty. Changes are saved for this home (a yellow box was changed by hand). Leave a box empty to leave that blank on the form.</p><div id="pfList"></div><p class="pf-note" style="margin-top:14px;">The office-use-only parts of the form are left for the borough.</p>`}</div></div>`;
      if(view === 'form'){ buildOverlays(form); drawPages(ed.form, $('pfPages')).catch(err=>{ console.error(err); document.querySelectorAll('.pf-loading').forEach(x=>{ x.textContent = 'The page couldn\'t be shown — use "As a list".'; }); }); }
    }
    if(view === 'form') refreshOverlays(form, c);
    else {
      const focus = document.activeElement && ov.contains(document.activeElement) ? document.activeElement.dataset.pf : null;
      $('pfList').innerHTML = listBody(form, c);
      if(focus){ const el = ov.querySelector(`[data-pf="${focus}"]`); if(el){ el.focus(); if(el.setSelectionRange && el.type === 'text') el.setSelectionRange(el.value.length, el.value.length); } }
    }
  }
  function needCount(n){ const el = $('pfNeed'); if(!el) return; el.className = 'pf-needn ' + (n ? 'bad' : 'ok'); el.textContent = n ? n + ' still to fill in' : 'All filled in'; }
  function closeEditor(){ ed = null; const ov = $('pfOv'); if(ov) ov.remove(); if(hasJob()) renderPermits(); }
  document.addEventListener('keydown', e=>{ if(e.key === 'Escape' && ed) closeEditor(); });
  // one answer changed: shown at once, saved for this home. A size typed on one form is kept for THIS home only (permits.info), so its
  // other forms start with it — never remembered for the home style (owner, 2026-11-16: every home is custom).
  function setVal(f, v){
    const s = { ...(saved({ id: ed.form })) }; s[f.k] = v;
    J().permits = { ...(J().permits || {}), forms: { ...((J().permits || {}).forms || {}), [ed.form]: s } };
    const patch = { forms: { [ed.form]: { [f.k]: v } } };
    if(f.size){ const n = String(v).replace(/[^\d.]/g, ''); const iv = n !== '' && isFinite(Number(n)) ? Number(n) : '';
      J().permits.info = { ...(J().permits.info || {}), [f.size]: iv }; patch.info = { [f.size]: iv }; }
    save(patch);
  }
  function onEdChange(e){
    const el = e.target; if(!el.dataset || !el.dataset.pf) return;
    const f = FORMS[ed.form].fields.find(x=>x.k === el.dataset.pf); if(!f) return;
    let v = el.type === 'checkbox' ? el.checked : el.value.trim().slice(0, 200);
    if(f.money && v !== '') v = String(v).replace(/[$,\s]/g, '');
    setVal(f, v);
    // a typed box: just mark it (redrawing now would take away the box the person is moving to)
    if(el.type === 'text'){ const c = ctx(), changed = String(v) !== defOf(f, c); el.classList.toggle('changed', changed); const lab = el.closest('.pf-f'); if(lab) lab.classList.toggle('changed', changed);
      const miss = new Set(missingKeys(ed.form, c)); needCount(miss.size);
      document.querySelectorAll('#pfOv [data-pf]').forEach(x=>{ const t = x.closest('.pf-f') || x; t.classList.toggle('need', miss.has(x.dataset.pf)); });
      return; }
    renderEditor();
  }
  async function onEdClick(e){
    if(e.target.id === 'pfOv'){ closeEditor(); return; }
    const u = e.target.closest('[data-undo]');
    if(u){ const k = u.dataset.undo, s = { ...(saved({ id: ed.form })) }; delete s[k];
      J().permits = { ...(J().permits || {}), forms: { ...((J().permits || {}).forms || {}), [ed.form]: s } };
      save({ forms: { [ed.form]: { [k]: firebase.firestore.FieldValue.delete() } } }); renderEditor(); return; }
    const vw = e.target.closest('[data-view]'); if(vw){ ed.view = vw.dataset.view; renderEditor(); return; }
    const ch = e.target.closest('[data-choice]');
    if(ch){ const i = ch.dataset.choice.indexOf('|'), k = ch.dataset.choice.slice(0, i), v = ch.dataset.choice.slice(i + 1);
      const f = FORMS[ed.form].fields.find(x=>x.k === k), cur = valOf(f, ctx(), { id: ed.form });
      setVal(f, cur === v ? '' : v); renderEditor(); return; }
    const sg = e.target.closest('[data-sig]');
    if(sg){ if(!settings || !settings.signature){ alert('No signature saved yet — draw it in the Permits app → Settings for the forms.'); return; }
      const f = FORMS[ed.form].fields.find(x=>x.k === sg.dataset.sig), cur = valOf(f, ctx(), { id: ed.form });
      setVal(f, !(cur === true || cur === 'yes')); renderEditor(); return; }
    const a = e.target.closest('[data-act]'); if(!a) return;
    if(a.dataset.act === 'close'){ closeEditor(); return; }
    const miss = missingKeys(ed.form, ctx());
    if(miss.length){
      const names = miss.map(k=>(FORMS[ed.form].fields.find(f=>f.k === k) || {}).l);
      if(!confirm('Still to fill in (red on the form):\n\n• ' + names.join('\n• ') + '\n\n' + (a.dataset.act === 'open' ? 'Open it to print anyway?' : 'Download it anyway?'))) return;
    }
    const w = a.dataset.act === 'open' ? window.open('', '_blank') : null;
    if(w) w.document.write('<p style="font:16px sans-serif;padding:24px">Filling in the form…</p>');
    a.disabled = true; const was = a.textContent; a.textContent = 'Filling in…';
    try{
      const form = FORMS[ed.form], bytes = await fill(ed.form), job = J();
      const name = `${[job.community, job.lot].filter(Boolean).join(' ') || 'Home'} - ${form.title}.pdf`;
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      if(w) w.location = url;
      else { const l = document.createElement('a'); l.href = url; l.download = name; document.body.appendChild(l); l.click(); l.remove(); }
    } catch(err){ console.error(err); if(w) w.close(); alert('Could not fill in the form. Check your connection and try again.'); }
    a.disabled = false; a.textContent = was;
  }
  function loadLib(){
    if(window.PDFLib) return Promise.resolve(window.PDFLib);
    return new Promise((ok, bad)=>{ const s = document.createElement('script'); s.src = PDFLIB; s.onload = ()=>ok(window.PDFLib); s.onerror = bad; document.head.appendChild(s); });
  }
  const plain = s=>String(s == null ? '' : s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[^\x20-\x7e]/g, '');
  // write every answer onto the borough's blank form(s)
  async function fill(formId){
    const { PDFDocument, StandardFonts, rgb } = await loadLib();
    const form = { id: formId, ...FORMS[formId] }, c = ctx();
    const out = await PDFDocument.create();
    const font = await out.embedFont(StandardFonts.Helvetica);
    const ink = rgb(0.05, 0.12, 0.45);
    const pages = [];
    for(const file of form.files){
      const src = await PDFDocument.load(await (await fetch(file)).arrayBuffer());
      (await out.copyPages(src, src.getPageIndices())).forEach(p=>{ out.addPage(p); pages.push(p); });
    }
    const sigImg = settings && settings.signature ? await out.embedPng(settings.signature) : null;
    form.fields.forEach(f=>{
      if(f.sec) return;
      const v = valOf(f, c, form), page = pages[f.p]; if(!page) return;
      if(f.type === 'sig'){
        if((v === true || v === 'yes') && sigImg){ const h = 26, w = Math.min(f.w || 190, sigImg.width * h / sigImg.height); page.drawImage(sigImg, { x: f.x, y: f.y - 4, width: w, height: w * sigImg.height / sigImg.width }); }
        return;
      }
      if(f.type === 'choice'){
        const o = f.opts.find(x=>x.v === v); if(!o) return;
        if(o.ring) page.drawEllipse({ x: o.ring[0], y: o.ring[1], xScale: o.ring[2], yScale: o.ring[3], borderColor: ink, borderWidth: 1.2 });
        if(o.mark) page.drawText('X', { x: o.mark[0], y: o.mark[1] + 1, size: 12, font, color: ink });
        return;
      }
      let t = plain(v); if(!t) return;
      if(f.money && isFinite(Number(t))) t = Number(t).toLocaleString('en-US');
      if(f.size && ['len', 'wid', 'hgt'].includes(f.size) && /^\d+(\.\d+)?$/.test(t)) t += "'";
      if(f.size === 'sqft' && /^\d+$/.test(t)) t = Number(t).toLocaleString('en-US');
      // a date written into "___/___/___": each part on its own blank
      if(f.slots){ const parts = t.split(/[\/\-.]/); if(parts.length === f.slots.length){ parts.forEach((x, i)=>page.drawText(x.trim(), { x: f.slots[i], y: f.y + 1, size: f.s || 10.5, font, color: ink })); return; } }
      let s = f.s || 10.5; while(s > 6.5 && font.widthOfTextAtSize(t, s) > 572 - f.x) s -= 0.5;
      page.drawText(t, { x: f.x, y: f.y + 1, size: s, font, color: ink });
    });
    return out.save();
  }
  // Alden's details, the signature and remembered style sizes
  function listen(){
    if(typeof db === 'undefined' || !window.firebase || !firebase.auth().currentUser){ setTimeout(listen, 800); return; }
    db.collection('settings').doc('permits').onSnapshot(d=>{ settings = d.exists ? d.data() : {}; if(hasJob()) renderPermits(); subs.forEach(f=>f(settings)); }, err=>console.error('permits settings', err));
  }
  const subs = [];
  listen();
  // for the Permits app: where a home stands, the developments with forms, and the saved settings
  window.Permits = {
    DEVS: PERMIT_DEVS,
    stepsFor: job=>stepsOf(PERMIT_DEVS[job.community]),
    status(job){
      const steps = this.stepsFor(job), p = job.permits || {};
      const i = steps.findIndex(s=>!(p[s.id] || {}).ok), st = i < 0 ? null : steps[i];
      if(!st) return { state: 'done', label: 'All approved', done: steps.length, of: steps.length };
      const sent = (p[st.id] || {}).sent;
      // nothing recorded on a home that wasn't signed through Selections: probably handled before the hub — grey, not counted as to send
      const nothing = i === 0 && !steps.some(s=>p[s.id] && (p[s.id].sent || p[s.id].ok));
      if(nothing && !job.selectionSheet && !p.start) return { state: 'new', label: 'Nothing recorded yet', step: st, done: 0, of: steps.length };
      return { state: sent ? 'waiting' : 'todo', label: sent ? 'Waiting on ' + st.t.toLowerCase() : 'Send the ' + st.t.toLowerCase(), step: st, done: i, of: steps.length, since: sent };
    },
    settings: ()=>settings,
    onSettings: f=>{ subs.push(f); if(settings) f(settings); },
  };
})();
