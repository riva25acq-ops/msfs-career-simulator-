//fleet-db.js v.0721a
//
// CHANGELOG rispetto a v.0406d:
//
// BUGFIX:
//   P180  → aggiunto "units":"LBS" (mtow/oew erano in lbs, trattati erroneamente come kg)
//   LJ35  → aggiunto "units":"LBS" (idem)
//
// fuelPerNm CORRETTI (metodologia: burn_gph × 3.785 × 0.803 / cruiseKt × 1.10 block factor):
//   C750  → 2.10 → 1.70  (245 gph / 480 kt)
//   HDJT  → 0.60 → 0.70  (88 gph / 380 kt)  | maxD 1500 → 1400
//   SF50  → 0.60 → 0.58  (52 gph / 300 kt)   | maxD 1500 → 1250
//   E55P  → 1.10 → 1.00  (130 gph / 430 kt)
//   C680  → 1.60 → 1.45  (185 gph / 430 kt)
//   C25C  → 1.20 → 1.00  (130 gph / 440 kt)
//   C700  → 1.70 → 1.60  (205 gph / 450 kt)
//   TBM9  → 0.80 → 0.65  (58 gph / 300 kt)   | maxD 1500 → 1000
//   P180  → 0.90 → 0.95  (90 gph / 320 kt)
//
// NUOVI:
//   TBM8  (Daher TBM 850)
//   C25B  (Cessna CJ3+)
//   PC12  (Pilatus PC-12 NGX)
//
// Coerenza verificata: fuelCapacityKg / fuelPerNm × 0.83 (riserva IFR 17%) >= maxD per ogni voce.
// mtow, oew, fuelCapacityKg invariati rispetto alla versione precedente.

const coreFleetSpecs = {

  "C750": {
    "name": "FlightFX - Cessna 750 Citation X",
    "variants": "46755_1770473892407",
    "maxPax": 9, "maxCargo": 776,
    "minD": 150, "maxD": 1500,
    "minAlt": 25000, "maxAlt": 51000,
    "rules": "IFR", "minRunwayLength": 3000, "class": "BIZ JET",
    "mtow": 36101, "oew": 22190,
    "fuelPerNm": 1.70, "units": "LBS", "fuelCapacityKg": 5865,
    "cruiseKt": 480,
	"Ppass": 175,
	"Pbag": 51,
	"mzfw": 24401
  },

  "HDJT": {
    "name": "FlightFX - Honda Jet",
    "variants": "46755_1780792313340",
    "maxPax": 6, "maxCargo": 500,
    "minD": 150, "maxD": 1400,
    "minAlt": 25000, "maxAlt": 43000,
    "rules": "IFR", "minRunwayLength": 4000, "class": "BIZ JET",
    "mtow": 11000, "oew": 7200,
    "fuelPerNm": 0.70, "units": "LBS", "fuelCapacityKg": 1207,
    "cruiseKt": 380,
	"Ppass": 170,
	"Pbag": 0,
	"mzfw": 8800
  },

  "P180": {
    "name": "FlightFX - P180 Avanti",
    "variants": "46755_1785528636861",
    "maxPax": 7, "maxCargo": 500,
    "minD": 70, "maxD": 1500,
    "minAlt": 15000, "maxAlt": 41000,
    "rules": "IFR", "minRunwayLength": 3300, "class": "BIZ JET",
    "mtow": 11550, "oew": 7840,
    "fuelPerNm": 0.95, "units": "LBS", "fuelCapacityKg": 1735,
    "cruiseKt": 320,
	"Ppass": 170,
	"Pbag": 50,
	"mzfw": 9800
  },

  "SF50": {
    "name": "FlightFX - Vision Jet G2+",
    "variants": "46755_1785528816807",
    "maxPax": 4, "maxCargo": 136,
    "minD": 70, "maxD": 1250,
    "minAlt": 15000, "maxAlt": 31000,
    "rules": "IFR", "minRunwayLength": 3100, "class": "BIZ JET",
    "mtow": 6000, "oew": 3730,
    "fuelPerNm": 0.58, "units": "LBS", "fuelCapacityKg": 880,
    "cruiseKt": 300,
	"Ppass": 181,
	"Pbag": 11,
	"mzfw": 4901
  },

  "LJ35": {
    "name": "Flysimware - Bombardier Lear Jet 35A",
    "maxPax": 8, "maxCargo": 1450,
    "minD": 150, "maxD": 1500,
    "minAlt": 24000, "maxAlt": 45000,
    "rules": "IFR", "minRunwayLength": 4972, "class": "BIZ JET",
    "mtow": 18001, "oew": 10362,
    "fuelPerNm": 1.20, "units": "LBS", "fuelCapacityKg": 2722,
    "cruiseKt": 420,
	"Ppass": 175,
	"Pbag": 55,
	"mzfw": 13289
  },

  "E55P": {
    "name": "FSReborn - Phenom 300e",
    "variants": "46755_1780080930483",
    "maxPax": 7, "maxCargo": 550,
    "minD": 150, "maxD": 1500,
    "minAlt": 25000, "maxAlt": 45000,
    "rules": "IFR", "minRunwayLength": 3209, "class": "BIZ JET",
    "mtow": 18551, "oew": 11074,
    "fuelPerNm": 1.00, "units": "LBS", "fuelCapacityKg": 1917,
    "cruiseKt": 430,
	"Ppass": 175,
	"Pbag": 55,
	"mzfw": 14263
  },

  "C680": {
    "name": "Citation C680 Sovereign+",
    "variants": "46755_1780822606653",
    "maxPax": 9, "maxCargo": 651,
    "minD": 150, "maxD": 1500,
    "minAlt": 24000, "maxAlt": 47000,
    "rules": "IFR", "minRunwayLength": 3530, "class": "BIZ JET",
    "mtow": 30300, "oew": 18200,
    "fuelPerNm": 1.45, "units": "LBS", "fuelCapacityKg": 4112,
    "cruiseKt": 430,
	"Ppass": 209,
	"Pbag": 31,
	"mzfw": 20800
  },

  "C25C": {
    "name": "Asobo - Cessna CJ4",
    "variants": "46755_1780761391312",
    "maxPax": 10, "maxCargo": 600,
    "minD": 150, "maxD": 1320,
    "minAlt": 25000, "maxAlt": 45000,
    "rules": "IFR", "minRunwayLength": 3270, "class": "BIZ JET",
    "mtow": 17110, "oew": 9859,
    "fuelPerNm": 1.00, "units": "LBS", "fuelCapacityKg": 2644,
    "cruiseKt": 440,
	"Ppass": 170,
	"Pbag": 55,
	"mzfw": 12500
  },

  "C700": {
    "name": "Asobo - Cessna Longitude",
    "variants": "46755_1670749535269",
    "maxPax": 6, "maxCargo": 0,
    "minD": 150, "maxD": 1500,
    "minAlt": 25000, "maxAlt": 45000,
    "rules": "IFR", "minRunwayLength": 4810, "class": "BIZ JET",
    "mtow": 39500, "oew": 23389,
    "fuelPerNm": 1.60, "units": "LBS", "fuelCapacityKg": 6619,
    "cruiseKt": 450,
	"Ppass": 170,
	"Pbag": 55,
	"mzfw": 25108
  },

  "TBM9": {
    "name": "Asobo - Daher TBM 930",
    "variants": "46755_1735950546163",
    "maxPax": 6, "maxCargo": 800,
    "minD": 150, "maxD": 1000,
    "minAlt": 25000, "maxAlt": 31000,
    "rules": "IFR", "minRunwayLength": 2380, "class": "BIZ JET",
    "mtow": 7394, "oew": 4630,
    "fuelPerNm": 0.65, "units": "LBS", "fuelCapacityKg": 795,
    "cruiseKt": 300,
	"Ppass": 230,
	"Pbag": 0,
	"mzfw": 6032
  },

  "TBM8": {
    "name": "Asobo - Daher TBM 850",
    "maxPax": 5, "maxCargo": 750,
    "minD": 150, "maxD": 1200,
    "minAlt": 20000, "maxAlt": 31000,
    "rules": "IFR", "minRunwayLength": 2380, "class": "BIZ JET",
    "mtow": 7430, "oew": 4806,
    "fuelPerNm": 0.60, "units": "LBS", "fuelCapacityKg": 897,
    "cruiseKt": 320,
	"Ppass": 181,
	"Pbag": 37,
	"mzfw": 6032
  },

  "C25B": {
    "name": "Asobo - Cessna CJ3+",
    "variants": "46755_1749963696157",
    "maxPax": 7, "maxCargo": 550,
    "minD": 150, "maxD": 1500,
    "minAlt": 24000, "maxAlt": 45000,
    "rules": "IFR", "minRunwayLength": 3200, "class": "BIZ JET",
    "mtow": 13870, "oew": 8700,
    "fuelPerNm": 0.90, "units": "LBS", "fuelCapacityKg": 1634,
    "cruiseKt": 416,
	"Ppass": 185,
	"Pbag": 35,
	"mzfw": 10500
  },

  "PC12": {
    "name": "Asobo - Pilatus PC-12 NGX",
    "variants": "46755_1742133950066",
    "maxPax": 6, "maxCargo": 900,
    "minD": 70, "maxD": 1500,
    "minAlt": 10000, "maxAlt": 30000,
    "rules": "IFR", "minRunwayLength": 2400, "class": "BIZ JET",
    "mtow": 10450, "oew": 6172,
    "fuelPerNm": 0.68, "units": "LBS", "fuelCapacityKg": 1235,
    "cruiseKt": 270,
	"Ppass": 205,
	"Pbag": 55,
	"mzfw": 7729
  },

  "STAR": {
    "name": "Black Square – Beechcraft Starship",
    "variants": "46755_1785012138864",
    "maxPax": 6, "maxCargo": 685,
    "minD": 150, "maxD": 1300,
    "minAlt": 20000, "maxAlt": 35000,
    "rules": "IFR", "minRunwayLength": 3900, "class": "BIZ JET",
    "mtow": 14900, "oew": 10085,
    "fuelPerNm": 1.05, "units": "LBS", "fuelCapacityKg": 1702,
    "cruiseKt": 315,
	"Ppass": 175,
	"Pbag": 55,
	"mzfw": 12599
  },
  
  "SF": {
    "name": "Asobo SF50 Family",
    "maxPax": 6,
    "maxCargo": 300,
    "minD": 150,
    "maxD": 1200,
    "minAlt": 15000,
    "maxAlt": 31000,
    "rules": "IFR",
    "minRunwayLength": 2000,
    "class": "BIZ JET",
    "mtow": 6000,
    "oew": 3711,
    "fuelPerNm": 0.58,
    "units": "LBS",
    "fuelCapacityKg": 907,
    "cruiseKt": 300,
    "Ppass": 175,
    "Pbag": 55,
    "mzfw": 4900
  },
};
