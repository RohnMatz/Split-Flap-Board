'use client';

import { useRef, useState, useCallback, useEffect } from 'react';

interface UseAudioReturn {
  scheduleWave: (cols: number, waveDelayMs: number) => void;
  setVolume: (v: number) => void;
  isEnabled: boolean;
  isReady: boolean;
  enable: () => void;
  toggle: () => void;
}

export function useAudio(initialEnabled = true, initialVolume = 0.7): UseAudioReturn {
  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const [isEnabled, setIsEnabled] = useState(initialEnabled);
  const [isReady, setIsReady] = useState(false);
  const volumeRef = useRef(initialVolume);

  const initContext = useCallback(() => {
    if (ctxRef.current) return;
    const ctx = new AudioContext();
    const masterGain = ctx.createGain();
    masterGain.gain.value = volumeRef.current;
    masterGain.connect(ctx.destination);
    ctxRef.current = ctx;
    masterGainRef.current = masterGain;
    setIsReady(true);
  }, []);

  const resumeContext = useCallback(async () => {
    if (!ctxRef.current) initContext();
    if (ctxRef.current?.state === 'suspended') {
      await ctxRef.current.resume();
    }
  }, [initContext]);

  useEffect(() => {
    const onInteraction = () => {
      if (!ctxRef.current) initContext();
      resumeContext();
      setIsReady(true);
    };
    // Use capture:true so this fires even when child elements call stopPropagation()
    document.addEventListener('click', onInteraction, { once: true, capture: true });
    document.addEventListener('keydown', onInteraction, { once: true, capture: true });
    return () => {
      document.removeEventListener('click', onInteraction, { capture: true });
      document.removeEventListener('keydown', onInteraction, { capture: true });
    };
  }, [resumeContext, initContext]);

  const synthesizeClick = useCallback((ctx: AudioContext, master: GainNode, time: number) => {
    // Classic split-flap "clack" — short burst of mid-range filtered noise
    const bufferSize = Math.floor(ctx.sampleRate * 0.008);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    // Mid-range bandpass — plastic card hitting a stop, not a typewriter
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 1.8;

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, time);
    gainNode.gain.linearRampToValueAtTime(0.28, time + 0.002);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.055);

    noiseSource.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(master);
    noiseSource.start(time);
    noiseSource.stop(time + 0.060);

    // Soft mechanical thud — body resonance of the panel
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(180, time);
    thump.frequency.exponentialRampToValueAtTime(80, time + 0.040);
    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(0.12, time);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, time + 0.045);
    thump.connect(thumpGain);
    thumpGain.connect(master);
    thump.start(time);
    thump.stop(time + 0.050);
  }, []);

  const scheduleWave = useCallback(
    (cols: number, waveDelayMs: number) => {
      if (!isEnabled) return;
      const ctx = ctxRef.current;
      const master = masterGainRef.current;
      if (!ctx || !master) return;

      const play = () => {
        const now = ctx.currentTime;
        for (let col = 0; col < cols; col++) {
          synthesizeClick(ctx, master, now + (col * waveDelayMs) / 1000);
        }
      };

      if (ctx.state === 'suspended') {
        ctx.resume().then(play).catch(() => {/* browser denied resume */});
      } else {
        play();
      }
    },
    [isEnabled, synthesizeClick],
  );

  const setVolume = useCallback((v: number) => {
    volumeRef.current = v;
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = v;
    }
  }, []);

  const enable = useCallback(() => {
    initContext();
    resumeContext();
    setIsEnabled(true);
  }, [initContext, resumeContext]);

  const toggle = useCallback(() => {
    setIsEnabled((prev) => !prev);
  }, []);

  return { scheduleWave, setVolume, isEnabled, isReady, enable, toggle };
}
