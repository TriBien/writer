# Writer

A mobile-first writing feedback app. Paste a draft, pick a focus, and get structured feedback from a free LLM — no account, backend, or build step.

**Live app:** https://tribien.github.io/writer/

## What it does

- Accepts up to 20,000 characters of English or Vietnamese writing.
- Lets you clear the current draft with one click.
- Sends the draft to an LLM with a predefined writing-coach prompt.
- Streams back a TL;DR, scorecard, corrections, corrected and polished versions, a thinking review, an improvement plan, and a practice exercise.
- Renders comparison tables as clean tables on desktop and stacked label/value cards on mobile.
- Lets you edit the coach prompt in the browser and restore the default at any time.
- Lets you adjust the draft and feedback font size in Settings.
- Saves completed sessions so you can reopen the draft and the AI feedback later.
- Keeps drafts, preferences, and up to 100 recent sessions in browser storage by default, with an optional text-file storage mode.
- Works as a static site on GitHub Pages.

## Free providers

| Provider | API key | Notes |
| --- | --- | --- |
| LLM7 | Not needed | Default. Free anonymous tier with fair-use rate limits. |
| Pollinations | Not needed | Keyless fallback. Default model: `gpt-oss-20b`. One request at a time, about 30 seconds apart. Blocks localhost requests. |
| Groq | Free key | Fast free tier. Default model: `openai/gpt-oss-120b`. |
| Google Gemini | Free key | Free tier from Google AI Studio. Default model: `gemini-3.5-flash-lite`. |
| OpenRouter | Free key | Uses `openrouter/free` to route to an available free model. |

LLM7 and Pollinations need no key. Open the settings dialog to choose another provider and paste a free key; links to each provider's key page are shown there. Model IDs can be overridden under **Advanced**.

LLM7's anonymous quota is shared and can be busy. When that happens, the app shows the suggested wait and a retry button. Pollinations is a keyless fallback, but it allows one request at a time and blocks requests from localhost. For the most reliable access, use a free key from Groq, Gemini, or OpenRouter.

Free tiers and model availability change over time. If a provider stops working, switch providers or update the model ID.

## Coach prompt

The default coach prompt lives in `prompts/coach-prompt.txt` and is loaded when the app starts. Use **Edit prompt** in the composer to change it. A custom prompt is stored in browser `localStorage` and applies to the next request. **Use default prompt** restores the file version.

The app sends the prompt as model instructions, then sends the draft in a separate user message inside `<draft>` tags. The placeholder `[Paste my Vietnamese or English writing here]` is replaced with a short note pointing to that message. The selected focus is appended as an extra instruction, so custom prompts still work with the focus chips.

## Storage and history

Every completed feedback request is saved automatically. Open the clock icon in the header to browse your recent sessions. Each session keeps the original draft and the rendered AI feedback; you can copy the feedback, restore the draft and focus, delete one session, or clear everything. The plus icon on the feedback card starts a blank session without deleting anything from History.

Up to 100 recent sessions are kept. **Settings → Data storage** defaults to **This browser**. Choose **Text file** and select a `.json` file to load or create a portable data file. In browsers with the File System Access API, new drafts, settings, the coach prompt, and history are synced to that file automatically. The browser remembers the file selection when possible; if permission needs to be restored, select the file again.

Choose **Google Drive text file**, then select **Sign in & connect writer.json** and authorize your Google account. The app finds a `writer.json` it previously created, or creates one in your Drive, then syncs drafts, settings, the coach prompt, and history. It uses the `drive.file` permission, so it only accesses files created by this app; it will not take over an unrelated `writer.json` already in Drive. Select **Disconnect Google account** to stop syncing and remove the saved file selection from this browser. Google Drive must be enabled in the Google Cloud project for the configured OAuth client, and the deployed site origin must be listed as an authorized JavaScript origin. On a later visit, sign in again to load the latest version and resume syncing.

## Privacy and API keys

This is a static site. Drafts go directly from the browser to the selected provider; there is no server operated by this project.

In browser storage mode, drafts, settings, and completed sessions remain in this browser. In file mode, a plain-text JSON file contains your draft, settings (including API keys), default prompt, and recent history. Keep that file private. Use **Download data file** for a portable backup, or **Import data file** to restore it. Browsers without direct file saving can import and export the file manually.

API keys are sent only to the selected provider. Never hard-code a key into this repository. Use a restricted or disposable key, and clear it when using a shared device.

## Run locally

Any static file server works:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

A local server is recommended because the app uses ES modules and streaming `fetch`.

## Deploy to GitHub Pages

The workflow in `.github/workflows/deploy.yml` deploys every push to `main`.

1. Create a repository and push this directory to `main`.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Run the workflow or push again.

For a project site, the app is served from `https://<user>.github.io/<repo>/`. All asset paths are relative, so no extra configuration is needed.

## Customize

- Edit the coach instructions, focus areas, and sample text in `js/prompt.js`.
- Add or change providers in `js/providers.js`.
- The app logic is in `js/app.js`; the small safe Markdown renderer is in `js/markdown.js`.
- Styling and responsive behavior are in `css/styles.css`.

## Project structure

```text
.
├── index.html
├── css/styles.css
├── js/
│   ├── app.js
│   ├── markdown.js
│   ├── prompt.js
│   └── providers.js
├── prompts/coach-prompt.txt
├── assets/icon.svg
├── site.webmanifest
└── .github/workflows/deploy.yml
```
