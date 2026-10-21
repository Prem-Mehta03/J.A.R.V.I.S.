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

## 4. Voice mode in the app

1. Tap the mic next to the message box. A full screen opens with the orb in the middle. iPhone asks for microphone access the first time: Allow.
2. Talk. The orb ripples with your voice ("Listening"). After about a second and a half of quiet it sends by itself, or tap the orb to send now.
3. The orb spins up ("Thinking"), then calms and a ring of bars moves with Jarvis's voice ("Speaking"). Tap the orb to interrupt.
4. It then listens again, so you can keep talking. Nine seconds of silence pauses it ("Tap the orb to talk"). The X ends voice mode.
5. Nothing from voice mode is shown or saved in the chat. Reminders you create by voice still appear in your lists.

## 4b. Natural voice (one-time setup)

Spoken replies use Groq's free Orpheus voice, which sounds far less robotic than the phone's built-in one.

1. Open https://console.groq.com/playground, choose the model `canopylabs/orpheus-v1-english`, and accept its terms when asked (once). Without this the server answers "terms" and the app quietly uses the phone voice.
2. In n8n import `n8n/workflows/05-speak.json`. On its two credential fields choose **Jarvis token** (webhook) and your Groq key (HTTP node), then make it **Active**.
3. Copy `frontend/` to your GitHub Pages folder again and push. Close the app completely and open it twice.
4. In the app: menu, Settings, Voice. Pick a voice (Troy, Austin or Daniel are male) and tap **Play a sample**. If it says the natural voice is unavailable it shows why, and plays the phone voice instead.

Limits: Groq's free tier allows about 100 spoken pieces a day (each reply is 1 to 4 pieces). When it runs out, or Groq is down, replies fall back to the phone voice by themselves. Very long replies are spoken only up to the first four sentences-worth. In Settings you can also choose the phone voice for everything.

Siri's own "American voice 3" can't be used inside a web app (iOS does not expose Siri voices to web pages), so the Settings voices are the closest match. For a nicer phone voice: Settings, Accessibility, Spoken Content, Voices, English, download an Enhanced or Premium voice.

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
4. Action **Get Dictionary from Input**, with its input set to **Contents of URL** (tap the input and pick the variable; do not leave it on Dictated Text).
5. Action **Get Dictionary Value**: Get **Value** for `reply` in **Dictionary**.
6. Action **Speak Text**: the **Dictionary Value**.
7. Try: "Hey Siri, Jarvis", then say "what is on my list today".

### Shortcut B: "Jarvis reminders"

Duplicate Shortcut A, rename it **Jarvis reminders**, delete the Dictate Text action and set `text` to the fixed text `what reminders do I have`. Say "Hey Siri, Jarvis reminders".

### Shortcut C: "Wake up Jarvis" (opens the app, listening)

1. New Shortcut named **Wake up Jarvis**, action **Open URLs** with `https://<username>.github.io/jarvis/?voice=1`.
2. Say "Hey Siri, Wake up Jarvis". The app opens in voice mode; tap the orb once to start (iPhone only allows sound after a touch).

**Open question to answer here:** does it open the Home Screen app, or Safari? iPhone often opens links in Safari, and Safari keeps its own saved data, so you may see the setup screen again. If it opens Safari, keep using Shortcut A for hands-free, and use the Home Screen icon when you want the app. Note the result below.

### If it says "Get Dictionary Value couldn't convert Rich Text to Dictionary"

The server's answer came back as text, not JSON. Temporarily add **Show Result** after Get Contents of URL and read what it shows:

- `Authorization data is wrong` or a 403: the token in the header is wrong (check for a trailing space).
- A web page or "Service Unavailable": Render was asleep. Run it again after a minute.
- `{"ok":false,"reply":"..."}`: the connection works; the problem is the Get Dictionary step. Use the Get Dictionary from Input action above.
- Nothing useful: the Request Body must be **JSON**, not Form or File, and `text` must contain the Dictated Text variable.

### If it speaks from the Shortcuts app but not when Siri runs it

Your actions are right; this is an iPhone audio setting. Try in order:

1. Settings, Siri (Apple Intelligence & Siri), Siri Responses, set to **Prefer Spoken Responses** (the Automatic setting goes silent when the Silent switch is on or the screen is locked).
2. On the **Speak Text** action, tap the small arrow and turn on **Wait Until Finished**.
3. Turn the Silent switch off and raise the volume while Siri is running.
4. Run it from a Home Screen icon of the shortcut: if that speaks, the shortcut is fine and only Siri's own audio setting is in the way.

## 6. Things to watch

- A first request after a quiet spell can take up to a minute (Render waking). Shortcut A just waits; it speaks the answer when it arrives.
- If Siri says it can't run the shortcut with the phone locked, set the shortcut to allow it in Shortcuts, then Settings, Face ID and Passcode, Allow When Locked, Voice Dial.
- Whisper sometimes mishears names. Typing always works.

## Not tested by me

Tested in desktop Chromium with a fake microphone against a local n8n with mock Whisper and mock speech: voice mode (listen, send, think, speak, listen again, close, nothing saved in chat), the Settings voice picker and sample. **Not tested:** the real Groq Whisper and Groq speech (output format, the roughly 200-character limit per piece, terms acceptance), any real iPhone behaviour (microphone permission in the installed app, whether sound still comes out loud after recording, the silent switch), and all three Shortcuts.

## Done when

- [ ] Voice in the app: your sentence becomes a correct reminder
- [ ] Replies are spoken, and the speaker button turns it off
- [ ] Shortcut "Jarvis" works hands-free
- [ ] Shortcut "Jarvis reminders" reads your reminders
- [ ] "Wake up Jarvis" result noted below

Results / notes:

-
