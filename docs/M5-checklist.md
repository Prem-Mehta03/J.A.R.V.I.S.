# M5: Voice and Siri

Goal: talk to Jarvis. Two ways: inside the app (mic button, spoken replies) and hands-free with Siri (a Shortcut that works without opening the app).

## 1. Update the repo

Extract the zip over the repo, then commit (commands came with the zip).

## 2. n8n (2 minutes)

1. Import `n8n/workflows/04-voice.json`.
2. **Webhook**: credential **Jarvis token**. **Whisper**: credential **Groq key** (the same one the router uses). Save, then **Active**.

Quick check (PowerShell, any short audio file, for example a phone voice memo):

```powershell
curl.exe -X POST "https://jarvis-n8n-rd61.onrender.com/webhook/jarvis-transcribe" -H "X-Jarvis-Token: <your token>" -F "audio=@memo.m4a"
```

You should get `{"ok":true,"text":"..."}`.

## 3. Update the app

Copy the contents of `frontend/` into the `jarvis/` folder of your `<username>.github.io` repo again and push. Then close the app completely and open it twice (the first open fetches the update, the second runs it).

## 4. Try voice in the app

1. Tap the mic. iPhone asks for microphone access the first time: Allow. (If it asks again every time you open the app, that is iPhone behaviour for installed web apps; the Siri Shortcut below does not have this.)
2. Say "remind me in 10 minutes to stretch". The orb swells with your voice. Stop talking: after about a second and a half it sends by itself, or tap the square button. The X cancels.
3. Your words appear as a message, then the reply, and it is spoken aloud.
4. Speaker icon, top right: on means replies to your voice are spoken. Typed messages are never spoken. The small speaker next to each reply reads it again.
5. Silence for 9 seconds gives "I didn't hear anything." Nothing is sent.

## 5. Siri Shortcuts (Shortcuts app on the iPhone)

Use your real server address and token. The token is typed into the shortcut by hand, like before.

### Shortcut A: "Jarvis" (hands-free)

1. New Shortcut, name it **Jarvis**.
2. Action **Dictate Text** (Stop Listening: After Pause, Language: English).
3. Action **Get Contents of URL**:
   - URL: `https://jarvis-n8n-rd61.onrender.com/webhook/jarvis`
   - Show More, Method: **POST**
   - Headers: `X-Jarvis-Token` = your token
   - Request Body: **JSON**, add `text` (Text) = the **Dictated Text** variable, and `source` (Text) = `shortcut`
4. Action **Get Dictionary Value**: Get **Value** for `reply` in **Contents of URL**.
5. Action **Speak Text**: the **Dictionary Value**.
6. Try: "Hey Siri, Jarvis", then say "what is on my list today".

### Shortcut B: "Jarvis reminders"

Duplicate Shortcut A, rename it **Jarvis reminders**, delete the Dictate Text action and set `text` to the fixed text `what reminders do I have`. Say "Hey Siri, Jarvis reminders".

### Shortcut C: "Wake up Jarvis" (opens the app, listening)

1. New Shortcut named **Wake up Jarvis**, action **Open URLs** with `https://<username>.github.io/jarvis/?voice=1`.
2. Say "Hey Siri, Wake up Jarvis".

**Open question to answer here:** does it open the Home Screen app, or Safari? iPhone often opens links in Safari, and Safari keeps its own saved data, so you may see the setup screen again. If it opens Safari, keep using Shortcut A for hands-free, and use the Home Screen icon when you want the app. Note the result below.

## 6. Things to watch

- A first request after a quiet spell can take up to a minute (Render waking). Shortcut A just waits; it speaks the answer when it arrives.
- If Siri says it can't run the shortcut with the phone locked, set the shortcut to allow it in Shortcuts, then Settings, Face ID and Passcode, Allow When Locked, Voice Dial.
- Whisper sometimes mishears names. Typing always works.
- Spoken replies use the voice installed on your phone. For a nicer one: Settings, Accessibility, Spoken Content, Voices, English, and download an Enhanced or Premium voice (a British or Indian English one suits Jarvis). The app picks the best English voice it finds.

## Not tested by me

Tested in desktop Chromium with a fake microphone against a local n8n with a mock Whisper: recording, silence detection, the upload, the transcript appearing as your message, the reply, the cancel button, and the speaker toggle. **Not tested:** the real Groq Whisper, any real iPhone behaviour (microphone permission in the installed app, Safari's recording format, the spoken voice), and all three Shortcuts, which I can't run from here.

## Done when

- [ ] Voice in the app: your sentence becomes a correct reminder
- [ ] Replies are spoken, and the speaker button turns it off
- [ ] Shortcut "Jarvis" works hands-free
- [ ] Shortcut "Jarvis reminders" reads your reminders
- [ ] "Wake up Jarvis" result noted below

Results / notes:

-
