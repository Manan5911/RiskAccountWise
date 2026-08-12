import { useState, useMemo } from 'react';
import { useDataStore } from '../store/dataStore';
import { evaluateFormula } from '../utils/customCalcEvaluator';

// ─── Design tokens — matches GroupingModal/SubscriptionsModal's palette ──────
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
  danger: '#e0291b',
  dangerBg: '#fff5f5',
  blue1Bg: '#c3d4f5',
};

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(15,20,40,0.45)',
  zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const modal = {
  background: C.white, borderRadius: '10px', width: '780px', maxWidth: '96vw',
  maxHeight: '88vh', display: 'flex', flexDirection: 'column',
  boxShadow: '0 12px 48px rgba(0,0,0,0.22)',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const header = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '16px 22px', background: C.navy, borderRadius: '10px 10px 0 0',
  borderBottom: `2px solid ${C.navyLight}`,
};

const sectionLabel = {
  fontSize: '12px', fontWeight: 700, color: C.muted,
  textTransform: 'uppercase', letterSpacing: '0.6px',
};

const footer = {
  padding: '14px 22px', borderTop: `1px solid ${C.border}`,
  display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px',
  background: C.surface,
};

const inputStyle = {
  fontSize: '14px', color: C.text, border: `1px solid ${C.borderMid}`,
  borderRadius: '5px', padding: '6px 10px', outline: 'none', background: '#fff',
};

const smallBtn = (variant = 'default') => ({
  fontSize: '12px', fontWeight: 600, cursor: 'pointer',
  borderRadius: '5px', padding: '5px 10px',
  border: `1px solid ${variant === 'danger' ? '#f3c9c5' : C.borderMid}`,
  background: variant === 'danger' ? C.dangerBg : '#fff',
  color: variant === 'danger' ? C.danger : C.navy,
});

const MAX_SLOTS = 5;
const MAX_FORMULAS = 4;

// A row's unique identity — matches SubscriptionsModal's own keying exactly.
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
const rowKey = (item) => `${item.SecurityId}_${exchangeName(item.SecurityExchange)}`;

const newId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const CALC_BUTTONS_ROW1 = ['7', '8', '9', '÷'];
const CALC_BUTTONS_ROW2 = ['4', '5', '6', '×'];
const CALC_BUTTONS_ROW3 = ['1', '2', '3', '-'];
const CALC_BUTTONS_ROW4 = ['0', '.', '%', '+'];

export default function CustomCalcModal({ onClose }) {
  const selectedSubscriptions = useDataStore(s => s.selectedSubscriptions);
  const subscriptions = useDataStore(s => s.subscriptions);
  const headerLtps = useDataStore(s => s.headerLtps);
  const customCalcConfig = useDataStore(s => s.customCalcConfig);
  const saveCustomCalcConfig = useDataStore(s => s.saveCustomCalcConfig);
  const port = window.location.port || '80';

  const [slots, setSlots] = useState(() =>
    customCalcConfig?.slots?.length ? customCalcConfig.slots : []
  );
  const [formulas, setFormulas] = useState(() =>
    customCalcConfig?.formulas?.length ? customCalcConfig.formulas : []
  );
  const [activeFormulaId, setActiveFormulaId] = useState(formulas[0]?.id ?? null);

  const allItems = useMemo(() => (
    Array.isArray(subscriptions) ? subscriptions : (subscriptions?.getAllSubscriptionsResult || [])
  ), [subscriptions]);

  const subByKey = useMemo(() => {
    const map = {};
    allItems.forEach((item) => { map[rowKey(item)] = item; });
    return map;
  }, [allItems]);

  // Subscriptions available to a given slot = currently selected ones, minus
  // whatever's already claimed by a DIFFERENT slot (one-subscription-one-slot).
  const subscriptionOptions = (forSlotId) => (selectedSubscriptions || []).filter((key) => {
    const claimedBy = slots.find((s) => s.subscriptionKey === key);
    return !claimedBy || claimedBy.id === forSlotId;
  });

  const addSlot = () => {
    if (slots.length >= MAX_SLOTS) return;
    setSlots((prev) => [...prev, { id: newId(), name: `Var ${prev.length + 1}`, subscriptionKey: null }]);
  };

  const updateSlot = (id, patch) => {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const deleteSlot = (id) => {
    setSlots((prev) => prev.filter((s) => s.id !== id));
    // Any formula referencing this slot keeps its token — it'll just show
    // "?" and evaluate to — until the user removes/replaces that reference.
  };

  const addFormula = () => {
    if (formulas.length >= MAX_FORMULAS) return;
    const f = { id: newId(), name: `Calc ${formulas.length + 1}`, tokens: [] };
    setFormulas((prev) => [...prev, f]);
    setActiveFormulaId(f.id);
  };

  const updateFormulaName = (id, name) => {
    setFormulas((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
  };

  const deleteFormula = (id) => {
    setFormulas((prev) => prev.filter((f) => f.id !== id));
    if (activeFormulaId === id) setActiveFormulaId(null);
  };

  const activeFormula = formulas.find((f) => f.id === activeFormulaId) || null;

  const pushToken = (token) => {
    if (!activeFormula) return;
    setFormulas((prev) => prev.map((f) => {
      if (f.id !== activeFormula.id) return f;
      const tokens = [...f.tokens];
      const last = tokens[tokens.length - 1];
      // Digits/decimal point extend the current number-in-progress instead
      // of creating a new token per keystroke — matches how a real
      // calculator's display grows.
      if (token.type === 'num' && last && last.type === 'num') {
        if (token.value === '.' && last.value.includes('.')) return f; // one decimal point per number
        tokens[tokens.length - 1] = { ...last, value: last.value + token.value };
      } else {
        tokens.push(token);
      }
      return { ...f, tokens };
    }));
  };

  const pressDigit = (d) => pushToken({ type: 'num', value: d });
  const pressOp = (op) => pushToken({ type: 'op', value: op });
  const pressParen = (p) => pushToken({ type: 'paren', value: p });
  const pressVar = (slotId) => pushToken({ type: 'var', slotId });

  const backspace = () => {
    if (!activeFormula) return;
    setFormulas((prev) => prev.map((f) => {
      if (f.id !== activeFormula.id) return f;
      const tokens = [...f.tokens];
      const last = tokens[tokens.length - 1];
      if (!last) return f;
      if (last.type === 'num' && last.value.length > 1) {
        tokens[tokens.length - 1] = { ...last, value: last.value.slice(0, -1) };
      } else {
        tokens.pop();
      }
      return { ...f, tokens };
    }));
  };

  const clearFormula = () => {
    if (!activeFormula) return;
    setFormulas((prev) => prev.map((f) => (f.id === activeFormula.id ? { ...f, tokens: [] } : f)));
  };

  const renderTokenLabel = (token) => {
    if (token.type === 'var') {
      const slot = slots.find((s) => s.id === token.slotId);
      return slot ? slot.name : '?';
    }
    return token.value;
  };

  const resolveVar = (slotId) => {
    const slot = slots.find((s) => s.id === slotId);
    if (!slot || !slot.subscriptionKey) return null;
    return headerLtps?.[slot.subscriptionKey]?.ltp ?? null;
  };

  const [confirmingRemoveAll, setConfirmingRemoveAll] = useState(false);

  const handleSave = () => {
    saveCustomCalcConfig({ slots, formulas }, port);
    onClose();
  };

  const removeAll = () => {
    saveCustomCalcConfig({ slots: [], formulas: [] }, port);
    onClose();
  };

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modal}>

        {/* Header */}
        <div style={header}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#fff', letterSpacing: '0.2px' }}>
            Custom Live Calculations
          </span>
          <button onClick={onClose} style={{
            fontSize: '22px', cursor: 'pointer', color: '#fff',
            background: 'none', border: 'none', lineHeight: 1, padding: '0 2px', opacity: 0.8,
          }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* ── Variable slots ── */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={sectionLabel}>Variables ({slots.length}/{MAX_SLOTS})</span>
              {slots.length < MAX_SLOTS && (
                <button onClick={addSlot} style={smallBtn()}>+ Add variable</button>
              )}
            </div>

            {slots.length === 0 && (
              <div style={{ fontSize: '14px', color: C.mutedLight, padding: '8px 0' }}>
                No variables yet — add one and map it to a subscribed security.
              </div>
            )}

            {slots.map((slot) => (
              <div key={slot.id} style={{
                display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px',
              }}>
                <input
                  value={slot.name}
                  onChange={(e) => updateSlot(slot.id, { name: e.target.value })}
                  placeholder="Name"
                  style={{ ...inputStyle, width: '110px', fontWeight: 600 }}
                />
                <select
                  value={slot.subscriptionKey || ''}
                  onChange={(e) => updateSlot(slot.id, { subscriptionKey: e.target.value || null })}
                  style={{ ...inputStyle, flex: 1 }}
                >
                  <option value="">— choose a subscription —</option>
                  {subscriptionOptions(slot.id).map((key) => {
                    const item = subByKey[key];
                    return (
                      <option key={key} value={key}>
                        {item ? (item.Symbol_DisplayName || item.Symbol) : key}
                      </option>
                    );
                  })}
                </select>
                <button onClick={() => deleteSlot(slot.id)} style={{
                  fontSize: '18px', cursor: 'pointer', color: C.muted,
                  background: 'none', border: 'none', lineHeight: 1, padding: '0 4px',
                }}>×</button>
              </div>
            ))}
          </div>

          {/* ── Formulas ── */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={sectionLabel}>Formulas ({formulas.length}/{MAX_FORMULAS})</span>
              {formulas.length < MAX_FORMULAS && (
                <button onClick={addFormula} style={smallBtn()}>+ Add formula</button>
              )}
            </div>

            {formulas.length === 0 && (
              <div style={{ fontSize: '14px', color: C.mutedLight, padding: '8px 0' }}>
                No formulas yet — add one, give it a name, and build it below.
              </div>
            )}

            {formulas.map((f) => {
              const isActive = f.id === activeFormulaId;
              const value = evaluateFormula(f.tokens, resolveVar);
              return (
                <div
                  key={f.id}
                  onClick={() => setActiveFormulaId(f.id)}
                  style={{
                    border: `1px solid ${isActive ? C.navy : C.borderMid}`,
                    borderRadius: '7px', padding: '10px 12px', marginBottom: '8px',
                    cursor: 'pointer', background: isActive ? C.blue1Bg : '#fff',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <input
                      value={f.name}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateFormulaName(f.id, e.target.value)}
                      placeholder="Formula name"
                      style={{ ...inputStyle, flex: 1, fontWeight: 700, background: isActive ? '#fff' : C.surface }}
                    />
                    <span style={{ fontSize: '14px', fontWeight: 700, color: C.navy, minWidth: '70px', textAlign: 'right' }}>
                      {value != null ? value.toFixed(2) : '—'}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteFormula(f.id); }}
                      style={{ fontSize: '18px', cursor: 'pointer', color: C.muted, background: 'none', border: 'none', lineHeight: 1, padding: '0 2px' }}
                    >×</button>
                  </div>
                  <div style={{
                    fontSize: '14px', fontFamily: 'monospace', color: C.text,
                    minHeight: '20px', overflowX: 'auto', whiteSpace: 'nowrap',
                  }}>
                    {f.tokens.length === 0
                      ? <span style={{ color: C.mutedLight }}>tap to build with the calculator below</span>
                      : f.tokens.map((t, i) => (
                          <span key={i} style={{ marginRight: '4px' }}>{renderTokenLabel(t)}</span>
                        ))
                    }
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Calculator pad — applies to whichever formula is active ── */}
          {activeFormula && (
            <div>
              <div style={{ ...sectionLabel, marginBottom: '10px' }}>
                Building "{activeFormula.name}"
              </div>

              {slots.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                  {slots.map((slot) => (
                    <button
                      key={slot.id}
                      onClick={() => pressVar(slot.id)}
                      style={{
                        fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                        padding: '8px 14px', borderRadius: '6px', border: `1px solid ${C.borderMid}`,
                        background: C.navy, color: '#fff',
                      }}
                    >
                      {slot.name}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                <button onClick={() => pressParen('(')} style={calcBtnStyle()}>(</button>
                <button onClick={() => pressParen(')')} style={calcBtnStyle()}>)</button>
                <button onClick={backspace} style={calcBtnStyle()}>⌫</button>
                <button onClick={clearFormula} style={calcBtnStyle('danger')}>AC</button>
                <div />

                {CALC_BUTTONS_ROW1.map((b) => (
                  <button key={b} onClick={() => (/[0-9]/.test(b) ? pressDigit(b) : pressOp(b))} style={calcBtnStyle()}>{b}</button>
                ))}
                <div />
                {CALC_BUTTONS_ROW2.map((b) => (
                  <button key={b} onClick={() => (/[0-9]/.test(b) ? pressDigit(b) : pressOp(b))} style={calcBtnStyle()}>{b}</button>
                ))}
                <div />
                {CALC_BUTTONS_ROW3.map((b) => (
                  <button key={b} onClick={() => (/[0-9]/.test(b) ? pressDigit(b) : pressOp(b))} style={calcBtnStyle()}>{b}</button>
                ))}
                <div />
                {CALC_BUTTONS_ROW4.map((b) => (
                  <button key={b} onClick={() => (/[0-9.]/.test(b) ? pressDigit(b) : pressOp(b))} style={calcBtnStyle()}>{b}</button>
                ))}
                <div />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={footer}>
          {!confirmingRemoveAll ? (
            <button
              onClick={() => setConfirmingRemoveAll(true)}
              style={{
                fontSize: '13px', fontWeight: 600, color: C.danger,
                background: C.dangerBg, border: '1px solid #f3c9c5',
                borderRadius: '6px', padding: '8px 16px', cursor: 'pointer',
                marginRight: 'auto',
              }}
            >
              Remove All
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: 'auto' }}>
              <span style={{ fontSize: '13px', color: C.danger, fontWeight: 600 }}>
                Remove all variables and formulas?
              </span>
              <button onClick={removeAll} style={{
                fontSize: '13px', fontWeight: 700, color: '#fff', background: C.danger,
                border: 'none', borderRadius: '4px', padding: '5px 12px', cursor: 'pointer',
              }}>Yes, remove</button>
              <button onClick={() => setConfirmingRemoveAll(false)} style={{
                fontSize: '13px', color: C.muted, background: '#f3f4f6',
                border: `1px solid ${C.borderMid}`, borderRadius: '4px',
                padding: '5px 10px', cursor: 'pointer',
              }}>Cancel</button>
            </div>
          )}
          <button onClick={onClose} style={{
            fontSize: '13px', fontWeight: 600, color: C.muted,
            background: '#f3f4f6', border: `1px solid ${C.borderMid}`,
            borderRadius: '6px', padding: '8px 20px', cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleSave} style={{
            fontSize: '13px', fontWeight: 700, color: '#fff',
            background: C.navy, border: 'none',
            borderRadius: '6px', padding: '8px 22px', cursor: 'pointer',
          }}>Save</button>
        </div>
      </div>
    </div>
  );
}

function calcBtnStyle(variant = 'default') {
  return {
    fontSize: '16px', fontWeight: 600, cursor: 'pointer',
    padding: '10px 0', borderRadius: '6px',
    border: `1px solid ${C.borderMid}`,
    background: variant === 'danger' ? C.dangerBg : C.surface,
    color: variant === 'danger' ? C.danger : C.text,
  };
}