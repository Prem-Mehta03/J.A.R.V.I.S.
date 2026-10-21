// Node "Check audio": makes sure the request carried a recording, and gives the file a name Whisper recognises.
const item = $input.first();
const bin = item.binary && item.binary.audio;
if (!bin) {
  return [{ json: { ok: false, error: 'no_audio', reply: "I didn't receive any audio. Try again." } }];
}
const mime = String(bin.mimeType || '').toLowerCase();
let ext = 'm4a';
if (mime.includes('webm')) ext = 'webm';
else if (mime.includes('ogg')) ext = 'ogg';
else if (mime.includes('wav')) ext = 'wav';
else if (mime.includes('mpeg') || mime.includes('mp3')) ext = 'mp3';
bin.fileName = 'voice.' + ext;
return [{ json: { ok: true, mime }, binary: { audio: bin } }];
