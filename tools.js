// Ferramentas (Metrônomo + Afinador)

// --- METRÔNOMO ORIGINAL FUNCIONAL ---
let metAudioCtx = null, isMetPlaying = false, metTempo = 120, nextNoteTime = 0.0, metTimerID = null;
const lookahead = 25.0, scheduleAheadTime = 0.1;

function scheduleNote(time) {
  const s = document.getElementById('met-sound').value;
  if(s === 'padrao') {
      const osc = metAudioCtx.createOscillator();
      const envelope = metAudioCtx.createGain();
      osc.frequency.value = 1000;
      envelope.gain.exponentialRampToValueAtTime(1, time);
      envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
      osc.connect(envelope); envelope.connect(metAudioCtx.destination);
      osc.start(time); osc.stop(time + 0.05);
  } else {
      const audio = new Audio('./' + s);
      audio.play().catch(()=>{});
  }
  window.requestAnimationFrame(() => {
      const prog = document.getElementById('met-progress');
      prog.style.transition = 'none'; prog.style.strokeDashoffset = '0';
      setTimeout(() => {
          prog.style.transition = `stroke-dashoffset ${(60/metTempo)*1000 - 20}ms linear`;
          prog.style.strokeDashoffset = '440';
      }, 10);
  });
}

function metScheduler() {
  while (nextNoteTime < metAudioCtx.currentTime + scheduleAheadTime ) {
      scheduleNote(nextNoteTime);
      nextNoteTime += 60.0 / metTempo;
  }
  metTimerID = window.setTimeout(metScheduler, lookahead);
}

function toggleMetronome() {
  if (!metAudioCtx) metAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  isMetPlaying = !isMetPlaying;
  const btn = document.getElementById('btn-met');
  if (isMetPlaying) {
      if (metAudioCtx.state === 'suspended') metAudioCtx.resume();
      nextNoteTime = metAudioCtx.currentTime;
      metScheduler();
      btn.innerText = "PARAR"; btn.classList.add('stop');
  } else {
      window.clearTimeout(metTimerID);
      btn.innerText = "INICIAR"; btn.classList.remove('stop');
      document.getElementById('met-progress').style.strokeDashoffset = '440';
  }
}

function updateBpm(val) { metTempo = val; document.getElementById('bpm-value').innerText = val; }
function changeBpm(val) { 
  const s = document.getElementById('bpm-slider');
  let nv = parseInt(s.value) + val;
  if(nv >= 40 && nv <= 220) { s.value = nv; updateBpm(nv); }
}
document.getElementById('bpm-slider').oninput = function() { updateBpm(this.value); };

// --- AFINADOR ORIGINAL FUNCIONAL ---
let tunerOn = false, micStream, analyzer, animId, aCtx;
const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
async function toggleTuner() {
  const btn = document.getElementById('btn-tuner');
  if(tunerOn) {
    tunerOn = false;
    if(micStream) micStream.getTracks().forEach(t => t.stop());
    cancelAnimationFrame(animId);
    btn.innerText = "LIGAR AFINADOR"; btn.classList.remove('stop');
  } else {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      aCtx = aCtx || new AudioContext();
      const src = aCtx.createMediaStreamSource(micStream);
      analyzer = aCtx.createAnalyser(); analyzer.fftSize = 2048;
      src.connect(analyzer);
      tunerOn = true; btn.innerText = "DESLIGAR AFINADOR"; btn.classList.add('stop');
      updatePitch();
    } catch(e) { alert("Microfone não autorizado."); }
  }
}

function updatePitch() {
  const buf = new Float32Array(analyzer.fftSize);
  analyzer.getFloatTimeDomainData(buf);
  let freq = getPitch(buf, aCtx.sampleRate);
  
  const noteEl = document.getElementById('pitch-note');
  const freqEl = document.getElementById('pitch-freq');

  // 1. IMPORTANTE: Apaga todos os LEDs e reseta a cor da nota antes de cada medição
  document.querySelectorAll('.led').forEach(l => {
    l.classList.remove('v-red', 'v-orange', 'v-yellow', 'v-green');
  });
  noteEl.style.color = "var(--text-muted)"; // Cor "apagada"

  if(freq > 0) {
    let noteNum = 12 * (Math.log(freq / 440) / Math.log(2)) + 69;
    let rounded = Math.round(noteNum);
    let diff = noteNum - rounded; // Diferença para saber se está afinado ou não
    
    noteEl.innerText = NOTES[rounded % 12];
    freqEl.innerText = freq.toFixed(1) + " Hz";

    // 2. Lógica para acender o LED correspondente à frequência
    if (Math.abs(diff) < 0.05) { 
      // AFINADO: Acende o central verde
      noteEl.style.color = "#22c55e"; 
      document.getElementById('center-led').classList.add('v-green');
    } 
    else if (diff < 0) { 
      // ABAIXO DA NOTA (Esquerda)
      if (diff < -0.35) { 
        document.getElementById('l5').classList.add('v-red'); 
        noteEl.style.color = "#ef4444"; 
      } else if (diff < -0.20) { 
        document.getElementById('l3').classList.add('v-orange'); 
        noteEl.style.color = "#f97316"; 
      } else { 
        document.getElementById('l1').classList.add('v-yellow'); 
        noteEl.style.color = "#facc15"; 
      }
    } 
    else { 
      // ACIMA DA NOTA (Direita)
      if (diff > 0.35) { 
        document.getElementById('r5').classList.add('v-red'); 
        noteEl.style.color = "#ef4444"; 
      } else if (diff > 0.20) { 
        document.getElementById('r3').classList.add('v-orange'); 
        noteEl.style.color = "#f97316"; 
      } else { 
        document.getElementById('r1').classList.add('v-yellow'); 
        noteEl.style.color = "#facc15"; 
      }
    }
  }
  animId = requestAnimationFrame(updatePitch);
}

// Sua função getPitch otimizada para precisão
function getPitch(buf, sr) {
  let size = buf.length, rms = 0;
  for(let i=0; i<size; i++) rms += buf[i]*buf[i];
  if(Math.sqrt(rms/size) < 0.01) return -1;
  
  let r1 = 0, r2 = size-1, thres = 0.2;
  for(let i=0; i<size/2; i++) if(Math.abs(buf[i]) < thres) { r1 = i; break; }
  for(let i=1; i<size/2; i++) if(Math.abs(buf[size-i]) < thres) { r2 = size-i; break; }
  
  let buf2 = buf.slice(r1, r2), c = new Float32Array(buf2.length);
  for(let i=0; i<buf2.length; i++) 
    for(let j=0; j<buf2.length-i; j++) 
      c[i] += buf2[j]*buf2[j+i];
  
let d = 0; while(c[d] > c[d+1]) d++;
let maxval = -1, maxpos = -1;
for(let i=d; i<buf2.length; i++) if(c[i] > maxval) { maxval = c[i]; maxpos = i; }
return sr / maxpos;
}

/* ======================================================
   🚀 CONVERSOR DE LINK GOOGLE DRIVE (ABRE MAIS RÁPIDO)
   COLE EXATAMENTE AQUI — ANTES DO window.onload
====================================================== */
function toFastDriveUrl(url) {
  if (!url || url === '#') return '#';

  let id = null;

  // Formato /file/d/ID
  const m1 = url.match(/\/file\/d\/([^/]+)/);
  if (m1 && m1[1]) id = m1[1];

  // Formato ?id=ID
  if (!id) {
    const m2 = url.match(/[?&]id=([^&]+)/);
    if (m2 && m2[1]) id = m2[1];
  }

  // Se for link do Google Drive → abre via open?id (mais rápido)
  if (id && url.includes('drive.google.com')) {
    return `https://drive.google.com/open?id=${id}`;
  }

  return url;
}
