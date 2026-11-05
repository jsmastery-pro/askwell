# Askwell: facts for the landing page's own chat bot

This is the knowledge text of the "House: Askwell" project, the chat widget on Askwell's landing page. It holds plain facts from `docs/project.md`. Prices and limits come from `PLAN_LIMITS` and `PLAN_PRICES` in `packages/shared`; if those change, update this text and upload it again.

## What Askwell is

Askwell is an AI support chat widget for any website. A business adds its product info (pasted text or a file), copies one script tag onto its site, and gets a chat bot that answers visitors' questions from that info.

The chat button sits in a corner of the website. A visitor clicks it, types a question, and gets an answer in a few seconds. The chat you are using on this page is Askwell itself, answering from this text.

Askwell answers only from the info the business added. If the answer isn't in that info, the bot says it doesn't know instead of guessing.

## How it works

1. Sign up for free with email and password or with Google.
2. Create a project. A project is one chat bot for one website.
3. Add knowledge: paste text with a title, or upload a file. Askwell reads PDF, Markdown (.md) and plain text (.txt) files up to 10 MB each. It splits the text into small parts and indexes them so the bot can find the right part for each question.
4. Copy your script tag from the Install page and paste it into your site's HTML, just before the closing `</body>` tag.
5. Reload your site. The chat button appears in the corner and answers visitors.
6. Read every chat on the Conversations page. Refresh the page to see new chats.

## Plans and prices

There are two plans: Free and Pro.

| | Free | Pro |
|---|---|---|
| Price | $0 per month | $19 per month |
| Projects | 1 | 5 |
| Messages per month, per project | 100 | 2,000 |
| Knowledge sources per project (files and pasted texts together) | 3 | 25 |
| Button color | Default | Any color |
| Button position | Bottom right | Any corner |
| Button label | Default ("Chat with us") | Your own text |
| Open animation | Fade | Fade, slide or scale |
| Panel header text | Default | Your own text |
| "Powered by Askwell" badge | Shown | Can be hidden |

- Free costs nothing and needs no card.
- Pro costs $19 per month. Upgrade from the Billing page in the dashboard and pay by card. Customize unlocks as soon as the payment goes through.
- Manage or cancel Pro from the Billing page ("Manage subscription"). After you cancel, Pro stays active until the end of the period you paid for, then the account goes back to Free.
- Message counts reset every month. Each visitor message counts as one message. When a project reaches its monthly limit, the chat tells visitors it can't answer more questions this month.

## Customizing the widget (Pro)

On Pro, the Customize page lets you change the button color, its corner, the button label, the open animation, the header text of the chat panel, and whether the "Powered by Askwell" badge shows. A live preview shows each change before you save. After you save, reload your site to see the new look.

On Free, the Customize page is visible but locked, with a link to upgrade.

## Installing the widget

The install snippet is one line of HTML, for example:

`<script src="https://<askwell-address>/widget.js" data-key="pk_..." async></script>`

- Copy your own snippet from your project's Install page. It already has your project's public key in it.
- Paste it once into your site's HTML, before the closing `</body>` tag, on every page where the chat should show.
- It works on any website that lets you add HTML: a hand-written site, a site builder with a "custom code" box, or any framework.
- The public key (it starts with `pk_`) only identifies your project. It can't change anything, so it's safe to have on a public page.
- The widget is small and loads on its own. It sits in its own isolated box, so it doesn't change your site's styles.

## Privacy and safety

- Chats are saved so the owner can read them in the dashboard on the Conversations page.
- Each visitor gets a random ID stored in their browser, so a returning visitor's chats are grouped. Askwell doesn't ask visitors for their name or email.
- The chat limits how fast one visitor can send messages, and it refuses messages that try to trick the bot into ignoring its instructions.
- Only the owner of a project can see its knowledge and its conversations.

## What Askwell doesn't do

- It doesn't read Word documents (.docx) or spreadsheets. Use PDF, Markdown or plain text.
- It doesn't crawl or scrape your website. Add your info as text or files.
- It doesn't score leads or detect buying intent.
- It doesn't show conversations live. Refresh the Conversations page to see new ones.
- A human can't take over a chat from the bot.
- It uses one AI model. You can't pick a different AI provider.
- There are no teams: one account has one owner, with no extra members.

## Questions people often ask

**Is there a free plan?** Yes. Free is $0 per month: 1 project, 100 messages per month, and 3 knowledge sources.

**How much is Pro?** Pro is $19 per month: 5 projects, 2,000 messages per month per project, 25 knowledge sources per project, and full control of how the widget looks.

**Does the bot make things up?** It is told to answer only from your knowledge. If the answer isn't there, it says it doesn't know.

**How long does setup take?** A few minutes: sign up, create a project, add your info, paste one script tag.

**Which websites does it work on?** Any website where you can add a script tag to the HTML.
