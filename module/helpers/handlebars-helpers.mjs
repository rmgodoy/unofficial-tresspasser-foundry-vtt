/**
 * Register custom Handlebars helpers for the Trespasser system.
 */
export function registerHandlebarsHelpers() {
  Handlebars.registerHelper("trespasserChecked", (value) => (value ? "checked" : ""));
  Handlebars.registerHelper("trespasserGt", (a, b) => a > b);
  Handlebars.registerHelper("gt", (a, b) => a > b);
  Handlebars.registerHelper("eq", (a, b) => a === b);
  Handlebars.registerHelper("or", (...args) => args.slice(0, -1).some(Boolean));
  Handlebars.registerHelper("and", (...args) => args.slice(0, -1).every(Boolean));
  Handlebars.registerHelper("ne", (a, b) => a !== b);
  Handlebars.registerHelper("array", (...args) => args.slice(0, -1));
  Handlebars.registerHelper("capitalize", (str) => {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
  });
  Handlebars.registerHelper("concat", (...args) => args.slice(0, -1).join(""));
  Handlebars.registerHelper("lookup", (obj, key) => obj?.[key]);
  Handlebars.registerHelper("unless", Handlebars.helpers.unless);
  Handlebars.registerHelper("times", (n, block) => {
    let result = "";
    for (let i = 0; i < n; i++) result += block.fn(i);
    return result;
  });
  Handlebars.registerHelper("math", (lvalue, operator, rvalue) => {
    lvalue = parseFloat(lvalue);
    rvalue = parseFloat(rvalue);
    return {
      "+": lvalue + rvalue,
      "-": lvalue - rvalue,
      "*": lvalue * rvalue,
      "/": lvalue / rvalue,
      "%": lvalue % rvalue
    }[operator];
  });
  Handlebars.registerHelper("sum", function(a, b) {
    return a + b;
  });
}
