import sys, json
from vosk import Model, KaldiRecognizer
import wave

model = Model("vosk-model-small-en-us-0.15")
wf = wave.open(sys.argv[1], "rb")
rec = KaldiRecognizer(model, wf.getframerate())

results = []
while True:
    data = wf.readframes(4000)
    if len(data) == 0:
        break
    if rec.AcceptWaveform(data):
        res = json.loads(rec.Result())
        results.append(res.get("text", ""))

final_res = json.loads(rec.FinalResult())
results.append(final_res.get("text", ""))
print(" ".join(results))

