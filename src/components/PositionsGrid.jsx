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

  // Mirrors the same fallback in dataStore.js's getBucketKey — some trades
  // arrive with SecurityType/Optiontype both null despite being genuine
  // options, so fall back to reading the C/P indicator out of Symbol. This
  // MUST stay identical to the dataStore.js version, or bucket totals and
  // this breakdown panel's filtering will disagree with each other again.
  let optiontype = Optiontype;
  if (!optiontype && Symbol) {
    const tokens = Symbol.trim().split(/\s+/);
    const cpToken = tokens.find(t => t === 'C' || t === 'P');
    if (cpToken === 'C') optiontype = 'CE';
    else if (cpToken === 'P') optiontype = 'PE';
  }

  if (SecurityType === 'OPT' || optiontype) {
    const week = getWeekKey(Symbol);
    if (optiontype === 'CE') return `c${week}`;
    if (optiontype === 'PE') return `p${week}`;
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
                const pnlRounded = (pnl / 100000).toFixed(2);
                const pnlIsZero = parseFloat(pnlRounded) === 0;
                const mtmRounded = (mtm / 100000).toFixed(2);
                const mtmIsZero = parseFloat(mtmRounded) === 0;
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
                    <td style={{ ...ptd, color: pnlIsZero ? C.zero : pnl > 0 ? C.pos : C.neg }}>
                      {pnlIsZero ? '0.00' : fmtNum(pnlRounded)}
                    </td>
                    <td style={{ ...ptd, color: mtmIsZero ? C.zero : mtm > 0 ? C.pos : C.neg }}>
                      {mtmIsZero ? '0.00' : fmtNum(mtmRounded)}
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
const decimalVal = (v) => {
  const rounded = (v / 100000).toFixed(2);
  const isZero = parseFloat(rounded) === 0; // catches -0.00 as well as 0.00
  return {
    display: isZero ? '0.00' : fmtNum(rounded),
    styleKey: isZero ? 'zero' : resolveValKey(v),
  };
};
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
const ACCOUNT_COLUMN = {
  id: 'account', accessorKey: 'account', header: 'Name', isPaired: false, size: 120,
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
const GroupRow = ({ label, level, isExpanded, onToggle, aggRow, columns, clickableCells, activeColId, onCellClick }) => {
  const bg = level === 1 ? C.cat1Bg : C.cat2Bg;
  const textClr = level === 1 ? C.cat1Text : C.cat2Text;
  const indent = (level - 1) * 16; // scales to any depth; level 1→0, 2→16, 3→32, matches old behavior for 1-2
  const fontSize = level === 1 ? '14px' : '14px';
  const fontW = level === 1 ? 700 : 700;

  return (
    <tr
      onClick={clickableCells ? undefined : onToggle}
      style={{ background: bg, cursor: clickableCells ? 'default' : 'pointer', userSelect: 'none' }}
    >
      {columns.map((col, i) => {
        const isUserCol = col.id === 'account';
        const isPaired = col.isPaired;
        const isClickableCol = clickableCells && CLICKABLE.has(col.id);
        const isActive = clickableCells && activeColId === col.id;

        const tdStyle = {
          ...(isUserCol ? S.tdUserBase : S.tdBase),
          ...(isPaired ? S.tdGrouped : {}),
          ...(isClickableCol ? S.tdClickable : {}),
          background: isActive ? '#c3d4f5' : bg,
          borderBottom: `1px solid ${C.border}`,
        };

        if (isUserCol) {
          return (
            <td key={col.id} style={tdStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: indent }}>
                {!clickableCells && (
                  <span style={{
                    fontSize: '11px', color: textClr,
                    transition: 'transform 0.15s',
                    display: 'inline-block',
                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  }}>▶</span>
                )}
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
          <td
            key={col.id}
            style={tdStyle}
            onClick={isClickableCol ? () => onCellClick(col.id) : undefined}
          >
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
    const map = { account: ACCOUNT_COLUMN.size };
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

  // Grouping config — persisted per viewer, 3 mutually-exclusive modes
  const groupingConfig            = useDataStore(s => s.groupingConfig);
  const showAccountRows           = useDataStore(s => s.showAccountRows);
  const referenceRate             = useDataStore(s => s.referenceRate);
  const saveGroupingConfigToStore = useDataStore(state => state.saveGroupingConfig);
  const userMarginSummary         = useDataStore(s => s.userMarginSummary);
  const port = window.location.port || '80';

  const saveGroupingConfig = (config) => {
    saveGroupingConfigToStore(config, port);
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
    return [ACCOUNT_COLUMN, ...rest];
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
      // prev.userKey is either a plain account key (flat rows) or a
      // composite `${qtUser}:::${account}` key (grouped rows) — positions
      // in the store are keyed by plain account either way.
      if (prev.userKey.startsWith('grpAgg|')) {
        const qtUser = prev.userKey.split('|').pop();
        const accountPositions = Object.values(livePositions).filter(
          (p) => p.qtUsers && p.qtUsers.has(qtUser)
        );
        const mergedTradesMap = {};
        accountPositions.forEach((pos) => {
          Object.entries(pos.tradesMap).forEach(([k, t]) => {
            mergedTradesMap[`${pos.account}::${k}`] = t;
          });
        });
        const bucketKeys = BUCKET_KEYS[prev.colId] || [];
        const trades = Object.values(mergedTradesMap).filter(t =>
          bucketKeys.includes(getTradeBucketKey(t)) &&
          (t.NetPos !== 0 || t.SOD_Qty !== 0 || t.IntraQty !== 0)
        ).sort((a, b) => {
          const ac = a.Optiontype === 'CE' ? 0 : 1, bc = b.Optiontype === 'CE' ? 0 : 1;
          if (ac !== bc) return ac - bc;
          return (a.Symbol || '').localeCompare(b.Symbol || '');
        });
        return { ...prev, trades };
      }

      if (prev.userKey.startsWith('grpAcct|')) {
        const account = prev.userKey.split('|').pop();
        const pos = livePositions[account];
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
      }

      if (prev.userKey.startsWith('agg:::')) {
        // Aggregate (qt-user) row — rebuild the merged view fresh, same way
        // the initial click did, so refresh reflects current live data.
        const qtUser = prev.userKey.slice('agg:::'.length);
        const accountPositions = Object.values(livePositions).filter(
          (p) => p.qtUsers && p.qtUsers.has(qtUser)
        );
        const mergedTradesMap = {};
        accountPositions.forEach((pos) => {
          Object.entries(pos.tradesMap).forEach(([k, t]) => {
            mergedTradesMap[`${pos.account}::${k}`] = t;
          });
        });
        const bucketKeys = BUCKET_KEYS[prev.colId] || [];
        const trades = Object.values(mergedTradesMap).filter(t =>
          bucketKeys.includes(getTradeBucketKey(t)) &&
          (t.NetPos !== 0 || t.SOD_Qty !== 0 || t.IntraQty !== 0)
        ).sort((a, b) => {
          const ac = a.Optiontype === 'CE' ? 0 : 1, bc = b.Optiontype === 'CE' ? 0 : 1;
          if (ac !== bc) return ac - bc;
          return (a.Symbol || '').localeCompare(b.Symbol || '');
        });
        return { ...prev, trades };
      }

      const acctKey = prev.userKey.includes(':::')
        ? prev.userKey.split(':::')[1]
        : prev.userKey;
      const pos = livePositions[acctKey];
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

  // Default view: one aggregate row per qt user, with that user's trade
  // accounts nested underneath. An account mapped to more than one qt user
  // appears — in full — under each of those users' groups.
  const userGroups = useMemo(() => {
    const map = {};
    Object.values(positions).forEach((pos) => {
      (pos.qtUsers || []).forEach((u) => {
        if (!map[u]) map[u] = [];
        map[u].push(pos);
      });
    });
    return map;
  }, [positions]);

  const allUserKeys = useMemo(() => Object.keys(positions).sort(), [positions]);

  // CTCL index — same pattern as userGroups, keyed by trade.CTCLId instead.
  const ctclMap = useMemo(() => {
    const map = {};
    Object.values(positions).forEach((pos) => {
      (pos.ctcls || []).forEach((c) => {
        if (!map[c]) map[c] = [];
        map[c].push(pos);
      });
    });
    return map;
  }, [positions]);

  // Candidate lists for the GroupingModal, one per mode.
  const memberOptionsForModal = useMemo(() => ({
    account: allUserKeys,
    qtUser: Object.keys(userGroups).sort(),
    ctcl: Object.keys(ctclMap).sort(),
  }), [allUserKeys, userGroups, ctclMap]);

  // Restricts the qtUser→accounts index to a specific subset of accounts —
  // used when a custom group (or CTCL) only covers some accounts, not all.
  const buildQtUserBucketsFrom = (accountList) => {
    const map = {};
    accountList.forEach((pos) => {
      (pos.qtUsers || []).forEach((u) => {
        if (!map[u]) map[u] = [];
        map[u].push(pos);
      });
    });
    return map;
  };

  // Renders one qt-user row + (optionally) its account rows underneath.
  // Shared by the default view AND all 3 custom grouping modes — this is
  // exactly the qtUser-level block that already existed for the default
  // view, generalized to take a keyPrefix (for unique expand/click state
  // across different parent groups) and a groupLevel (for indent depth).
  const renderQtUserBlock = (qtUser, accountsForUser, keyPrefix, groupLevel) => {
    const filteredAccounts = sortPositions(filterPositions(accountsForUser, qtUser));
    if (filteredAccounts.length === 0) return null;

    const toggleKey = `${keyPrefix}|quser|${qtUser}`;
    const isExpanded = expandedCat1.has(toggleKey);
    const isEffExpanded = debouncedQuery.trim() ? true : isExpanded;

    const aggSource = debouncedQuery.trim() ? filteredAccounts : accountsForUser;
    const rawAgg = aggregateBuckets(aggSource);
    const margin = userMarginSummary[qtUser] || {};
    rawAgg.nseMargin    = margin.nseMarginAbs  || 0;
    rawAgg.totalMargin  = margin.totalMargin   || 0;
    rawAgg.bseMargin    = margin.bseMarginAbs  || 0;
    rawAgg.ifscMargin   = margin.ifscMarginAbs || 0;
    rawAgg.nseMaxMargin = margin.nseMarginMax  || 0;
    const aggRow = aggToRow(rawAgg);

    const aggKey = `grpAgg|${keyPrefix}|quser|${qtUser}`;
    const isAggExpRow = !!expanded && expanded.userKey === aggKey;
    const acctIndentPx = groupLevel * 16;

    const handleAggCellClick = (colId) => {
      const mergedTradesMap = {};
      aggSource.forEach((pos) => {
        Object.entries(pos.tradesMap).forEach(([k, t]) => {
          mergedTradesMap[`${pos.account}::${k}`] = t;
        });
      });
      const mergedPos = {
        account: qtUser,
        tradesMap: mergedTradesMap,
        nseMarginAbs: margin.nseMarginAbs || 0,
        nseMarginMax: margin.nseMarginMax || 0,
        bseMarginAbs: margin.bseMarginAbs || 0,
        ifscMarginAbs: margin.ifscMarginAbs || 0,
        totalMargin: margin.totalMargin || 0,
        premiumBuy: margin.premiumBuy || 0,
        MarginPer: margin.MarginPer || 0,
        spanEntries: margin.spanEntries || [],
      };
      handleCellClick(colId, aggKey, mergedPos);
    };

    return (
      <Fragment key={`quser-${keyPrefix}-${qtUser}`}>
        <GroupRow
          label={qtUser}
          level={groupLevel}
          isExpanded={showAccountRows && isEffExpanded}
          onToggle={() => toggleCat1(toggleKey)}
          aggRow={aggRow}
          columns={visibleColDefs}
          clickableCells={!showAccountRows}
          activeColId={isAggExpRow ? expanded.colId : null}
          onCellClick={handleAggCellClick}
        />

        {!showAccountRows && isAggExpRow && (
          expanded.type === 'margin'
            ? <MarginExpandedRow pos={expanded.pos} colId={expanded.colId} onClose={closeExpanded} totalCols={totalCols} referenceRate={referenceRate} />
            : <ExpandedRow trades={expanded.trades} colId={expanded.colId} onClose={closeExpanded} onRefresh={refreshExpanded} totalCols={totalCols} />
        )}

        {showAccountRows && isEffExpanded && filteredAccounts.map((pos) => {
          const rowData = buildUserRowData(pos);
          const rowKey = `grpAcct|${keyPrefix}|quser|${qtUser}|${pos.account}`;
          const isExpRow = !!expanded && expanded.userKey === rowKey;
          const rowBg = ROW_BG[userRowIndex % 2];
          userRowIndex++;
          return (
            <Fragment key={rowKey}>
              <tr>
                {visibleColDefs.map((col) => {
                  const isAcctCol = col.id === 'account';
                  const isClickable = CLICKABLE.has(col.id);
                  const isActive = isExpRow && expanded?.colId === col.id;
                  const tdStyle = {
                    ...(isAcctCol ? S.tdUserBase : S.tdBase),
                    ...(col.isPaired ? S.tdGrouped : {}),
                    ...(isClickable ? S.tdClickable : {}),
                    ...rowBg,
                    ...(isActive ? { background: '#c3d4f5' } : {}),
                  };
                  if (isAcctCol) {
                    return (
                      <td key={col.id} style={tdStyle}>
                        <div style={{ paddingLeft: acctIndentPx }}>
                          <span style={S.userText}>{pos.account}</span>
                        </div>
                      </td>
                    );
                  }
                  const val = rowData[col.id];
                  const isMarginCol = ['nseMargin', 'totalMargin', 'bseMargin', 'ifscMargin', 'nseMaxMargin'].includes(col.id);
                  return (
                    <td key={col.id} style={tdStyle}
                      onClick={isClickable ? () => handleCellClick(col.id, rowKey, pos) : undefined}
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
                  ? <MarginExpandedRow pos={expanded.pos} colId={expanded.colId} onClose={closeExpanded} totalCols={totalCols} referenceRate={referenceRate} />
                  : <ExpandedRow trades={expanded.trades} colId={expanded.colId} onClose={closeExpanded} onRefresh={refreshExpanded} totalCols={totalCols} />
              )}
            </Fragment>
          );
        })}
      </Fragment>
    );
  };

  // Builds the rendered rows for whichever custom grouping mode is active.
  // Returns a flat array of elements (already filtered to non-empty groups).
  const renderGroupModeBody = () => {
    const mode = groupingConfig.mode;
    const customGroupsList = groupingConfig.groups || [];

    if (mode === 'account') {
      const memberToGroup = {};
      customGroupsList.forEach((g) => (g.members || []).forEach((acc) => { memberToGroup[acc] = String(g.id); }));

      const bucketByKey = {};
      customGroupsList.forEach((g) => { bucketByKey[String(g.id)] = { key: String(g.id), label: g.name, accounts: [] }; });
      const ungrouped = { key: 'ungrouped', label: 'Ungrouped', accounts: [] };

      Object.values(positions).forEach((pos) => {
        const gKey = memberToGroup[pos.account];
        (gKey && bucketByKey[gKey] ? bucketByKey[gKey] : ungrouped).accounts.push(pos);
      });

      const allBuckets = [...customGroupsList.map(g => bucketByKey[String(g.id)]), ungrouped].filter(b => b.accounts.length > 0);

      return allBuckets.map((b) => {
        const qtUserBuckets = buildQtUserBucketsFrom(b.accounts);
        const qtUserKeys = Object.keys(qtUserBuckets).sort();
        const groupToggleKey = `grp|${b.key}`;
        const isGroupEffExpanded = debouncedQuery.trim() ? true : expandedCat1.has(groupToggleKey);

        const inner = qtUserKeys.map((u) => renderQtUserBlock(u, qtUserBuckets[u], groupToggleKey, 2)).filter(Boolean);
        if (debouncedQuery.trim() && inner.length === 0) return null;

        const groupAggRow = aggToRow(aggregateBuckets(b.accounts));
        return (
          <Fragment key={`grp-${b.key}`}>
            <GroupRow label={b.label} level={1} isExpanded={isGroupEffExpanded}
              onToggle={() => toggleCat1(groupToggleKey)} aggRow={groupAggRow} columns={visibleColDefs} />
            {isGroupEffExpanded && inner}
          </Fragment>
        );
      }).filter(Boolean);
    }

    if (mode === 'qtUser') {
      const memberToGroup = {};
      customGroupsList.forEach((g) => (g.members || []).forEach((u) => { memberToGroup[u] = String(g.id); }));

      const bucketByKey = {};
      customGroupsList.forEach((g) => { bucketByKey[String(g.id)] = { key: String(g.id), label: g.name, qtUsers: [] }; });
      const ungrouped = { key: 'ungrouped', label: 'Ungrouped', qtUsers: [] };

      Object.keys(userGroups).forEach((u) => {
        const gKey = memberToGroup[u];
        (gKey && bucketByKey[gKey] ? bucketByKey[gKey] : ungrouped).qtUsers.push(u);
      });

      const allBuckets = [...customGroupsList.map(g => bucketByKey[String(g.id)]), ungrouped].filter(b => b.qtUsers.length > 0);

      return allBuckets.map((b) => {
        const qtUserKeys = [...b.qtUsers].sort();
        const groupToggleKey = `grp|${b.key}`;
        const isGroupEffExpanded = debouncedQuery.trim() ? true : expandedCat1.has(groupToggleKey);

        const inner = qtUserKeys.map((u) => renderQtUserBlock(u, userGroups[u] || [], groupToggleKey, 2)).filter(Boolean);
        if (debouncedQuery.trim() && inner.length === 0) return null;

        const groupAccounts = qtUserKeys.flatMap(u => userGroups[u] || []);
        const groupAggRow = aggToRow(aggregateBuckets(groupAccounts));
        return (
          <Fragment key={`grp-${b.key}`}>
            <GroupRow label={b.label} level={1} isExpanded={isGroupEffExpanded}
              onToggle={() => toggleCat1(groupToggleKey)} aggRow={groupAggRow} columns={visibleColDefs} />
            {isGroupEffExpanded && inner}
          </Fragment>
        );
      }).filter(Boolean);
    }

    if (mode === 'ctcl') {
      const memberToGroup = {};
      customGroupsList.forEach((g) => (g.members || []).forEach((c) => { memberToGroup[c] = String(g.id); }));

      const bucketByKey = {};
      customGroupsList.forEach((g) => { bucketByKey[String(g.id)] = { key: String(g.id), label: g.name, ctcls: [] }; });
      const ungrouped = { key: 'ungrouped', label: 'Ungrouped', ctcls: [] };

      Object.keys(ctclMap).forEach((c) => {
        const gKey = memberToGroup[c];
        (gKey && bucketByKey[gKey] ? bucketByKey[gKey] : ungrouped).ctcls.push(c);
      });

      const allBuckets = [...customGroupsList.map(g => bucketByKey[String(g.id)]), ungrouped].filter(b => b.ctcls.length > 0);

      return allBuckets.map((b) => {
        const ctclKeys = [...b.ctcls].sort();
        const groupToggleKey = `grp|${b.key}`;
        const isGroupEffExpanded = debouncedQuery.trim() ? true : expandedCat1.has(groupToggleKey);

        const ctclBlocks = ctclKeys.map((ctclId) => {
          const ctclAccounts = ctclMap[ctclId] || [];
          const qtUserBuckets = buildQtUserBucketsFrom(ctclAccounts);
          const qtUserKeys = Object.keys(qtUserBuckets).sort();
          const ctclToggleKey = `${groupToggleKey}|ctcl|${ctclId}`;
          const isCtclEffExpanded = debouncedQuery.trim() ? true : expandedCat1.has(ctclToggleKey);

          const inner = qtUserKeys.map((u) => renderQtUserBlock(u, qtUserBuckets[u], ctclToggleKey, 3)).filter(Boolean);
          if (debouncedQuery.trim() && inner.length === 0) return null;

          const ctclAggRow = aggToRow(aggregateBuckets(ctclAccounts));
          return (
            <Fragment key={`ctcl-${ctclToggleKey}`}>
              <GroupRow label={ctclId} level={2} isExpanded={isCtclEffExpanded}
                onToggle={() => toggleCat1(ctclToggleKey)} aggRow={ctclAggRow} columns={visibleColDefs} />
              {isCtclEffExpanded && inner}
            </Fragment>
          );
        }).filter(Boolean);

        if (debouncedQuery.trim() && ctclBlocks.length === 0) return null;

        const groupAccounts = ctclKeys.flatMap(c => ctclMap[c] || []);
        const groupAggRow = aggToRow(aggregateBuckets(groupAccounts));
        return (
          <Fragment key={`grp-${b.key}`}>
            <GroupRow label={b.label} level={1} isExpanded={isGroupEffExpanded}
              onToggle={() => toggleCat1(groupToggleKey)} aggRow={groupAggRow} columns={visibleColDefs} />
            {isGroupEffExpanded && ctclBlocks}
          </Fragment>
        );
      }).filter(Boolean);
    }

    return [];
  };

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
      // Match account
      if ((pos.account || '').toLowerCase().includes(q)) return true;

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

  const SORTABLE = new Set(['account','pnl','cumPnl','mtm','nseMargin','totalMargin','nseMaxMargin']);

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
        case 'account':    aVal = a.account || '';         bVal = b.account || '';         return mult * aVal.localeCompare(bVal);
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
              placeholder="Search account..."
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
                  ...(col.id === 'account' ? S.thUser : S.th),
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
          {!groupingConfig.mode ? (
            Object.keys(userGroups).sort().every(
              (u) => filterPositions(userGroups[u], u).length === 0
            ) ? (
              <tr>
                <td colSpan={totalCols} style={{
                  padding: '32px', textAlign: 'center',
                  fontSize: '13px', color: C.muted,
                  fontStyle: 'italic',
                }}>
                  No accounts match "{debouncedQuery}"
                </td>
              </tr>
            ) :
            Object.keys(userGroups).sort().map((qtUser) => {
              const filteredAccounts = sortPositions(filterPositions(userGroups[qtUser], qtUser));
              if (filteredAccounts.length === 0) return null;

              const isExpanded = expandedCat1.has(qtUser);
              const isEffExpanded = debouncedQuery.trim() ? true : isExpanded;

              // Aggregate stays unfiltered outside of an active search, same
              // as the cat1/cat2 pattern this reuses.
              const aggSource = debouncedQuery.trim() ? filteredAccounts : userGroups[qtUser];
              const rawAgg = aggregateBuckets(aggSource);

              // Margin is genuinely qt-user-level data — pull it from
              // userMarginSummary rather than summing account rows (which
              // don't carry margin at all).
              const margin = userMarginSummary[qtUser] || {};
              rawAgg.nseMargin    = margin.nseMarginAbs  || 0;
              rawAgg.totalMargin  = margin.totalMargin   || 0;
              rawAgg.bseMargin    = margin.bseMarginAbs  || 0;
              rawAgg.ifscMargin   = margin.ifscMarginAbs || 0;
              rawAgg.nseMaxMargin = margin.nseMarginMax  || 0;
              const aggRow = aggToRow(rawAgg);

              // Composite key for the aggregate row itself — distinct from
              // any individual account's key.
              const aggKey = `agg:::${qtUser}`;
              const isAggExpRow = !!expanded && expanded.userKey === aggKey;

              const handleAggCellClick = (colId) => {
                // Built only on click, from whatever this group's current
                // account list is — negligible cost, never runs on render.
                const mergedTradesMap = {};
                aggSource.forEach((pos) => {
                  Object.entries(pos.tradesMap).forEach(([k, t]) => {
                    mergedTradesMap[`${pos.account}::${k}`] = t;
                  });
                });
                const margin = userMarginSummary[qtUser] || {};
                const mergedPos = {
                  account: qtUser,
                  tradesMap: mergedTradesMap,
                  nseMarginAbs: margin.nseMarginAbs || 0,
                  nseMarginMax: margin.nseMarginMax || 0,
                  bseMarginAbs: margin.bseMarginAbs || 0,
                  ifscMarginAbs: margin.ifscMarginAbs || 0,
                  totalMargin: margin.totalMargin || 0,
                  premiumBuy: margin.premiumBuy || 0,
                  MarginPer: margin.MarginPer || 0,
                  spanEntries: margin.spanEntries || [],
                };
                handleCellClick(colId, aggKey, mergedPos);
              };

              return (
                <Fragment key={`qtuser-${qtUser}`}>
                  <GroupRow
                    label={qtUser}
                    level={1}
                    isExpanded={showAccountRows && isEffExpanded}
                    onToggle={() => toggleCat1(qtUser)}
                    aggRow={aggRow}
                    columns={visibleColDefs}
                    clickableCells={!showAccountRows}
                    activeColId={isAggExpRow ? expanded.colId : null}
                    onCellClick={handleAggCellClick}
                  />

                  {!showAccountRows && isAggExpRow && (
                    expanded.type === 'margin'
                      ? <MarginExpandedRow pos={expanded.pos} colId={expanded.colId} onClose={closeExpanded} totalCols={totalCols} referenceRate={referenceRate} />
                      : <ExpandedRow trades={expanded.trades} colId={expanded.colId} onClose={closeExpanded} onRefresh={refreshExpanded} totalCols={totalCols} />
                  )}

                  {showAccountRows && isEffExpanded && filteredAccounts.map((pos) => {
                    const rowData = buildUserRowData(pos);
                    const acctKey = pos.account;
                    // Composite key — the same account can appear under more
                    // than one qt-user group, so account alone isn't unique.
                    const rowKey = `${qtUser}:::${acctKey}`;
                    const isExpRow = !!expanded && expanded.userKey === rowKey;
                    const rowBg = ROW_BG[userRowIndex % 2];
                    userRowIndex++;
                    return (
                      <Fragment key={`acct-${rowKey}`}>
                        <tr>
                          {visibleColDefs.map((col) => {
                            const isAcctCol = col.id === 'account';
                            const isClickable = CLICKABLE.has(col.id);
                            const isActive = isExpRow && expanded?.colId === col.id;
                            const tdStyle = {
                              ...(isAcctCol ? S.tdUserBase : S.tdBase),
                              ...(col.isPaired ? S.tdGrouped : {}),
                              ...(isClickable ? S.tdClickable : {}),
                              ...rowBg,
                              ...(isActive ? { background: '#c3d4f5' } : {}),
                            };
                            if (isAcctCol) {
                              return (
                                <td key={col.id} style={tdStyle}>
                                  <div style={{ paddingLeft: 24 }}>
                                    <span style={S.userText}>{pos.account}</span>
                                  </div>
                                </td>
                              );
                            }
                            const val = rowData[col.id];
                            const isMarginCol = ['nseMargin', 'totalMargin', 'bseMargin', 'ifscMargin', 'nseMaxMargin'].includes(col.id);
                            return (
                              <td key={col.id} style={tdStyle}
                                onClick={isClickable ? () => handleCellClick(col.id, rowKey, pos) : undefined}
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
                            ? <MarginExpandedRow key={`exp-${rowKey}`} pos={expanded.pos} colId={expanded.colId} onClose={closeExpanded} totalCols={totalCols} referenceRate={referenceRate} />
                            : <ExpandedRow key={`exp-${rowKey}`} trades={expanded.trades} colId={expanded.colId} onClose={closeExpanded} onRefresh={refreshExpanded} totalCols={totalCols} />
                        )}
                      </Fragment>
                    );
                  })}
                </Fragment>
              );
            })
          ) : (
            (() => {
              const rendered = renderGroupModeBody();
              return rendered.length === 0 ? (
                <tr>
                  <td colSpan={totalCols} style={{
                    padding: '32px', textAlign: 'center',
                    fontSize: '13px', color: C.muted, fontStyle: 'italic',
                  }}>
                    {debouncedQuery.trim() ? `No matches for "${debouncedQuery}"` : 'Nothing assigned yet.'}
                  </td>
                </tr>
              ) : rendered;
            })()
          )}
        </tbody>
      </table>

      </div>

      {/* ── Grouping modal ── */}
      {groupingOpen && (
        <GroupingModal
          initialConfig={groupingConfig}
          memberOptions={memberOptionsForModal}
          onSave={saveGroupingConfig}
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