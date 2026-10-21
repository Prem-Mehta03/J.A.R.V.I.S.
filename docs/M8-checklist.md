# M8: Email intelligence

Goal: Jarvis reads both Gmail accounts, sorts new mail into Important, Normal and Ads, shows it per account in an Email tab, answers "any important emails?", and learns from your corrections. It never sends, deletes or changes mail, and only sender, subject and a short snippet are stored. Never the body.

Chosen with you: no pushes for email (digest only; the M9 morning brief will include it), corrections by buttons and by chat or voice, three categories.

## 1. Update the repo

Extract the zip over the repo, then commit (commands came with the zip).

## 2. Supabase (1 minute)

Supabase, SQL Editor, paste `db/migrations/008_email.sql`, Run. It adds one table, `email_messages`. The rules and feedback tables already exist from the first migration. Safe to run twice.

## 3. n8n (10 minutes)

1. **Import the new workflow** `n8n/workflows/07-email.json` (menu, Import from file). It has two Gmail nodes, **Fetch personal** and **Fetch college**. Open each and pick the matching Gmail credential you made in M0. Also set Jarvis token (Webhook), Gemini key, Groq key and Supabase Postgres on the nodes that ask. Save and make it **Active**.
2. **Re-import** `01-chat-router.json` and `03-items-api.json` the usual way (import, reconnect credentials, Active, deactivate the old copies).
3. Open workflow 07 and press **Execute workflow** once. In "Fetch personal" and "Fetch college" you should see mail. If a node shows an error, the Gmail credential needs reconnecting (this is the check that was planned for around 28 October).

Successful runs are not kept in n8n's history (the setting is in the file). Otherwise each run would store the raw mail, bodies included, in your database. Error runs are still kept.

It then runs by itself every 15 minutes while Render is awake (the cron-job.org ping keeps it awake), and whenever you tap Refresh in the app.

## 4. The app

Copy `frontend/` to GitHub Pages again and push. Close the app fully and open it twice. The menu has a new **Email** entry.

- Switch between **Personal** and **College** at the top (the number is important mail from the last day). Tap **Refresh** to check both inboxes now; it can take up to a minute.
- Sections: Important, Normal, and Ads (tap to open). Tap a mail to see sender, subject and a short preview.
- **Correcting:** in that sheet tap Important, Normal or Ad. All mail from that sender is moved, and the sender becomes a rule so future mail follows it. **Sorting rules** at the bottom lists the rules; tap the bin twice to remove one.
- Jarvis cannot open the mail itself from here; open Gmail for that.

## 5. In chat and by voice

- "Any important emails?", "Any college mail?" reads out the last 24 hours per account.
- "The Unstop mail was an ad", "Mail from my professor is important" corrects by name (it looks at the last two weeks of mail; if two senders match it asks which).
- "All of unstop.com is promo" or "Mail from rao@goa.bits-pilani.ac.in is important" makes a rule straight away. A whole free-mail domain such as gmail.com is refused.

## How sorting works

For each new mail, in order: (1) your rules, (2) Gmail's own Promotions tab means Ad, (3) the language model (Gemini, Groq as backup) sees sender, subject and the first 120 characters of the snippet, plus your 15 most recent corrections as examples. If the models are down, those mails are left unsaved and tried again at the next check.

## Tested and not tested

Tested with a real Postgres and a fake Gmail: both inboxes, repeat checks adding nothing twice, rules and the Promotions tab, correction relabelling the sender's other mail, one account failing while the other works, chat digest and corrections, and the Email tab in desktop Chromium.

**Not tested:** the real Gmail node. The workflow asks Gmail for the raw message format and reads the From, Subject and date headers from it, which is Gmail's standard format; if your first run shows 0 mail or odd senders, send me the output of "Fetch personal" (without bodies) and I will adjust. Also not tested: how well Gemini sorts your real mail. Expect to correct a few at first.
