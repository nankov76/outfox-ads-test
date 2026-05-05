# Outfox Ads Intelligence — Test Version

Single-page Meta Ads Library competitor intelligence platform for Bulgarian iGaming market.

## 🔗 Live demo

👉 **https://nankov76.github.io/outfox-ads-test/**

## What testers need

1. **Facebook Access Token** (free, 5 min to get):
   - Visit https://developers.facebook.com/tools/explorer/
   - Select app → Add `ads_read` permission
   - Generate Access Token
   - Copy the token, paste in app: Settings → API Tokens → Facebook Access Token

2. **Claude API Key** (optional, for AI analysis):
   - https://console.anthropic.com/settings/keys
   - Pay-as-you-go, ~$0.05 per scan

3. **Football-Data.org Key** (optional, for accurate sports calendar):
   - https://www.football-data.org/client/register
   - Free 10 req/min

## 🤖 Auto-scan setup

A GitHub Actions workflow runs daily at 06:00 UTC (09:00 BG summer / 08:00 BG winter), fetches Meta Ads Library data for the configured brands, writes results to `data/latest.json` (and a dated copy in `data/history/`), and sends a Telegram diff vs the previous scan. The browser app picks up `data/latest.json` automatically — so accumulation of data and comparison with previous information no longer requires the browser to be open.

### One-time activation (30 seconds, GitHub web UI)

GitHub's API blocks creating workflow files via personal access tokens that don't have the `workflow` scope. The workflow YAML is therefore committed as a regular file at `scripts/auto-scan.workflow.yml`. To activate it, copy its content into `.github/workflows/auto-scan.yml` via the web UI:

1. Open the repo on github.com → click `scripts/auto-scan.workflow.yml` → click the **Raw** button → copy everything.
2. In the repo root → click **Add file** → **Create new file**.
3. Type the path exactly: `.github/workflows/auto-scan.yml` (the slashes create the directories).
4. Paste the YAML, scroll down → **Commit new file** to `main`.
5. (Optional cleanup) Delete `scripts/auto-scan.workflow.yml` afterwards.

**Required GitHub Secrets** (Settings → Secrets and variables → Actions → New repository secret):
- `FB_TOKEN` — Facebook Graph API access token with `ads_read` (same one you use in the browser app).
- `TG_BOT_TOKEN` — Telegram bot token from [@BotFather](https://t.me/BotFather) (`/newbot` → copy token).
- `TG_CHAT_ID` — your Telegram chat id. Easiest way: message your bot once, then visit `https://api.telegram.org/bot<TG_BOT_TOKEN>/getUpdates` and copy the `chat.id` value.

**Edit brand list:** open `scripts/brands.json`, change the `brands` array (and `country` if needed), commit and push. No code changes required.

**Trigger a manual run:** GitHub repo → Actions tab → "Auto-scan ads" → "Run workflow". Useful for testing right after setup.

**Cost:** free. Each run takes ~10-15 seconds; daily cron uses well under 10 minutes/month of the 2000 min/mo GitHub Actions free tier.

**Privacy / security:** tokens are stored as encrypted GitHub Secrets, never logged, never written to disk in the runner output. This automation is single-tenant — only the repo owner's tokens and the repo owner's brand list are used. The browser app for end users remains 100% client-side.

## Privacy

- All data stored locally in browser (`localStorage`)
- API tokens never leave your browser
- No backend, no tracking
- Each tester has independent data
