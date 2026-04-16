'use client';

import { useEffect, useState, useCallback } from 'react';
import type { AppConfig } from '@/types/config';
import { BOARD_PRESETS } from '@/types/config';

async function resolveTimezone(lat: number, lon: number): Promise<string> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to resolve timezone');
  const data = await res.json();
  return (data.timezone as string) ?? 'UTC';
}

function Slider({
  label, value, min, max, step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
        <label style={{ fontSize: '0.7rem', color: '#666', letterSpacing: '0.1em' }}>{label}</label>
        <span style={{ fontSize: '0.7rem', color: '#888', fontFamily: 'monospace' }}>{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#e85d04' }}
      />
    </div>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={{ fontSize: '0.7rem', color: '#666', letterSpacing: '0.1em', display: 'block', marginBottom: '0.25rem' }}>
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: '2.5rem', height: '2rem', border: '1px solid #333', borderRadius: '3px', background: 'none', cursor: 'pointer' }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            background: '#111', border: '1px solid #333', color: '#e5e5e5',
            padding: '0.25rem 0.5rem', borderRadius: '3px', fontFamily: 'monospace',
            fontSize: '0.75rem', width: '7rem',
          }}
        />
      </div>
    </div>
  );
}

export default function DisplayPage() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  const useMyLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setLocError('Geolocation not supported by this browser');
      return;
    }
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = parseFloat(pos.coords.latitude.toFixed(4));
          const lon = parseFloat(pos.coords.longitude.toFixed(4));
          const timezone = await resolveTimezone(lat, lon);
          setConfig((prev) => prev ? { ...prev, latitude: lat, longitude: lon, timezone } : prev);
        } catch {
          setLocError('Could not resolve timezone — coordinates saved, set timezone manually');
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        setLocError(
          err.code === 1 ? 'Location permission denied — allow it in your browser settings' :
          err.code === 2 ? 'Location unavailable' : 'Location request timed out',
        );
      },
      { timeout: 10000, maximumAge: 300000 },
    );
  }, []);

  useEffect(() => {
    fetch('/api/config').then((r) => r.json()).then(setConfig);
  }, []);

  const save = useCallback(async (patch: Partial<AppConfig>) => {
    if (!config) return;
    setSaving(true);
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const updated = await res.json();
    setConfig(updated);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, [config]);

  const applyPreset = useCallback((presetId: string) => {
    const preset = BOARD_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    save({
      presetId: preset.id,
      cols: preset.cols,
      rows: preset.rows,
      boardBg: preset.boardBg,
      cellBg: preset.cellBg,
      charColor: preset.charColor,
      accentColor: preset.accentColor,
      fontFamily: preset.fontFamily,
      cellWidth: preset.cellWidth,
      cellHeight: preset.cellHeight,
    });
  }, [save]);

  if (!config) return <div style={{ color: '#555', fontFamily: 'monospace' }}>LOADING...</div>;

  const FONTS = [
    { label: 'Courier Prime', value: "'Courier Prime', 'Courier New', monospace" },
    { label: 'Courier New', value: "'Courier New', monospace" },
    { label: 'IBM Plex Mono', value: "'IBM Plex Mono', monospace" },
    { label: 'Share Tech Mono', value: "'Share Tech Mono', monospace" },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 700, letterSpacing: '0.15em', margin: 0 }}>DISPLAY</h1>
          <p style={{ color: '#555', fontSize: '0.75rem', marginTop: '0.25rem' }}>Board layout, theme, and visual settings</p>
        </div>
        <button
          onClick={() => save(config)}
          disabled={saving}
          style={{
            background: '#e85d04', border: 'none', color: '#fff',
            padding: '0.5rem 1.25rem', borderRadius: '4px',
            cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.8rem',
            letterSpacing: '0.1em',
          }}
        >
          {saving ? 'SAVING...' : saved ? 'SAVED \u2713' : 'SAVE'}
        </button>
      </div>

      {/* Presets */}
      <h2 style={{ fontSize: '0.8rem', color: '#666', letterSpacing: '0.12em', marginBottom: '1rem' }}>
        BOARD PRESETS
      </h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: '0.75rem',
          marginBottom: '2rem',
        }}
      >
        {BOARD_PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => applyPreset(preset.id)}
            style={{
              background: preset.boardBg,
              border: `2px solid ${config.presetId === preset.id ? '#e85d04' : '#333'}`,
              borderRadius: '6px',
              padding: '0.75rem',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'border-color 0.15s',
            }}
          >
            {/* Mini preview */}
            <div style={{ marginBottom: '0.5rem', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {[0, 1].map((row) => (
                <div key={row} style={{ display: 'flex', gap: '1px' }}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      style={{
                        width: '0.85rem',
                        height: '1.2rem',
                        background: i === 0 && row === 0 ? preset.accentColor : preset.cellBg,
                        borderRadius: '1px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.45rem',
                        color: preset.charColor,
                        fontFamily: 'monospace',
                        overflow: 'hidden',
                      }}
                    >
                      {['A', 'B', 'C', 'D', 'E', 'F'][i]}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ fontSize: '0.7rem', color: preset.charColor, fontWeight: 700, letterSpacing: '0.05em' }}>
              {preset.name}
            </div>
            <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', marginTop: '0.1rem' }}>
              {preset.location || `${preset.cols}\u00d7${preset.rows}`}
            </div>
          </button>
        ))}
      </div>

      {/* Manual settings */}
      <h2 style={{ fontSize: '0.8rem', color: '#666', letterSpacing: '0.12em', marginBottom: '1rem' }}>
        MANUAL SETTINGS
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <div>
          <h3 style={{ fontSize: '0.7rem', color: '#555', letterSpacing: '0.1em', marginBottom: '1rem' }}>GRID</h3>
          <Slider label="COLUMNS" value={config.cols} min={8} max={40} onChange={(v) => setConfig({ ...config, cols: v })} />
          <Slider label="ROWS" value={config.rows} min={1} max={6} onChange={(v) => setConfig({ ...config, rows: v })} />
          <Slider label="ROTATION INTERVAL (SEC)" value={config.rotationInterval} min={5} max={120} onChange={(v) => setConfig({ ...config, rotationInterval: v })} />
        </div>

        <div>
          <h3 style={{ fontSize: '0.7rem', color: '#555', letterSpacing: '0.1em', marginBottom: '1rem' }}>ANIMATION</h3>
          <Slider label="FLIP SPEED (MS)" value={config.flipSpeed} min={30} max={200} onChange={(v) => setConfig({ ...config, flipSpeed: v })} />
          <Slider label="WAVE DELAY (MS)" value={config.waveDelay} min={10} max={100} onChange={(v) => setConfig({ ...config, waveDelay: v })} />
          <Slider label="AUDIO VOLUME" value={Math.round(config.audioVolume * 100)} min={0} max={100} onChange={(v) => setConfig({ ...config, audioVolume: v / 100 })} />

          {/* Pattern selection */}
          <div style={{ marginTop: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label style={{ fontSize: '0.7rem', color: '#666', letterSpacing: '0.1em' }}>TRANSITION PATTERN</label>
              <button
                onClick={() => setConfig({ ...config, animationPatterns: [] })}
                style={{
                  background: (config.animationPatterns ?? []).length === 0 ? '#e85d04' : '#111',
                  border: `1px solid ${(config.animationPatterns ?? []).length === 0 ? '#e85d04' : '#333'}`,
                  color: (config.animationPatterns ?? []).length === 0 ? '#fff' : '#666',
                  padding: '0.2rem 0.5rem', borderRadius: '3px', cursor: 'pointer',
                  fontFamily: 'monospace', fontSize: '0.6rem', letterSpacing: '0.08em',
                }}
              >ALL (RANDOM)</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.3rem' }}>
              {([
                ['wave-lr',    'L→R Wave'],
                ['wave-rl',    'R→L Wave'],
                ['top-bottom', 'Top→Bottom'],
                ['spiral',     'Spiral'],
                ['hatch',      'Hatch'],
                ['snake-up',   'Snake Up'],
                ['matrix',     'Matrix'],
                ['row-by-row', 'Row by Row'],
                ['dissolve',   'Dissolve'],
                ['diagonal',   'Diagonal'],
                ['middle-out', 'Middle Out'],
              ] as [string, string][]).map(([id, label]) => {
                const patterns = config.animationPatterns ?? [];
                const active = patterns.length > 0 && patterns.includes(id);
                return (
                  <button
                    key={id}
                    onClick={() => {
                      const cur = config.animationPatterns ?? [];
                      let next: string[];
                      if (cur.length === 0) {
                        next = [id]; // exit ALL mode → just this one
                      } else if (cur.includes(id)) {
                        next = cur.filter((p) => p !== id);
                        if (next.length === 0) next = [id]; // keep at least 1
                      } else {
                        next = [...cur, id];
                      }
                      setConfig({ ...config, animationPatterns: next });
                    }}
                    style={{
                      background: active ? 'rgba(232,93,4,0.15)' : '#0d0d0d',
                      border: `1px solid ${active ? '#e85d04' : '#2a2a2a'}`,
                      color: active ? '#e85d04' : '#555',
                      padding: '0.3rem 0.25rem', borderRadius: '3px', cursor: 'pointer',
                      fontFamily: 'monospace', fontSize: '0.6rem', letterSpacing: '0.04em',
                      textAlign: 'center' as const,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p style={{ fontSize: '0.62rem', color: '#3a3a3a', marginTop: '0.4rem' }}>
              {(config.animationPatterns ?? []).length === 0
                ? 'Randomly picks from all 11 patterns on each board change'
                : (config.animationPatterns ?? []).length === 1
                  ? `Always uses: ${config.animationPatterns[0]}`
                  : `Randomly picks from ${config.animationPatterns.length} selected patterns`}
            </p>
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: '0.7rem', color: '#555', letterSpacing: '0.1em', marginBottom: '1rem' }}>COLORS</h3>
          <ColorInput label="BOARD BACKGROUND" value={config.boardBg} onChange={(v) => setConfig({ ...config, boardBg: v })} />
          <ColorInput label="CELL BACKGROUND" value={config.cellBg} onChange={(v) => setConfig({ ...config, cellBg: v })} />
          <ColorInput label="CHARACTER COLOR" value={config.charColor} onChange={(v) => setConfig({ ...config, charColor: v })} />
          <ColorInput label="ACCENT COLOR" value={config.accentColor} onChange={(v) => setConfig({ ...config, accentColor: v })} />
        </div>

        <div>
          <h3 style={{ fontSize: '0.7rem', color: '#555', letterSpacing: '0.1em', marginBottom: '1rem' }}>TYPOGRAPHY & SIZE</h3>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.7rem', color: '#666', letterSpacing: '0.1em', display: 'block', marginBottom: '0.25rem' }}>FONT</label>
            <select
              value={config.fontFamily}
              onChange={(e) => setConfig({ ...config, fontFamily: e.target.value })}
              style={{
                background: '#111', border: '1px solid #333', color: '#e5e5e5',
                padding: '0.35rem 0.6rem', borderRadius: '3px', fontFamily: 'monospace',
                fontSize: '0.75rem', width: '100%',
              }}
            >
              {FONTS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Location */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '0.8rem', color: '#666', letterSpacing: '0.12em', margin: 0 }}>LOCATION</h2>
        <button
          onClick={useMyLocation}
          disabled={locating}
          style={{
            background: locating ? '#222' : '#1a3a1a',
            border: `1px solid ${locating ? '#333' : '#2a5a2a'}`,
            color: locating ? '#555' : '#44cc44',
            padding: '0.25rem 0.75rem',
            borderRadius: '3px',
            cursor: locating ? 'default' : 'pointer',
            fontFamily: 'monospace',
            fontSize: '0.7rem',
            letterSpacing: '0.08em',
          }}
        >
          {locating ? 'LOCATING...' : '\u2295 USE MY LOCATION'}
        </button>
        {locError && (
          <span style={{ fontSize: '0.7rem', color: '#cc4444', fontFamily: 'monospace' }}>
            {locError}
          </span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        {[
          { label: 'LATITUDE', key: 'latitude', type: 'number' },
          { label: 'LONGITUDE', key: 'longitude', type: 'number' },
          { label: 'TIMEZONE', key: 'timezone', type: 'text' },
        ].map(({ label, key, type }) => (
          <div key={key}>
            <label style={{ fontSize: '0.7rem', color: '#666', letterSpacing: '0.1em', display: 'block', marginBottom: '0.25rem' }}>
              {label}
            </label>
            <input
              type={type}
              value={config[key as keyof AppConfig] as string | number}
              onChange={(e) => setConfig({ ...config, [key]: type === 'number' ? parseFloat(e.target.value) : e.target.value })}
              style={{
                background: '#111', border: '1px solid #333', color: '#e5e5e5',
                padding: '0.35rem 0.6rem', borderRadius: '3px', fontFamily: 'monospace',
                fontSize: '0.8rem', width: '100%', boxSizing: 'border-box',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
