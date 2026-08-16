const MAX_LEN = 64;
const MAX_VALUE = 1e15;
const MAX_DEPTH = 12;

export function evaluateExpression(input) {
  if (typeof input !== 'string') throw new Error('invalid');
  const source = input.replace(/\s+/g, '');
  if (!source || source.length > MAX_LEN) throw new Error('invalid');
  if (!/^[0-9+\-*/%().]+$/.test(source)) throw new Error('invalid');

  const tokens = tokenize(source);
  const parser = new Parser(tokens);
  const result = parser.parseExpression(0);
  if (parser.index !== tokens.length) throw new Error('invalid');
  if (!Number.isFinite(result) || Math.abs(result) > MAX_VALUE) throw new Error('overflow');
  return result;
}

function tokenize(source) {
  const tokens = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if ('+-*/%()'.includes(ch)) {
      tokens.push({ type: ch });
      i += 1;
      continue;
    }
    if (ch >= '0' && ch <= '9' || ch === '.') {
      const start = i;
      let dots = 0;
      while (i < source.length && (source[i] >= '0' && source[i] <= '9' || source[i] === '.')) {
        if (source[i] === '.') dots += 1;
        i += 1;
      }
      const raw = source.slice(start, i);
      if (!raw || dots > 1 || raw === '.') throw new Error('invalid');
      tokens.push({ type: 'num', value: Number(raw) });
      continue;
    }
    throw new Error('invalid');
  }
  return tokens;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  peek() {
    return this.tokens[this.index];
  }

  eat(type) {
    const token = this.peek();
    if (!token || (type && token.type !== type)) throw new Error('invalid');
    this.index += 1;
    return token;
  }

  parseExpression(depth) {
    if (depth > MAX_DEPTH) throw new Error('invalid');
    let left = this.parseTerm(depth + 1);
    while (this.peek()?.type === '+' || this.peek()?.type === '-') {
      const op = this.eat().type;
      const right = this.parseTerm(depth + 1);
      left = op === '+' ? left + right : left - right;
      assertNumber(left);
    }
    return left;
  }

  parseTerm(depth) {
    if (depth > MAX_DEPTH) throw new Error('invalid');
    let left = this.parseUnary(depth + 1);
    while (this.peek()?.type === '*' || this.peek()?.type === '/' || this.peek()?.type === '%') {
      const op = this.eat().type;
      const right = this.parseUnary(depth + 1);
      if ((op === '/' || op === '%') && right === 0) throw new Error('divzero');
      left = op === '*' ? left * right : op === '/' ? left / right : left % right;
      assertNumber(left);
    }
    return left;
  }

  parseUnary(depth) {
    if (depth > MAX_DEPTH) throw new Error('invalid');
    if (this.peek()?.type === '+') {
      this.eat('+');
      return this.parseUnary(depth + 1);
    }
    if (this.peek()?.type === '-') {
      this.eat('-');
      return -this.parseUnary(depth + 1);
    }
    return this.parsePrimary(depth + 1);
  }

  parsePrimary(depth) {
    if (depth > MAX_DEPTH) throw new Error('invalid');
    const token = this.peek();
    if (!token) throw new Error('invalid');
    if (token.type === 'num') {
      this.eat('num');
      assertNumber(token.value);
      return token.value;
    }
    if (token.type === '(') {
      this.eat('(');
      const value = this.parseExpression(depth + 1);
      this.eat(')');
      return value;
    }
    throw new Error('invalid');
  }
}

function assertNumber(value) {
  if (!Number.isFinite(value) || Math.abs(value) > MAX_VALUE) throw new Error('overflow');
}
