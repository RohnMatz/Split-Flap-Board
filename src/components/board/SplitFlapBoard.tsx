'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import FlapRow from './FlapRow';
import type { AppConfig } from '@/types/config';
import { DRUM_CHARS } from '@/types/board';
import {
  pickRandomPattern,
  computeDelays,
  maxDelay,
  alignRows,
  type AnimationPattern,
} from '@/lib/animations';

interface SplitFlapBoardProps {
  targetRows: string[];
  accentCols: number[];
  config: AppConfig;
  feedName?: string;
  feedIcon?: string;
  onWaveStart?: (colCount: number) => void;
}

export default function SplitFlapBoard({
  targetRows,
  accentCols,
  config,
  feedName,
  feedIcon,
  onWaveStart,
}: SplitFlapBoardProps) {
  const [displayedRows, setDisplayedRows] = useState<string[]>(() =>
    Array.from({ length: config.rows }, () => ' '.repeat(config.cols)),
  );
  const [scale, setScale] = useState(1);
  // Current pattern delays — re-randomized each content change
  const delaysRef = useRef<number[][]>(
    Array.from({ length: config.rows }, () => new Array(config.cols).fill(0)),
  );
  const currentPatternRef = useRef<AnimationPattern>('wave-lr');
  const prevTargetRef = useRef<string[]>([]);
  const waveCalledRef = useRef(false);
  const [scale, setScale] = useState(1);

  const computeScale = useCallback(() => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const parse = (s: string) => s.endsWith('rem') ? parseFloat(s) * rem : parseFloat(s);
    const cellW = parse(config.cellWidth) + 2; // +2px margin
    const cellH = parse(config.cellHeight) + 2;
    const naturalW = config.cols * cellW + 24; // +24 board padding
    const naturalH = config.rows * cellH + 24 + (config.rows - 1) * 2;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const s = Math.min((vw * 0.96) / naturalW, (vh * 0.9) / naturalH, 1.8);
    setScale(Math.max(s, 0.25));
  }, [config.cols, config.rows, config.cellWidth, config.cellHeight]);

  useEffect(() => {
    computeScale();
    window.addEventListener('resize', computeScale);
    return () => window.removeEventListener('resize', computeScale);
  }, [computeScale]);

  useEffect(() => {
    computeScale();
    window.addEventListener('resize', computeScale);
    return () => window.removeEventListener('resize', computeScale);
  }, [computeScale]);

  // Detect content change → pick new random pattern, compute delays, trigger animation
  useEffect(() => {
    const prev = prevTargetRef.current;
    const changed = targetRows.some((row, i) => row !== prev[i]);
    if (!changed) return;

    // Pick a new pattern from the configured pool (empty = all patterns)
    const pool = config.animationPatterns?.length > 0
      ? (config.animationPatterns as AnimationPattern[])
      : undefined;
    const pattern = pickRandomPattern(pool);
    currentPatternRef.current = pattern;
    delaysRef.current = computeDelays(pattern, config.rows, config.cols, config.waveDelay);

    // Ghost-flip non-changing cells for Matrix animation
    if (pattern === 'matrix') {
      setGhostTrigger((n) => n + 1);
    }

    // Sound — play a simple left-to-right wave regardless of visual pattern
    if (onWaveStart && !waveCalledRef.current) {
      waveCalledRef.current = true;
      onWaveStart(config.cols);
      setTimeout(() => { waveCalledRef.current = false; }, 500);
    }

    setDisplayedRows(
      prev.length > 0
        ? [...prev]
        : Array.from({ length: config.rows }, () => ' '.repeat(config.cols)),
    );
    prevTargetRef.current = targetRows;
  }, [targetRows, config.cols, config.rows, config.waveDelay, onWaveStart]);

  // Sync-snap: after all cells finish animating, force displayedRows to target
  useEffect(() => {
    const mDelay = maxDelay(delaysRef.current);
    const snapDelay = mDelay + Math.ceil(DRUM_CHARS.length / 2) * config.flipSpeed + 300;
    const timer = setTimeout(() => {
      setDisplayedRows(
        targetRows.map((row) => row.padEnd(config.cols, ' ').slice(0, config.cols)),
      );
    }, snapDelay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetRows]);

  // Apply alignment to the target rows for display
  const alignedTarget = alignRows(
    targetRows,
    config.cols,
    config.textHAlign ?? 'center',
    config.textVAlign ?? 'top',
    config.rows,
  );

  const emptyRows = Array.from(
    { length: Math.max(0, config.rows - displayedRows.length) },
    () => ' '.repeat(config.cols),
  );
  const allCurrentRows = [...displayedRows, ...emptyRows].slice(0, config.rows);

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: `translate(-50%, -50%) scale(${scale})`,
        transformOrigin: 'center center',
        display: 'inline-flex',
        flexDirection: 'column',
        background: config.boardBg,
        padding: '12px',
        borderRadius: '6px',
        boxShadow: '0 0 40px rgba(0,0,0,0.8), inset 0 0 60px rgba(0,0,0,0.3)',
        gap: '2px',
      }}
    >
      {allCurrentRows.map((currentRow, rowIdx) => (
        <FlapRow
          key={rowIdx}
          currentRow={currentRow}
          targetRow={alignedTarget[rowIdx] ?? ' '.repeat(config.cols)}
          cols={config.cols}
          accentCols={rowIdx === 0 ? accentCols : []}
          config={config}
          cellDelays={delaysRef.current[rowIdx] ?? new Array(config.cols).fill(0)}
          onCellFlip={undefined}
          ghostTrigger={currentPatternRef.current === 'matrix' ? ghostTrigger : undefined}
        />
      ))}

      {/* Feed name overlay */}
      {feedName && (
        <div
          style={{
            position: 'absolute',
            bottom: '4px',
            right: '8px',
            fontSize: '0.6rem',
            color: 'rgba(255,255,255,0.25)',
            fontFamily: 'monospace',
            letterSpacing: '0.1em',
            pointerEvents: 'none',
          }}
        >
          {feedIcon ? `[${feedIcon}] ` : ''}{feedName}
        </div>
      )}

      {/* Scan-line overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.04) 3px, rgba(0,0,0,0.04) 4px)',
          pointerEvents: 'none',
          borderRadius: '6px',
        }}
      />
    </div>
  );
}
