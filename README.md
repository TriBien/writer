# Draftwise

A mobile-first writing feedback app. Paste a draft, pick a focus, and get structured feedback from a free LLM — no account, backend, or build step.

**Live app:** https://tribien.github.io/writer/

## What it does

- Accepts up to 20,000 characters of writing.
- Sends the draft to an LLM with a predefined writing-coach prompt.
- Streams back an answer with an overall impression, strengths, concrete improvements, a suggested revision, and one next step.
- Keeps drafts and preferences in `localStorage` on the device.
- Works as a static site on GitHub Pages.

## Free providers

| Provider | API key | Notes |
| --- | --- | --- |
| LLM7 | Not needed | Default. Free anonymous tier with fair-use rate limits. |
| Groq | Free key | Fast free tier. Default model: `openai/gpt-oss-120b`. |
| Google Gemini | Free key | Free tier from Google AI Studio. Default model: `gemini-3.5-flash-lite`. |
| OpenRouter | Free key | Uses `openrouter/free` to route to an available free model. |

LLM7 needs no key. Open the settings dialog to choose another provider and paste a free key; links to each provider's key page are shown there. Model IDs can be overridden under **Advanced**.

LLM7's anonymous quota is shared and can be busy for a minute at a time. When that happens, the app shows the suggested wait and a retry button. For more reliable access, use a free key from Groq, Gemini, or OpenRouter.

Free tiers and model availability change over time. If a provider stops working, switch providers or update the model ID.

## Privacy and API keys

This is a static site. Drafts go directly from the browser to the selected provider; there is no server operated by this project.

API keys are stored in the browser's `localStorage` and sent only to the selected provider. Never hard-code a key into this repository. Use a restricted or disposable key, and clear it when using a shared device.

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
├── assets/icon.svg
├── site.webmanifest
└── .github/workflows/deploy.yml
```
