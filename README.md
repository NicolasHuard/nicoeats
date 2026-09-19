# Nicoeats

Reviews of natas, carrot cake and poutine in Montréal. Risograph-print design.
Pure Python 3 standard library on the back end (SQLite), vanilla JS on the front. No installs.

## Run locally
    NICOEATS_PASSWORD=pick-something python3 server.py
Then open http://localhost:8000 and go to `/#/admin` (or the "door for the chef" link in the footer).

## Deploy (public)
Any host that runs Python 3.9+ and has a persistent disk works. `render.yaml` is included for Render.
Set `NICOEATS_PASSWORD` and point `DATA_DIR` at the persistent disk (reviews + photos live there).
Back up by copying that folder.

## Changing the scoring criteria
Edit `CRITERIA` in `server.py` and `CATS` in `public/js/app.js` (keep the keys identical).
