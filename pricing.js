/* IntelliBuild AI — bottom-up materials & labor estimating engine (browser + Node). */
(function (root) {
  'use strict';
  const NAHB = [ // NAHB 2024 national construction cost components ($ per average 2,647 sq ft home)
    ['Site work', 'Building permit fees', 7640, 'soft'], ['Site work', 'Impact fee', 6367, 'soft'], ['Site work', 'Water & sewer fees, inspections', 6260, 'soft'],
    ['Site work', 'Architecture, engineering', 6480, 'soft'], ['Site work', 'Other site work', 5972, 'site'],
    ['Foundations', 'Excavation, foundation, concrete, backfill', 43002, 'foundation'], ['Foundations', 'Other', 1747, 'foundation'],
    ['Framing', 'Framing (incl. roof)', 49763, 'framing'], ['Framing', 'Trusses', 12903, 'framing'], ['Framing', 'Sheathing', 6513, 'framing'], ['Framing', 'General metal, steel', 1718, 'framing'],
    ['Exterior finishes', 'Exterior wall finish', 24450, 'exterior'], ['Exterior finishes', 'Roofing', 16732, 'exterior'], ['Exterior finishes', 'Windows & doors', 15990, 'exterior'],
    ['Major systems', 'Plumbing (except fixtures)', 27180, 'mep'], ['Major systems', 'Electrical (except fixtures)', 27383, 'mep'], ['Major systems', 'HVAC', 26938, 'mep'],
    ['Interior finishes', 'Insulation', 6992, 'interior'], ['Interior finishes', 'Drywall', 13962, 'interior'], ['Interior finishes', 'Interior trim, doors, mirrors', 12920, 'interior'],
    ['Interior finishes', 'Painting', 11150, 'interior'], ['Interior finishes', 'Lighting', 5392, 'interior'], ['Interior finishes', 'Cabinets, countertops', 19056, 'interior'],
    ['Interior finishes', 'Appliances', 7499, 'interior'], ['Interior finishes', 'Flooring', 15388, 'interior'], ['Interior finishes', 'Plumbing fixtures', 7922, 'interior'],
    ['Interior finishes', 'Fireplace', 2378, 'interior'], ['Final steps', 'Landscaping', 9269, 'final'], ['Final steps', 'Outdoor structures', 4722, 'final'],
    ['Final steps', 'Driveway', 9635, 'final'], ['Final steps', 'Clean-up', 3183, 'final'], ['Other', 'Other costs', 8835, 'final']
  ];

  function quantities(p) {
    const A = Math.max(600, Number(p.area) || 4000), S = Math.max(1, Number(p.stories) || 2), fp = A / S;
    const shape = Number((p.takeoff || {}).shape) || 1.15, per = 4 * Math.sqrt(fp) * shape;
    const beds = Number(p.newBeds) || 4, bathsTotal = Number(p.newBaths) || Math.max(2, beds - 0.5);
    const fullBaths = Math.floor(bathsTotal), halfBaths = bathsTotal % 1 >= 0.5 ? 1 : 0;
    const garage = Number(p.garage) || 0, garageSqft = garage * 260, fnd = p.foundation || 'basement';
    const roofArea = (fp + garageSqft) * 1.25 * shape;
    const wallArea = per * 9 * S;
    const footingCY = per * 2 * 1 / 27, wallCY = fnd === 'basement' ? per * 9 * (8 / 12) / 27 : fnd === 'crawlspace' ? per * 3.5 * (8 / 12) / 27 : 0;
    const slabCY = (fnd === 'crawlspace' ? 0 : fp * (4 / 12) / 27) + garageSqft * (4 / 12) / 27;
    const excavCY = fnd === 'basement' ? fp * 1.15 * 9 / 27 : fnd === 'crawlspace' ? per * 4 * 3 / 27 + fp * 0.5 / 27 : per * 2 * 1.5 / 27 + fp * 0.5 / 27;
    return {
      A, S, fp, per, beds, bathsTotal, fullBaths, halfBaths, garage, garageSqft, fnd, roofArea, wallArea, footingCY, wallCY, slabCY, excavCY,
      concreteCY: footingCY + wallCY + slabCY, gravelTon: (fp + garageSqft) * (4 / 12) / 27 * 1.4, waterproofSqft: fnd === 'basement' ? per * 9 : 0,
      lumberBF: (A + garageSqft * 0.5) * 6.5, sheathingSheets: Math.ceil((wallArea + roofArea + A) / 32 * 1.1), roofSquares: roofArea * 1.1 / 100,
      sidingSqft: wallArea * 0.82, windows: Math.round(A / 120), extDoors: 3, intDoors: Math.round(A / 180) + beds, garageDoors: Math.ceil(garage / 2),
      wallInsulSqft: wallArea * 0.85, atticInsulSqft: fp, drywallSheets: Math.ceil(A * 3.6 / 32 * 1.1), woodFloorSqft: A * 0.62, tileSqft: A * 0.12 + fullBaths * 40,
      cabinetLF: 32 + fullBaths * 6 + 6, countertopSqft: 65 + fullBaths * 12, fixtures: fullBaths * 3 + halfBaths * 2 + 3 + 2 + 2,
      hvacTons: Math.max(2, Math.round(A / 550 * 2) / 2), dumpsters: Math.ceil(A / 1000) * 2
    };
  }

  function estimate(p, cb) {
    const q = quantities(p), M = cb.materials, W = cb.wages, H = cb.productivity, AL = cb.allowances;
    const tier = (cb.finishTiers || {})[p.finishTier || 'Premium'] || 1, burden = Number(cb.laborBurden) || 1.45;
    const ov = p.mlOverrides || {};
    const wage = t => (W[t] && W[t].rate) || 30;
    const lines = [];
    // id, stage, item, qty, unit, matUnit, laborTrade, hrsPerUnit, finishSensitive, scope(contract|owner), keywords
    const L = (id, stage, item, qty, unit, matUnit, trade, hrs, fin, scope, kw) => {
      const o = ov[id] || {};
      const mu = o.matUnit !== undefined ? Number(o.matUnit) : matUnit * (fin ? tier : 1);
      const qq = o.qty !== undefined ? Number(o.qty) : qty;
      const hr = o.hrs !== undefined ? Number(o.hrs) : hrs;
      const mat = qq * mu, labHrs = trade ? qq * hr : 0, lab = trade ? labHrs * wage(trade) * burden : 0;
      lines.push({ id, stage, item, qty: qq, unit, matUnit: mu, trade: trade || '', hrsPerUnit: hr, labHrs, mat, lab, direct: mat + lab, scope: scope || 'contract', kw: kw || [], overridden: !!ov[id] });
    };
    const D = Number(p.existingArea) || 2400;
    L('demo', 'Demolition & site', 'Demolition of existing house & haul-off', D, 'sq ft existing', AL.demolitionPerSqft, null, 0, false, 'contract', ['demolition', 'demo']);
    L('hazmat', 'Demolition & site', 'Asbestos / lead survey & abatement allowance', 1, 'allowance', AL.hazmatSurvey, null, 0, false, 'contract', ['asbestos', 'hazmat', 'abatement']);
    L('utilities', 'Demolition & site', 'Water/sewer laterals & utility reconnections', 1, 'allowance', AL.utilityReconnect, 'laborer', 24, false, 'contract', ['utility', 'utilities', 'sewer']);
    L('dumpsters', 'Demolition & site', 'Construction dumpsters (30 yd)', q.dumpsters, 'each', M.dumpsterEach, null, 0, false, 'contract', ['dumpster']);
    L('excavation', 'Foundations', 'Excavation & backfill (' + q.fnd + ')', q.excavCY, 'CY', M.excavationEquipCY, 'operator', H.excavationOperatorHrPerCY, false, 'contract', ['excavation', 'foundation']);
    L('concrete', 'Foundations', 'Footings, walls & slabs — ready-mix 4,000 psi', q.concreteCY, 'CY', M.concreteCY + M.rebarPerCY, 'cementMason', H.concreteHrPerCY, false, 'contract', ['foundation', 'concrete']);
    L('concreteLabor', 'Foundations', 'Forming & placing crew (laborers)', q.concreteCY, 'CY', 0, 'laborer', H.concreteHrPerCY, false, 'contract', ['foundation', 'concrete']);
    L('slabFinish', 'Foundations', 'Slab finishing (basement / garage)', q.slabCY * 81, 'sq ft', 0, 'cementMason', H.slabFinishHrPerSqft, false, 'contract', ['foundation', 'concrete']);
    L('gravel', 'Foundations', 'Stone base under slabs', q.gravelTon, 'ton', M.gravelTon, 'laborer', 0.15, false, 'contract', ['foundation']);
    if (q.waterproofSqft) L('waterproof', 'Foundations', 'Foundation waterproofing & drain tile', q.waterproofSqft, 'sq ft', M.waterproofSqft, 'laborer', H.waterproofHrPerSqft, false, 'contract', ['foundation', 'waterproofing']);
    L('lumber', 'Framing', 'Framing lumber', q.lumberBF / 1000, 'MBF', M.lumberMBF, null, 0, false, 'contract', ['framing']);
    L('framingLabor', 'Framing', 'Framing crew — walls, floors, roof', q.A, 'sq ft', 0, 'carpenter', H.framingHrPerSqft, false, 'contract', ['framing']);
    L('framingLaborer', 'Framing', 'Framing laborers', q.A, 'sq ft', 0, 'laborer', H.framingLaborerHrPerSqft, false, 'contract', ['framing']);
    L('trusses', 'Framing', 'Roof trusses (engineered)', q.roofArea, 'sq ft roof', M.trussPerRoofSqft, null, 0, false, 'contract', ['framing', 'trusses']);
    L('sheathing', 'Framing', 'OSB wall, roof & subfloor sheathing', q.sheathingSheets, 'sheet', M.osbSheet, null, 0, false, 'contract', ['framing']);
    L('hardware', 'Framing', 'LVL beams, hangers, steel & hardware', q.A, 'sq ft', M.hardwarePerSqft, null, 0, false, 'contract', ['framing', 'steel']);
    L('roofing', 'Exterior', 'Architectural shingles + underlayment', q.roofSquares, 'square', M.shingleSquare + M.underlaymentSquare, 'roofer', H.roofingHrPerSquare, true, 'contract', ['roofing', 'roof']);
    L('siding', 'Exterior', 'Fiber-cement siding & exterior trim', q.sidingSqft, 'sq ft', M.sidingSqft, 'carpenter', H.sidingHrPerSqft, true, 'contract', ['siding', 'exterior']);
    L('windows', 'Exterior', 'Windows (double-pane, Low-E)', q.windows, 'each', M.windowEach, 'carpenter', H.windowHr, true, 'contract', ['windows']);
    L('extDoors', 'Exterior', 'Exterior doors', q.extDoors, 'each', M.extDoorEach, 'carpenter', H.extDoorHr, true, 'contract', ['doors']);
    if (q.garageDoors) L('garageDoors', 'Exterior', 'Garage doors with openers', q.garageDoors, 'each', M.garageDoorEach, 'carpenter', H.garageDoorHr, true, 'contract', ['garage door']);
    L('plumbing', 'Mechanical, electrical & plumbing', 'Plumbing rough-in & trim (' + q.fixtures + ' fixtures)', q.fixtures, 'fixture', 0, 'plumber', H.plumbingHrPerFixture, false, 'contract', ['plumbing']);
    L('waterHeater', 'Mechanical, electrical & plumbing', 'Water heater', 1, 'each', M.waterHeater, 'plumber', 6, false, 'contract', ['plumbing', 'water heater']);
    L('electrical', 'Mechanical, electrical & plumbing', 'Electrical — 200A service, wiring, devices', q.A, 'sq ft', M.electricalPerSqft, 'electrician', H.electricalHrPerSqft, false, 'contract', ['electrical']);
    L('service', 'Mechanical, electrical & plumbing', 'Electric service upgrade allowance', 1, 'allowance', AL.electricServiceUpgrade, null, 0, false, 'contract', ['electrical']);
    L('hvac', 'Mechanical, electrical & plumbing', 'HVAC equipment (' + q.hvacTons + ' tons, heat pump)', q.hvacTons, 'ton', M.hvacPerTon, 'hvac', H.hvacHrPerTon, false, 'contract', ['hvac']);
    L('ducts', 'Mechanical, electrical & plumbing', 'Ductwork, registers & ventilation', q.A, 'sq ft', M.ductPerSqft, 'hvac', H.ductHrPerSqft, false, 'contract', ['hvac']);
    L('insulation', 'Interior', 'Wall insulation (R-15 batts)', q.wallInsulSqft, 'sq ft', M.insulationWallSqft, 'insulation', H.insulationHrPerSqft, false, 'contract', ['insulation']);
    L('atticInsul', 'Interior', 'Attic insulation (R-49 blown)', q.atticInsulSqft, 'sq ft', M.insulationAtticSqft, 'insulation', H.insulationHrPerSqft, false, 'contract', ['insulation']);
    L('drywall', 'Interior', 'Drywall — hang, tape & finish', q.drywallSheets, 'sheet', M.drywallSheet + M.drywallSundriesPerSheet, 'drywall', H.drywallHrPerSheet, false, 'contract', ['drywall']);
    L('intDoors', 'Interior', 'Interior doors (pre-hung)', q.intDoors, 'each', M.intDoorEach, 'carpenter', H.intDoorHr, true, 'contract', ['doors', 'trim']);
    L('trim', 'Interior', 'Interior trim, stairs & millwork', q.A, 'sq ft', M.trimPerSqft, 'carpenter', H.trimHrPerSqft, true, 'contract', ['trim', 'millwork']);
    L('paint', 'Interior', 'Interior & exterior painting', q.A, 'sq ft', M.paintPerSqft, 'painter', H.paintHrPerSqft, false, 'contract', ['paint', 'painting']);
    L('woodFloor', 'Interior', 'Hardwood / LVP flooring', q.woodFloorSqft, 'sq ft', M.woodFloorSqft, 'flooring', H.woodFloorHrPerSqft, true, 'contract', ['flooring', 'floors']);
    L('tile', 'Interior', 'Tile — baths, laundry, showers', q.tileSqft, 'sq ft', M.tileSqft, 'tile', H.tileHrPerSqft, true, 'contract', ['tile', 'flooring']);
    L('cabinets', 'Interior', 'Cabinets — kitchen, baths, laundry', q.cabinetLF, 'LF', M.cabinetsLF, 'carpenter', H.cabinetHrPerLF, true, 'contract', ['cabinets']);
    L('countertops', 'Interior', 'Countertops (quartz, fabricated & installed)', q.countertopSqft, 'sq ft', M.countertopSqft, null, 0, true, 'contract', ['countertops', 'cabinets']);
    L('fixtures', 'Interior', 'Plumbing fixtures & faucets', 1, 'set', M.fixturesPerFullBath * q.fullBaths + M.fixturesPerHalfBath * q.halfBaths + M.kitchenLaundryFixtures, null, 0, true, 'contract', ['fixtures', 'plumbing fixtures']);
    L('lighting', 'Interior', 'Lighting fixtures', q.A, 'sq ft', M.lightingPerSqft, 'electrician', 0.01, true, 'contract', ['lighting', 'light fixtures']);
    L('appliances', 'Interior', 'Appliance package', 1, 'set', M.appliancePackage, null, 0, true, 'contract', ['appliances']);
    if ((p.finishTier || 'Premium') !== 'Standard') L('fireplace', 'Interior', 'Fireplace (gas insert & surround)', 1, 'each', M.fireplace, 'mason', 16, true, 'contract', ['fireplace']);
    L('driveway', 'Final steps', 'Concrete driveway & walks', AL.drivewaySqft, 'sq ft', AL.drivewayPerSqft, null, 0, false, 'contract', ['driveway']);
    L('landscaping', 'Final steps', 'Final grading, sod & planting', q.A, 'sq ft', AL.landscapingPerSqft, null, 0, false, 'contract', ['landscaping', 'landscape', 'grading']);
    L('outdoor', 'Final steps', 'Porch / patio / deck allowance', q.A, 'sq ft', AL.outdoorStructuresPerSqft, null, 0, false, 'contract', ['deck', 'patio', 'porch']);
    L('cleanup', 'Final steps', 'Final clean & punch list', q.A, 'sq ft', AL.cleanupPerSqft, null, 0, false, 'contract', ['cleanup', 'clean']);
    L('permits', 'Owner soft costs', 'Permits, plan review & utility availability fees', 1, 'allowance', AL.permitsAndFees, null, 0, false, 'owner', ['permits', 'permit']);
    L('architecture', 'Owner soft costs', 'Architecture & structural engineering', q.A, 'sq ft', AL.architecturePerSqft, null, 0, false, 'owner', ['architect', 'design']);
    L('survey', 'Owner soft costs', 'Boundary/topo survey & house location plat', 1, 'allowance', AL.survey, null, 0, false, 'owner', ['survey']);
    L('infill', 'Owner soft costs', 'Infill lot grading plan (civil engineer)', 1, 'allowance', AL.infillGradingPlan, null, 0, false, 'owner', ['grading plan', 'engineering']);
    L('geotech', 'Owner soft costs', 'Soils / geotechnical report', 1, 'allowance', AL.geotech, null, 0, false, 'owner', ['geotech', 'soils']);

    const sub = 1 + (Number(cb.subMarkupPct) || 0) / 100;
    lines.forEach(l => { l.price = l.scope === 'contract' ? l.direct * sub : l.direct; });
    const contractLines = lines.filter(l => l.scope === 'contract'), ownerLines = lines.filter(l => l.scope === 'owner');
    const sum = (arr, k) => arr.reduce((t, l) => t + l[k], 0);
    const tradeCost = sum(contractLines, 'price'), gc = tradeCost * (Number(cb.generalConditionsPct) || 0) / 100;
    const fee = (tradeCost + gc) * (Number(cb.gcFeePct) || 0) / 100, contract = tradeCost + gc + fee, owner = sum(ownerLines, 'price');
    const markupFactor = contract / (tradeCost || 1);
    const stages = {};
    lines.forEach(l => { const s = stages[l.stage] = stages[l.stage] || { stage: l.stage, mat: 0, lab: 0, labHrs: 0, price: 0, scope: l.scope }; s.mat += l.mat; s.lab += l.lab; s.labHrs += l.labHrs; s.price += l.price; });
    const labTrades = {};
    lines.forEach(l => { if (l.trade) { const t = labTrades[l.trade] = labTrades[l.trade] || { trade: l.trade, hrs: 0, cost: 0, wage: wage(l.trade) }; t.hrs += l.labHrs; t.cost += l.lab; } });
    return {
      q, lines, stages: Object.values(stages), labTrades: Object.values(labTrades).sort((a, b) => b.cost - a.cost),
      totals: { materials: sum(contractLines, 'mat'), labor: sum(contractLines, 'lab'), laborHours: sum(contractLines, 'labHrs'), tradeCost, generalConditions: gc, gcFee: fee,
        contract, owner, project: contract + owner, perSqft: contract / q.A, markupFactor, low: contract * (1 - (cb.bidRangePct || 10) / 100), high: contract * (1 + (cb.bidRangePct || 10) / 100) }
    };
  }

  function nahbBenchmark(p, cb) {
    const n = cb.nahb2024 || { avgSqft: 2647, escalationTo2026Pct: 8, regionFactor: 1.1 };
    const A = Number(p.area) || 4000, k = A / n.avgSqft * (1 + n.escalationTo2026Pct / 100) * n.regionFactor;
    const rows = NAHB.map(([stage, item, v, grp]) => ({ stage, item, grp, value: v * k }));
    return { rows, total: rows.reduce((t, r) => t + r.value, 0), factor: k, perSqft: rows.reduce((t, r) => t + r.value, 0) / A };
  }

  /** Compares a lump-sum bid to the estimate, removing scope the contractor excluded. */
  function levelBid(bid, est) {
    const text = String((bid.exclusions || '') + ' ').toLowerCase();
    const excluded = est.lines.filter(l => l.scope === 'contract' && l.kw.some(k => new RegExp('\\b' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(text)));
    const removed = excluded.reduce((t, l) => t + l.price, 0) * est.totals.markupFactor;
    const comparable = est.totals.contract - removed, variance = comparable ? (bid.price - comparable) / comparable * 100 : 0;
    const verdict = variance < -15 ? ['bad', 'Well below estimate — check for scope gaps, low allowances or missing trades']
      : variance < -5 ? ['ok', 'Competitive — confirm scope and allowances match'] : variance <= 10 ? ['ok', 'Within expected range']
        : variance <= 20 ? ['warn', 'Above range — ask for a trade-by-trade breakdown'] : ['bad', 'Well above estimate — negotiate or re-bid'];
    return { excluded: [...new Set(excluded.map(l => l.item))], removed, comparable, variance, verdict, perSqft: bid.price / est.q.A };
  }

  root.IBPricing = { estimate, nahbBenchmark, levelBid, quantities, NAHB };
  if (typeof module !== 'undefined') module.exports = root.IBPricing;
})(typeof window !== 'undefined' ? window : globalThis);
