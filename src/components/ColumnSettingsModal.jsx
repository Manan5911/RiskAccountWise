// src/components/ColumnSettingsModal.jsx
import { useState, useCallback } from 'react';

const C = {
  overlay:      'rgba(20, 24, 36, 0.45)',
  panelBg:      '#ffffff',
  border:       '#e2e6ed',
  borderStrong: '#c8cdd6',
  text:         '#1a1f2e',
  muted:        '#6b7585',
  rowHover:     '#f7f9fc',
  dragOver:     '#e8edf8',
  accent:       '#1a5fb4',
  danger:       '#c0392b',
};

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: C.overlay,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
  },
  panel: {
    background: C.panelBg, borderRadius: '10px',
    width: '380px', maxHeight: '70vh',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 12px 32px rgba(20,24,36,0.25)',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  headerRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 16px', borderBottom: `1px solid ${C.border}`,
  },
  title: { fontSize: '14px', fontWeight: 700, color: C.text },
  closeBtn: {
    cursor: 'pointer', fontSize: '18px', lineHeight: 1, color: C.muted,
    background: 'none', border: 'none', padding: '0 4px',
  },
  body: { padding: '8px 0', overflowY: 'auto', flex: 1 },
  fixedRow: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '8px 16px', color: C.muted, fontSize: '12px',
  },
  row: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '8px 16px', cursor: 'grab', userSelect: 'none',
    borderTop: `1px solid transparent`, borderBottom: `1px solid transparent`,
  },
  dragHandle: { fontSize: '13px', color: C.muted, cursor: 'grab', flexShrink: 0 },
  checkbox: { width: '14px', height: '14px', flexShrink: 0, cursor: 'pointer' },
  label: { fontSize: '13px', color: C.text, flex: 1 },
  footer: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 16px', borderTop: `1px solid ${C.border}`,
  },
  resetBtn: {
    fontSize: '12px', color: C.muted, background: 'none', border: 'none',
    cursor: 'pointer', textDecoration: 'underline', padding: 0,
  },
  doneBtn: {
    fontSize: '13px', fontWeight: 600, color: '#ffffff', background: C.accent,
    border: 'none', borderRadius: '6px', padding: '7px 16px', cursor: 'pointer',
  },
};

export default function ColumnSettingsModal({
  columns,        // full COLUMNS array (for header labels), excluding 'user'
  order,          // array of column ids in current order
  hidden,         // Set of hidden column ids
  onToggleVisibility,
  onReorder,
  onReset,
  onClose,
}) {
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  const colById = useCallback(
    (id) => columns.find((c) => c.id === id),
    [columns]
  );

  const handleDragStart = useCallback((id) => (e) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((id) => (e) => {
    e.preventDefault();
    if (id !== dragId) setDragOverId(id);
  }, [dragId]);

  const handleDragLeave = useCallback(() => setDragOverId(null), []);

  const handleDrop = useCallback((targetId) => (e) => {
    e.preventDefault();
    if (dragId && dragId !== targetId) onReorder(dragId, targetId);
    setDragId(null);
    setDragOverId(null);
  }, [dragId, onReorder]);

  const handleDragEnd = useCallback(() => {
    setDragId(null);
    setDragOverId(null);
  }, []);

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.panel} onClick={(e) => e.stopPropagation()}>
        <div style={S.headerRow}>
          <span style={S.title}>Customize Columns</span>
          <button style={S.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        <div style={S.body}>
          <div style={S.fixedRow}>
            <span style={{ width: '13px' }} />
            <span style={{ width: '14px' }} />
            <span style={S.label}>Name <em style={{ color: C.muted }}>(always visible)</em></span>
          </div>

          {order.map((id) => {
            const col = colById(id);
            if (!col) return null;
            const isHidden = hidden.has(id);
            const isDragOver = dragOverId === id;

            return (
              <div
                key={id}
                draggable
                onDragStart={handleDragStart(id)}
                onDragOver={handleDragOver(id)}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop(id)}
                onDragEnd={handleDragEnd}
                style={{
                  ...S.row,
                  background: isDragOver ? C.dragOver : 'transparent',
                  borderTop: isDragOver ? `1px solid ${C.borderStrong}` : S.row.borderTop,
                  opacity: dragId === id ? 0.4 : 1,
                }}
              >
                <span style={S.dragHandle}>⠿</span>
                <input
                  type="checkbox"
                  style={S.checkbox}
                  checked={!isHidden}
                  onChange={() => onToggleVisibility(id)}
                />
                <span style={{ ...S.label, color: isHidden ? C.muted : C.text }}>
                  {col.header}
                </span>
              </div>
            );
          })}
        </div>

        <div style={S.footer}>
          <button style={S.resetBtn} onClick={onReset}>Reset to default</button>
          <button style={S.doneBtn} onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}