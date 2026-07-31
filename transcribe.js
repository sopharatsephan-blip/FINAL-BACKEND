function transcribeAudio(audioPath) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'whisper_local.py');

    const pythonProcess = spawn('python', [scriptPath, audioPath], {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' } // บังคับ encoding utf-8 ทั้งฝั่ง python
    });

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.setEncoding('utf-8');
    pythonProcess.stderr.setEncoding('utf-8');

    pythonProcess.stdout.on('data', (data) => { output += data; });
    pythonProcess.stderr.on('data', (data) => { errorOutput += data; });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error('Whisper local stderr:', errorOutput);
        reject(new Error('ถอดเสียงด้วย Whisper local ล้มเหลว: ' + errorOutput));
        return;
      }
      resolve(output.trim());
    });

    pythonProcess.on('error', (err) => {
      reject(new Error('ไม่สามารถเรียก Python ได้: ' + err.message));
    });
  });
}