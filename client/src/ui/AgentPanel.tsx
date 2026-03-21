import { useAgentStore } from '../store/agent-store';
import { COLORS, getAgentColor } from '../utils/colors';
import { useThemeColors } from '../hooks/useThemeColors';

export function AgentPanel() {
  const events = useAgentStore(s => s.events);
  const panelOpen = useAgentStore(s => s.panelOpen);
  const togglePanel = useAgentStore(s => s.togglePanel);
  const C = useThemeColors();

  return (
    <div className="pointer-events-auto">
      {/* Toggle button */}
      <button
        onClick={togglePanel}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs"
        style={{
          background: C.panelBg,
          border: `1px solid ${C.panelBorder}`,
          color: C.textPrimary,
        }}
      >
        <div className={`w-1.5 h-1.5 rounded-full ${events.length > 0 ? 'animate-pulse' : ''}`}
          style={{ background: events.length > 0 ? COLORS.agentClaude : C.textSecondary }} />
        Agent Activity
        {events.length > 0 && (
          <span className="font-mono" style={{ color: COLORS.agentClaude }}>
            {events.length}
          </span>
        )}
      </button>

      {/* Panel */}
      {panelOpen && (
        <div className="absolute bottom-full mb-2 right-0 w-80 max-h-64 overflow-y-auto rounded-lg text-xs"
          style={{ background: C.panelBg, border: `1px solid ${C.panelBorder}` }}>
          {events.length === 0 ? (
            <div className="px-3 py-4 text-center" style={{ color: C.textSecondary }}>
              No agent activity detected
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: C.panelBorder }}>
              {events.slice(0, 20).map(event => (
                <div key={event.id} className="px-3 py-1.5 flex items-start gap-2">
                  <div className="w-1 h-1 rounded-full mt-1.5 shrink-0"
                    style={{ background: getAgentColor(event.agent) }} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span style={{ color: C.textPrimary }}>
                        {event.type.replace('_', ' ')}
                      </span>
                      <span className="font-mono" style={{ color: C.textSecondary, fontSize: '9px' }}>
                        {formatTime(event.timestamp)}
                      </span>
                    </div>
                    {event.filePath && (
                      <div className="truncate" style={{ color: C.textSecondary }}>
                        {event.filePath}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
