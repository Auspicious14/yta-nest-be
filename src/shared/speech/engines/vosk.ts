import { spawn } from "child_process";
import path from "path";

module.exports = function voskTranscribe(audioPath: string) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'transcribe.py');
    const process = spawn('python3', [scriptPath, audioPath]);

    let output = '';
    process.stdout.on('data', (data) => (output += data.toString()));
    process.stderr.on('data', (err) =>
      console.error('stderr:', err.toString()),
    );
    process.on('close', (code) => {
      if (code === 0) resolve(output.trim());
      else reject('Vosk failed.');
    });
  });
};
