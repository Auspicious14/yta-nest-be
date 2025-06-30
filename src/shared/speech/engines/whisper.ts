import { execFile } from "child_process";

module.exports = function whisperTranscribe(audioPath: string) {
  return new Promise((resolve, reject) => {
    const args = [
      '-m',
      'whisper',
      audioPath,
      '--model',
      'tiny',
      '--language',
      'en',
      '--fp16',
      'False',
      '--output_format',
      'txt',
    ];

    execFile('python3', args, (error, stdout, stderr) => {
      if (error) {
        return reject(`Whisper error: ${stderr}`);
      }
      resolve(stdout.trim());
    });
  });
};
