/**
 * Safe expression evaluator for TCA conditions and formulas.
 * Implements a recursive-descent parser that produces an AST evaluated against a context object.
 * NO eval() or new Function().
 */

const BLOCKED_PROPERTIES = new Set(["__proto__", "prototype", "constructor"]);

const WHITELISTED_MATH_FUNCTIONS = {
  "Math.min": Math.min,
  "Math.max": Math.max,
  "Math.floor": Math.floor,
  "Math.ceil": Math.ceil,
  "Math.abs": Math.abs,
  "Math.round": Math.round,
  "Math.clamp": (Math.clamp ? Math.clamp : (val, min, max) => Math.min(Math.max(val, min), max))
};

/**
 * Tokenizes an expression string into an array of tokens.
 * @param {string} input
 * @returns {Array<{ type: string, value: any }>}
 */
function tokenize(input) {
  const tokens = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    const char = input[i];

    // Whitespace
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    // Number literals
    if (/\d/.test(char) || (char === "." && /\d/.test(input[i + 1] || ""))) {
      let numStr = "";
      while (i < len && (/[\d.]/.test(input[i]))) {
        numStr += input[i];
        i++;
      }
      tokens.push({ type: "NUMBER", value: parseFloat(numStr) });
      continue;
    }

    // String literals (single or double quotes)
    if (char === '"' || char === "'") {
      const quote = char;
      i++;
      let str = "";
      while (i < len && input[i] !== quote) {
        if (input[i] === "\\" && i + 1 < len) {
          i++;
          str += input[i];
        } else {
          str += input[i];
        }
        i++;
      }
      if (i < len && input[i] === quote) i++;
      tokens.push({ type: "STRING", value: str });
      continue;
    }

    // Multi-character operators
    const threeChar = input.slice(i, i + 3);
    if (threeChar === "===" || threeChar === "!==") {
      tokens.push({ type: "OPERATOR", value: threeChar });
      i += 3;
      continue;
    }

    const twoChar = input.slice(i, i + 2);
    if (["==", "!=", "<=", ">=", "&&", "||"].includes(twoChar)) {
      tokens.push({ type: "OPERATOR", value: twoChar });
      i += 2;
      continue;
    }

    // Single-character operators and punctuation
    if ("+-*/%><!(),.".includes(char)) {
      tokens.push({ type: char === "(" || char === ")" || char === "," || char === "." ? "PUNCT" : "OPERATOR", value: char });
      i++;
      continue;
    }

    // Identifiers (keywords, variables, property names)
    if (/[a-zA-Z_$]/.test(char)) {
      let ident = "";
      while (i < len && /[a-zA-Z0-9_$]/.test(input[i])) {
        ident += input[i];
        i++;
      }
      if (ident === "true") tokens.push({ type: "BOOLEAN", value: true });
      else if (ident === "false") tokens.push({ type: "BOOLEAN", value: false });
      else if (ident === "null") tokens.push({ type: "NULL", value: null });
      else if (ident === "undefined") tokens.push({ type: "UNDEFINED", value: undefined });
      else tokens.push({ type: "IDENT", value: ident });
      continue;
    }

    // Unknown character: skip
    i++;
  }

  tokens.push({ type: "EOF", value: null });
  return tokens;
}

/**
 * Parser for AST generation.
 */
class ExpressionParser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek() {
    return this.tokens[this.pos];
  }

  consume(expectedType = null, expectedValue = null) {
    const tok = this.tokens[this.pos];
    if (expectedType && tok.type !== expectedType) {
      throw new Error(`Expected token type ${expectedType}, found ${tok.type}`);
    }
    if (expectedValue && tok.value !== expectedValue) {
      throw new Error(`Expected token value ${expectedValue}, found ${tok.value}`);
    }
    this.pos++;
    return tok;
  }

  parse() {
    const node = this.parseLogicalOr();
    if (this.peek().type !== "EOF") {
      throw new Error(`Unexpected token at end of expression: ${this.peek().value}`);
    }
    return node;
  }

  parseLogicalOr() {
    let left = this.parseLogicalAnd();
    while (this.peek().type === "OPERATOR" && this.peek().value === "||") {
      const op = this.consume().value;
      const right = this.parseLogicalAnd();
      left = { type: "BinaryExpression", operator: op, left, right };
    }
    return left;
  }

  parseLogicalAnd() {
    let left = this.parseEquality();
    while (this.peek().type === "OPERATOR" && this.peek().value === "&&") {
      const op = this.consume().value;
      const right = this.parseEquality();
      left = { type: "BinaryExpression", operator: op, left, right };
    }
    return left;
  }

  parseEquality() {
    let left = this.parseRelational();
    while (this.peek().type === "OPERATOR" && ["==", "!=", "===", "!=="].includes(this.peek().value)) {
      const op = this.consume().value;
      const right = this.parseRelational();
      left = { type: "BinaryExpression", operator: op, left, right };
    }
    return left;
  }

  parseRelational() {
    let left = this.parseAdditive();
    while (this.peek().type === "OPERATOR" && ["<", "<=", ">", ">="].includes(this.peek().value)) {
      const op = this.consume().value;
      const right = this.parseAdditive();
      left = { type: "BinaryExpression", operator: op, left, right };
    }
    return left;
  }

  parseAdditive() {
    let left = this.parseMultiplicative();
    while (this.peek().type === "OPERATOR" && ["+", "-"].includes(this.peek().value)) {
      const op = this.consume().value;
      const right = this.parseMultiplicative();
      left = { type: "BinaryExpression", operator: op, left, right };
    }
    return left;
  }

  parseMultiplicative() {
    let left = this.parseUnary();
    while (this.peek().type === "OPERATOR" && ["*", "/", "%"].includes(this.peek().value)) {
      const op = this.consume().value;
      const right = this.parseUnary();
      left = { type: "BinaryExpression", operator: op, left, right };
    }
    return left;
  }

  parseUnary() {
    const tok = this.peek();
    if (tok.type === "OPERATOR" && (tok.value === "!" || tok.value === "-" || tok.value === "+")) {
      const op = this.consume().value;
      const argument = this.parseUnary();
      return { type: "UnaryExpression", operator: op, argument };
    }
    return this.parseMemberOrCall();
  }

  parseMemberOrCall() {
    let node = this.parsePrimary();

    while (true) {
      if (this.peek().type === "PUNCT" && this.peek().value === ".") {
        this.consume();
        const propTok = this.consume("IDENT");
        node = { type: "MemberExpression", object: node, property: propTok.value };
      } else if (this.peek().type === "PUNCT" && this.peek().value === "(") {
        this.consume("PUNCT", "(");
        const args = [];
        if (this.peek().type !== "PUNCT" || this.peek().value !== ")") {
          while (true) {
            args.push(this.parseLogicalOr());
            if (this.peek().type === "PUNCT" && this.peek().value === ",") {
              this.consume("PUNCT", ",");
            } else {
              break;
            }
          }
        }
        this.consume("PUNCT", ")");
        node = { type: "CallExpression", callee: node, arguments: args };
      } else {
        break;
      }
    }

    return node;
  }

  parsePrimary() {
    const tok = this.peek();

    if (tok.type === "NUMBER" || tok.type === "STRING" || tok.type === "BOOLEAN" || tok.type === "NULL" || tok.type === "UNDEFINED") {
      this.consume();
      return { type: "Literal", value: tok.value };
    }

    if (tok.type === "IDENT") {
      this.consume();
      return { type: "Identifier", name: tok.value };
    }

    if (tok.type === "PUNCT" && tok.value === "(") {
      this.consume("PUNCT", "(");
      const expr = this.parseLogicalOr();
      this.consume("PUNCT", ")");
      return expr;
    }

    throw new Error(`Unexpected token: ${tok.type} (${tok.value})`);
  }
}

/**
 * Evaluates an AST against a runtime context object.
 * @param {object} ast
 * @param {object} context
 * @returns {*}
 */
function evaluateAST(ast, context) {
  if (!ast) return null;

  switch (ast.type) {
    case "Literal":
      return ast.value;

    case "Identifier": {
      if (ast.name === "Math") return "Math";
      return context?.[ast.name];
    }

    case "MemberExpression": {
      const obj = evaluateAST(ast.object, context);
      if (obj === "Math" && ast.property) {
        return `Math.${ast.property}`;
      }
      if (obj === null || obj === undefined) return undefined;
      if (BLOCKED_PROPERTIES.has(ast.property)) return undefined;
      return obj[ast.property];
    }

    case "CallExpression": {
      let calleeName = null;
      if (ast.callee.type === "MemberExpression") {
        calleeName = evaluateAST(ast.callee, context);
      } else if (ast.callee.type === "Identifier") {
        calleeName = ast.callee.name;
      }

      if (typeof calleeName === "string" && WHITELISTED_MATH_FUNCTIONS[calleeName]) {
        const fn = WHITELISTED_MATH_FUNCTIONS[calleeName];
        const evaluatedArgs = ast.arguments.map(arg => evaluateAST(arg, context));
        return fn(...evaluatedArgs);
      }

      console.warn(`ExpressionEvaluator | Disallowed function call: ${calleeName}`);
      return null;
    }

    case "UnaryExpression": {
      const argVal = evaluateAST(ast.argument, context);
      if (ast.operator === "!") return !argVal;
      if (ast.operator === "-") return -Number(argVal);
      if (ast.operator === "+") return +Number(argVal);
      return null;
    }

    case "BinaryExpression": {
      const leftVal = evaluateAST(ast.left, context);
      
      // Short-circuiting logical operations
      if (ast.operator === "&&") {
        return leftVal ? evaluateAST(ast.right, context) : leftVal;
      }
      if (ast.operator === "||") {
        return leftVal ? leftVal : evaluateAST(ast.right, context);
      }

      const rightVal = evaluateAST(ast.right, context);

      switch (ast.operator) {
        case "==": return leftVal == rightVal;
        case "!=": return leftVal != rightVal;
        case "===": return leftVal === rightVal;
        case "!==": return leftVal !== rightVal;
        case ">": return leftVal > rightVal;
        case ">=": return leftVal >= rightVal;
        case "<": return leftVal < rightVal;
        case "<=": return leftVal <= rightVal;
        case "+": return leftVal + rightVal;
        case "-": return leftVal - rightVal;
        case "*": return leftVal * rightVal;
        case "/": return rightVal !== 0 ? leftVal / rightVal : 0;
        case "%": return rightVal !== 0 ? leftVal % rightVal : 0;
        default: return null;
      }
    }

    default:
      return null;
  }
}

/**
 * Evaluate an expression string and return the raw result.
 * @param {string} expression
 * @param {object} [context={}]
 * @returns {*}
 */
export function evaluateExpression(expression, context = {}) {
  if (!expression || typeof expression !== "string" || expression.trim() === "") {
    return null;
  }

  try {
    const tokens = tokenize(expression);
    const parser = new ExpressionParser(tokens);
    const ast = parser.parse();
    return evaluateAST(ast, context);
  } catch (err) {
    console.warn(`ExpressionEvaluator | Failed to evaluate expression "${expression}":`, err);
    return null;
  }
}

/**
 * Evaluate a condition expression string against a context object.
 * Returns true for empty/null/undefined expressions (no condition = always true).
 * @param {string} expression
 * @param {object} [context={}]
 * @returns {boolean}
 */
export function evaluateCondition(expression, context = {}) {
  if (!expression || typeof expression !== "string" || expression.trim() === "") {
    return true;
  }

  try {
    const result = evaluateExpression(expression, context);
    return Boolean(result);
  } catch (err) {
    console.warn(`ExpressionEvaluator | Condition evaluation error on "${expression}":`, err);
    return false;
  }
}
