import { useState, useMemo } from 'react';

// ─── Design tokens — matches the grid's navy/white palette ───────────────────
const C = {
  navy: '#1a2340',
  navyLight: '#1f2a4a',
  blue1Bg: '#c3d4f5',
  blue1Text: '#0c0f17',
  white: '#ffffff',
  surface: '#f8fafc',
  border: '#e5e7eb',
  borderMid: '#d1d5db',
  text: '#111827',
  muted: '#6b7280',
  mutedLight: '#9ca3af',
  chipBg: '#f3f4f6',
  assignedBg: '#1a2340',
  assignedText: '#ffffff',
  dropActive: '#eef2fb',
  dropBorder: '#1a2340',
  danger: '#e0291b',
  dangerBg: '#fff5f5',
};

const MODE_LABELS = { account: 'Account', qtUser: 'Trader', ctcl: 'Client Code' };

const MODE_DESCRIPTIONS = {
  account: 'Assign trade accounts to custom groups. Each account\u2019s Trader(s) and, if enabled, account row will nest underneath automatically.',
  qtUser:  'Assign Traders to custom groups. Each user\u2019s accounts will nest underneath (if account rows are enabled). Margin shows at this level.',
  ctcl:    'Assign Client Codes to custom groups. Traders and accounts under each Client Code nest underneath automatically.',
};

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(15,20,40,0.45)',
  zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const modal = {
  background: C.white, borderRadius: '10px', width: '820px', maxWidth: '96vw',
  maxHeight: '88vh', display: 'flex', flexDirection: 'column',
  boxShadow: '0 12px 48px rgba(0,0,0,0.22)',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const header = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '16px 22px', background: C.navy, borderRadius: '10px 10px 0 0',
  borderBottom: `2px solid ${C.navyLight}`,
};

const body = {
  display: 'flex', flex: 1, overflow: 'hidden',
};

const footer = {
  padding: '14px 22px', borderTop: `1px solid ${C.border}`,
  display: 'flex', justifyContent: 'flex-end', gap: '10px',
  background: C.surface,
};

const reorderBtn = (disabled) => ({
  fontSize: '10px', cursor: disabled ? 'default' : 'pointer',
  color: C.muted, background: 'none',
  border: `1px solid ${C.borderMid}`,
  borderRadius: '3px', lineHeight: 1,
  padding: '2px 4px', opacity: disabled ? 0.3 : 1,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
});

// Member chip (unassigned panel)
const MemberChip = ({ member, onDragStart, onDragEnd }) => (
  <div
    draggable
    onDragStart={() => onDragStart(member)}
    onDragEnd={onDragEnd}
    style={{
      padding: '5px 11px', borderRadius: '4px', fontSize: '15px',
      fontWeight: 500, cursor: 'grab', userSelect: 'none',
      background: C.chipBg, color: C.text, marginBottom: '5px',
      border: `1px solid ${C.borderMid}`, display: 'block',
      letterSpacing: '0.1px',
    }}
  >
    {member}
  </div>
);

// Assigned chip (inside a group's drop zone)
const AssignedChip = ({ member, onRemove, onDragStart, onDragEnd }) => (
  <span
    draggable
    onDragStart={() => onDragStart(member)}
    onDragEnd={onDragEnd}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '3px 8px 3px 10px', borderRadius: '4px', fontSize: '15px',
      fontWeight: 500, background: C.assignedBg, color: C.assignedText,
      cursor: 'grab', userSelect: 'none',
    }}
  >
    {member}
    <span
      onClick={(e) => { e.stopPropagation(); onRemove(member); }}
      style={{ cursor: 'pointer', opacity: 0.65, fontSize: '14px', lineHeight: 1 }}
    >×</span>
  </span>
);

// Drop zone — one per group (single level, no sub-groups anymore)
const DropZone = ({ members, groupId, dragOver, onDragOver, onDragLeave, onDrop, onRemove, onDragStart, onDragEnd, modeLabel }) => {
  const isOver = dragOver === groupId;
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); onDragOver(groupId); }}
      onDragLeave={onDragLeave}
      onDrop={() => onDrop(groupId)}
      style={{
        minHeight: '36px', border: `2px dashed ${isOver ? C.dropBorder : C.borderMid}`,
        borderRadius: '5px', padding: '4px 6px',
        display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center',
        background: isOver ? C.dropActive : 'transparent',
        transition: 'border-color 0.12s, background 0.12s',
        flex: 1,
      }}
    >
      {members.length === 0 && (
        <span style={{ fontSize: '14px', color: C.mutedLight, padding: '2px 4px' }}>
          Drop {modeLabel.toLowerCase()}s here
        </span>
      )}
      {members.map(m => (
        <AssignedChip
          key={m} member={m}
          onRemove={onRemove}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />
      ))}
    </div>
  );
};

// ─── Mode picker screen — shown when no grouping mode is active yet ──────────
const ModePicker = ({ onPick, onClose }) => (
  <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
    <div style={{ ...modal, width: '620px' }}>
      <div style={header}>
        <span style={{ fontSize: '15px', fontWeight: 700, color: '#fff', letterSpacing: '0.2px' }}>
          Grouping — choose a type
        </span>
        <button onClick={onClose} style={{
          fontSize: '22px', cursor: 'pointer', color: '#fff',
          background: 'none', border: 'none', lineHeight: 1, padding: '0 2px', opacity: 0.8,
        }}>×</button>
      </div>
      <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {['account', 'qtUser', 'ctcl'].map((m) => (
          <div
            key={m}
            onClick={() => onPick(m)}
            style={{
              border: `1px solid ${C.borderMid}`, borderRadius: '8px',
              padding: '14px 16px', cursor: 'pointer',
              transition: 'border-color 0.12s, background 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.navy; e.currentTarget.style.background = C.surface; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.borderMid; e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{ fontSize: '14px', fontWeight: 700, color: C.text, marginBottom: '4px' }}>
              Group by {MODE_LABELS[m]}
            </div>
            <div style={{ fontSize: '13px', color: C.muted, lineHeight: 1.4 }}>
              {MODE_DESCRIPTIONS[m]}
            </div>
          </div>
        ))}
      </div>
      <div style={footer}>
        <button onClick={onClose} style={{
          fontSize: '13px', fontWeight: 600, color: C.muted,
          background: '#f3f4f6', border: `1px solid ${C.borderMid}`,
          borderRadius: '6px', padding: '8px 20px', cursor: 'pointer',
        }}>Cancel</button>
      </div>
    </div>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────
// Config structure now:
//   { mode: 'account' | 'qtUser' | 'ctcl', groups: [{ id, name, members: [...] }] }
// Anything not assigned to a group falls into an automatic "Ungrouped" bucket
// at render time in the grid — this modal doesn't need to represent that bucket
// itself, it only manages explicit groups.
//
// memberOptions = { account: [...ids], qtUser: [...names], ctcl: [...ids] }
// — the full candidate list for whichever mode is active, supplied by the grid.

export default function GroupingModal({ initialConfig, memberOptions, onSave, onClose }) {
  const hasExistingMode = !!(initialConfig && initialConfig.mode);

  const [mode, setMode] = useState(hasExistingMode ? initialConfig.mode : null);
  const [groups, setGroups] = useState(() =>
    hasExistingMode && Array.isArray(initialConfig.groups) ? initialConfig.groups : []
  );
  const [newGroupName, setNewGroupName] = useState('');
  const [addingGroup, setAddingGroup] = useState(false);
  const [dragMember, setDragMember] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const allMembers = mode ? (memberOptions[mode] || []) : [];
  const modeLabel = mode ? MODE_LABELS[mode] : '';

  const assignedMembers = useMemo(() => {
    const s = new Set();
    groups.forEach(g => (g.members || []).forEach(m => s.add(m)));
    return s;
  }, [groups]);

  const unassignedMembers = useMemo(() =>
    allMembers.filter(m => !assignedMembers.has(m)).sort(),
    [allMembers, assignedMembers]
  );

  // ── Mode selection (only reachable when there's no active mode) ────────────
  if (!mode) {
    return (
      <ModePicker
        onPick={(m) => setMode(m)}
        onClose={onClose}
      />
    );
  }

  // ── Group management ────────────────────────────────────────────────────────
  const confirmAddGroup = () => {
    const name = newGroupName.trim();
    if (!name) return;
    setGroups(prev => [...prev, { id: Date.now(), name, members: [] }]);
    setNewGroupName('');
    setAddingGroup(false);
  };

  const deleteGroup = (gIdx) => setGroups(prev => prev.filter((_, i) => i !== gIdx));

  const moveGroup = (gIdx, dir) => {
    setGroups(prev => {
      const next = [...prev];
      const targetIdx = gIdx + dir;
      if (targetIdx < 0 || targetIdx >= next.length) return prev;
      [next[gIdx], next[targetIdx]] = [next[targetIdx], next[gIdx]];
      return next;
    });
  };

  const updateGroupName = (gIdx, name) =>
    setGroups(prev => prev.map((g, i) => i === gIdx ? { ...g, name } : g));

  // ── Remove member from any group ────────────────────────────────────────────
  const removeMember = (member) => {
    setGroups(prev => prev.map(g => ({
      ...g,
      members: (g.members || []).filter(m => m !== member),
    })));
  };

  // ── Drag & drop ─────────────────────────────────────────────────────────────
  const onDragStart = (member) => setDragMember(member);
  const onDragEnd = () => { setDragMember(null); setDragOver(null); };

  const onDrop = (groupId) => {
    if (!dragMember) return;
    setGroups(prev => prev.map(g => {
      const withoutMember = (g.members || []).filter(m => m !== dragMember);
      return g.id === groupId
        ? { ...g, members: [...withoutMember, dragMember] }
        : { ...g, members: withoutMember };
    }));
    setDragMember(null);
    setDragOver(null);
  };

  // ── Remove grouping entirely — unlocks the other two modes ─────────────────
  // This saves and closes immediately, rather than just switching local
  // state — the mode-picker screen (shown once mode is null) has no Save
  // button, so waiting for one would mean the removal never actually reaches
  // the store.
  const confirmRemoveGrouping = () => {
    onSave({ mode: null, groups: [] });
    onClose();
  };

  const handleSave = () => {
    const cleaned = groups
      .filter(g => g.name.trim())
      .map(g => ({
        id: g.id,
        name: g.name.trim(),
        members: g.members || [],
      }));
    onSave({ mode, groups: cleaned });
  };

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modal}>

        {/* Header */}
        <div style={header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#fff', letterSpacing: '0.2px' }}>
              Grouping
            </span>
            <span style={{
              fontSize: '11px', fontWeight: 700, color: C.navy,
              background: C.blue1Bg, borderRadius: '999px',
              padding: '3px 10px', letterSpacing: '0.3px',
            }}>
              By {modeLabel}
            </span>
          </div>
          <button onClick={onClose} style={{
            fontSize: '22px', cursor: 'pointer', color: '#fff',
            background: 'none', border: 'none', lineHeight: 1, padding: '0 2px', opacity: 0.8,
          }}>×</button>
        </div>

        {/* Body */}
        <div style={body}>

          {/* Left — unassigned members */}
          <div style={{
            width: '200px', flexShrink: 0, borderRight: `1px solid ${C.border}`,
            display: 'flex', flexDirection: 'column', background: C.surface,
          }}>
            <div style={{
              padding: '10px 14px 8px', fontSize: '13px', fontWeight: 700,
              color: C.muted, textTransform: 'uppercase', letterSpacing: '0.6px',
              borderBottom: `1px solid ${C.border}`,
            }}>
              Unassigned
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px' }}>
              {unassignedMembers.length === 0
                ? <div style={{ fontSize: '13px', color: C.mutedLight, padding: '4px 2px' }}>
                    All {modeLabel.toLowerCase()}s assigned
                  </div>
                : unassignedMembers.map(m => (
                  <MemberChip key={m} member={m} onDragStart={onDragStart} onDragEnd={onDragEnd} />
                ))
              }
            </div>
            <div style={{ padding: '10px 12px', borderTop: `1px solid ${C.border}`, fontSize: '11px', color: C.mutedLight, lineHeight: 1.4 }}>
              Anything left unassigned shows under an automatic "Ungrouped" bucket in the grid.
            </div>
          </div>

          {/* Right — groups */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{
              padding: '10px 16px 8px', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', borderBottom: `1px solid ${C.border}`,
              background: C.surface,
            }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                Groups
              </span>
              {!addingGroup && (
                <button
                  onClick={() => setAddingGroup(true)}
                  style={{
                    fontSize: '13px', fontWeight: 600, color: C.navy,
                    background: C.blue1Bg, border: `1px solid #b0c4e8`,
                    borderRadius: '4px', padding: '4px 12px', cursor: 'pointer',
                  }}
                >
                  + Add Group
                </button>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>

              {/* New group name input */}
              {addingGroup && (
                <div style={{
                  display: 'flex', gap: '8px', marginBottom: '12px',
                  padding: '10px 12px', background: C.blue1Bg,
                  borderRadius: '6px', border: `1px solid #b0c4e8`,
                }}>
                  <input
                    autoFocus
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') confirmAddGroup(); if (e.key === 'Escape') setAddingGroup(false); }}
                    placeholder="Group name..."
                    style={{
                      flex: 1, fontSize: '14px', fontWeight: 600, color: C.text,
                      border: `1px solid ${C.borderMid}`, borderRadius: '4px',
                      padding: '5px 10px', outline: 'none', background: '#fff',
                    }}
                  />
                  <button onClick={confirmAddGroup} style={{
                    fontSize: '13px', fontWeight: 700, color: '#fff', background: C.navy,
                    border: 'none', borderRadius: '4px', padding: '5px 14px', cursor: 'pointer',
                  }}>Add</button>
                  <button onClick={() => { setAddingGroup(false); setNewGroupName(''); }} style={{
                    fontSize: '13px', fontWeight: 600, color: C.muted,
                    background: '#f3f4f6', border: `1px solid ${C.borderMid}`,
                    borderRadius: '4px', padding: '5px 10px', cursor: 'pointer',
                  }}>Cancel</button>
                </div>
              )}

              {groups.length === 0 && !addingGroup && (
                <div style={{ fontSize: '13px', color: C.muted, padding: '32px 0', textAlign: 'center' }}>
                  No groups defined yet — all {modeLabel.toLowerCase()}s will show under "Ungrouped".<br />
                  <span style={{ fontSize: '12px', color: C.mutedLight }}>Click "Add Group" to start.</span>
                </div>
              )}

              {groups.map((g, gIdx) => (
                <div key={g.id} style={{
                  border: `1px solid ${C.borderMid}`, borderRadius: '7px',
                  marginBottom: '12px', overflow: 'hidden',
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '9px 12px', background: C.blue1Bg,
                    borderBottom: `1px solid #b0c4e8`,
                  }}>
                    <span style={{ fontSize: '14px', color: C.blue1Text, fontWeight: 600, flexShrink: 0 }}>▶</span>
                    <input
                      value={g.name}
                      onChange={e => updateGroupName(gIdx, e.target.value)}
                      style={{
                        flex: 1, fontSize: '14px', fontWeight: 700, color: C.blue1Text,
                        border: 'none', background: 'transparent', outline: 'none', padding: '1px 0',
                      }}
                    />
                    <button onClick={() => moveGroup(gIdx, -1)} disabled={gIdx === 0} style={reorderBtn(gIdx === 0)} title="Move up">▲</button>
                    <button onClick={() => moveGroup(gIdx, 1)} disabled={gIdx === groups.length - 1} style={reorderBtn(gIdx === groups.length - 1)} title="Move down">▼</button>
                    <button onClick={() => deleteGroup(gIdx)} style={{
                      fontSize: '17px', cursor: 'pointer', color: C.muted,
                      background: 'none', border: 'none', lineHeight: 1, padding: '0 2px',
                    }}>×</button>
                  </div>

                  <div style={{ padding: '10px 12px' }}>
                    <DropZone
                      members={g.members || []}
                      groupId={g.id}
                      dragOver={dragOver}
                      onDragOver={setDragOver}
                      onDragLeave={() => setDragOver(null)}
                      onDrop={onDrop}
                      onRemove={removeMember}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                      modeLabel={modeLabel}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={footer}>
          {!confirmingRemove ? (
            <button
              onClick={() => setConfirmingRemove(true)}
              style={{
                fontSize: '13px', fontWeight: 600, color: C.danger,
                background: C.dangerBg, border: `1px solid #f3c9c5`,
                borderRadius: '6px', padding: '8px 16px', cursor: 'pointer',
                marginRight: 'auto',
              }}
            >
              Remove Grouping
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: 'auto' }}>
              <span style={{ fontSize: '13px', color: C.danger, fontWeight: 600 }}>
                Remove this grouping entirely?
              </span>
              <button onClick={confirmRemoveGrouping} style={{
                fontSize: '13px', fontWeight: 700, color: '#fff', background: C.danger,
                border: 'none', borderRadius: '4px', padding: '5px 12px', cursor: 'pointer',
              }}>Yes, remove</button>
              <button onClick={() => setConfirmingRemove(false)} style={{
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
          }}>Save Grouping</button>
        </div>
      </div>
    </div>
  );
}