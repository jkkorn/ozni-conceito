// Synthesised sounds (Web Audio, no files), played "as heard" at one phone: quieter with
// distance and duller through each wall. Illustrative only — not real recordings, and
// deliberately limited in loudness (a compressor + gain cap protect the listener).
(function (root) {
  "use strict";
  let ctx = null, out = null;

  function ensure() {
    if (ctx) return ctx;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 8;
    out = ctx.createGain(); out.gain.value = 0.7;
    comp.connect(out).connect(ctx.destination);
    out = comp;
    return ctx;
  }

  function noise(seconds) {
    const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // kind: "gun" | "fw" | "spoof"; levelDb: level at the listening phone; walls: count crossed
  function play(kind, levelDb, walls) {
    if (!ensure()) return;
    if (ctx.state === "suspended") ctx.resume();
    const t0 = ctx.currentTime + 0.02;
    const gain = Math.min(0.9, Math.max(0.03, Math.pow(10, (levelDb - 125) / 40)));
    const master = ctx.createGain(); master.gain.value = gain;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass";
    lp.frequency.value = Math.max(350, 11000 / Math.pow(2, walls));
    master.connect(lp);
    let last = lp;
    if (kind === "spoof") {                 // small speaker: no deep bass, boxy mids
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 450;
      const pk = ctx.createBiquadFilter(); pk.type = "peaking"; pk.frequency.value = 1800; pk.gain.value = 6;
      last.connect(hp).connect(pk); last = pk;
    }
    last.connect(out);

    // crack: very short broadband burst
    const crack = ctx.createBufferSource(); crack.buffer = noise(0.6);
    const ce = ctx.createGain();
    const tail = kind === "fw" ? 0.18 : 0.45;        // a gunshot carries a longer reverberant tail
    ce.gain.setValueAtTime(1, t0);
    ce.gain.exponentialRampToValueAtTime(0.25, t0 + 0.004);
    ce.gain.exponentialRampToValueAtTime(0.001, t0 + tail);
    crack.connect(ce).connect(master); crack.start(t0); crack.stop(t0 + 0.6);

    // blast / boom: low thump (muzzle blast; a firecracker's is smaller and shorter)
    const osc = ctx.createOscillator(); osc.type = "sine";
    osc.frequency.setValueAtTime(kind === "fw" ? 140 : 95, t0);
    osc.frequency.exponentialRampToValueAtTime(40, t0 + 0.25);
    const oe = ctx.createGain();
    oe.gain.setValueAtTime(kind === "fw" ? 0.5 : 1.1, t0);
    oe.gain.exponentialRampToValueAtTime(0.001, t0 + (kind === "fw" ? 0.12 : 0.3));
    osc.connect(oe).connect(master); osc.start(t0); osc.stop(t0 + 0.35);
  }

  root.OzniAudio = { play };
})(this);
