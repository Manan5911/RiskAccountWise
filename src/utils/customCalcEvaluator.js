// Evaluates a formula stored as a token array — see dataStore.js's
// customCalcConfig shape. Deliberately NOT eval()/new Function(): since the
// only tokens that can ever exist are the ones our own calculator buttons
// produce, this is a small, fully-known grammar, safe to hand-parse.
//
// Grammar (standard precedence):
//   expression := term (('+' | '-') term)*
//   term       := factor (('×' | '÷' | '%') factor)*
//   factor     := ('-')* primary          // supports unary minus, incl. repeated
//   primary    := NUMBER | VAR | '(' expression ')'
//
// resolveVar(slotId) => number | null — caller supplies current live values.
// Returns null (never throws, never NaN/Infinity) if the formula is
// incomplete, malformed, divides by zero, or references a variable with no
// current value — callers should render null as a placeholder (e.g. "—").

export function evaluateFormula(tokens, resolveVar) {
  if (!tokens || tokens.length === 0) return null;

  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const isOp = (tok, ...values) => tok && tok.type === 'op' && values.includes(tok.value);
  const isParen = (tok, value) => tok && tok.type === 'paren' && tok.value === value;

  function parseExpression() {
    let value = parseTerm();
    while (isOp(peek(), '+', '-')) {
      const op = next().value;
      const rhs = parseTerm();
      if (value == null || rhs == null) { value = null; continue; }
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  }

  function parseTerm() {
    let value = parseFactor();
    while (isOp(peek(), '×', '÷', '%')) {
      const op = next().value;
      const rhs = parseFactor();
      if (value == null || rhs == null) { value = null; continue; }
      if (op === '×') value = value * rhs;
      else if (op === '÷') value = (rhs === 0) ? null : value / rhs;
      else value = (rhs === 0) ? null : value % rhs;
    }
    return value;
  }

  function parseFactor() {
    let negate = false;
    while (isOp(peek(), '-')) {
      next();
      negate = !negate;
    }
    const value = parsePrimary();
    if (value == null) return null;
    return negate ? -value : value;
  }

  function parsePrimary() {
    const tok = peek();
    if (!tok) return null;

    if (tok.type === 'num') {
      next();
      const n = parseFloat(tok.value);
      return isNaN(n) ? null : n;
    }

    if (tok.type === 'var') {
      next();
      const v = resolveVar(tok.slotId);
      return (typeof v === 'number' && isFinite(v)) ? v : null;
    }

    if (isParen(tok, '(')) {
      next();
      const inner = parseExpression();
      if (isParen(peek(), ')')) next(); // tolerate a missing close-paren rather than throwing
      return inner;
    }

    return null; // unexpected token — malformed formula, fail soft
  }

  const result = parseExpression();
  // Leftover unconsumed tokens (e.g. a trailing operator) → treat as
  // incomplete rather than silently ignoring the tail.
  if (pos !== tokens.length) return null;
  return (typeof result === 'number' && isFinite(result)) ? result : null;
}