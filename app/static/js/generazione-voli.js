const fleet = typeof coreFleetSpecs !== 'undefined' ? coreFleetSpecs : {};
const airports = typeof seedAirportDatabase !== 'undefined' ? seedAirportDatabase : [];
const $ = (id) => document.getElementById(id);

const aircraftEl = $('aircraft');
const variantEl = $('variant');
const continentEl = $('continent');
const countryEl = $('country');
const statusEl = $('status');
const resultsEl = $('results');
const briefEl = $('brief');
const formEl = $('flight-form');
const simbriefButton = $('simbrief');

const selectedAirportTypes = new Set();
let currentFlight = null;

const setStatus = (text, kind = '') => {
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`.trim();
};

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return [value];
};

const updateAircraftVariants = () => {
  const selectedAirframe = aircraftEl.value;
  const spec = fleet[selectedAirframe] || {};
  const variants = toArray(spec.variants);

  variantEl.innerHTML = '<option value="">Auto / default</option>';
  variants.forEach((value) => {
    if (value) {
      variantEl.add(new Option(value, value));
    }
  });
};

const updateCountries = () => {
  const continentCode = continentEl.value;
  const codes = [...new Set(
    airports
      .filter((airport) => airport.country && (continentCode === 'ALL' || airport.continent === continentCode))
      .map((airport) => airport.country)
  )].sort();

  countryEl.innerHTML = '<option value="ALL">Tutte</option>';
  codes.forEach((code) => {
    countryEl.add(new Option(code, code));
  });
};

const renderBrief = (flight) => {
  briefEl.innerHTML = `
    <div class="metric-list">
      <div class="metric"><span>Route</span><strong>${flight.origin.icao} → ${flight.destination.icao}</strong></div>
      <div class="metric"><span>Mission score</span><strong>${flight.missionScore}/100</strong></div>
      <div class="metric"><span>Altitude</span><strong>${flight.altDisplayStr}</strong></div>
      <div class="metric"><span>Payload</span><strong>${flight.pax} pax · ${flight.cargoDisplay} ${flight.cargoUnitLabel}</strong></div>
      <div class="metric"><span>Range residuo</span><strong>${flight.maxRangeNm} NM</strong></div>
    </div>
  `;
};

const renderResults = (list) => {
  resultsEl.innerHTML = list.map((flight) => `
    <article class="result">
      <h3>${flight.origin.icao} → ${flight.destination.icao}</h3>
      <p>${flight.chosenMission?.desc || 'Missione'} · ${flight.distanceNm} NM · score ${flight.missionScore}</p>
      <p>${flight.altDisplayStr} · ${flight.pax} pax · ${flight.cargoDisplay} ${flight.cargoUnitLabel}</p>
      <a href="${flight.simbriefUrl}" target="_blank" rel="noopener noreferrer">Apri SimBrief</a>
    </article>
  `).join('');
};

const init = () => {
  if (!aircraftEl || !continentEl || !countryEl) return;

  aircraftEl.innerHTML = '<option value="">Seleziona</option>' + Object.entries(fleet)
    .map(([key, value]) => `<option value="${key}">${key} — ${value.name || key}</option>`)
    .join('');

  const firstKey = Object.keys(fleet)[0] || '';
  if (firstKey) aircraftEl.value = firstKey;

  continentEl.innerHTML = ['ALL', 'EU', 'NA', 'SA', 'AF', 'AS', 'OC']
    .map((code) => `<option value="${code}">${code}</option>`)
    .join('');
  continentEl.value = 'ALL';

  updateAircraftVariants();
  updateCountries();
};

document.querySelectorAll('[data-type]').forEach((button) => {
  button.addEventListener('click', () => {
    const type = button.dataset.type;
    if (selectedAirportTypes.has(type)) {
      selectedAirportTypes.delete(type);
      button.classList.remove('selected');
    } else {
      selectedAirportTypes.add(type);
      button.classList.add('selected');
    }
  });
});

aircraftEl.addEventListener('change', updateAircraftVariants);
continentEl.addEventListener('change', updateCountries);

formEl.addEventListener('submit', (event) => {
  event.preventDefault();

  try {
    if (typeof window.IfrFlightEngine === 'undefined') {
      throw new Error('flight-engine.js non caricato');
    }

    const engine = new window.IfrFlightEngine({
      airportDatabase: airports,
      fleetSpecs: fleet,
      missionMatrix: [
        { type: 1, desc: 'Charter cargo', weight: 20, allowedClasses: ['JET', 'BIZ JET', 'TURBO', 'GA'], cargoOnly: true },
        { type: 2, desc: 'VIP transfer', weight: 18, allowedClasses: ['JET', 'BIZ JET', 'TURBO'], paxOnly: true },
        { type: 3, desc: 'Regional shuttle', weight: 24, allowedClasses: ['JET', 'BIZ JET', 'TURBO', 'GA'] },
        { type: 4, desc: 'Priority cargo', weight: 16, allowedClasses: ['JET', 'BIZ JET', 'TURBO', 'GA'], cargoOnly: true },
        { type: 5, desc: 'Medical flight', weight: 14, allowedClasses: ['JET', 'BIZ JET', 'TURBO'], paxOnly: true }
      ],
    });

    const flights = engine.generateFlights({
      aircraftType: aircraftEl.value,
      callsign: $('callsign').value,
      depIcao: $('departure').value.trim() || undefined,
      arrIcao: $('arrival').value.trim() || undefined,
      continent: continentEl.value,
      country: countryEl.value,
      airportTypes: selectedAirportTypes.size ? selectedAirportTypes : undefined,
      blockTimeMins: Number($('block-time').value) || 60,
      weightUnit: $('units').value,
      simbriefVariantOverride: variantEl.value || undefined,
      recentDestinations: [],
      maxResults: 5,
    });

    if (!flights.length) {
      throw new Error('Nessun volo compatibile con i filtri attuali');
    }

    currentFlight = flights[0];
    renderBrief(currentFlight);
    renderResults(flights);
    setStatus(`${flights.length} voli generati`, 'ok');
  } catch (error) {
    currentFlight = null;
    briefEl.innerHTML = '<p>Impossibile generare il volo con i filtri attuali.</p>';
    resultsEl.innerHTML = '';
    setStatus(error.message, 'error');
  }
});

simbriefButton.addEventListener('click', () => {
  if (currentFlight?.simbriefUrl) {
    window.open(currentFlight.simbriefUrl, '_blank', 'noopener,noreferrer');
    return;
  }
  setStatus('Genera prima un volo', 'error');
});

init();
