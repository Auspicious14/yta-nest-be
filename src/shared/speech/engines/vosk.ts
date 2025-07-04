import { spawn } from "child_process";
import * as path from "path";

module.exports = function voskTranscribe(audioPath: string) {
  return new Promise((resolve, reject) => {
    
    const scriptPath = path.join(
      process.cwd(),
      'src',
      'shared',
      'speech',
      'engines',
      'vosk.py',
    );
    const isWin = process.platform === 'win32';
    const pythonCmd = isWin ? 'python' : 'python3';
    const processs = spawn(pythonCmd, [scriptPath, audioPath]);

    let output = '';
    processs.stdout.on('data', (data) => (output += data.toString()));
    processs.stderr.on('data', (err) =>
      console.error('stderr:', err.toString()),
    );
    processs.on('close', (code) => {
      if (code === 0) resolve(output.trim());
      else reject('Vosk failed.');
    });
  });
};


