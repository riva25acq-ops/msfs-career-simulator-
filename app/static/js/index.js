const tick = () => {
  const localEl = document.getElementById('local-time');
  const utcEl = document.getElementById('utc-time');
  const localClock = document.getElementById('local-clock');
  const utcClock = document.getElementById('utc-clock');

  const localTime = new Intl.DateTimeFormat('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }).format(new Date());

  const utcTime = new Intl.DateTimeFormat('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(new Date());

  if (localEl) localEl.textContent = localTime;
  if (utcEl) utcEl.textContent = utcTime;
  if (localClock) localClock.textContent = localTime.slice(0, 5);
  if (utcClock) utcClock.textContent = utcTime.slice(0, 5);
};

tick();
setInterval(tick, 1000);
