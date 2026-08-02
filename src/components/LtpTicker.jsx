import { useState, useMemo } from 'react';
import { useDataStore } from '../store/dataStore';

// A row's unique identity — matches SubscriptionsModal's own keying, so the
// same security is never ambiguous between two exchanges.
const rowKeyOf = (item) => `${item.SecurityId}_${item.SecurityExchange}`;

export default function LtpTicker() {
  const selectedSubscriptions = useDataStore(s => s.selectedSubscriptions);
  const subscriptions = useDataStore(s => s.subscriptions);
  const headerLtps = useDataStore(s => s.headerLtps);
  const saveSelectedSubscriptions = useDataStore(s => s.saveSelectedSubscriptions);
  const port = window.location.port || '80';

  const [dragKey, setDragKey] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);

  const list = Array.isArray(subscriptions) ? subscriptions : (subscriptions?.getAllSubscriptionsResult || []);
  const byKey = useMemo(() => {
    const map = {};
    list.forEach((item) => { map[rowKeyOf(item)] = item; });
    return map;
  }, [list]);

  // Display order IS selectedSubscriptions' own order — no separate order
  // field needed. Dragging a chip just rewrites this array's order.
  const items = (selectedSubscriptions || [])
    .map((key) => byKey[key])
    .filter(Boolean)
    .map((item) => ({ key: rowKeyOf(item), symbol: item.Symbol_DisplayName || item.Symbol }));

  const handleDrop = (targetKey) => {
    setDragOverKey(null);
    if (!dragKey || dragKey === targetKey) { setDragKey(null); return; }
    const order = [...selectedSubscriptions];
    const fromIdx = order.indexOf(dragKey);
    const toIdx = order.indexOf(targetKey);
    setDragKey(null);
    if (fromIdx === -1 || toIdx === -1) return;
    order.splice(fromIdx, 1);
    order.splice(toIdx, 0, dragKey);
    saveSelectedSubscriptions(order, port);
  };

  // Always occupy the middle space (even when empty) so the header layout
  // doesn't shift depending on whether anything is subscribed.
  if (items.length === 0) return <div style={{ flex: 1, minWidth: 0 }} />;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      overflowX: 'auto', flex: 1, minWidth: 0, padding: '0 14px',
    }}>
      {items.map(({ key, symbol }) => {
        const tick = headerLtps?.[key];
        const ltp = tick?.ltp;
        const dir = tick?.dir; // 'up' | 'down' | null — set once live wiring lands
        const isDragOver = dragOverKey === key;
        const isDragging = dragKey === key;
        return (
          <div
            key={key}
            draggable
            onDragStart={() => setDragKey(key)}
            onDragOver={(e) => { e.preventDefault(); setDragOverKey(key); }}
            onDragLeave={() => setDragOverKey((k) => (k === key ? null : k))}
            onDrop={() => handleDrop(key)}
            onDragEnd={() => { setDragKey(null); setDragOverKey(null); }}
            title="Drag to reorder"
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '4px 10px', borderRadius: '5px', flexShrink: 0,
              background: isDragOver ? '#dde2ec' : '#f3f4f6',
              border: '1px solid #e5e7eb', cursor: 'grab', userSelect: 'none',
              opacity: isDragging ? 0.4 : 1,
              transition: 'background 0.1s',
            }}
          >
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>
              {symbol}
            </span>
            <span style={{
              fontSize: '14px', fontWeight: 600, fontVariantNumeric: 'tabular-nums',
              color: dir === 'up' ? '#0e9f5a' : dir === 'down' ? '#e0291b' : '#6b7280',
            }}>
              {ltp != null ? ltp : '0.00'}
            </span>
          </div>
        );
      })}
    </div>
  );
}