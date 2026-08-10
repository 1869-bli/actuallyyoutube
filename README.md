# actuallyYOUtube

An ad-free YouTube client that runs on your PC. Search, watch and stream videos
straight from YouTube's own servers — no 90-second unskippable ads, no banner
garbage breaking the UI, no promoted trash. Ever.

## How to run

1. Install [Python](https://python.org) (check "Add to PATH" during install) and
   [FFmpeg](https://ffmpeg.org/download.html).
2. Double-click `start.bat` — it installs dependencies, starts the app and
   opens your browser.

Or manually:

```
pip install -r requirements.txt
python app.py
```

Then open http://127.0.0.1:5000

## Install as a desktop web app (Windows)

In Chrome or Edge, while the app is open:

- an **"Install app"** button appears in the top-right corner, or
- click the install icon in the browser's address bar.

The app then installs like a native desktop app: own window, own icon in the
Start menu and taskbar. Double-click `start.bat` whenever you want to use it
(the app is local to your PC, so it needs to be running).

## Features

- Search, watch and stream videos straight from YouTube — no ads, no promoted content
- **Local accounts** with profiles (avatars, colors) — clicking Subscribe saves a channel
  to your account, and your home feed shows their latest uploads. Everything stays in
  `data.json` on your PC.
- **SponsorBlock**: the "SB ON" button auto-skips sponsor, intro, outro and
  self-promo segments (yellow markers on the progress bar). Toggle it in the header.
- Channel profile pictures everywhere, channel pages (click a channel name)
- Light mode / dark mode toggle (sun/moon button)
- Watch history, "continue watching" (browser localStorage only)
- Installable as a desktop web app (PWA) in Chrome/Edge

## How it works

- The backend (Flask) uses **yt-dlp** to search YouTube and read video info.
- Video + audio are fetched directly as raw streams and merged on the fly with
  FFmpeg — your browser never touches YouTube's ad-infested player.
- Nothing about you is tracked or logged. History stays in your browser's
  local storage only.

## Notes

- Best quality is picked automatically (up to 4K when available).
- Some protected videos (age-gated, geo-blocked) may not play.
- Live streams are not supported yet.