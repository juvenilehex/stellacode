import { useRef, useCallback, useEffect } from 'react';
import { useTimelineStore } from '../store/timeline-store';
import { COLORS } from '../utils/colors';

/**
 * Timeline scrub bar for time-travel replay.
 * Fixed at the bottom of the screen when replay mode is active.
 */
export function TimelineSlider() {
  const mode = useTimelineStore(s => s.mode);
  const commits = useTimelineStore(s => s.commits);
  const currentIndex = useTimelineStore(s => s.currentIndex);
  const playing = useTimelineStore(s => s.playing);
  const speed = useTimelineStore(s => s.speed);
  const play = useTimelineStore(s => s.play);
  const pause = useTimelineStore(s => s.pause);
  const setSpeed = useTimelineStore(s => s.setSpeed);
  const scrubTo = useTimelineStore(s => s.scrubTo);
  const exitReplay = useTimelineStore(s => s.exitReplay);
  const visibleFiles = useTimelineStore(s => s.visibleFiles);

  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const total = commits.length;
  const progress = total > 0 ? (currentIndex + 1) / total : 0;

  const current = currentIndex >= 0 && currentIndex < total ? commits[currentIndex] : null;

  // Scrub by mouse position on track
  const scrubFromEvent = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!trackRef.current || total === 0) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const idx = Math.round(x * (total - 1));
    scrubTo(idx);
  }, [total, scrubTo]);

  const onTrackPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    scrubFromEvent(e as unknown as MouseEvent);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [scrubFromEvent]);

  const onTrackPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    scrubFromEvent(e as unknown as MouseEvent);
  }, [scrubFromEvent]);

  const onTrackPointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    if (mode !== 'replay') return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === ' ') {
        e.preventDefault();
        playing ? pause() : play();
      }
      if (e.key === 'ArrowRight') {
        scrubTo(Math.min(currentIndex + 1, total - 1));
      }
      if (e.key === 'ArrowLeft') {
        scrubTo(Math.max(currentIndex - 1, 0));
      }
      if (e.key === 'Escape') {
        exitReplay();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mode, playing, currentIndex, total, play, pause, scrubTo, exitReplay]);

  if (mode !== 'replay') return null;

  const speeds = [0.5, 1, 2, 4, 8];

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-50 pointer-events-auto"
      style={{
        background: 'linear-gradient(transparent, rgba(12, 12, 16, 0.95) 30%)',
        padding: '24px 20px 12px',
      }}
    >
      {/* Commit info line */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-3">
          {/* Play/Pause */}
          <button
            className="w-7 h-7 flex items-center justify-center rounded-sm transition-colors hover:bg-white/10"
            style={{ color: COLORS.textPrimary }}
            onClick={() => playing ? pause() : play()}
            title={playing ? 'Pause (Space)' : 'Play (Space)'}
          >
            {playing ? (
              <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor">
                <rect x="1" y="0" width="3.5" height="14" rx="0.5" />
                <rect x="7.5" y="0" width="3.5" height="14" rx="0.5" />
              </svg>
            ) : (
              <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor">
                <path d="M1 1.5 L11 7 L1 12.5Z" />
              </svg>
            )}
          </button>

          {/* Speed selector */}
          <div className="flex items-center gap-1">
            {speeds.map(s => (
              <button
                key={s}
                className="px-1.5 py-0.5 text-[9px] rounded-sm transition-colors"
                style={{
                  color: speed === s ? COLORS.textPrimary : COLORS.textSecondary,
                  background: speed === s ? 'rgba(180,180,200,0.12)' : 'transparent',
                }}
                onClick={() => setSpeed(s)}
              >
                {s}x
              </button>
            ))}
          </div>

          {/* Progress counter */}
          <span className="text-[10px] tabular-nums" style={{ color: COLORS.textSecondary }}>
            {currentIndex + 1} / {total}
          </span>

          {/* Visible files count */}
          <span className="text-[10px]" style={{ color: COLORS.textSecondary }}>
            {visibleFiles.size} files
          </span>
        </div>

        {/* Current commit info */}
        <div className="flex items-center gap-3">
          {current && (
            <>
              <span className="text-[10px] font-mono" style={{ color: 'rgba(137, 196, 244, 0.7)' }}>
                {current.shortHash}
              </span>
              <span
                className="text-[10px] truncate"
                style={{ color: COLORS.textSecondary, maxWidth: 300 }}
              >
                {current.message}
              </span>
              {current.isAgent && current.agentName && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-sm" style={{
                  color: COLORS.agentClaude,
                  background: 'rgba(255, 142, 200, 0.1)',
                }}>
                  {current.agentName}
                </span>
              )}
            </>
          )}

          {/* Exit button */}
          <button
            className="text-[10px] px-2.5 py-1 rounded-sm tracking-wider uppercase transition-colors hover:bg-white/10"
            style={{
              color: COLORS.textSecondary,
              border: '0.5px solid rgba(180,180,200,0.15)',
            }}
            onClick={exitReplay}
          >
            Exit
          </button>
        </div>
      </div>

      {/* Scrub track */}
      <div
        ref={trackRef}
        className="relative h-2 rounded-full cursor-pointer"
        style={{ background: 'rgba(180,180,200,0.08)' }}
        onPointerDown={onTrackPointerDown}
        onPointerMove={onTrackPointerMove}
        onPointerUp={onTrackPointerUp}
      >
        {/* Progress fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${progress * 100}%`,
            background: 'linear-gradient(90deg, rgba(137,196,244,0.3), rgba(137,196,244,0.6))',
          }}
        />

        {/* Agent commit markers */}
        {total > 0 && commits.map((c, i) => {
          if (!c.isAgent) return null;
          const x = (i / (total - 1)) * 100;
          return (
            <div
              key={c.hash}
              className="absolute top-0 w-px h-full"
              style={{
                left: `${x}%`,
                background: 'rgba(255, 142, 200, 0.4)',
              }}
            />
          );
        })}

        {/* Playhead */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2"
          style={{
            left: `calc(${progress * 100}% - 6px)`,
            background: 'rgba(137, 196, 244, 0.9)',
            borderColor: 'rgba(137, 196, 244, 0.4)',
            boxShadow: '0 0 6px rgba(137, 196, 244, 0.3)',
          }}
        />
      </div>

      {/* Date range hint */}
      {total > 1 && (
        <div className="flex justify-between mt-1 px-0.5">
          <span className="text-[9px]" style={{ color: 'rgba(180,180,200,0.3)' }}>
            {formatDate(commits[0].timestamp)}
          </span>
          <span className="text-[9px]" style={{ color: 'rgba(180,180,200,0.3)' }}>
            {formatDate(commits[total - 1].timestamp)}
          </span>
        </div>
      )}
    </div>
  );
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
