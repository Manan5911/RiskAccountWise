import { useState, useMemo, useRef, useEffect } from 'react';
import { useDataStore } from '../store/dataStore';

// ─── Design tokens — matches GroupingModal's palette ──────────────────────────
const C = {
  navy: '#1a2340',
  navyLight: '#1f2a4a',
  white: '#ffffff',
  surface: '#f8fafc',
  border: '#e5e7eb',
  borderMid: '#d1d5db',
  text: '#111827',
  muted: '#6b7280',
  mutedLight: '#9ca3af',
  rowHover: '#f5f7fb',
  rowSelected: '#eef2fb',
};

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(15,20,40,0.45)',
  zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const modal = {
  background: C.white, borderRadius: '10px', width: '760px', maxWidth: '96vw',
  maxHeight: '86vh', display: 'flex', flexDirection: 'column',
  boxShadow: '0 12px 48px rgba(0,0,0,0.22)',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const header = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '16px 22px', background: C.navy, borderRadius: '10px 10px 0 0',
  borderBottom: `2px solid ${C.navyLight}`,
};

// Shared between the header row and every data row so columns always align.
const COLUMN_TEMPLATE = '36px 1fr 130px 150px';

const headCell = {
  padding: '9px 10px', display: 'flex', alignItems: 'center',
  borderRight: `1px solid ${C.border}`,
};

const bodyCell = {
  padding: '0 10px', display: 'flex', alignItems: 'center',
  borderRight: `1px solid ${C.border}`,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

const footer = {
  padding: '14px 22px', borderTop: `1px solid ${C.border}`,
  display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px',
  background: C.surface,
};

// ── Exchange enum — numeric code kept as the source of truth (sent to the
// backend later); this is purely a display lookup. ────────────────────────
const EXCHANGE_NAMES = {
  0: 'CME', 1: 'LME', 2: 'DGCX', 3: 'MCX', 4: 'Shanghai', 5: 'NDF',
  7: 'NSECD', 8: 'NSEFO', 9: 'NSECM', 10: 'SGX', 11: 'BSECD', 12: 'ICE',
  13: 'IKON', 15: 'CQG', 17: 'TT_INE', 18: 'INTEGRAL', 19: 'LP', 20: 'FXCM',
  21: 'SGX_DC', 22: 'TFEX', 23: 'CME_Q', 24: 'LME_Q', 25: 'NYM_Q',
  26: 'TT_DGCX', 27: 'CS', 28: 'IGE', 29: 'ICE_L', 30: 'Eurex', 31: 'OZ',
  32: 'MCX_ETI', 33: 'NOORINDEX', 34: 'IIBX', 35: 'IFSC', 36: 'IB_CME',
  37: 'BSEED', 38: 'TT_IFSC', 39: 'CTRADE', 40: 'SYMP', 41: 'MONEY_MARKET',
  42: 'B3', 43: 'BSECM', 44: 'JIOGLOBEX', 45: 'ZDH', 46: 'UBS', 47: 'DROP',
  48: 'FIX_DROP', 49: 'IIBX_FUT', 51: 'NSECOM', 52: 'JPX', 53: 'MSEI', 54: 'HKEX',
};
const exchangeName = (code) => EXCHANGE_NAMES[code] ?? `#${code}`;

// ── .NET "/Date(1806345000000+0530)/" → readable date ──────────────────────
const parseDotNetDate = (str) => {
  if (!str) return null;
  const m = /\/Date\((-?\d+)([+-]\d{4})?\)\//.exec(str);
  if (!m) return null;
  const d = new Date(parseInt(m[1], 10));
  return isNaN(d.getTime()) ? null : d;
};
const formatExpiry = (str) => {
  const d = parseDotNetDate(str);
  if (!d) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

// A row's unique identity — SecurityId alone can collide across exchanges,
// so every key here is the pair, not the bare id. Uses the STRING exchange
// name (via exchangeName below), not the raw numeric code — the live LTP
// socket tick identifies securities by string exchange name (e.g. "NSEFO"),
// so this has to match that format or header-ticker subscriptions can never
// match themselves to a live tick.
const rowKey = (item) => `${item.SecurityId}_${exchangeName(item.SecurityExchange)}`;

// ── Hand-rolled virtualization — fixed row height, windowed render ─────────
const MAX_SUBSCRIPTIONS = 5;
const ROW_HEIGHT = 34;
const HEADER_HEIGHT = 34;
const OVERSCAN = 10;

export default function SubscriptionsModal({ onClose }) {
  const subscriptions = useDataStore(s => s.subscriptions);
  const selectedSubscriptions = useDataStore(s => s.selectedSubscriptions);
  const saveSelectedSubscriptions = useDataStore(s => s.saveSelectedSubscriptions);
  const subscribeSecurities = useDataStore(s => s.subscribeSecurities);
  const customCalcConfig = useDataStore(s => s.customCalcConfig);
  const port = window.location.port || '80';

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(() => new Set(selectedSubscriptions || []));
  // conflicts = { ids, affected } while a save is paused waiting for the
  // user to resolve custom-calc variables that pointed at a subscription
  // that's about to be removed. null = no conflict screen active.
  const [blocked, setBlocked] = useState(null); // { affected } while save is blocked by custom-calc usage
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef(null);
  const [viewportHeight, setViewportHeight] = useState(420);

  useEffect(() => {
    if (containerRef.current) setViewportHeight(containerRef.current.clientHeight);
  }, []);

  const allItems = useMemo(() => (
    Array.isArray(subscriptions) ? subscriptions : (subscriptions?.getAllSubscriptionsResult || [])
  ), [subscriptions]);

  // Keyed lookup so selected chips can resolve a symbol regardless of what
  // the current search filter happens to show.
  const byKey = useMemo(() => {
    const map = {};
    allItems.forEach((item) => { map[rowKey(item)] = item; });
    return map;
  }, [allItems]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems;
    // Multi-token, order-independent match — every space-separated word in
    // the query must appear SOMEWHERE in the combined searchable text, not
    // as one single literal substring. Searches Symbol_DisplayName AND the
    // full Symbol (strike/type/expiry live there, not in the display name),
    // plus the exchange name — none of these three were searched before.
    const tokens = q.split(/\s+/).filter(Boolean);
    return allItems.filter((item) => {
      const searchable = [
        item.Symbol_DisplayName,
        item.Symbol,
        exchangeName(item.SecurityExchange),
      ].filter(Boolean).join(' ').toLowerCase();
      return tokens.every((t) => searchable.includes(t));
    });
  }, [allItems, query]);

  const toggleRow = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (next.size >= MAX_SUBSCRIPTIONS) return prev; // at cap — no-op
        next.add(key);
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const item of filtered) {
        if (next.size >= MAX_SUBSCRIPTIONS) break;
        next.add(rowKey(item));
      }
      return next;
    });
  };

  const clearAllFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      filtered.forEach((item) => next.delete(rowKey(item)));
      return next;
    });
  };

  const removeSelected = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const handleSubscribe = () => {
    const ids = [...selected];
    const slots = customCalcConfig?.slots || [];
    const affected = slots.filter((s) => s.subscriptionKey && !ids.includes(s.subscriptionKey));

    if (affected.length > 0) {
      setBlocked({ affected });
      return; // blocked entirely — nothing saves until Custom Live Calculations is cleared
    }

    saveSelectedSubscriptions(ids, port);
    subscribeSecurities(ids.map((key) => byKey[key]).filter(Boolean));
    onClose();
  };

  const itemCount = filtered.length;
  // scrollTop measures the whole scroll container, which now includes the
  // sticky header's own layout height — subtract it to get how far we've
  // scrolled into the rows specifically.
  const rowsScrollTop = Math.max(0, scrollTop - HEADER_HEIGHT);
  const startIndex = Math.max(0, Math.floor(rowsScrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(itemCount, Math.ceil((rowsScrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN);
  const visibleItems = filtered.slice(startIndex, endIndex);

  if (blocked) {
    return (
      <div style={overlay}>
        <div style={{ ...modal, width: '480px' }}>
          <div style={header}>
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#fff', letterSpacing: '0.2px' }}>
              Can't Remove — In Use
            </span>
          </div>
          <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '13px', color: C.text }}>
              The following Custom Live Calculations variables are using a subscription you're trying to remove:
            </div>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: C.text, lineHeight: 1.8 }}>
              {blocked.affected.map((slot) => (
                <li key={slot.id}><strong>{slot.name}</strong></li>
              ))}
            </ul>
            <div style={{ fontSize: '13px', color: C.muted }}>
              Open <strong>Custom Live Calculations</strong> and clear this data (there's a "Remove All" button there) before removing this subscription.
            </div>
          </div>
          <div style={footer}>
            <button onClick={() => setBlocked(null)} style={{
              fontSize: '13px', fontWeight: 700, color: '#fff',
              background: C.navy, border: 'none',
              borderRadius: '6px', padding: '8px 22px', cursor: 'pointer',
            }}>Got it</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modal}>

        {/* Header */}
        <div style={header}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#fff', letterSpacing: '0.2px' }}>
            Live Subscriptions
          </span>
          <button onClick={onClose} style={{
            fontSize: '22px', cursor: 'pointer', color: '#fff',
            background: 'none', border: 'none', lineHeight: 1, padding: '0 2px', opacity: 0.8,
          }}>×</button>
        </div>

        {/* Search + bulk actions */}
        <div style={{
          padding: '12px 20px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', gap: '10px', background: C.surface,
        }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search symbol..."
            style={{
              flex: 1, fontSize: '14px', color: C.text,
              border: `1px solid ${C.borderMid}`, borderRadius: '5px',
              padding: '7px 12px', outline: 'none', background: '#fff',
            }}
          />
          <button onClick={selectAllFiltered} style={{
            fontSize: '12px', fontWeight: 600, color: C.navy,
            background: '#fff', border: `1px solid ${C.borderMid}`,
            borderRadius: '5px', padding: '6px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            Select {query.trim() ? 'filtered' : 'all'}
          </button>
          <button onClick={clearAllFiltered} style={{
            fontSize: '12px', fontWeight: 600, color: C.muted,
            background: '#fff', border: `1px solid ${C.borderMid}`,
            borderRadius: '5px', padding: '6px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            Clear {query.trim() ? 'filtered' : 'all'}
          </button>
        </div>

        {/* Selected chips — a collective view of everything currently
            chosen, independent of search/scroll position in the list
            below. */}
        {selected.size > 0 && (
          <div style={{
            padding: '10px 20px', borderBottom: `1px solid ${C.border}`,
            display: 'flex', flexWrap: 'wrap', gap: '6px', background: C.surface,
          }}>
            {[...selected].map((key) => {
              const item = byKey[key];
              const label = item ? (item.Symbol_DisplayName || item.Symbol) : key;
              return (
                <span
                  key={key}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    padding: '3px 8px 3px 10px', borderRadius: '4px', fontSize: '12px',
                    fontWeight: 600, background: C.navy, color: '#fff',
                  }}
                >
                  {label}
                  <span
                    onClick={() => removeSelected(key)}
                    style={{ cursor: 'pointer', opacity: 0.7, fontSize: '13px', lineHeight: 1 }}
                    title="Remove"
                  >×</span>
                </span>
              );
            })}
          </div>
        )}

        {/* Header + rows share ONE scroll container, so there's only ever
            one scrollbar affecting both — alignment is guaranteed by
            construction rather than something to compensate for. */}
        <div
          ref={containerRef}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          style={{ flex: 1, overflowY: 'auto', position: 'relative', minHeight: '300px' }}
        >
          <div style={{
            position: 'sticky', top: 0, zIndex: 2,
            display: 'grid', gridTemplateColumns: COLUMN_TEMPLATE,
            paddingLeft: 20, paddingRight: 20, height: HEADER_HEIGHT,
            fontSize: '11px', fontWeight: 700, color: C.muted,
            textTransform: 'uppercase', letterSpacing: '0.5px',
            borderBottom: `2px solid ${C.borderMid}`, background: C.surface,
          }}>
            <div style={{ ...headCell, borderRight: 'none' }} />
            <div style={headCell}>Symbol</div>
            <div style={headCell}>Exchange</div>
            <div style={{ ...headCell, borderRight: 'none' }}>Expiry</div>
          </div>

          {itemCount === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', fontSize: '13px', color: C.mutedLight }}>
              No securities match "{query}"
            </div>
          ) : (
            <div style={{ height: itemCount * ROW_HEIGHT, position: 'relative' }}>
              {visibleItems.map((item, i) => {
                const key = rowKey(item);
                const isSelected = selected.has(key);
                return (
                  <div
                    key={key}
                    onClick={() => toggleRow(key)}
                    style={{
                      position: 'absolute', top: (startIndex + i) * ROW_HEIGHT, left: 0, right: 0,
                      height: ROW_HEIGHT, display: 'grid', gridTemplateColumns: COLUMN_TEMPLATE,
                      paddingLeft: 20, paddingRight: 20, cursor: 'pointer', fontSize: '13px', color: C.text,
                      background: isSelected ? C.rowSelected : 'transparent',
                      borderBottom: `1px solid ${C.border}`,
                    }}
                  >
                    <div style={{ ...bodyCell, borderRight: 'none' }}>
                      <input type="checkbox" checked={isSelected} readOnly style={{ cursor: 'pointer' }} />
                    </div>
                    <div style={{ ...bodyCell, fontWeight: 600 }}>
                      {item.Symbol_DisplayName || item.Symbol}
                    </div>
                    <div style={{ ...bodyCell, color: C.muted }}>
                      {exchangeName(item.SecurityExchange)}
                    </div>
                    <div style={{ ...bodyCell, color: C.muted, borderRight: 'none' }}>
                      {formatExpiry(item.DateOfExpiry)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={footer}>
          <span style={{ fontSize: '13px', color: selected.size >= MAX_SUBSCRIPTIONS ? '#e0291b' : C.muted, marginRight: 'auto' }}>
            {selected.size} / {MAX_SUBSCRIPTIONS} selected
            {selected.size >= MAX_SUBSCRIPTIONS ? ' — limit reached' : ''}
          </span>
          <button onClick={onClose} style={{
            fontSize: '13px', fontWeight: 600, color: C.muted,
            background: '#f3f4f6', border: `1px solid ${C.borderMid}`,
            borderRadius: '6px', padding: '8px 20px', cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleSubscribe} style={{
            fontSize: '13px', fontWeight: 700, color: '#fff',
            background: C.navy, border: 'none',
            borderRadius: '6px', padding: '8px 22px', cursor: 'pointer',
          }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}