import { useState, useMemo } from 'react';
import { useDataStore } from '../store/dataStore';

// Same exchange enum as SubscriptionsModal.jsx — MUST stay identical, since
// both files need to build the exact same key format for a given security.
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

// A row's unique identity — matches SubscriptionsModal's own keying, so the
// same security is never ambiguous between two exchanges. Uses the STRING
// exchange name, matching how the live LTP socket tick identifies
// securities — see SubscriptionsModal.jsx for the full explanation.
const rowKeyOf = (item) => `${item.SecurityId}_${exchangeName(item.SecurityExchange)}`;

export default function LtpTicker() {
  const selectedSubscriptions = useDataStore(s => s.selectedSubscriptions);
  const subscriptions = useDataStore(s => s.subscriptions);
  const LTP_Data = useDataStore(s => s.LTP_Data);
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

  // LTP_Data is the getLTP() snapshot fetched once at load — used as the
  // starting displayed price before any live tick has arrived for this
  // security. Field names here are SecurityId/Exchange/LTP, NOT the
  // SecurityExchange/OpenPrice-style naming the subscriptions list uses —
  // different source, different shape.
  const ltpDataByKey = useMemo(() => {
    const map = {};
    (LTP_Data || []).forEach((item) => {
      map[`${item.SecurityId}_${item.Exchange}`] = item.LTP;
    });
    return map;
  }, [LTP_Data]);

  // Display order IS selectedSubscriptions' own order — no separate order
  // field needed. Dragging a chip just rewrites this array's order.
  const items = (selectedSubscriptions || [])
    .map((key) => byKey[key])
    .filter(Boolean)
    .map((item) => {
      const key = rowKeyOf(item);
      return {
        key,
        symbol: item.Symbol_DisplayName || item.Symbol,
        openPrice: item.OpenPrice,
        initialLtp: ltpDataByKey[key],
      };
    });

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

  // Always occupy its half of the header (even when empty) so the 50/50
  // split with CustomCalcTicker stays stable regardless of content.
  if (items.length === 0) return <div style={{ width: '100%', minWidth: 0 }} />;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      overflowX: 'auto', width: '100%', minWidth: 0, padding: '0 14px',
    }}>
      {items.map(({ key, symbol, openPrice, initialLtp }) => {
        const tick = headerLtps?.[key];
        // Before any live tick arrives, show the getLTP() snapshot value.
        // Once a tick lands in headerLtps, that takes over from here on.
        const ltp = tick?.ltp ?? initialLtp ?? 0;
        // Color always compares the currently-displayed price against the
        // day's open price — regardless of whether that price came from
        // the initial snapshot or a live tick.
        const dir = (openPrice != null && ltp !== openPrice)
          ? (ltp > openPrice ? 'up' : 'down')
          : null;
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
              {ltp}
            </span>
          </div>
        );
      })}
    </div>
  );
}