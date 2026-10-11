# MeetMind AI

MeetMind turns meeting transcripts into a summary, key points, confirmed decisions, open questions, action items, and a follow-up email. Transcript files are extracted in the browser; only the resulting text is sent to Gemini for analysis.

## Local development

Prerequisites: Node.js 22.9 or newer and npm. The Gemini SDK supports Node.js 20+, and the local scripts use Node's `--env-file-if-exists` option.

1. Install dependencies:

	```sh
	npm install
	```

2. Create a local environment file from the example:

	```powershell
	Copy-Item .env.example .env
	```

	In `.env`, replace `your_google_ai_studio_api_key_here` with your Google AI Studio API key. Keep the key in `GEMINI_API_KEY`; do not use a `VITE_` prefix. `GEMINI_MODEL` is optional and defaults to `gemini-2.5-flash`.

3. Start the app:

	```sh
	npm run dev
	```

	Open <http://localhost:8080/>. Load the sample meeting or paste at least 20 characters of transcript, then select **Generate Meeting Insights**. You can also upload a `.txt`, `.docx`, or text-based `.pdf` file. The UI preserves the 600,000-character maximum and processes long transcripts in overlapping sections; this is not unlimited transcript support.

The dev and preview scripts load `.env` into the Node server process. The API key is read only by server-side code and is not exposed as a browser variable. `.env` is ignored by Git; `.env.example` contains only a placeholder.

## Deployment

Local `.env` files are for local development and are not deployed. Configure `GEMINI_API_KEY` as a server-side secret in your hosting provider, and optionally set `GEMINI_MODEL` there. Do not add either value to client-side or `VITE_*` variables. Verify the hosting runtime supports the Node-compatible Google Gen AI SDK before deployment.

## Checks

```sh
npm test
npm run lint
npx tsc --noEmit
npm run build
```
