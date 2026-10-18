# Askwell

This document is the knowledge for Askwell's own chat widget on the Askwell landing page. Upload it to the "Askwell" project on the production app, in Knowledge. Keep it in sync with `PLAN_LIMITS` in `packages/shared` and with `docs/project.md`.

## What Askwell is

Askwell is an AI support chat widget for any website. You give it your documents, add one script tag to your site, and a chat button appears in the corner. Visitors ask questions, and Askwell answers only from your documents.

If your documents don't contain the answer, Askwell says it doesn't know instead of guessing. It answers from one project's documents only, never from other projects or general knowledge.

## How it works, in three steps

1. **Create a project and add knowledge.** Sign up, create a project, then open Knowledge. Upload files, or paste text with a title. Askwell processes each source and shows its status: processing, ready or failed.
2. **Install the widget.** Open Install, copy your script tag, and paste it just before the closing `</body>` tag on every page that should show the chat. Reload your site, and the chat button appears in the corner.
3. **Visitors ask, Askwell answers.** A visitor opens the chat and asks a question. Askwell finds the most relevant parts of your documents and answers from them. Every conversation shows up in Conversations in your dashboard. Refresh the page to see new chats.

## Plans: Free and Pro

| | Free | Pro |
|---|---|---|
| Projects | 1 | 5 |
| Messages per month, per project | 100 | 2,000 |
| Knowledge sources per project (files and pasted text) | 3 | 25 |
| Customize the widget | No | Yes |
| "Powered by Askwell" badge | Shown | Can be hidden |

- **Messages:** the monthly count resets each month. When a project reaches its limit, the widget tells visitors the assistant is unavailable until the next month.
- **Sources:** every uploaded file and every pasted text counts as one source toward the limit. Delete a source to add another.
- **Customization (Pro):** button color, button position (any corner), button label, open animation (fade, slide or scale) and header text. Pro can also hide the "Powered by Askwell" badge. On Free, the widget uses the defaults: the default color, bottom-right, fade, and the badge is shown.
- **Upgrading:** upgrade to Pro from the Billing page in the dashboard. The current price is shown there. Manage or cancel your subscription from "Manage subscription" on the same page. After a cancellation, Pro stays active until the end of the paid period.

## Install snippet

Each project has its own script tag on its Install page. It looks like this:

```html
<script src="https://YOUR-ASKWELL-URL/widget.js" data-key="pk_..."></script>
```

- `data-key` is the project's public key. It only identifies the project and gives no access to your account.
- Copy the exact tag from Install. It already contains your project's key and the right address.
- The widget works on any website, and it doesn't change your site's styles.

## Supported file types

- PDF (`.pdf`)
- Markdown (`.md`)
- Plain text (`.txt`)

Each file can be up to 10 MB. You can also paste text directly.

## Limits that protect your quota

- A visitor's message can be up to 1,000 characters.
- Each IP address can send up to 20 messages a minute to a project. Visitors who share a network, such as an office, share that limit. Past it, the widget asks them to wait a minute.

## Privacy and security

- Your uploaded files are stored privately and are never public links.
- Askwell treats the text in your documents and in visitors' messages as information, never as instructions. It doesn't reveal its own instructions or other projects' data.
- Visitor messages and bot replies are shown as plain text.

## What Askwell doesn't do

- Word documents (DOCX) and spreadsheets aren't supported. Use PDF, Markdown or plain text.
- It doesn't scrape or crawl your website. Add knowledge by uploading files or pasting text.
- It doesn't score visitors' buying intent.
- Conversations don't update in real time. Refresh the Conversations page to see new chats.
- A human can't take over a conversation from the bot.
- It uses one AI provider. You can't choose between AI models.
- Each account has one member. Teams and multiple members per account aren't supported.
