import { useDataStore } from '../store/dataStore';
import { evaluateFormula } from '../utils/customCalcEvaluator';

export default function CustomCalcTicker() {
  const customCalcConfig = useDataStore(s => s.customCalcConfig);
  const headerLtps = useDataStore(s => s.headerLtps);

  const slots = customCalcConfig?.slots || [];
  const formulas = customCalcConfig?.formulas || [];

  const resolveVar = (slotId) => {
    const slot = slots.find((s) => s.id === slotId);
    if (!slot || !slot.subscriptionKey) return null;
    return headerLtps?.[slot.subscriptionKey]?.ltp ?? null;
  };

  // Always occupy its half of the header (even when empty), matching
  // LtpTicker's own empty-state behavior — keeps the 50/50 split stable
  // regardless of whether either side currently has content.
  if (formulas.length === 0) return <div style={{ width: '100%', minWidth: 0 }} />;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      overflowX: 'auto', width: '100%', minWidth: 0, padding: '0 14px',
    }}>
      {formulas.map((f) => {
        const value = evaluateFormula(f.tokens, resolveVar);
        return (
          <div
            key={f.id}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '4px 10px', borderRadius: '5px', flexShrink: 0,
              background: '#f3f4f6', border: '1px solid #e5e7eb',
            }}
          >
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>
              {f.name}
            </span>
            <span style={{
              fontSize: '14px', fontWeight: 600, fontVariantNumeric: 'tabular-nums',
              color: '#6b7280',
            }}>
              {value != null ? value.toFixed(2) : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}