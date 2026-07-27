// src/components/PositionsGrid.jsx
import { useMemo, useState, useCallback, useRef, Fragment, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table';
import { useColumnPrefs } from '../hooks/useColumnPrefs';
import ColumnSettingsModal from './ColumnSettingsModal';
import GroupingModal from './GroupingModal';
import { useAuthStore } from '../store/authStore';
import { useDataStore } from '../store/dataStore';

// ─── Colors ───────────────────────────────────────────────────────────────────
// Brighter, higher-contrast palette — sharper pos/neg signal colors, deeper
// text/header contrast against white rows, tuned for fast scanning under
// time pressure rather than a quiet/muted aesthetic.
const C = {
  pos: '#0e9f5a',
  neg: '#e0291b',
  zero: '#6b7280',
  call: '#1f7ae0',
  put: '#e0291b',
  text: '#111827',
  muted: '#6b7280',
  headerBg: '#1a2340',
  headerBgAlt: '#1f2a4a',
  headerText: '#ffffff',
  headerTextDim: '#93a3c4',
  rowEven: '#ffffff',
  rowOdd: '#f9fafb',
  border: '#e5e7eb',
  borderStrong: '#d1d5db',
  badgeCall: '#dde9fb',
  badgeCallText: '#0c5fd0',
  badgePut: '#fbdfdc',
  badgePutText: '#e0291b',
  expandedBg: '#f8faff',
  expandedBorder: '#e0e7f0',
  cat1Bg: '#ffffff',
  cat1Text: '#0c0f17',
  cat2Bg: '#ffffff',
  cat2Text: '#0c0f17',
};

// Font sizes bumped up across the board for readability:
// data cells 11px → 13px, this is the primary "ease of readiness" lever.
const VAL = {
  pos: { fontSize: '16px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: C.pos },
  neg: { fontSize: '16px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: C.neg },
  zero: { fontSize: '16px', fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: C.zero },
  call: { fontSize: '16px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: C.call },
  put: { fontSize: '16px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: C.put },
};

const S = {
  wrapper: {
    width: '100%',
    height: '100%',
    overflow: 'auto',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    background: '#ffffff',
    scrollbarWidth: 'thin',
    scrollbarColor: '#c8cdd6 transparent',
  },
  toolbar: {
    display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
    padding: '3px 8px', borderBottom: `1px solid ${C.border}`,
    background: '#ffffff',
  },
  settingsBtn: {
    display: 'flex', alignItems: 'center', gap: '8px',
    fontSize: '14px', fontWeight: 700, color: C.headerText,
    background: C.headerBg, border: `1px solid ${C.headerBg}`, borderRadius: '4px',
    padding: '4px 9px', cursor: 'pointer',
  },
  table: { width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' },
  th: {
    padding: '6px 9px', textAlign: 'center',
    background: C.headerBg, color: C.headerText,
    fontSize: '14px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase',
    borderBottom: `2px solid ${C.borderStrong}`, borderRight: `1px solid rgba(255,255,255,0.08)`,
    whiteSpace: 'nowrap', userSelect: 'none',
    height: '34px', boxSizing: 'border-box',
  },
  thUser: {
    padding: '6px 9px', textAlign: 'left',
    background: C.headerBg, color: C.headerText,
    fontSize: '14px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase',
    borderBottom: `1px solid ${C.border}`, borderRight: `1px solid rgba(255,255,255,0.08)`,
    whiteSpace: 'nowrap', userSelect: 'none',
    height: '34px', boxSizing: 'border-box',
  },
  thGrouped: { borderRight: `1px solid rgba(255,255,255,0.08)` },
  subTh: {
    padding: '2px 6px', background: C.headerBgAlt,
    borderBottom: `1px solid ${C.border}`,
    borderRight: `1px solid rgba(255,255,255,0.08)`,
    height: '22px', boxSizing: 'border-box',
  },
  subThGrouped: { borderRight: `1px solid rgba(255,255,255,0.08)` },
  subLabel: { display: 'flex', justifyContent: 'space-between', gap: '4px' },
  subC: { flex: 1, textAlign: 'center', fontSize: '14px', fontWeight: 700, color: C.call },
  subP: { flex: 1, textAlign: 'center', fontSize: '14px', fontWeight: 700, color: C.put },
  tdBase: {
    padding: '5px 5px',
    borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`,
    overflow: 'hidden', verticalAlign: 'middle',
  },
  tdGrouped: { borderRight: `1px solid ${C.border}` },
  tdUserBase: {
    padding: '5px 5px',
    borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle',
  },
  tdClickable: { cursor: 'pointer' },
  pairInner: { display: 'flex', alignItems: 'center', gap: '2px' },
  pairSide: { flex: 1, textAlign: 'center' },
  pairDivider: { width: '1px', height: '15px', backgroundColor: C.border, flexShrink: 0 },
  userText: { fontSize: '14px', fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' },
  center: { textAlign: 'center' },
  empty: { padding: '64px 0', textAlign: 'center', color: C.muted, fontSize: '14px' },
};

const ROW_BG = [{ background: C.rowEven }, { background: C.rowOdd }];

const CLICKABLE = new Set([
  'niftyFut', 'bnfFut',
  'w', 'w1', 'w2', 'w3', 'w4', 'w5',
  'totalOpts', 'stocks',
  'nseMargin', 'bseMargin', 'ifscMargin', 'totalMargin', 'nseMaxMargin',
]);

// ─── Inject scrollbar styles once at module load ──────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('positions-scrollbar-style')) {
  const _style = document.createElement('style');
  _style.id = 'positions-scrollbar-style';
  _style.textContent = `
    .positions-wrapper::-webkit-scrollbar { height: 6px; width: 6px; }
    .positions-wrapper::-webkit-scrollbar-track { background: transparent; }
    .positions-wrapper::-webkit-scrollbar-thumb { background-color: #c8cdd6; border-radius: 999px; }
    .positions-wrapper::-webkit-scrollbar-thumb:hover { background-color: #aab2c2; }
    th:hover .sort-icon-hidden { opacity: 0.4 !important; }
  `;
  document.head.appendChild(_style);
}

const BUCKET_KEYS = {
  niftyFut: ['niftyFut'],
  bnfFut: ['bnfFut'],
  w: ['cw', 'pw'],
  w1: ['cw1', 'pw1'],
  w2: ['cw2', 'pw2'],
  w3: ['cw3', 'pw3'],
  w4: ['cw4', 'pw4'],
  w5: ['cw5', 'pw5'],
  totalOpts: ['cw','pw','cw1','pw1','cw2','pw2','cw3','pw3','cw4','pw4','cw5','pw5'],
  stocks: ['stocks'],
};

const getWeekKey = (symbol) => {
  const suffix = symbol.slice(-2);
  return /^W[1-5]$/.test(suffix) ? suffix.toLowerCase() : 'w';
};

const getTradeBucketKey = (trade) => {
  const { SecurityType, Optiontype, Symbol, SecurityExchange } = trade;
  if (SecurityType === 'FUT') {
    if (SecurityExchange === 'IFSC') return 'stocks';
    if (Symbol === 'NIFTY') return 'niftyFut';
    if (Symbol === 'BANKNIFTY') return 'bnfFut';
    return 'stocks';
  }
  if (SecurityType === 'OPT') {
    const week = getWeekKey(Symbol);
    if (Optiontype === 'CE') return `c${week}`;
    if (Optiontype === 'PE') return `p${week}`;
  }
  return 'stocks';
};

const fmtQty   = (v) => v === 0 ? '' : fmtNum(v);
const fmtPrice = (v) => v === 0 ? '' : fmtNum(v.toFixed(2));

const fmtNum = (v) => {
  if (v === '' || v === '—' || v === null || v === undefined) return v;
  const str = String(v);
  const neg = str[0] === '-';
  const abs = neg ? str.slice(1) : str;
  const [intPart, decPart] = abs.split('.');
  let fmt;
  if (intPart.length <= 3) {
    fmt = intPart;
  } else {
    const last3 = intPart.slice(-3);
    const rest  = intPart.slice(0, -3);
    fmt = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }
  return (neg ? '-' : '') + fmt + (decPart !== undefined ? '.' + decPart : '');
};

const fmtExp = (v) => {
  if (!v) return '—';
  const s = v.toString();
  return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
};

// ─── Expanded trade detail row ────────────────────────────────────────────────
const ExpandedRow = ({ trades, colId, onClose, onRefresh, totalCols }) => {
  const colMap = ['Symbol', 'Expiry', 'Net Pos', 'LTP', 'PnL (L)', 'MTM (L)', 'SOD Qty', 'SOD Price', 'Intra Qty', 'Intra Price'];

  const ptd = {
    padding: '4px 12px', textAlign: 'center', color: C.muted,
    borderRight: `1px solid ${C.expandedBorder}`,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontSize: '14px',
  };

  return (
    <tr>
      <td colSpan={totalCols} style={{
        padding: 0, background: C.expandedBg,
        borderBottom: `2px solid ${C.expandedBorder}`,
        borderTop: `1px solid ${C.expandedBorder}`,
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '5px 12px', background: '#e7eefb',
          borderBottom: `1px solid ${C.expandedBorder}`,
        }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: C.text, letterSpacing: '0.2px' }}>
            {colId.toUpperCase()} — Trade Breakdown
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={onRefresh} style={{
              fontSize: '11px', fontWeight: 600, color: '#1a2340',
              background: '#dbe6f9', border: '1px solid #b3c8ee',
              borderRadius: '4px', padding: '2px 8px', cursor: 'pointer',
            }}>⟳</button>
            <span onClick={onClose} style={{
              fontSize: '17px', lineHeight: 1, cursor: 'pointer',
              color: C.muted, userSelect: 'none', padding: '0 4px',
            }}>×</span>
          </div>
        </div>

        {trades.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: C.muted, fontSize: '13px' }}>
            No trades in this bucket.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#e7eefb' }}>
                {colMap.map((h) => (
                  <th key={h} style={{
                    padding: '4px 12px', textAlign: 'center',
                    fontSize: '12px', fontWeight: 700, color: C.text,
                    letterSpacing: '0.5px', textTransform: 'uppercase',
                    borderBottom: `1px solid ${C.expandedBorder}`,
                    borderRight: `1px solid ${C.expandedBorder}`,
                    whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trades.map((trade, i) => {
                const pnl = trade.Pnl || 0;
                const mtm = trade.MTM || 0;
                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? C.expandedBg : '#eef3fc' }}>
                    <td style={{ ...ptd, color: C.text, fontWeight: 600 }} title={trade.Symbol}>
                      {trade.Symbol}
                    </td>
                    <td style={ptd}>{fmtExp(trade.Expiry)}</td>
                    <td style={{ ...ptd, color: trade.NetPos > 0 ? C.pos : trade.NetPos < 0 ? C.neg : C.zero, fontWeight: 600 }}>
                      {fmtQty(trade.NetPos)}
                    </td>
                    <td style={{ ...ptd, color: C.text }}>
                      {fmtNum(trade.Ltp || 0)}
                    </td>
                    <td style={{ ...ptd, color: pnl > 0 ? C.pos : pnl < 0 ? C.neg : C.zero }}>
                      {pnl === 0 ? '—' : fmtNum((pnl / 100000).toFixed(2))}
                    </td>
                    <td style={{ ...ptd, color: mtm > 0 ? C.pos : mtm < 0 ? C.neg : C.zero }}>
                      {mtm === 0 ? '—' : fmtNum((mtm / 100000).toFixed(2))}
                    </td>
                    <td style={ptd}>{fmtQty(trade.SOD_Qty)}</td>
                    <td style={ptd}>{fmtPrice(trade.SOD_Price)}</td>
                    <td style={ptd}>{fmtQty(trade.IntraQty)}</td>
                    <td style={ptd}>{fmtPrice(trade.IntraPrice)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </td>
    </tr>
  );
};

// ─── Margin breakdown row ─────────────────────────────────────────────────────
const MARGIN_EXCH_FILTER = {
  nseMargin:    (e) => e.exch === 'NSEFO',
  nseMaxMargin: (e) => e.exch === 'NSEFO',
  bseMargin:    (e) => e.exch === 'BSEED',
  ifscMargin:   (e) => e.exch === 'IFSC',
  totalMargin:  (e) => true,
};

const MarginExpandedRow = ({ pos, colId, onClose, totalCols, referenceRate }) => {
  const entries = (pos.spanEntries || []).filter(MARGIN_EXCH_FILTER[colId] || (() => true));
  const premiumBuy = pos.premiumBuy || 0;
  const showPremium = colId === 'totalMargin';

  const headers = ['Client Code', 'Exchange', 'Span', 'Exposure', 'Total', 'Peak',
    ...(showPremium ? ['Premium Buy'] : [])
  ];

  const ptd = {
    padding: '4px 12px', textAlign: 'center', color: C.muted,
    borderRight: `1px solid ${C.expandedBorder}`,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontSize: '14px',
  };
  const ptdL = { ...ptd, textAlign: 'left', color: C.text };
  const ptdR = { ...ptd, textAlign: 'right' };

  const fmt = (v) => v === 0 ? '—' : fmtNum((v / 100000).toFixed(2));

  const totSpan     = entries.reduce((s, e) => s + (e.spanMargin     || 0), 0);
  const totExposure = entries.reduce((s, e) => s + (e.exposureMargin || 0), 0);
  const totTotal    = entries.reduce((s, e) => s + (e.totalMargin    || 0), 0);
  const totPeak     = entries.reduce((s, e) => s + (e.maxMargin      || 0), 0);

  return (
    <tr>
      <td colSpan={totalCols} style={{
        padding: 0, background: C.expandedBg,
        borderBottom: `2px solid ${C.expandedBorder}`,
        borderTop: `1px solid ${C.expandedBorder}`,
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '5px 12px', background: '#e7eefb',
          borderBottom: `1px solid ${C.expandedBorder}`,
        }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: C.text, letterSpacing: '0.2px' }}>
            Margin Breakdown
          </span>
          <span onClick={onClose} style={{
            fontSize: '17px', lineHeight: 1, cursor: 'pointer',
            color: C.muted, userSelect: 'none', padding: '0 4px',
          }}>×</span>
        </div>

        {entries.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: C.muted, fontSize: '13px' }}>
            No margin data.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '180px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '120px' }} />
              {showPremium && <col style={{ width: '140px' }} />}
            </colgroup>
            <thead>
              <tr style={{ background: '#e7eefb' }}>
                {headers.map(h => (
                  <th key={h} style={{
                    padding: '4px 12px',
                    textAlign: 'left',
                    fontSize: '12px', fontWeight: 700, color: C.text,
                    letterSpacing: '0.5px', textTransform: 'uppercase',
                    borderBottom: `1px solid ${C.expandedBorder}`,
                    borderRight: `1px solid ${C.expandedBorder}`,
                    whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? C.expandedBg : '#eef3fc' }}>
                  <td style={ptdL}>{e.ctcl}</td>
                  <td style={ptdL}>{e.exch}</td>
                  <td style={ptdL}>{fmt(e.spanMargin || 0)}</td>
                  <td style={ptdL}>{fmt(e.exposureMargin || 0)}</td>
                  <td style={ptdL}>{fmt(e.totalMargin || 0)}</td>
                  <td style={ptdL}>{fmt(e.maxMargin || 0)}</td>
                  {showPremium && <td style={ptdL}>—</td>}
                </tr>
              ))}
              {showPremium && premiumBuy > 0 && (
                <tr style={{ background: '#eef3fc' }}>
                  <td style={ptdL}>Premium Buy</td>
                  <td style={ptdL}>—</td>
                  <td style={ptdL}>—</td>
                  <td style={ptdL}>—</td>
                  <td style={ptdL}>—</td>
                  <td style={ptdL}>—</td>
                  <td style={ptdL}>{fmt(premiumBuy)}</td>
                </tr>
              )}
              <tr style={{ background: '#dce6f8' }}>
                <td style={{ ...ptdL, fontWeight: 700 }}>Total</td>
                <td style={{ ...ptdL, fontWeight: 700 }}>—</td>
                <td style={{ ...ptdL, fontWeight: 700, color: C.text }}>{fmt(totSpan)}</td>
                <td style={{ ...ptdL, fontWeight: 700, color: C.text }}>{fmt(totExposure)}</td>
                <td style={{ ...ptdL, fontWeight: 700, color: C.text }}>{fmt(totTotal)}</td>
                <td style={{ ...ptdL, fontWeight: 700, color: C.text }}>{fmt(totPeak)}</td>
                {showPremium && (
                  <td style={{ ...ptdL, fontWeight: 700, color: C.text }}>{fmt(premiumBuy)}</td>
                )}
              </tr>
            </tbody>
          </table>
        )}
      </td>
    </tr>
  );
};

// ─── Value helpers ────────────────────────────────────────────────────────────
const resolveValKey = (v) => v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero';
const numVal = (v) => ({ display: v === 0 ? '—' : v, styleKey: resolveValKey(v) });
const decimalVal = (v) => ({ display: v === 0 ? '—' : fmtNum((v / 100000).toFixed(2)), styleKey: resolveValKey(v) });
const pairVal = (c, p) => ({
  cDisplay: c === 0 ? '—' : fmtNum(c),
  pDisplay: p === 0 ? '—' : fmtNum(p),
  cStyleKey: c === 0 ? 'zero' : 'call',
  pStyleKey: p === 0 ? 'zero' : 'put',
});
// Margin values displayed in lakhs (÷100000), always non-negative
const marginVal = (v) => ({ display: v === 0 ? '' : fmtNum((v / 100000).toFixed(2)), styleKey: v === 0 ? 'zero' : 'pos' });

// ─── Cell renderers ───────────────────────────────────────────────────────────
const NumCell = ({ display, styleKey, dark }) => (
  <div style={S.center}>
    <span style={{ ...VAL[styleKey], ...(dark && styleKey === 'zero' ? { color: '#93a3c4' } : {}) }}>
      {display}
    </span>
  </div>
);
const PairCell = ({ cDisplay, pDisplay, cStyleKey, pStyleKey }) => (
  <div style={S.pairInner}>
    <div style={S.pairSide}><span style={VAL[cStyleKey]}>{cDisplay}</span></div>
    <div style={S.pairDivider} />
    <div style={S.pairSide}><span style={VAL[pStyleKey]}>{pDisplay}</span></div>
  </div>
);
const MarginCell = ({ display, styleKey, dark }) => (
  <div style={S.center}>
    <span style={{ ...VAL[styleKey], color: dark ? '#ffffff' : '#0c0f17' }}>{display}</span>
  </div>
);

// ─── Column definitions ───────────────────────────────────────────────────────
// NOTE: 'user' is always rendered first and is never hideable/reorderable —
// it is handled separately from the configurable column list below.
const USER_COLUMN = {
  id: 'user', accessorKey: 'user', header: 'User', isPaired: false, size: 120,
  cell: ({ getValue }) => <span style={S.userText}>{getValue()}</span>,
};

// 'stocks' (displayed as "Others") is listed first here so it appears at the
// front of the grid by default. Users can still reorder freely afterward —
// this only sets the out-of-the-box default via DEFAULT_COLUMN_ORDER below.
const COLUMNS = [
  {
    id: 'stocks', accessorKey: 'stocks', header: 'Others', isPaired: false, size: 75,
    cell: ({ getValue }) => { const v = getValue(); return <NumCell display={v.display} styleKey={v.styleKey} />; }
  },
  {
    id: 'niftyFut', accessorKey: 'niftyFut', header: 'Nifty Fut', isPaired: false, size: 75,
    cell: ({ getValue }) => { const v = getValue(); return <NumCell display={v.display} styleKey={v.styleKey} />; }
  },
  {
    id: 'bnfFut', accessorKey: 'bnfFut', header: 'BNF Fut', isPaired: false, size: 75,
    cell: ({ getValue }) => { const v = getValue(); return <NumCell display={v.display} styleKey={v.styleKey} />; }
  },
  { id: 'w', accessorKey: 'w', header: 'W', isPaired: true, size: 90, cell: ({ getValue }) => <PairCell {...getValue()} /> },
  { id: 'w1', accessorKey: 'w1', header: 'W1', isPaired: true, size: 90, cell: ({ getValue }) => <PairCell {...getValue()} /> },
  { id: 'w2', accessorKey: 'w2', header: 'W2', isPaired: true, size: 90, cell: ({ getValue }) => <PairCell {...getValue()} /> },
  { id: 'w3', accessorKey: 'w3', header: 'W3', isPaired: true, size: 90, cell: ({ getValue }) => <PairCell {...getValue()} /> },
  { id: 'w4', accessorKey: 'w4', header: 'W4', isPaired: true, size: 90, cell: ({ getValue }) => <PairCell {...getValue()} /> },
  { id: 'w5', accessorKey: 'w5', header: 'W5', isPaired: true, size: 90, cell: ({ getValue }) => <PairCell {...getValue()} /> },
  { id: 'totalOpts', accessorKey: 'totalOpts', header: 'Total W', isPaired: true, size: 88, cell: ({ getValue }) => <PairCell {...getValue()} /> },
  {
    id: 'pnl', accessorKey: 'pnl', header: 'PnL (L)', isPaired: false, size: 90,
    cell: ({ getValue }) => { const v = getValue(); return <NumCell display={v.display} styleKey={v.styleKey} />; }
  },
  {
    id: 'cumPnl', accessorKey: 'cumPnl', header: 'Cum PnL (L)', isPaired: false, size: 100,
    cell: ({ getValue }) => { const v = getValue(); return <NumCell display={v.display} styleKey={v.styleKey} />; }
  },
  { id: 'mtm', accessorKey: 'mtm', header: 'MTM (L)', isPaired: false, size: 80,
    cell: ({ getValue }) => { const v = getValue(); return <NumCell display={v.display} styleKey={v.styleKey} />; } },
  { id: 'nseMtm', accessorKey: 'nseMtm', header: 'NSE MTM (L)', isPaired: false, size: 90,
    cell: ({ getValue }) => { const v = getValue(); return <NumCell display={v.display} styleKey={v.styleKey} />; } },
  { id: 'othersMtm', accessorKey: 'othersMtm', header: 'Others MTM (L)', isPaired: false, size: 100,
    cell: ({ getValue }) => { const v = getValue(); return <NumCell display={v.display} styleKey={v.styleKey} />; } },
  // ── Margin columns ─────────────────────────────────────────────────────────
  {
    id: 'nseMargin', accessorKey: 'nseMargin', header: 'NSE Margin', isPaired: false, size: 100,
    cell: ({ getValue }) => { const v = getValue(); return <MarginCell display={v.display} styleKey={v.styleKey} />; }
  },
  {
    id: 'totalMargin', accessorKey: 'totalMargin', header: 'Total Margin (P)', isPaired: false, size: 110,
    cell: ({ getValue }) => { const v = getValue(); return <MarginCell display={v.display} styleKey={v.styleKey} />; }
  },
  {
    id: 'bseMargin', accessorKey: 'bseMargin', header: 'BSE Margin', isPaired: false, size: 100,
    cell: ({ getValue }) => { const v = getValue(); return <MarginCell display={v.display} styleKey={v.styleKey} />; }
  },
  {
    id: 'ifscMargin', accessorKey: 'ifscMargin', header: 'IFSC Margin', isPaired: false, size: 100,
    cell: ({ getValue }) => { const v = getValue(); return <MarginCell display={v.display} styleKey={v.styleKey} />; }
  },
  {
    id: 'nseMaxMargin', accessorKey: 'nseMaxMargin', header: 'Peak Margin', isPaired: false, size: 120,
    cell: ({ getValue }) => { const v = getValue(); return <MarginCell display={v.display} styleKey={v.styleKey} />; }
  },
];

const DEFAULT_COLUMN_ORDER = COLUMNS.map((c) => c.id);

// ─── Aggregate helper — sums numeric bucket fields across an array of pos ────
const aggregateBuckets = (posList) => {
  const sum = {
    niftyFut: 0, bnfFut: 0, totalC: 0, totalP: 0,
    cw: 0, cw1: 0, cw2: 0, cw3: 0, cw4: 0, cw5: 0,
    pw: 0, pw1: 0, pw2: 0, pw3: 0, pw4: 0, pw5: 0,
    stocks: 0, pnl: 0, cumPnl: 0, mtm: 0, nseMtm: 0, othersMtm: 0,
    nseMargin: 0, totalMargin: 0, bseMargin: 0, ifscMargin: 0, nseMaxMargin: 0,
  };
  for (const pos of posList) {
    sum.niftyFut += pos.niftyFut || 0;
    sum.bnfFut += pos.bnfFut || 0;
    sum.totalC += pos.totalC || 0; 
    sum.totalP += pos.totalP || 0;
    sum.cw += pos.cw || 0;
    sum.cw1 += pos.cw1 || 0;
    sum.cw2 += pos.cw2 || 0;
    sum.cw3 += pos.cw3 || 0;
    sum.cw4 += pos.cw4 || 0;
    sum.cw5 += pos.cw5 || 0;
    sum.pw += pos.pw || 0;
    sum.pw1 += pos.pw1 || 0;
    sum.pw2 += pos.pw2 || 0;
    sum.pw3 += pos.pw3 || 0;
    sum.pw4 += pos.pw4 || 0;
    sum.pw5 += pos.pw5 || 0;
    sum.stocks += pos.stocks || 0;
    // PnL/MTM — sum from tradesMap
    for (const trade of Object.values(pos.tradesMap || {})) {
      sum.pnl    += trade.Pnl    || 0;
      sum.cumPnl += trade.cumPnl || 0;
      sum.mtm    += trade.MTM    || 0;
      if (trade.SecurityExchange === 'NSEFO') {
        sum.nseMtm += trade.MTM || 0;
      } else {
        sum.othersMtm += trade.MTM || 0;
      }
    }
    // Margin — sum directly from position-level fields set by updateSpanMargin
    sum.nseMargin    += pos.nseMarginAbs  || 0;
    sum.totalMargin  += pos.totalMargin   || 0;
    sum.bseMargin    += pos.bseMarginAbs  || 0;
    sum.ifscMargin   += pos.ifscMarginAbs || 0;
    sum.nseMaxMargin += pos.nseMarginMax  || 0;
  }
  return sum;
};

// ─── Convert aggregate sums to display values ─────────────────────────────────
const aggNumVal = (v) => ({ display: v === 0 ? '' : fmtNum(v), styleKey: v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero' });
const aggPairVal = (c, p) => ({
  cDisplay: c === 0 ? '' : fmtNum(c),
  pDisplay: p === 0 ? '' : fmtNum(p),
  cStyleKey: c === 0 ? 'zero' : 'call',
  pStyleKey: p === 0 ? 'zero' : 'put',
});

const aggToRow = (agg) => ({
  niftyFut: aggNumVal(agg.niftyFut),
  bnfFut: aggNumVal(agg.bnfFut),
  totalOpts: aggPairVal(agg.totalC, agg.totalP),
  w: aggPairVal(agg.cw, agg.pw),
  w1: aggPairVal(agg.cw1, agg.pw1),
  w2: aggPairVal(agg.cw2, agg.pw2),
  w3: aggPairVal(agg.cw3, agg.pw3),
  w4: aggPairVal(agg.cw4, agg.pw4),
  w5: aggPairVal(agg.cw5, agg.pw5),
  stocks: aggNumVal(agg.stocks),
  pnl: decimalVal(agg.pnl),
  cumPnl: decimalVal(agg.cumPnl),
  mtm:       decimalVal(agg.mtm),
  nseMtm:    decimalVal(agg.nseMtm),
  othersMtm: decimalVal(agg.othersMtm),
  nseMargin:    marginVal(agg.nseMargin),
  totalMargin:  marginVal(agg.totalMargin),
  bseMargin:    marginVal(agg.bseMargin),
  ifscMargin:   marginVal(agg.ifscMargin),
  nseMaxMargin: marginVal(agg.nseMaxMargin),
});

// ─── Group row — Category1 or Category2 ──────────────────────────────────────
const GroupRow = ({ label, level, isExpanded, onToggle, aggRow, columns }) => {
  const bg = level === 1 ? C.cat1Bg : C.cat2Bg;
  const textClr = level === 1 ? C.cat1Text : C.cat2Text;
  const indent = level === 1 ? 0 : 16;
  const fontSize = level === 1 ? '14px' : '14px';
  const fontW = level === 1 ? 700 : 700;

  return (
    <tr
      onClick={onToggle}
      style={{ background: bg, cursor: 'pointer', userSelect: 'none' }}
    >
      {columns.map((col, i) => {
        const isUserCol = col.id === 'user';
        const isPaired = col.isPaired;

        const tdStyle = {
          ...(isUserCol ? S.tdUserBase : S.tdBase),
          ...(isPaired ? S.tdGrouped : {}),
          background: bg,
          borderBottom: `1px solid ${C.border}`,
        };

        if (isUserCol) {
          return (
            <td key={col.id} style={tdStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: indent }}>
               <span style={{
                  fontSize: '11px', color: textClr,
                  transition: 'transform 0.15s',
                  display: 'inline-block',
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                }}>▶</span>
                <span style={{ fontSize, fontWeight: fontW, color: textClr }}>
                  {label}
                </span>
              </div>
            </td>
          );
        }

        // Render aggregated value for this column
        const val = aggRow[col.id];
        if (!val) return <td key={col.id} style={tdStyle} />;

        const isMarginCol = ['nseMargin', 'totalMargin', 'bseMargin', 'ifscMargin', 'nseMaxMargin'].includes(col.id);
        return (
          <td key={col.id} style={tdStyle}>
            {isPaired
              ? <PairCell {...val} />
              : isMarginCol
                ? <MarginCell display={val.display} styleKey={val.styleKey} />
                : <NumCell display={val.display} styleKey={val.styleKey} />
            }
          </td>
        );
      })}
    </tr>
  );
};

// ─── Build grouped structure from positions ───────────────────────────────────
const buildGroups = (positions, customGroups) => {
  if (!customGroups || customGroups.length === 0) return null;

  const assignedUsers = new Set();
  const result = [];

  for (const group of customGroups) {
    const cat2Groups = [];

    const directKeys = (group.directUsers || []).filter(u => positions[u]);
    directKeys.forEach(u => assignedUsers.add(u));
    if (directKeys.length > 0) {
      cat2Groups.push({ cat2: '', userKeys: directKeys });
    }

    for (const sg of group.subGroups || []) {
      const sgKeys = (sg.users || []).filter(u => positions[u]);
      sgKeys.forEach(u => assignedUsers.add(u));
      if (sgKeys.length > 0) {
        cat2Groups.push({ cat2: sg.name || '', userKeys: sgKeys });
      }
    }

    const allUserKeys = cat2Groups.flatMap(sg => sg.userKeys);
    if (allUserKeys.length > 0) {
      result.push({ cat1: group.name, cat2Groups, allUserKeys });
    }
  }

  const unassignedKeys = Object.keys(positions)
    .filter(u => !assignedUsers.has(u))
    .sort();

  if (unassignedKeys.length > 0) {
    result.push({
      cat1: 'Unassigned',
      cat2Groups: [{ cat2: '', userKeys: unassignedKeys }],
      allUserKeys: unassignedKeys,
    });
  }

  return result;
};

// ─── Main component ───────────────────────────────────────────────────────────
import { forwardRef, useImperativeHandle } from 'react';

const PositionsGrid = forwardRef(function PositionsGrid({ positions }, ref) {
  useImperativeHandle(ref, () => ({
    openColumns:  () => { setSettingsOpen(true); },
    openGrouping: () => { setGroupingOpen(true); },
  }));
  // expanded state — sets of expanded cat1 and cat2 keys
  // default: all collapsed
  const [expandedCat1, setExpandedCat1] = useState(new Set());
  const [expandedCat2, setExpandedCat2] = useState(new Set());

  const toggleCat2 = useCallback((cat1, cat2) => {
    const key = `${cat1}:::${cat2}`;
    setExpandedCat2(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
    setExpanded(null);
  }, []);

  // trade breakdown popup state
  const [expanded, setExpanded] = useState(null);

  // ── Logged-in viewer identity — column prefs are a per-VIEWER display ────
  // setting (which columns this person likes to see on their own screen),
  // not tied to any individual risk-user row rendered inside the grid.
  // Scoping the localStorage key to this viewer means two different people
  // using the same browser/profile never share or clobber each other's
  // column setup.
  const viewerUser = useAuthStore((state) => state.user);

  // column visibility/order — persisted to localStorage, namespaced by viewerUser
  const {
    order: colOrder,
    hidden: hiddenCols,
    toggleVisibility,
    reorder,
    resetToDefault,
    loaded: prefsLoaded,
  } = useColumnPrefs(DEFAULT_COLUMN_ORDER, viewerUser);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [groupingOpen, setGroupingOpen] = useState(false);

  // ── Column resizing ──────────────────────────────────────────────────────────
  const defaultColWidths = useMemo(() => {
    const map = { user: USER_COLUMN.size };
    COLUMNS.forEach(c => { map[c.id] = c.size; });
    return map;
  }, []);

  const [colWidths, setColWidths] = useState(defaultColWidths);
  const resizingRef = useRef(null);

  // ── Sorting ────────────────────────────────────────────────────────────────
  const [sortState, setSortState] = useState({ colId: null, dir: null });
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);
  // dir: 'asc' | 'desc' | null

  const toggleSort = useCallback((colId) => {
    setSortState(prev => {
      if (prev.colId !== colId) return { colId, dir: 'asc' };
      if (prev.dir === 'asc')  return { colId, dir: 'desc' };
      return { colId: null, dir: null };
    });
  }, []);

  const onResizeMouseDown = useCallback((e, colId) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = colWidths[colId];
    const minW   = colId === 'user' ? 60 : colId.startsWith('w') && colId.length <= 3 ? 50 : 50;

    const onMove = (me) => {
      const newW = Math.max(minW, startW + (me.clientX - startX));
      setColWidths(prev => ({ ...prev, [colId]: newW }));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      resizingRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    resizingRef.current = colId;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [colWidths]);

  // Grouping config — persisted to localStorage per viewer
  const customGroupingFromStore   = useDataStore(s => s.customGrouping);
  const referenceRate             = useDataStore(s => s.referenceRate);
  const saveCustomGroupingToStore = useDataStore(state => state.saveCustomGrouping);
  const port = window.location.port || '80';

  const [customGroups, setCustomGroups] = useState([]);

  useEffect(() => {
    setCustomGroups(customGroupingFromStore || []);
  }, [customGroupingFromStore]);

  const saveCustomGroups = (groups) => {
    setCustomGroups(groups);
    saveCustomGroupingToStore(groups, port);
    setGroupingOpen(false);
  };

  // Final column list actually rendered: User pinned first, then the
  // viewer's configured order, filtered to exclude hidden columns.
  const visibleColDefs = useMemo(() => {
    const byId = new Map(COLUMNS.map((c) => [c.id, c]));
    const rest = colOrder
      .filter((id) => !hiddenCols.has(id))
      .map((id) => byId.get(id))
      .filter(Boolean);
    return [USER_COLUMN, ...rest];
  }, [colOrder, hiddenCols]);

  const totalCols = visibleColDefs.length;

  const toggleCat1 = useCallback((cat1) => {
    setExpandedCat1((prev) => {
      const next = new Set(prev);
      next.has(cat1) ? next.delete(cat1) : next.add(cat1);
      return next;
    });
    setExpanded(null);
  }, []);

  const MARGIN_COLS = new Set(['nseMargin','bseMargin','ifscMargin','totalMargin','nseMaxMargin']);

  const handleCellClick = useCallback((colId, userKey, pos) => {
    if (!CLICKABLE.has(colId)) return;
    if (!pos) return;

    // Margin column — show margin breakdown
    if (MARGIN_COLS.has(colId)) {
      setExpanded(prev =>
        prev && prev.colId === colId && prev.userKey === userKey
          ? null
          : { userKey, colId, type: 'margin', pos }
      );
      return;
    }

    // Trade bucket column
    const bucketKeys = BUCKET_KEYS[colId];
    if (!bucketKeys) return;
    setExpanded(prev => {
      if (prev && prev.colId === colId && prev.userKey === userKey) return null;
      const trades = Object.values(pos.tradesMap).filter(t =>
        bucketKeys.includes(getTradeBucketKey(t)) &&
        (t.NetPos !== 0 || t.SOD_Qty !== 0 || t.IntraQty !== 0)
      );
      trades.sort((a,b) => {
        const ac = a.Optiontype==='CE'?0:1, bc = b.Optiontype==='CE'?0:1;
        if (ac!==bc) return ac-bc;
        return (a.Symbol||'').localeCompare(b.Symbol||'');
      });
      return { userKey, colId, type: 'trade', trades };
    });
  }, []);

  const closeExpanded = useCallback(() => setExpanded(null), []);

  const refreshExpanded = useCallback(() => {
    const livePositions = useDataStore.getState().positions;
    setExpanded(prev => {
      if (!prev || prev.type !== 'trade') return prev;
      const pos = livePositions[prev.userKey];
      if (!pos) return prev;
      const bucketKeys = BUCKET_KEYS[prev.colId] || [];
      const trades = Object.values(pos.tradesMap).filter(t =>
        bucketKeys.includes(getTradeBucketKey(t)) &&
        (t.NetPos !== 0 || t.SOD_Qty !== 0 || t.IntraQty !== 0)
      ).sort((a, b) => {
        const ac = a.Optiontype === 'CE' ? 0 : 1, bc = b.Optiontype === 'CE' ? 0 : 1;
        if (ac !== bc) return ac - bc;
        return (a.Symbol || '').localeCompare(b.Symbol || '');
      });
      return { ...prev, trades };
    });
  }, []);

  const groups = useMemo(() => buildGroups(positions, customGroups), [positions, customGroups]);

  const allUserKeys = useMemo(() => Object.keys(positions).sort(), [positions]);

  if (!Object.keys(positions).length) {
    return <div style={S.empty}>No positions to display.</div>;
  }

  // User row data builder
  const buildUserRowData = (pos) => {
    let totalPnl = 0, totalCumPnl = 0, totalMtm = 0;

    // Pre-compute which buckets have trades
    const bucketsWithTrades = new Set();
    for (const trade of Object.values(pos.tradesMap)) {
      bucketsWithTrades.add(getTradeBucketKey(trade));
    }

    // numVal that shows blank if no trades in bucket, — if trades but zero
    const bucketVal = (value, bucketKey) => {
      if (value !== 0) return { display: fmtNum(value), styleKey: value > 0 ? 'pos' : 'neg' };
      const hasTrades = Array.isArray(bucketKey)
        ? bucketKey.some(k => bucketsWithTrades.has(k))
        : bucketsWithTrades.has(bucketKey);
      return { display: hasTrades ? '—' : '', styleKey: 'zero' };
    };

    const pairBucketVal = (c, p, ck, pk) => ({
      cDisplay: c !== 0 ? fmtNum(c) : bucketsWithTrades.has(ck) ? '—' : '',
      pDisplay: p !== 0 ? fmtNum(p) : bucketsWithTrades.has(pk) ? '—' : '',
      cStyleKey: c === 0 ? 'zero' : 'call',
      pStyleKey: p === 0 ? 'zero' : 'put',
    });

    let totalNseMtm = 0, totalOthersMtm = 0;
    for (const trade of Object.values(pos.tradesMap)) {
      totalPnl    += trade.Pnl    || 0;
      totalCumPnl += trade.cumPnl || 0;
      totalMtm    += trade.MTM    || 0;
      if (trade.SecurityExchange === 'NSEFO') {
        totalNseMtm += trade.MTM || 0;
      } else {
        totalOthersMtm += trade.MTM || 0;
      }
    }
    return {
      niftyFut: bucketVal(pos.niftyFut, 'niftyFut'),
      bnfFut: bucketVal(pos.bnfFut, 'bnfFut'),
      w: pairBucketVal(pos.cw, pos.pw, 'cw', 'pw'),
      w1: pairBucketVal(pos.cw1, pos.pw1, 'cw1', 'pw1'),
      w2: pairBucketVal(pos.cw2, pos.pw2, 'cw2', 'pw2'),
      w3: pairBucketVal(pos.cw3, pos.pw3, 'cw3', 'pw3'),
      w4: pairBucketVal(pos.cw4, pos.pw4, 'cw4', 'pw4'),
      w5: pairBucketVal(pos.cw5, pos.pw5, 'cw5', 'pw5'),
      totalOpts: pairBucketVal(pos.totalC || 0, pos.totalP || 0, 'cw', 'pw'),
      stocks: bucketVal(pos.stocks, 'stocks'),
      pnl: decimalVal(totalPnl),
      cumPnl: decimalVal(totalCumPnl),
      mtm:       decimalVal(totalMtm),
      nseMtm:    decimalVal(totalNseMtm),
      othersMtm: decimalVal(totalOthersMtm),
      nseMargin:    marginVal(pos.nseMarginAbs  || 0),
      totalMargin:  marginVal(pos.totalMargin   || 0),
      bseMargin:    marginVal(pos.bseMarginAbs  || 0),
      ifscMargin:   marginVal(pos.ifscMarginAbs || 0),
      nseMaxMargin: marginVal(pos.nseMarginMax  || 0),
    };
  };

  let userRowIndex = 0; // for alternating row bg across all user rows

  const filterPositions = (posList, groupName = '') => {
    if (!debouncedQuery.trim()) return posList;
    const q = debouncedQuery.trim().toLowerCase();

    // If group name matches — show all users in this group
    if (groupName && groupName.toLowerCase().includes(q)) return posList;

    return posList.filter(pos => {
      // Match user name
      if ((pos.user || '').toLowerCase().includes(q)) return true;

      // Match scalar bucket values
      const scalarBuckets = ['stocks', 'niftyFut', 'bnfFut'];
      for (const key of scalarBuckets) {
        const v = pos[key];
        if (v && v !== 0 && String(v).toLowerCase().includes(q)) return true;
      }

      // Match paired C/P bucket values
      const pairBuckets = [
        ['cw','pw'], ['cw1','pw1'], ['cw2','pw2'],
        ['cw3','pw3'], ['cw4','pw4'], ['cw5','pw5'],
        ['totalC','totalP'],
      ];
      for (const [ck, pk] of pairBuckets) {
        const c = pos[ck], p = pos[pk];
        if (c && c !== 0 && String(c).toLowerCase().includes(q)) return true;
        if (p && p !== 0 && String(p).toLowerCase().includes(q)) return true;
      }

      // Match trade Symbol
      for (const trade of Object.values(pos.tradesMap || {})) {
        if ((trade.Symbol || '').toLowerCase().includes(q)) return true;
      }

      return false;
    });
  };

  const SORTABLE = new Set(['user','pnl','cumPnl','mtm','nseMargin','totalMargin','nseMaxMargin']);

  const sortIcon = (colId) => {
    if (!SORTABLE.has(colId)) return null;
    const isActive = sortState.colId === colId && sortState.dir !== null;
    if (!isActive) return (
      <span
        onClick={(e) => e.stopPropagation()}
        style={{
          marginLeft: '4px', fontSize: '10px', cursor: 'pointer',
          opacity: 0, color: '#ffffff', userSelect: 'none',
        }}
        className="sort-icon-hidden"
      >▲</span>
    );
    return (
      <span
        onClick={(e) => e.stopPropagation()}
        style={{
          marginLeft: '4px', fontSize: '10px', cursor: 'pointer',
          color: '#93c5fd', userSelect: 'none',
        }}
      >
        {sortState.dir === 'desc' ? '▼' : '▲'}
      </span>
    );
  };

  // Apply sort to a flat list of position objects
  const sortPositions = (posList) => {
    if (!sortState.colId || !sortState.dir) return posList;
    const { colId, dir } = sortState;
    const mult = dir === 'asc' ? 1 : -1;

    return [...posList].sort((a, b) => {
      let aVal, bVal;
      switch (colId) {
        case 'user':       aVal = a.user || '';            bVal = b.user || '';            return mult * aVal.localeCompare(bVal);
        case 'pnl':        aVal = Object.values(a.tradesMap||{}).reduce((s,t)=>s+(t.Pnl||0),0);    bVal = Object.values(b.tradesMap||{}).reduce((s,t)=>s+(t.Pnl||0),0);    break;
        case 'cumPnl':     aVal = Object.values(a.tradesMap||{}).reduce((s,t)=>s+(t.cumPnl||0),0); bVal = Object.values(b.tradesMap||{}).reduce((s,t)=>s+(t.cumPnl||0),0); break;
        case 'mtm':        aVal = Object.values(a.tradesMap||{}).reduce((s,t)=>s+(t.MTM||0),0);    bVal = Object.values(b.tradesMap||{}).reduce((s,t)=>s+(t.MTM||0),0);    break;
        case 'nseMargin':    aVal = a.nseMarginAbs  || 0; bVal = b.nseMarginAbs  || 0; break;
        case 'totalMargin':  aVal = a.totalMargin   || 0; bVal = b.totalMargin   || 0; break;
        case 'nseMaxMargin': aVal = a.nseMarginMax  || 0; bVal = b.nseMarginMax  || 0; break;
        default: return 0;
      }
      return mult * (aVal - bVal);
    });
  };

return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      {/* ── Toolbar ── */}
      <div style={{ ...S.toolbar, flexShrink: 0, justifyContent: 'space-between' }}>
        {/* ── Search ── */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{
              position: 'absolute', left: '7px', fontSize: '14px',
              color: '#9ca3af', pointerEvents: 'none',
            }}>⌕</span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search user..."
              style={{
                paddingLeft: '22px', paddingRight: searchQuery ? '22px' : '8px',
                paddingTop: '4px', paddingBottom: '4px',
                fontSize: '14px', color: '#111827',
                border: '1px solid #d1d5db', borderRadius: '4px',
                outline: 'none', width: '200px',
                fontFamily: 'system-ui, -apple-system, sans-serif', 
              }}
            />
            {searchQuery && (
              <span
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute', right: '7px', fontSize: '14px',
                  color: '#9ca3af', cursor: 'pointer', lineHeight: 1,
                }}
              >×</span>
            )}
          </div>
        </div>
      </div>
    <div className="positions-wrapper" style={{ ...S.wrapper, flex: 1 }}>
      <table style={S.table}>

        {/* ── Column widths ── */}
        <colgroup>
          {visibleColDefs.map((col) => (
            <col key={col.id} style={{ width: colWidths[col.id] ?? col.size }} />
          ))}
        </colgroup>

        {/* ── Headers ── */}
        <thead style={{ position: 'sticky', top: 0, zIndex: 3 }}>
          <tr>
            {visibleColDefs.map((col) => (
              <th key={col.id}
                onClick={() => SORTABLE.has(col.id) && toggleSort(col.id)}
                style={{
                  ...(col.id === 'user' ? S.thUser : S.th),
                  ...(col.isPaired ? S.thGrouped : {}),
                  position: 'relative',
                  cursor: SORTABLE.has(col.id) ? 'pointer' : 'default',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                  {col.header}
                  {sortIcon(col.id)}
                </span>
                <div
                  onMouseDown={(e) => { e.stopPropagation(); onResizeMouseDown(e, col.id); }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute', top: 0, right: 0,
                    width: '4px', height: '100%',
                    cursor: 'col-resize',
                    userSelect: 'none',
                    zIndex: 3,
                  }}
                />
              </th>
            ))}
          </tr>
          <tr>
            {visibleColDefs.map((col) => (
              <th key={`${col.id}-sub`} style={{
                ...S.subTh,
                ...(col.isPaired ? S.subThGrouped : {}),
              }}>
                {col.isPaired && (
                  <div style={S.subLabel}>
                    <span style={S.subC}>C</span>
                    <span style={S.subP}>P</span>
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>

        {/* ── Body ── */}
        <tbody>
          {groups === null ? (
            sortPositions(filterPositions(Object.values(positions))).length === 0 ? (
              <tr>
                <td colSpan={totalCols} style={{
                  padding: '32px', textAlign: 'center',
                  fontSize: '13px', color: C.muted,
                  fontStyle: 'italic',
                }}>
                  No users match "{debouncedQuery}"
                </td>
              </tr>
            ) :
            sortPositions(filterPositions(Object.values(positions)))
              .map((pos) => {
                const rowData = buildUserRowData(pos);
                const userKey = pos.user;
                const isExpRow = expanded?.userKey === userKey;
                const rowBg = ROW_BG[userRowIndex % 2];
                userRowIndex++;
                return (
                  <Fragment key={`user-${userKey}`}>
                    <tr>
                      {visibleColDefs.map((col) => {
                        const isUserCol = col.id === 'user';
                        const isClickable = CLICKABLE.has(col.id);
                        const isActive = isExpRow && expanded?.colId === col.id;
                        const tdStyle = {
                          ...(isUserCol ? S.tdUserBase : S.tdBase),
                          ...(col.isPaired ? S.tdGrouped : {}),
                          ...(isClickable ? S.tdClickable : {}),
                          ...rowBg,
                          ...(isActive ? { background: '#c3d4f5' } : {}),
                        };
                        if (isUserCol) {
                          return (
                            <td key={col.id} style={tdStyle}>
                              <div style={{ paddingLeft: 8 }}>
                                <span style={S.userText}>{pos.user}</span>
                              </div>
                            </td>
                          );
                        }
                        const val = rowData[col.id];
                        const isMarginCol = ['nseMargin', 'totalMargin', 'bseMargin', 'ifscMargin', 'nseMaxMargin'].includes(col.id);
                        return (
                          <td key={col.id} style={tdStyle}
                            onClick={isClickable ? () => handleCellClick(col.id, userKey, pos) : undefined}
                          >
                            {col.isPaired ? <PairCell {...val} />
                              : isMarginCol ? <MarginCell display={val.display} styleKey={val.styleKey} />
                              : <NumCell display={val.display} styleKey={val.styleKey} />}
                          </td>
                        );
                      })}
                    </tr>
                    {isExpRow && (
                      expanded.type === 'margin'
                        ? <MarginExpandedRow key={`exp-${userKey}`} pos={expanded.pos} colId={expanded.colId} onClose={closeExpanded} totalCols={totalCols} referenceRate={referenceRate} />
                        : <ExpandedRow key={`exp-${userKey}`} trades={expanded.trades} colId={expanded.colId} onClose={closeExpanded} onRefresh={refreshExpanded} totalCols={totalCols} />
                    )}
                  </Fragment>
                );
              })
          ) : (
            groups.map(({ cat1, cat2Groups, allUserKeys }) => {
              const filteredCat2Groups = cat2Groups.map(({ cat2, userKeys }) => ({
                cat2,
                userKeys,
                filteredUsers: sortPositions(filterPositions(userKeys.map(k => positions[k]).filter(Boolean), cat2)),
              })).filter(sg => sg.filteredUsers.length > 0);

              // Also check if cat1 name matches — show all sub-groups if so
              const cat1Matches = debouncedQuery.trim() &&
                cat1.toLowerCase().includes(debouncedQuery.trim().toLowerCase());

              if (!cat1Matches && filteredCat2Groups.length === 0) return null;

              // If cat1 matches, use all users unfiltered
              const effectiveCat2Groups = cat1Matches
                ? cat2Groups.map(({ cat2, userKeys }) => ({
                    cat2,
                    userKeys,
                    filteredUsers: sortPositions(userKeys.map(k => positions[k]).filter(Boolean)),
                  }))
                : filteredCat2Groups;

              const isCat1Expanded = expandedCat1.has(cat1);
              const isCat1EffExpanded = debouncedQuery.trim() ? true : isCat1Expanded;
              const aggUsers = debouncedQuery.trim()
                ? effectiveCat2Groups.flatMap(sg => sg.filteredUsers)
                : allUserKeys.map(k => positions[k]).filter(Boolean);
              const cat1Agg    = aggregateBuckets(aggUsers);
              const cat1AggRow = aggToRow(cat1Agg);

              return (
                <Fragment key={`cat1-${cat1}`}>
                  <GroupRow
                    label={cat1}
                    level={1}
                    isExpanded={isCat1EffExpanded}
                    onToggle={() => toggleCat1(cat1)}
                    aggRow={cat1AggRow}
                    columns={visibleColDefs}
                  />

                  {isCat1EffExpanded && effectiveCat2Groups.map(({ cat2, userKeys, filteredUsers }) => {
                    const cat2Key = `${cat1}:::${cat2}`;
                    const isCat2Expanded = cat2 ? expandedCat2.has(cat2Key) : true;
                    const isCat2EffExpanded = debouncedQuery.trim() ? true : isCat2Expanded;
                    const cat2Agg    = aggregateBuckets(debouncedQuery.trim() ? filteredUsers : userKeys.map(k => positions[k]).filter(Boolean));
                    const cat2AggRow = aggToRow(cat2Agg);

                    return (
                    <Fragment key={`cat2-${cat1}-${cat2}`}>
                      {cat2 && (
                        <GroupRow
                          label={cat2}
                          level={2}
                          isExpanded={isCat2EffExpanded}
                          onToggle={() => toggleCat2(cat1, cat2)}
                          aggRow={cat2AggRow}
                          columns={visibleColDefs}
                        />
                      )}

                      {isCat2EffExpanded && filteredUsers.map((pos) => {
                        const userKey = pos.user;
                        if (!pos) return null;
                        const rowData = buildUserRowData(pos);
                        const isExpRow = expanded?.userKey === userKey;
                        const rowBg = ROW_BG[userRowIndex % 2];
                        userRowIndex++;

                        return (
                          <Fragment key={`user-${userKey}`}>
                            <tr>
                              {visibleColDefs.map((col) => {
                                const isUserCol = col.id === 'user';
                                const isClickable = CLICKABLE.has(col.id);
                                const isActive = isExpRow && expanded?.colId === col.id;

                                const tdStyle = {
                                  ...(isUserCol ? S.tdUserBase : S.tdBase),
                                  ...(col.isPaired ? S.tdGrouped : {}),
                                  ...(isClickable ? S.tdClickable : {}),
                                  ...rowBg,
                                  ...(isActive ? { background: '#c3d4f5' } : {}),
                                };

                                if (isUserCol) {
                                  return (
                                    <td key={col.id} style={tdStyle}>
                                      <div style={{ paddingLeft: cat2 ? 48 : 16 }}>
                                        <span style={S.userText}>{pos.user}</span>
                                      </div>
                                    </td>
                                  );
                                }

                                const val = rowData[col.id];
                                const isMarginCol = ['nseMargin', 'totalMargin', 'bseMargin', 'ifscMargin', 'nseMaxMargin'].includes(col.id);

                                return (
                                  <td
                                    key={col.id}
                                    style={tdStyle}
                                    onClick={isClickable ? () => handleCellClick(col.id, userKey, pos) : undefined}
                                  >
                                    {col.isPaired ? <PairCell {...val} />
                                      : isMarginCol ? <MarginCell display={val.display} styleKey={val.styleKey} />
                                      : <NumCell display={val.display} styleKey={val.styleKey} />}
                                  </td>
                                );
                              })}
                            </tr>

                            {isExpRow && (
                              expanded.type === 'margin'
                                ? <MarginExpandedRow key={`exp-${userKey}`} pos={expanded.pos} colId={expanded.colId} onClose={closeExpanded} totalCols={totalCols} referenceRate={referenceRate} />
                                : <ExpandedRow key={`exp-${userKey}`} trades={expanded.trades} colId={expanded.colId} onClose={closeExpanded} onRefresh={refreshExpanded} totalCols={totalCols} />
                            )}
                          </Fragment>
                        );
                     })}
                    </Fragment>
                    );
                  })}
                </Fragment>
              );
            })
          )}
          {groups !== null && debouncedQuery.trim() && groups.every(({ cat2Groups, allUserKeys }) =>
            cat2Groups.every(({ userKeys }) =>
              filterPositions(userKeys.map(k => positions[k]).filter(Boolean)).length === 0
            )
          ) && (
            <tr>
              <td colSpan={totalCols} style={{
                padding: '32px', textAlign: 'center',
                fontSize: '13px', color: C.muted,
                fontStyle: 'italic',
              }}>
                No users match "{debouncedQuery}"
              </td>
            </tr>
          )}
        </tbody>
      </table>

      </div>

      {/* ── Grouping modal ── */}
      {groupingOpen && (
        <GroupingModal
          allUsers={allUserKeys}
          initialGroups={customGroups.map(g => ({
            ...g,
            directUsers: (g.directUsers || []).filter(u => positions[u]),
            subGroups: (g.subGroups || []).map(sg => ({
              ...sg,
              users: (sg.users || []).filter(u => positions[u]),
            })),
          }))}
          onSave={saveCustomGroups}
          onClose={() => setGroupingOpen(false)}
        />
      )}

      {/* ── Column settings modal ── */}
      {settingsOpen && prefsLoaded && (
        <ColumnSettingsModal
          columns={COLUMNS}
          order={colOrder}
          hidden={hiddenCols}
          onToggleVisibility={toggleVisibility}
          onReorder={reorder}
          onReset={resetToDefault}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
});

export default PositionsGrid;