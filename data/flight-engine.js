/**
 * IFR Flight Engine — Standalone Module
 * =======================================
 * Motore di generazione voli IFR estratto da GenFlight (NetJets Global Flight Dispatcher).
 * Tutti i calcoli interni in KG. Supporta LBS come unità nativa (conversione automatica).
 *
 * DIPENDENZE ESTERNE (da fornire al momento dell'init):
 *   - airportDatabase  : Array<AirportRecord>    → il tuo airport.js (seedAirportDatabase)
 *   - fleetSpecs       : Object<string, FleetSpec>  → il tuo fleet-db.js / aerei.js
 *   - missionMatrix    : Array<MissionRecord>       → il tuo missions-db.js
 *
 * USO MINIMO:
 *   const engine = new IfrFlightEngine({ airportDatabase: seedAirportDatabase, fleetSpecs, missionMatrix });
 *   const results = engine.generateFlights({ aircraftType: 'C56X', callsign: 'NJE001', blockTimeMins: 60 });
 *   // results → Array di FlightData (max 5), ordinati per missionScore decrescente
 *
 * TIPI:
 *
 * AirportRecord {
 *   icao: string, name: string, lat: number, lon: number,
 *   elev?: number,           // ft MSL (opzionale)
 *   rwy: 'GA'|'TURBO'|'BIZ JET'|'JET'|'HELI',
 *   length?: number,         // ft (opzionale)
 *   continent?: string,      // 'EU'|'NA'|'SA'|'AF'|'AS'|'OC'
 *   country?: string,        // ISO 3166-1 alpha-2
 *   type?: string,           // 'small_airport'|'medium_airport'|'large_airport'|...
 *   tag?: string             // 'Hand-Crafted'|'Third Party'|'Both' (opzionale, MSFS scenery)
 * }
 *
 * FleetSpec {
 *   name: string, class: 'GA'|'TURBO'|'BIZ JET'|'JET'|'HELI'|'WARBIRD',
 *   rules: string,           // 'IFR'|'VFR'|'IFR/VFR'
 *   maxPax: number, maxCargo: number,
 *   minD: number, maxD: number,   // range operativo in NM
 *   minAlt: number, maxAlt: number,  // ft
 *   minRunwayLength: number,  // ft
 *   cruiseKt: number,
 *   fuelPerNm: number,        // kg/NM (o lbs/NM se units='LBS')
 *   fuelCapacityKg: number,   // sempre kg
 *   mtow: number, oew: number, mzfw?: number,
 *   Ppass?: number, Pbag?: number,  // peso std pax + bagagli
 *   units?: 'KGS'|'LBS',
 *   fuelBurnKgH?: number      // alternativo a fuelPerNm
 * }
 *
 * MissionRecord {
 *   type: number, desc: string, weight: number,
 *   allowedClasses: string[],
 *   paxOnly?: boolean, cargoOnly?: boolean, isLocal?: boolean
 * }
 *
 * FlightData (output) {
 *   origin: AirportRecord, destination: AirportRecord,
 *   distanceNm: number, bearing: number,
 *   altValue: number, altDisplayStr: string,
 *   pax: number, cargoKg: number, cargoDisplay: number, cargoUnitLabel: string,
 *   fuelPlan: FuelPlan, zfwKg: number, rampWeightKg: number, maxRangeNm: number,
 *   missionScore: number,
 *   chosenMission: MissionRecord,
 *   simbriefUrl: string,        // pronto all'uso
 *   spec: FleetSpec, type: string, callsignRaw: string
 * }
 *
 * FuelPlan {
 *   hourlyBurnKg, taxiFuelKg, tripFuelKg, contingKg,
 *   altFuelKg, reserveKg, extraKg, blockFuelKg, maxRangeNm,
 *   feasible: boolean
 * }
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Costanti geografiche (fallback coordinate per aeroporti senza metadati mondo)
// ─────────────────────────────────────────────────────────────────────────────
const CONTINENT_BOUNDS = {
    EU: { latMin: 34,  latMax: 72,  lonMin: -25,  lonMax: 50  },
    NA: { latMin: 7,   latMax: 84,  lonMin: -168, lonMax: -52 },
    SA: { latMin: -57, latMax: 13,  lonMin: -82,  lonMax: -34 },
    AF: { latMin: -35, latMax: 38,  lonMin: -20,  lonMax: 60  },
    AS: { latMin: -10, latMax: 77,  lonMin: 26,   lonMax: 180 },
    OC: { latMin: -50, latMax: 0,   lonMin: 110,  lonMax: 180 }
};

// Paesi del Medio Oriente raggruppati con Africa nel menu UI (codice 'AF')
const MIDDLE_EAST_COUNTRIES = new Set([
    'AE', 'BH', 'CY', 'EG', 'IL', 'IQ', 'IR', 'JO',
    'KW', 'LB', 'OM', 'PS', 'QA', 'SA', 'SY', 'TR', 'YE'
]);

// Tabella ISO 3166-1 alpha-2 → nome paese (inglese)
const COUNTRY_NAMES = {
    AF:"Afghanistan",AL:"Albania",DZ:"Algeria",AD:"Andorra",AO:"Angola",AR:"Argentina",
    AM:"Armenia",AU:"Australia",AT:"Austria",AZ:"Azerbaijan",BS:"Bahamas",BH:"Bahrain",
    BD:"Bangladesh",BB:"Barbados",BY:"Belarus",BE:"Belgium",BZ:"Belize",BJ:"Benin",
    BT:"Bhutan",BO:"Bolivia",BA:"Bosnia & Herzegovina",BW:"Botswana",BR:"Brazil",
    BN:"Brunei",BG:"Bulgaria",BF:"Burkina Faso",BI:"Burundi",CV:"Cabo Verde",
    KH:"Cambodia",CM:"Cameroon",CA:"Canada",CF:"Central African Republic",TD:"Chad",
    CL:"Chile",CN:"China",CO:"Colombia",CG:"Congo",CD:"Congo (DRC)",CR:"Costa Rica",
    CI:"Côte d'Ivoire",HR:"Croatia",CU:"Cuba",CW:"Curaçao",CY:"Cyprus",
    CZ:"Czech Republic",DK:"Denmark",DJ:"Djibouti",DO:"Dominican Republic",EC:"Ecuador",
    EG:"Egypt",SV:"El Salvador",GQ:"Equatorial Guinea",ER:"Eritrea",EE:"Estonia",
    SZ:"Eswatini",ET:"Ethiopia",FK:"Falkland Islands",FO:"Faroe Islands",FJ:"Fiji",
    FI:"Finland",FR:"France",GF:"French Guiana",PF:"French Polynesia",GA:"Gabon",
    GM:"Gambia",GE:"Georgia",DE:"Germany",GH:"Ghana",GI:"Gibraltar",GR:"Greece",
    GL:"Greenland",GD:"Grenada",GT:"Guatemala",GN:"Guinea",GW:"Guinea-Bissau",
    GY:"Guyana",HT:"Haiti",HN:"Honduras",HK:"Hong Kong",HU:"Hungary",IS:"Iceland",
    IN:"India",ID:"Indonesia",IR:"Iran",IQ:"Iraq",IE:"Ireland",IL:"Israel",IT:"Italy",
    JM:"Jamaica",JP:"Japan",JO:"Jordan",KZ:"Kazakhstan",KE:"Kenya",KI:"Kiribati",
    KP:"North Korea",KR:"South Korea",XK:"Kosovo",KW:"Kuwait",KG:"Kyrgyzstan",
    LA:"Laos",LV:"Latvia",LB:"Lebanon",LS:"Lesotho",LR:"Liberia",LY:"Libya",
    LI:"Liechtenstein",LT:"Lithuania",LU:"Luxembourg",MO:"Macau",MG:"Madagascar",
    MW:"Malawi",MY:"Malaysia",MV:"Maldives",ML:"Mali",MT:"Malta",MQ:"Martinique",
    MR:"Mauritania",MU:"Mauritius",MX:"Mexico",FM:"Micronesia",MD:"Moldova",
    MC:"Monaco",MN:"Mongolia",ME:"Montenegro",MA:"Morocco",MZ:"Mozambique",
    MM:"Myanmar",NA:"Namibia",NR:"Nauru",NP:"Nepal",NL:"Netherlands",
    NC:"New Caledonia",NZ:"New Zealand",NI:"Nicaragua",NE:"Niger",NG:"Nigeria",
    NO:"Norway",OM:"Oman",PK:"Pakistan",PW:"Palau",PS:"Palestine",PA:"Panama",
    PG:"Papua New Guinea",PY:"Paraguay",PE:"Peru",PH:"Philippines",PL:"Poland",
    PT:"Portugal",PR:"Puerto Rico",QA:"Qatar",RO:"Romania",RU:"Russia",RW:"Rwanda",
    KN:"St. Kitts & Nevis",LC:"St. Lucia",VC:"St. Vincent & Grenadines",WS:"Samoa",
    SM:"San Marino",ST:"São Tomé & Príncipe",SA:"Saudi Arabia",SN:"Senegal",
    RS:"Serbia",SC:"Seychelles",SL:"Sierra Leone",SG:"Singapore",SK:"Slovakia",
    SI:"Slovenia",SB:"Solomon Islands",SO:"Somalia",ZA:"South Africa",SS:"South Sudan",
    ES:"Spain",LK:"Sri Lanka",SD:"Sudan",SR:"Suriname",SE:"Sweden",CH:"Switzerland",
    SY:"Syria",TW:"Taiwan",TJ:"Tajikistan",TZ:"Tanzania",TH:"Thailand",TL:"Timor-Leste",
    TG:"Togo",TO:"Tonga",TT:"Trinidad & Tobago",TN:"Tunisia",TR:"Turkey",
    TM:"Turkmenistan",TC:"Turks & Caicos Islands",TV:"Tuvalu",UG:"Uganda",UA:"Ukraine",
    AE:"United Arab Emirates",GB:"United Kingdom",US:"United States",UY:"Uruguay",
    UZ:"Uzbekistan",VU:"Vanuatu",VA:"Vatican City",VE:"Venezuela",VN:"Vietnam",
    YE:"Yemen",ZM:"Zambia",ZW:"Zimbabwe"
};

// ─────────────────────────────────────────────────────────────────────────────
// Configurazione centrale del Dispatcher Engine
// ─────────────────────────────────────────────────────────────────────────────
const DISPATCHER_CONFIG = {
    // Tempi taxi standard
    taxi: { outMins: 15, inMins: 10 },
    // Percentuale contingency sul trip fuel
    contingencyPct: 0.05,
    // Riserva finale (ore)
    finalReserveHrs: 0.75,
    // Limite massimo utilizzo carburante (% della capacità serbatoi)
    maxFuelUsagePct: 0.95,
    // Distanza alternate per categoria (NM)
    alternateDist: { GA: 40, TURBO: 70, 'BIZ JET': 120, JET: 180 },
    // Finestra ottimale utilizzo MZFW (Zero Fuel Weight)
    mzfwUtil: { optMin: 0.75, optMax: 0.95 },

    // Profili di missione: fill ratio [min, max] per pax e cargo + extra carburante
    missionProfiles: {
        default:   { paxFill: [0.55, 0.85], cargoFill: [0.25, 0.55], extraFuelMins: 0  },
        paxOnly:   { paxFill: [0.75, 1.00], cargoFill: [0.00, 0.08], extraFuelMins: 15 },
        cargoOnly: { paxFill: [0.00, 0.00], cargoFill: [0.70, 0.95], extraFuelMins: 10 },
        vip:       { paxFill: [0.35, 0.65], cargoFill: [0.00, 0.15], extraFuelMins: 30 },
        local:     { paxFill: [0.35, 0.65], cargoFill: [0.08, 0.25], extraFuelMins: 20 },
    },
    // Override tipo missione → profilo (es. tipo 15 = atleti → VIP)
    missionTypeToProfile: { 15: 'vip' },

    // Pesi per il Mission Score (devono sommare a 100)
    scoreWeights: {
        distCoherence:      25,
        fuelEfficiency:     20,
        mzfwUtilisation:    15,
        optimalFL:          10,
        runwayCompat:       10,
        missionCoherence:   10,
        destinationVariety: 10
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Funzioni di utilità geografica (esposte anche standalone)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Distanza ortodromica tra due punti (formula Haversine).
 * @returns {number} Distanza in NM
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 3440.065; // NM
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
        * Math.sin(dLon / 2) ** 2;
    return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * R;
}

/**
 * Rotta vera (True Track) tra due punti, 0–360°.
 * @returns {number} Bearing in gradi
 */
function calculateBearing(lat1, lon1, lat2, lon2) {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180)
        - Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

// ─────────────────────────────────────────────────────────────────────────────
// Funzioni di calcolo IFR interne
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Risolve il profilo di dispatch in base al tipo di missione estratta.
 */
function getDispatchProfile(mission) {
    if (!mission) return DISPATCHER_CONFIG.missionProfiles.default;
    const override = DISPATCHER_CONFIG.missionTypeToProfile[mission.type];
    if (override) return DISPATCHER_CONFIG.missionProfiles[override];
    if (mission.cargoOnly) return DISPATCHER_CONFIG.missionProfiles.cargoOnly;
    if (mission.paxOnly)   return DISPATCHER_CONFIG.missionProfiles.paxOnly;
    if (mission.isLocal)   return DISPATCHER_CONFIG.missionProfiles.local;
    return DISPATCHER_CONFIG.missionProfiles.default;
}

/**
 * Stima i minuti di salita e discesa in base al FL e alla classe dell'aeromobile.
 * @returns {{ climbMins: number, descentMins: number }}
 */
function estimatePhasesMins(flThousands, specClass) {
    const climbFpm   = { 'BIZ JET': 2800, JET: 2500, TURBO: 1800, GA: 1000, HELI: 700, WARBIRD: 1200 };
    const descentFpm = { 'BIZ JET': 2200, JET: 2000, TURBO: 1500, GA:  900, HELI: 600, WARBIRD: 1000 };
    const altFt = flThousands * 1000;
    return {
        climbMins:   Math.max(3, Math.round(altFt / (climbFpm[specClass]   || 1000))),
        descentMins: Math.max(3, Math.round(altFt / (descentFpm[specClass] || 900)))
    };
}

/**
 * Piano carburante IFR completo. Tutti i valori in KG.
 * BlockFuel = Taxi + Trip + Contingency5% + Alternate + Reserve45min + Extra
 * @returns {FuelPlan}
 */
function computeIfrFuelPlan(spec, distanceNm, profile) {
    const cfg = DISPATCHER_CONFIG;
    const hourlyBurnKg = spec.fuelPerNm * spec.cruiseKt;
    const taxiFuelKg   = hourlyBurnKg * ((cfg.taxi.outMins + cfg.taxi.inMins) / 60);
    const tripFuelKg   = distanceNm * spec.fuelPerNm;
    const contingKg    = tripFuelKg * cfg.contingencyPct;
    const altDistNm    = cfg.alternateDist[spec.class] || cfg.alternateDist['BIZ JET'];
    const altFuelKg    = altDistNm * spec.fuelPerNm;
    const reserveKg    = hourlyBurnKg * cfg.finalReserveHrs;
    const extraKg      = hourlyBurnKg * (profile.extraFuelMins / 60);
    const blockFuelKg  = taxiFuelKg + tripFuelKg + contingKg + altFuelKg + reserveKg + extraKg;

    const fixedKg       = taxiFuelKg + altFuelKg + reserveKg + extraKg;
    const maxTripFuelKg = Math.max(0,
        (spec.fuelCapacityKg * cfg.maxFuelUsagePct - fixedKg) / (1 + cfg.contingencyPct));
    const maxRangeNm = maxTripFuelKg / spec.fuelPerNm;

    return {
        hourlyBurnKg, taxiFuelKg, tripFuelKg,
        contingKg, altFuelKg, reserveKg, extraKg,
        blockFuelKg, maxRangeNm,
        feasible: blockFuelKg <= spec.fuelCapacityKg * cfg.maxFuelUsagePct
    };
}

/**
 * FL ottimale deterministico con regola semicircolare IFR.
 * Easterly (bearing 0–179°) → FL dispari; Westerly (180–359°) → FL pari.
 * @returns {{ kft: number, altValue: number, isEasterly: boolean }}
 */
function computeOptimalFL(spec, distanceNm, zfwToMtowRatio, bearing, terrainFloorFt) {
    const isEasterly = bearing >= 0 && bearing < 180;

    // FL base in funzione della distanza
    let kft;
    if      (distanceNm < 100)  kft = 22;
    else if (distanceNm < 200)  kft = 27;
    else if (distanceNm < 350)  kft = 31;
    else if (distanceNm < 550)  kft = 35;
    else if (distanceNm < 800)  kft = 38;
    else if (distanceNm < 1100) kft = 40;
    else                        kft = 43;

    // Penalità peso: più è carico, più basso il FL (max −6 kft)
    const excess = Math.max(0, zfwToMtowRatio - 0.50);
    kft -= Math.round(excess * 12);

    // Floor del terreno
    kft = Math.max(kft, Math.ceil(terrainFloorFt / 1000));

    // Limiti operativi aeromobile
    const maxKft = Math.floor(spec.maxAlt / 1000);
    const minKft = Math.ceil((spec.minAlt || 10000) / 1000);
    kft = Math.max(minKft, Math.min(maxKft, kft));

    // Regola semicircolare IFR
    if ( isEasterly && kft % 2 === 0) kft++;
    if (!isEasterly && kft % 2 !== 0) kft++;
    if (kft > maxKft) kft -= 2;
    kft = Math.max(minKft, kft);

    return { kft, altValue: kft * 10, isEasterly };
}

/**
 * Mission Score 0–100.
 * Sette fattori pesati: coerenza distanza/tempo, efficienza carburante,
 * utilizzo MZFW, FL ottimale, compatibilità pista, coerenza missione, varietà destinazione.
 */
function computeMissionScore(fd, blockTimeMins, rangeMode, recentDestinations) {
    const W   = DISPATCHER_CONFIG.scoreWeights;
    const cfg = DISPATCHER_CONFIG;
    const LBS_TO_KG = 0.453592;
    const spec = fd.spec;
    let score = 0;

    // 1 · Coerenza distanza / Block Time (25 pt)
    if (rangeMode === 'time' && blockTimeMins > 0 && fd.fuelPlan) {
        const kft    = fd.altValue / 10;
        const phases = estimatePhasesMins(kft, spec.class);
        const taxiT  = cfg.taxi.outMins + cfg.taxi.inMins;
        const cruiseM = Math.max(0, blockTimeMins - taxiT - phases.climbMins - phases.descentMins);
        const idealDist = (spec.cruiseKt || 300) * cruiseM / 60;
        const ratio = idealDist > 0
            ? Math.min(fd.distanceNm, idealDist) / Math.max(fd.distanceNm, idealDist)
            : 0;
        score += Math.round(ratio * W.distCoherence);
    } else {
        score += W.distCoherence; // modalità distanza: coerenza garantita per costruzione
    }

    // 2 · Efficienza carburante: trip / block (20 pt)
    if (fd.fuelPlan && fd.fuelPlan.blockFuelKg > 0) {
        const eff = fd.fuelPlan.tripFuelKg / fd.fuelPlan.blockFuelKg;
        score += Math.round(Math.min(1, eff / 0.72) * W.fuelEfficiency);
    }

    // 3 · Utilizzo MZFW ottimale 75–95% (15 pt)
    const isLbs  = spec.units === 'LBS';
    const mzfwKg = (spec.mzfw || 0) * (isLbs ? LBS_TO_KG : 1);
    if (mzfwKg > 0 && fd.zfwKg != null) {
        const util = fd.zfwKg / mzfwKg;
        if      (util >= cfg.mzfwUtil.optMin && util <= cfg.mzfwUtil.optMax) score += W.mzfwUtilisation;
        else if (util >= 0.60 && util < cfg.mzfwUtil.optMin)                 score += Math.round(W.mzfwUtilisation * 0.50);
        else if (util >  cfg.mzfwUtil.optMax && util <= 1.00)                score += Math.round(W.mzfwUtilisation * 0.30);
        else                                                                  score += Math.round(W.mzfwUtilisation * 0.15);
    }

    // 4 · FL ottimale: sweet spot 60–88% del soffitto operativo (10 pt)
    if (spec.maxAlt > 0) {
        const flRatio = (fd.altValue / 10 * 1000) / spec.maxAlt;
        if      (flRatio >= 0.60 && flRatio <= 0.88) score += W.optimalFL;
        else if (flRatio >= 0.40)                    score += Math.round(W.optimalFL * 0.55);
        else                                          score += Math.round(W.optimalFL * 0.25);
    }

    // 5 · Compatibilità pista (10 pt) — garantita dal pool filter, sempre piena
    score += W.runwayCompat;

    // 6 · Coerenza missione/aeromobile: rotta entro range operativo (10 pt)
    const distOk = fd.distanceNm >= (spec.minD || 0) && fd.distanceNm <= (spec.maxD || 9999);
    score += distOk ? W.missionCoherence : Math.round(W.missionCoherence * 0.30);

    // 7 · Varietà destinazione: penalizza aeroporti già visitati di recente (10 pt)
    const recent = Array.isArray(recentDestinations) ? recentDestinations : [];
    score += recent.includes(fd.destination.icao)
        ? Math.round(W.destinationVariety * 0.15)
        : W.destinationVariety;

    return Math.min(100, Math.max(0, score));
}

/**
 * Calcolo completo di un singolo piano di volo IFR (Dispatcher Engine v2).
 * Restituisce un oggetto FlightData o null se la rotta non è fattibile.
 */
function computeFlightDataV2(params) {
    const {
        selectedRoute, spec, type, callsignRaw, selectedUnit,
        savedVariants, blockTimeMins, rangeMode,
        missionMatrix, lastMissionType, recentDestinations,
        simbriefVariantOverride
    } = params;

    const LBS_TO_KG = 0.453592;
    const isLbsSpec = spec.units === 'LBS';
    const toKg = v => isLbsSpec ? v * LBS_TO_KG : v;

    const origin      = selectedRoute.src;
    const destination = selectedRoute.dst;
    const distanceNm  = Math.round(selectedRoute.dist);
    const bearing     = calculateBearing(origin.lat, origin.lon, destination.lat, destination.lon);

    // Normalizzazione unità → kg per tutti i calcoli interni
    const mtowKg     = toKg(spec.mtow  || (spec.class === 'JET' ? 75000 : 3500));
    const oewKg      = toKg(spec.oew   || (spec.class === 'JET' ? 42000 : 2000));
    const mzfwKg     = toKg(spec.mzfw  || mtowKg);
    const PpassKg    = toKg(spec.Ppass || 90);
    const PbagKg     = toKg(spec.Pbag  || 15);
    const maxCargoKg = Math.min(toKg(spec.maxCargo || 0), mzfwKg - oewKg);

    // Floor di sicurezza terreno (elevazione + 3000 ft, con zone montane hardcoded)
    const depElev = origin.elev || 0, arrElev = destination.elev || 0;
    let terrainFloor = Math.max(depElev, arrElev) + 3000;
    const midLat = (origin.lat + destination.lat) / 2;
    const midLon = (origin.lon + destination.lon) / 2;
    const terrainRanges = [
        { latMin:45.0,  latMax:48.0,  lonMin:5.0,    lonMax:15.0,   safeFloor:11500 }, // Alpi
        { latMin:42.0,  latMax:43.3,  lonMin:-2.0,   lonMax:3.3,    safeFloor:9500  }, // Pirenei
        { latMin:35.0,  latMax:60.0,  lonMin:-125.0, lonMax:-105.0, safeFloor:14500 }, // Rockies
        { latMin:-55.0, latMax:10.0,  lonMin:-76.0,  lonMax:-65.0,  safeFloor:15500 }, // Ande
        { latMin:26.0,  latMax:38.0,  lonMin:70.0,   lonMax:105.0,  safeFloor:21500 }, // Himalaya
        { latMin:34.5,  latMax:37.5,  lonMin:136.0,  lonMax:139.5,  safeFloor:10500 }  // Giappone
    ];
    for (const r of terrainRanges) {
        const hits = [origin, destination, { lat: midLat, lon: midLon }]
            .some(p => p.lat >= r.latMin && p.lat <= r.latMax && p.lon >= r.lonMin && p.lon <= r.lonMax);
        if (hits && spec.class !== 'HELI') {
            terrainFloor = Math.max(terrainFloor, r.safeFloor);
            break;
        }
    }

    // ── Selezione missione (ponderata, con anti-ripetizione) ──
    const searchClass = spec.class === 'WARBIRD' ? 'GA' : spec.class;
    const isLocalFlight = origin.icao === destination.icao;
    let filteredMissions = (missionMatrix || []).filter(m => {
        if (!m.allowedClasses.includes(searchClass)) return false;
        if (spec.maxPax === 0 && m.paxOnly)          return false;
        if (spec.maxPax >  0 && m.cargoOnly)         return false;
        return true;
    });
    if (isLocalFlight) {
        const local = filteredMissions.filter(m => m.isLocal);
        if (local.length > 0) filteredMissions = local;
    } else {
        filteredMissions = filteredMissions.filter(m => !m.isLocal);
    }
    const mpool = filteredMissions.length > 0
        ? filteredMissions
        : (missionMatrix || []).filter(m => !m.isLocal);
    let selPool = mpool.filter(m => m.type !== lastMissionType);
    if (selPool.length === 0) selPool = mpool;

    const totalW = selPool.reduce((s, m) => s + m.weight, 0);
    let rn = Math.random() * totalW;
    let chosenMission = selPool[0];
    for (const m of selPool) {
        if (rn < m.weight) { chosenMission = m; break; }
        rn -= m.weight;
    }

    // ── Profilo di dispatch ──
    const profile = getDispatchProfile(chosenMission);

    // STEP 1 — Passeggeri
    let pax = 0;
    if (spec.maxPax > 0 && profile.paxFill[1] > 0) {
        const ratio = profile.paxFill[0] + Math.random() * (profile.paxFill[1] - profile.paxFill[0]);
        pax = Math.max(1, Math.min(spec.maxPax, Math.round(spec.maxPax * ratio)));
    }

    // STEP 2 — Peso passeggeri
    const paxWeightKg = pax * (PpassKg + PbagKg);

    // STEP 3 — Cargo (MZFW-constrained)
    const payloadAvailKg = Math.max(0, mzfwKg - oewKg - paxWeightKg);
    const cargoCapKg     = Math.min(payloadAvailKg, maxCargoKg);
    let cargoKg = 0;
    if (cargoCapKg > 0 && profile.cargoFill[1] > 0) {
        const ratio = profile.cargoFill[0] + Math.random() * (profile.cargoFill[1] - profile.cargoFill[0]);
        cargoKg = Math.max(0, Math.round(cargoCapKg * ratio));
    }

    // Guardia MZFW
    let zfwKg = oewKg + paxWeightKg + cargoKg;
    if (zfwKg > mzfwKg) {
        cargoKg = Math.max(0, cargoKg - Math.ceil(zfwKg - mzfwKg));
        zfwKg   = oewKg + paxWeightKg + cargoKg;
    }

    // STEP 4 — FL ottimale
    const zfwRatio = mtowKg > 0 ? zfwKg / mtowKg : 0.70;
    const flResult = computeOptimalFL(spec, distanceNm, zfwRatio, bearing, terrainFloor);
    let { altValue } = flResult;

    let effectiveRules = spec.rules;
    if (effectiveRules.includes('VFR') && flResult.kft >= 18) effectiveRules = 'IFR';
    if (effectiveRules.includes('VFR')) altValue = flResult.kft * 1000 + 500;

    // STEP 5 — Piano carburante IFR
    let fuelPlan = computeIfrFuelPlan(spec, distanceNm, profile);

    // STEP 6 — Scarta se BlockFuel > 95% FuelCapacity
    if (!fuelPlan.feasible) return null;

    // STEP 7 — Verifica pesi iterativa (max 5 cicli): riduci cargo → riduci pax → scarta
    let iteration = 0;
    while (iteration++ < 5) {
        const rampKg = zfwKg + fuelPlan.blockFuelKg;
        if (rampKg <= mtowKg) break;
        const excess = Math.ceil(rampKg - mtowKg);
        if (cargoKg >= excess) {
            cargoKg -= excess;
        } else {
            const remExcess = excess - cargoKg;
            cargoKg  = 0;
            const paxCut = Math.ceil(remExcess / (PpassKg + PbagKg));
            pax = Math.max(0, pax - paxCut);
        }
        zfwKg    = oewKg + pax * (PpassKg + PbagKg) + cargoKg;
        fuelPlan = computeIfrFuelPlan(spec, distanceNm, profile);
        if (!fuelPlan.feasible) return null;
    }
    if (zfwKg + fuelPlan.blockFuelKg > mtowKg * 1.001) return null;

    // Conversione display
    const isLbs         = selectedUnit === 'LBS';
    const cargoDisplay  = isLbs ? Math.round(cargoKg * 2.20462) : Math.round(cargoKg);
    const cargoUnitLabel = isLbs ? 'lbs' : 'kg';
    const cargoParam    = (cargoDisplay / 1000).toFixed(3);
    const altDisplayStr = effectiveRules.includes('VFR')
        ? altValue.toLocaleString('en-US') + ' ft MSL'
        : 'FL' + altValue;

    // SimBrief URL
    const variants = savedVariants || {};
    const variantId  = variants[type] || simbriefVariantOverride || '';
    const typeParam  = variantId || type;
    const simbriefUrl = `https://www.simbrief.com/system/dispatch.php?share=1&type=${typeParam}&orig=${origin.icao}&dest=${destination.icao}&callsign=${callsignRaw}&pax=${pax}&cargo=${cargoParam}&units=${selectedUnit}`;

    const fd = {
        callsignRaw, spec, type, typeParam,
        origin, destination, distanceNm, bearing,
        altValue, altDisplayStr, effectiveRules,
        pax, cargoKg: Math.round(cargoKg), cargoDisplay, cargoUnitLabel,
        isLbs, selectedUnit,
        chosenMission,
        simbriefUrl,
        fuelPlan,
        zfwKg:        Math.round(zfwKg),
        rampWeightKg: Math.round(zfwKg + fuelPlan.blockFuelKg),
        maxRangeNm:   Math.round(fuelPlan.maxRangeNm)
    };

    fd.missionScore = computeMissionScore(fd, blockTimeMins, rangeMode, recentDestinations);
    return fd;
}

// ─────────────────────────────────────────────────────────────────────────────
// Classe principale: IfrFlightEngine
// ─────────────────────────────────────────────────────────────────────────────

class IfrFlightEngine {
    /**
     * @param {Object} config
     * @param {AirportRecord[]}    [config.airportDatabase] - Array aeroporti (airport.js / seedAirportDatabase)
     * @param {Object}             config.fleetSpecs        - Mappa tipo → FleetSpec (fleet-db.js)
     * @param {MissionRecord[]}    config.missionMatrix     - Array missioni (missions-db.js)
     */
    constructor({ airportDatabase, fleetSpecs, missionMatrix } = {}) {
        const mergedDb = (typeof seedAirportDatabase !== 'undefined') ? seedAirportDatabase : [];
        this.airportDatabase = airportDatabase || mergedDb;
        this.fleetSpecs      = fleetSpecs || {};
        this.missionMatrix   = missionMatrix || [];

        // Stato interno anti-ripetizione missioni
        this._lastMissionType = null;
    }

    // ── Filtri geografici ────────────────────────────────────────────────

    /** Verifica se un aeroporto appartiene al continente specificato. */
    _isInContinent(ap, code) {
        if (!code || code === 'ALL') return true;
        if (ap.continent) {
            if (code === 'AF') return ap.continent === 'AF' || MIDDLE_EAST_COUNTRIES.has(ap.country);
            return ap.continent === code;
        }
        const b = CONTINENT_BOUNDS[code];
        if (!b || !Number.isFinite(+ap.lat) || !Number.isFinite(+ap.lon)) return false;
        return +ap.lat >= b.latMin && +ap.lat <= b.latMax && +ap.lon >= b.lonMin && +ap.lon <= b.lonMax;
    }

    /** Verifica se un aeroporto appartiene al paese specificato (ISO alpha-2). */
    _isInCountry(ap, code) {
        if (!code || code === 'ALL') return true;
        return ap.country === code;
    }

    /** Verifica se un aeroporto ha il tipo specificato (small_airport, medium_airport, large_airport). */
    _matchesTypeFilter(ap, allowedTypes) {
        if (!allowedTypes || allowedTypes.size === 0) return true;
        return allowedTypes.has(ap.type);
    }

    // ── API pubblica ─────────────────────────────────────────────────────

    /**
     * Costruisce il pool di aeroporti compatibili con i filtri forniti.
     *
     * @param {Object} filters
     * @param {string}   filters.aircraftType       - Chiave in fleetSpecs (es. 'C56X')
     * @param {string}   [filters.continent='ALL']  - Codice continente ('EU'|'NA'|'SA'|'AF'|'AS'|'OC'|'ALL')
     * @param {string}   [filters.country='ALL']    - Codice paese ISO alpha-2
     * @param {Set<string>} [filters.airportTypes]  - Set di tipi ('small_airport', 'medium_airport', 'large_airport')
     * @param {string[]} [filters.blacklist=[]]     - ICAO da escludere
     * @returns {AirportRecord[]}
     */
    buildAirportPool(filters) {
        const { aircraftType, continent = 'ALL', country = 'ALL', airportTypes, blacklist = [] } = filters;
        const spec = this.fleetSpecs[aircraftType];
        if (!spec) throw new Error(`Aircraft type '${aircraftType}' not found in fleetSpecs`);

        // Mappa compatibilità pista: un aeroporto può accogliere tutti gli aerei
        // con classe ≤ alla propria categoria.
        const rwyAllowed = {
            GA:       ['GA', 'WARBIRD', 'HELI'],
            TURBO:    ['GA', 'WARBIRD', 'TURBO', 'HELI'],
            'BIZ JET':['GA', 'WARBIRD', 'TURBO', 'BIZ JET', 'HELI'],
            JET:      ['GA', 'WARBIRD', 'TURBO', 'BIZ JET', 'JET', 'HELI'],
            HELI:     ['HELI']
        };

        return this.airportDatabase.filter(ap => {
            const allowed = rwyAllowed[ap.rwy] || [];
            return allowed.includes(spec.class)
                && (ap.length ? ap.length >= spec.minRunwayLength : true)
                && this._isInContinent(ap, continent)
                && this._isInCountry(ap, country)
                && !blacklist.includes(ap.icao)
                && this._matchesTypeFilter(ap, airportTypes);
        });
    }

    /**
     * Genera fino a `maxResults` voli IFR, ordinati per Mission Score decrescente.
     *
     * @param {Object} options
     * @param {string}   options.aircraftType          - Chiave in fleetSpecs (es. 'C56X')
     * @param {string}   options.callsign              - Callsign ATC (es. 'NJE001')
     * @param {string}   [options.rangeMode='time']    - 'time' | 'dist'
     * @param {number}   [options.blockTimeMins=60]    - Target Block Time in minuti (rangeMode='time')
     * @param {number}   [options.maxDistNm=500]       - Distanza massima in NM (rangeMode='dist')
     * @param {string}   [options.depIcao]             - Override aeroporto di partenza
     * @param {string}   [options.arrIcao]             - Override aeroporto di arrivo
     * @param {string}   [options.continent='ALL']     - Filtro continente
     * @param {string}   [options.country='ALL']       - Filtro paese
     * @param {Set<string>} [options.airportTypes]     - Filtro tipo aeroporto
     * @param {string[]} [options.blacklist=[]]        - ICAO in blacklist
     * @param {string}   [options.weightUnit='KGS']    - 'KGS' | 'LBS' (display e SimBrief)
     * @param {Object}   [options.savedVariants={}]    - Mappa tipo → SimBrief variant ID
     * @param {string}   [options.simbriefVariantOverride] - Override variant ID singolo
     * @param {string[]} [options.recentDestinations=[]] - ICAO visitati di recente (anti-ripetizione)
     * @param {number}   [options.candidatePoolSize=20] - Quante rotte campionare prima di punteggiare
     * @param {number}   [options.maxResults=5]         - Quante proposte restituire
     * @returns {FlightData[]} Array ordinato per missionScore decrescente
     */
    generateFlights(options) {
        const {
            aircraftType,
            callsign,
            rangeMode      = 'time',
            blockTimeMins  = 60,
            maxDistNm      = 500,
            depIcao,
            arrIcao,
            continent      = 'ALL',
            country        = 'ALL',
            airportTypes,
            blacklist      = [],
            weightUnit     = 'KGS',
            savedVariants  = {},
            simbriefVariantOverride,
            recentDestinations = [],
            candidatePoolSize  = 20,
            maxResults         = 5
        } = options;

        const spec = this.fleetSpecs[aircraftType];
        if (!spec) throw new Error(`Aircraft type '${aircraftType}' not found in fleetSpecs`);

        const callsignRaw = String(callsign).trim().toUpperCase();

        // ── Pool di aeroporti validi ──
        const validAirports = this.buildAirportPool({
            aircraftType, continent, country, airportTypes, blacklist
        });

        // ── Resolve override DEP/ARR ──
        const resolvedDep = depIcao
            ? this.airportDatabase.find(ap => ap.icao === depIcao.toUpperCase()) || null
            : null;
        const resolvedArr = arrIcao
            ? this.airportDatabase.find(ap => ap.icao === arrIcao.toUpperCase()) || null
            : null;

        if (depIcao && !resolvedDep)
            throw new Error(`Departure airport '${depIcao}' not found in database`);
        if (arrIcao && !resolvedArr)
            throw new Error(`Arrival airport '${arrIcao}' not found in database`);
        if (depIcao && arrIcao && depIcao.toUpperCase() === arrIcao.toUpperCase())
            throw new Error('Departure and arrival cannot be the same airport');

        const srcPool = resolvedDep ? [resolvedDep] : validAirports;
        const dstPool = resolvedArr ? [resolvedArr] : validAirports;

        // ── Calcolo finestra distanza target ──
        let minTarget, maxTarget;
        if (rangeMode === 'dist') {
            const cappedMax = Math.min(spec.maxD, maxDistNm);
            minTarget = spec.class === 'HELI' ? 5 : Math.max(spec.minD, 100);
            maxTarget = spec.class === 'HELI' ? 35 : Math.max(minTarget + 50, cappedMax);
        } else {
            const blockSpeedByClass = { JET: 380, 'BIZ JET': 340, TURBO: 220, WARBIRD: 200, HELI: 80 };
            const blockSpeed = blockSpeedByClass[spec.class]
                || (spec.class === 'GA' && spec.maxAlt >= 15000 ? 160 : 90);
            const effectiveMins = spec.class === 'HELI' ? 20 : Math.max(10, blockTimeMins - 30);
            const targetDist = (blockSpeed * effectiveMins) / 60;
            minTarget = spec.class === 'HELI' ? 5 : Math.max(spec.minD, targetDist * 0.85);
            maxTarget = spec.class === 'HELI' ? 35 : Math.min(spec.maxD, targetDist * 1.15);
        }

        // ── Generazione coppie candidate ──
        let candidatePairs = [];
        for (const src of srcPool) {
            for (const dst of dstPool) {
                if (src.icao === dst.icao && spec.class === 'HELI') {
                    candidatePairs.push({ src, dst: src, dist: 25 });
                    continue;
                }
                if (src.icao === dst.icao) continue;
                const dist = calculateDistance(src.lat, src.lon, dst.lat, dst.lon);
                if (dist >= minTarget && dist <= maxTarget) candidatePairs.push({ src, dst, dist });
            }
        }

        // Fallback 1: relax al range operativo completo dell'aeromobile
        if (candidatePairs.length === 0) {
            for (const src of srcPool) {
                for (const dst of dstPool) {
                    if (src.icao === dst.icao) continue;
                    const dist = calculateDistance(src.lat, src.lon, dst.lat, dst.lon);
                    if (dist >= spec.minD && dist <= spec.maxD) candidatePairs.push({ src, dst, dist });
                }
            }
        }

        // Fallback 2: forza la coppia override indipendentemente dalla distanza
        if (candidatePairs.length === 0 && resolvedDep && resolvedArr) {
            candidatePairs.push({
                src: resolvedDep, dst: resolvedArr,
                dist: calculateDistance(resolvedDep.lat, resolvedDep.lon, resolvedArr.lat, resolvedArr.lon)
            });
        }

        if (candidatePairs.length === 0)
            throw new Error('No valid routes found for the current filters and aircraft range');

        // ── Shuffle e campionamento ──
        const pool = candidatePairs.slice();
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        const sample = pool.slice(0, Math.min(candidatePoolSize, pool.length));

        // ── Calcolo completo + scoring ──
        const scoredFlights = sample
            .map(pair => {
                const fd = computeFlightDataV2({
                    selectedRoute: pair,
                    spec: { ...spec },
                    type: aircraftType,
                    callsignRaw,
                    selectedUnit: weightUnit,
                    savedVariants,
                    blockTimeMins,
                    rangeMode,
                    missionMatrix: this.missionMatrix,
                    lastMissionType: this._lastMissionType,
                    recentDestinations,
                    simbriefVariantOverride
                });
                if (fd) this._lastMissionType = fd.chosenMission ? fd.chosenMission.type : null;
                return fd;
            })
            .filter(Boolean)
            .sort((a, b) => b.missionScore - a.missionScore);

        return scoredFlights.slice(0, maxResults);
    }

    /**
     * Calcola il block time stimato per un volo già generato.
     * @param {FlightData} fd
     * @returns {{ blockTimeMins: number, timeStr: string }}
     */
    static estimateBlockTime(fd) {
        const cruiseKt  = fd.spec.cruiseKt || 300;
        const taxiMins  = DISPATCHER_CONFIG.taxi.outMins + DISPATCHER_CONFIG.taxi.inMins;
        const isVfr     = fd.spec.rules.includes('VFR');
        const kft       = isVfr ? Math.round(fd.altValue / 1000) : fd.altValue / 10;
        const phases    = estimatePhasesMins(kft, fd.spec.class);
        const blockTimeMins = Math.round((fd.distanceNm / cruiseKt) * 60)
            + taxiMins + phases.climbMins + phases.descentMins;
        const h   = Math.floor(blockTimeMins / 60);
        const m   = blockTimeMins % 60;
        const timeStr = h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${blockTimeMins}m`;
        return { blockTimeMins, timeStr };
    }

    /**
     * Converte un Mission Score (0–100) in stelle (★★★★☆ ecc.).
     * @param {number} score
     * @returns {string}
     */
    static scoreToStars(score) {
        const n = Math.round(score / 20);
        return '★'.repeat(n) + '☆'.repeat(5 - n);
    }

    /**
     * Restituisce i paesi disponibili per un dato continente.
     * Utile per popolare un filtro UI dinamico.
     * @param {string} continentCode - 'EU'|'NA'|'SA'|'AF'|'AS'|'OC'|'ALL'
     * @returns {Array<{ code: string, name: string }>} Ordinato per nome
     */
    getCountriesForContinent(continentCode) {
        const codes = new Set();
        this.airportDatabase.forEach(ap => {
            if (!ap.country) return;
            if (!continentCode || continentCode === 'ALL') {
                codes.add(ap.country);
            } else if (continentCode === 'AF') {
                if (ap.continent === 'AF' || MIDDLE_EAST_COUNTRIES.has(ap.country))
                    codes.add(ap.country);
            } else if (ap.continent === continentCode) {
                codes.add(ap.country);
            }
        });
        return Array.from(codes)
            .filter(c => COUNTRY_NAMES[c])
            .sort((a, b) => COUNTRY_NAMES[a].localeCompare(COUNTRY_NAMES[b]))
            .map(c => ({ code: c, name: COUNTRY_NAMES[c] }));
    }

    /**
     * Statistiche sul database caricato.
     * @returns {{ airports: number, aircraft: number, missions: number }}
     */
    getDatabaseStats() {
        return {
            airports: this.airportDatabase.length,
            aircraft: Object.keys(this.fleetSpecs).length,
            missions: this.missionMatrix.length
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Export (compatibile con CommonJS, ESM e browser globale)
// ─────────────────────────────────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
    // Node.js / CommonJS
    module.exports = {
        IfrFlightEngine,
        calculateDistance,
        calculateBearing,
        computeIfrFuelPlan,
        computeOptimalFL,
        estimatePhasesMins,
        DISPATCHER_CONFIG,
        CONTINENT_BOUNDS,
        MIDDLE_EAST_COUNTRIES,
        COUNTRY_NAMES
    };
} else if (typeof define === 'function' && define.amd) {
    // AMD (RequireJS)
    define([], () => ({ IfrFlightEngine, calculateDistance, calculateBearing, DISPATCHER_CONFIG }));
} else {
    // Browser globale
    window.IfrFlightEngine    = IfrFlightEngine;
    window.DISPATCHER_CONFIG  = DISPATCHER_CONFIG;
    window.calculateDistance  = calculateDistance;
    window.calculateBearing   = calculateBearing;
}
