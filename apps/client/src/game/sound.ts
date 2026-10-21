let context: AudioContext | null = null;

/** Tiny generated sword whoosh: no remote audio asset and no autoplay (called from user input). */
export function playSwordWhoosh(): void {
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume();
    const now = context.currentTime;
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.21), context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass'; filter.Q.value = 0.6;
    filter.frequency.setValueAtTime(1100, now);
    filter.frequency.exponentialRampToValueAtTime(340, now + 0.2);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.075, now + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.21);
    source.connect(filter).connect(gain).connect(context.destination);
    source.start(now); source.stop(now + 0.21);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  } catch { /* Browsers without Web Audio still get the complete visual and server combat. */ }
}
