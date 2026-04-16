'use client';

import { useCallback, useEffect, useState } from 'react';
import SplitFlapBoard from '@/components/board/SplitFlapBoard';
import { useBoardState } from '@/hooks/useBoardState';
import { useAudio } from '@/hooks/useAudio';
import type { AppConfig } from '@/types/config';

// Re-flow server rows (formatted for serverCols width) into displayCols x displayRows.
// Words are preserved; lines are padded with spaces.
function reflowRows(rows: string[], displayCols: number, displayRows: number): string[] {
  const words = rows.join(' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (lines.length >= displayRows) break;
    if (!line) {
      line = word.slice(0, displayCols);
    } else if (line.length + 1 + word.length <= displayCols) {
      line += ' ' + word;
    } else {
      lines.push(line.padEnd(displayCols, ' '));
      line = word.slice(0, displayCols);
    }
  }
  if (line && lines.length < displayRows) lines.push(line.padEnd(displayCols, ' '));
  while (lines.length < displayRows) lines.push(' '.repeat(displayCols));
  return lines.slice(0, displayRows);
}

// Compute portrait-optimised col/row counts so cells are at least ~18 px wide
// and the board fills a good chunk of the screen height.
function portraitGrid(config: AppConfig, vw: number, vh: number): { cols: number; rows: number } {
  const rem = parseFloat(typeof document !== 'undefined'
    ? getComputedStyle(document.documentElement).fontSize
    : '16') || 16;
  const parse = (s: string) => s.endsWith('rem') ? parseFloat(s) * rem : parseFloat(s);
  const naturalCellW = parse(config.cellWidth) + 2;
  const naturalCellH = parse(config.cellHeight) + 2;

  // Target: cells at least 18 px on screen (at whatever scale results)
  const minCellPx = 18;
  const cols = Math.min(config.cols, Math.max(8, Math.floor(vw * 0.96 / minCellPx)));

  // With those cols, what scale will the board use?
  const scale = (vw * 0.96) / (cols * naturalCellW + 24);
  const cellHAtScale = naturalCellH * scale;

  // Fill up to 70% of the visible viewport height with rows
  const rows = Math.min(
    Math.max(config.rows, Math.ceil((vh * 0.70) / cellHAtScale)),
    12,
  );

  return { cols, rows };
}

export default function BoardPage() {
  const { state, error, config } = useBoardState();
  const { scheduleWave, isEnabled: audioEnabled, isReady: audioReady, enable, toggle: toggleAudio } = useAudio(
    config.audioEnabled,
    config.audioVolume,
  );
  const [showClickHint, setShowClickHint] = useState(true);
  const [prevRevision, setPrevRevision] = useState(-1);
  const [showLocPrompt, setShowLocPrompt] = useState(false);
  // Track real visible viewport height (fixes iOS 100vh centering bug)
  const [containerH, setContainerH] = useState('100svh');
  const [windowDims, setWindowDims] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const update = () => {
      setContainerH(`${window.innerHeight}px`);
      setWindowDims({ w: window.innerWidth, h: window.innerHeight });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (config.latitude === 40.7128 && config.longitude === -74.006) {
      const timer = setTimeout(() => setShowLocPrompt(true), 3000);
      return () => clearTimeout(timer);
    } else {
      setShowLocPrompt(false);
    }
  }, [config.latitude, config.longitude]);

  useEffect(() => {
    if (audioReady) setShowClickHint(false);
  }, [audioReady]);

  const handleFirstClick = useCallback(() => {
    enable();
    setShowClickHint(false);
  }, [enable]);

  const handleWaveStart = useCallback(
    (cols: number) => {
      if (audioEnabled) scheduleWave(cols, config.waveDelay);
    },
    [audioEnabled, scheduleWave, config.waveDelay],
  );

  useEffect(() => {
    if (state && state.revision !== prevRevision) {
      setPrevRevision(state.revision);
      handleWaveStart(config.cols);
    }
  }, [state, prevRevision, handleWaveStart, config.cols]);

  // Compute display grid — reflow to portrait-friendly dimensions if needed
  const isPortrait = windowDims.w > 0 && windowDims.w < windowDims.h;
  const pg = (isPortrait && windowDims.w > 0)
    ? portraitGrid(config, windowDims.w, windowDims.h)
    : { cols: config.cols, rows: config.rows };

  const serverRows = state?.rows ?? Array.from({ length: config.rows }, () => ' '.repeat(config.cols));
  const displayRows = (isPortrait && pg.cols !== config.cols)
    ? reflowRows(serverRows, pg.cols, pg.rows)
    : serverRows;

  const displayConfig = (isPortrait && pg.cols !== config.cols)
    ? { ...config, cols: pg.cols, rows: pg.rows }
    : config;

  return (
    <div
      onClick={handleFirstClick}
      style={{
        width: '100vw',
        height: containerH,
        background: '#0a0a0a',
        overflow: 'hidden',
        position: 'relative',
        cursor: 'default',
      }}
    >
      {/* Vignette */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)',
        pointerEvents: 'none', zIndex: 50,
      }} />

      {state && (
        <SplitFlapBoard
          targetRows={displayRows}
          accentCols={state.accentCols}
          config={displayConfig}
          feedName={state.feedName}
          feedIcon={state.feedIcon}
          onWaveStart={handleWaveStart}
        />
      )}

      {/* Sound hint */}
      {showClickHint && (
        <div style={{
          position: 'absolute', bottom: '2rem', left: '50%',
          transform: 'translateX(-50%)',
          color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem',
          fontFamily: 'monospace', letterSpacing: '0.15em',
          pointerEvents: 'none', whiteSpace: 'nowrap',
          animation: 'pulse 2s ease-in-out infinite',
        }}>
          CLICK ANYWHERE TO ENABLE SOUND
        </div>
      )}

      {/* Location prompt */}
      {showLocPrompt && (
        <div style={{
          position: 'absolute', bottom: '2rem', left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          background: 'rgba(20,20,20,0.92)',
          border: '1px solid rgba(232,93,4,0.4)',
          borderRadius: '4px', padding: '0.6rem 1rem', zIndex: 100,
          whiteSpace: 'nowrap',
        }}>
          <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', letterSpacing: '0.08em' }}>
            USING DEFAULT LOCATION (NEW YORK)
          </span>
          <a href="/config/display" onClick={(e) => e.stopPropagation()}
            style={{
              background: '#e85d04', color: '#fff', fontSize: '0.65rem',
              fontFamily: 'monospace', padding: '0.2rem 0.6rem',
              borderRadius: '3px', textDecoration: 'none',
              letterSpacing: '0.08em',
            }}>
            SET MY LOCATION →
          </a>
          <button onClick={(e) => { e.stopPropagation(); setShowLocPrompt(false); }}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '0.8rem', padding: '0 0.25rem' }}>
            ✕
          </button>
        </div>
      )}

      {/* Error */}
      {error && !state && (
        <div style={{
          position: 'absolute', bottom: '1rem', right: '1rem',
          color: 'rgba(255,80,80,0.6)', fontSize: '0.65rem', fontFamily: 'monospace',
        }}>
          CONNECTION ERROR — RETRYING
        </div>
      )}

      {/* Controls */}
      <div style={{
        position: 'absolute', top: '1rem', right: '1rem',
        display: 'flex', gap: '0.5rem', zIndex: 100,
      }}>
        <button onClick={(e) => { e.stopPropagation(); toggleAudio(); }}
          style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', fontFamily: 'monospace',
            padding: '0.3rem 0.6rem', cursor: 'pointer', borderRadius: '3px', letterSpacing: '0.1em',
          }}>
          {audioEnabled ? 'SND ON' : 'SND OFF'}
        </button>
        <a href="/config" onClick={(e) => e.stopPropagation()}
          style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', fontFamily: 'monospace',
            padding: '0.3rem 0.6rem', cursor: 'pointer', borderRadius: '3px',
            letterSpacing: '0.1em', textDecoration: 'none',
          }}>
          SETTINGS
        </a>
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.7; } }
      `}</style>
    </div>
  );
}
