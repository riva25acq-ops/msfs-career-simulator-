# MSFS Career Simulator - local flight generator

Questo repository contiene il motore di dati e la logica di generazione voli già sviluppata in JavaScript (`aerei.js`, `airport.js`, `flight-engine.js`).

Ora è stata aggiunta una struttura FastAPI locale per eseguire l'applicazione web in locale, con:

- backend Python in FastAPI
- frontend HTML e CSS separati
- pagina principale `Generazioni Voli`
- gestione locale dei file di configurazione (aerei, aeroporti, missioni)
- servizio statico per CSS e pagine HTML

## Requisiti

- Python 3.11+
- venv

## Avvio con virtualenv

1. Crea l'ambiente virtuale:
   python3 -m venv venv

2. Attiva l'ambiente:
   source venv/Script/activate

3. Installa le dipendenze:
   pip install -r requirements.txt

4. Avvia il server:
   python run.py

5. Apri nel browser:
   http://127.0.0.1:8000/

## Struttura principale

- `app/main.py` — backend FastAPI
- `app/static/pages/index.html` — layout con sidebar e frame
- `app/static/pages/generazione-voli.html` — pagina principale di generazione voli
- `app/static/css/flight-generator.css` — file CSS esterno dedicato
- `app/static/js/generazione-voli.js` — logica frontend di interazione
- `data/user-config/` — cartella locale per upload dei file utente
