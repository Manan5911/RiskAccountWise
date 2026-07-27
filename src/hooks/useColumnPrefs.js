import { useState, useEffect, useCallback, useRef } from 'react';
import { useDataStore } from '../store/dataStore';

export function useColumnPrefs(columnIds, userKey) {
  const [order, setOrder] = useState(columnIds);
  const [hidden, setHidden] = useState(new Set());
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);
  const skipSaveRef = useRef(false);
  const saveTimerRef = useRef(null);

  const customColumns = useDataStore(state => state.customColumns);
  const saveCustomColumns = useDataStore(state => state.saveCustomColumns);
  const port = window.location.port || '80';

  // ── Load from store when customColumns arrives ─────────────────────────────
  useEffect(() => {
    if (customColumns === null) return;
    if (loadedRef.current) return;

    skipSaveRef.current = true; // prevent save trigger on load

    if (customColumns.order && customColumns.order.length > 0) {
      const knownSet = new Set(columnIds);
      const reconciledOrder = customColumns.order.filter(id => knownSet.has(id));
      const savedSet = new Set(reconciledOrder);
      const newColumns = []; // columns not in saved config
      columnIds.forEach((id, idx) => {
        if (!savedSet.has(id)) {
          const prevInNatural = columnIds.slice(0, idx).reverse().find(pid => savedSet.has(pid));
          const insertAfter = prevInNatural ? reconciledOrder.indexOf(prevInNatural) : -1;
          reconciledOrder.splice(insertAfter + 1, 0, id);
          savedSet.add(id);
          newColumns.push(id);
        }
      });

      // Default hidden columns — applied to new columns not in saved config
      const DEFAULT_HIDDEN = new Set(['othersMtm']);
      const savedHidden = new Set((customColumns.hidden || []).filter(id => knownSet.has(id)));
      // Hide new columns that should be hidden by default
      newColumns.forEach(id => { if (DEFAULT_HIDDEN.has(id)) savedHidden.add(id); });

      setOrder(reconciledOrder);
      setHidden(savedHidden);
    } else {
      setOrder(columnIds);
      setHidden(new Set());
    }

    loadedRef.current = true;
    setLoaded(true);
  }, [customColumns]);

  // ── Persist to DB on every change — debounced, skip on initial load ────────
  useEffect(() => {
    if (!loaded) return;
    if (skipSaveRef.current) {
      skipSaveRef.current = false; // reset flag, don't save this time
      return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveCustomColumns(order, hidden, port);
    }, 1000);

    return () => clearTimeout(saveTimerRef.current);
  }, [order, hidden, loaded]);

  const toggleVisibility = useCallback((id) => {
    setHidden(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const reorder = useCallback((draggedId, targetId) => {
    setOrder(prev => {
      if (draggedId === targetId) return prev;
      const next = [...prev];
      const fromIdx = next.indexOf(draggedId);
      const toIdx = next.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, draggedId);
      return next;
    });
  }, []);

  const resetToDefault = useCallback(() => {
    setOrder(columnIds);
    setHidden(new Set(['othersMtm']));
  }, []);

  return { order, hidden, toggleVisibility, reorder, resetToDefault, loaded };
}