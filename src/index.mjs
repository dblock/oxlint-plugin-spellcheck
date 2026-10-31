import { getDictionary } from "./dictionaries.mjs";
import { commentSpans } from "./comments.mjs";
import { mappedText, words } from "./text.mjs";

const attributes = new Set([
  "alt",
  "title",
  "placeholder",
  "aria-label",
  "aria-description",
]);
const defaults = {
  dictionaries: ["builtin:en"],
  comments: true,
  jsx: true,
  strings: false,
  identifiers: false,
};

function excludedString(node) {
  if (node.type === "TemplateElement") {
    node = node.parent;
    if (node.parent?.type === "TaggedTemplateExpression") return true;
  }
  const parent = node.parent;
  if (!parent) return false;
  if (
    parent.source === node ||
    parent.key === node ||
    parent.property === node ||
    parent.type === "ImportAttribute" ||
    (parent.type === "ExpressionStatement" && parent.directive !== undefined)
  )
    return true;
  if (parent.arguments?.[0] === node) {
    const callee = parent.callee;
    if (parent.type === "NewExpression" && callee?.name === "URL") return true;
    if (callee?.type === "Import" || callee?.name === "require") return true;
    if (
      callee?.type === "MemberExpression" &&
      !callee.computed &&
      ((callee.object.name === "module" &&
        callee.property.name === "require") ||
        (callee.object.name === "require" &&
          callee.property.name === "resolve") ||
        (callee.object.type === "MetaProperty" &&
          callee.property.name === "resolve"))
    )
      return true;
  }
  let ancestor = parent;
  while (["TSLiteralType", "LiteralTypeAnnotation"].includes(ancestor.type)) {
    ancestor = ancestor.parent;
  }
  return parent.type === "ImportExpression" || ancestor.type === "TSImportType";
}

export const check = {
  meta: {
    type: "problem",
    docs: { description: "Check spelling in source-code prose." },
    schema: [
      {
        type: "object",
        additionalProperties: false,
        properties: {
          dictionaries: {
            type: "array",
            minItems: 1,
            items: { type: "string", minLength: 1 },
          },
          comments: { type: "boolean" },
          jsx: { type: "boolean" },
          strings: { type: "boolean" },
          identifiers: { type: "boolean" },
        },
      },
    ],
    messages: {
      misspelled: 'Misspelled word "{{word}}".{{suggestions}}',
    },
  },
  create(context) {
    const options = { ...defaults, ...context.options[0] };
    const dictionary = getDictionary(options.dictionaries, context.cwd);
    const sourceCode = context.sourceCode;
    const seen = new Set();
    function report(span, identifiers = false) {
      for (const { word, start, end } of words(span, identifiers)) {
        if (dictionary.has(word)) continue;
        const key = `${start}:${end}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const suggestions = dictionary.suggest(word);
        context.report({
          loc: {
            start: sourceCode.getLocFromIndex(start),
            end: sourceCode.getLocFromIndex(end),
          },
          messageId: "misspelled",
          data: {
            word,
            suggestions: suggestions.length
              ? ` Suggestions: ${suggestions.join(", ")}.`
              : "",
          },
        });
      }
    }
    function checkString(node) {
      const attribute =
        node.parent?.type === "JSXAttribute"
          ? node.parent
          : node.parent?.type === "JSXExpressionContainer" &&
              node.parent.parent?.type === "JSXAttribute"
            ? node.parent.parent
            : undefined;
      return attribute
        ? options.jsx && attributes.has(attribute.name.name)
        : options.strings;
    }
    function literal(node) {
      if (
        typeof node.value !== "string" ||
        excludedString(node) ||
        !checkString(node)
      )
        return;
      const [start, end] = node.range;
      report(
        mappedText(
          sourceCode.text.slice(start + 1, end - 1),
          start + 1,
          node.parent.type === "JSXAttribute" ? "html" : "javascript",
          node.parent.type === "JSXAttribute" ? undefined : node.value,
        ),
      );
    }
    function identifier(node) {
      if (!options.identifiers) return;
      let [start, end] = node.range;
      if (sourceCode.text[start] === "#") start++;
      report(
        mappedText(
          sourceCode.text.slice(start, end),
          start,
          "javascript",
          node.name,
        ),
        true,
      );
    }
    return {
      Program() {
        if (options.comments)
          for (const span of commentSpans(sourceCode)) report(span);
      },
      Literal: literal,
      JSXText(node) {
        if (options.jsx)
          report(mappedText(sourceCode.getText(node), node.range[0], "html"));
      },
      TemplateElement(node) {
        if (!checkString(node.parent) || excludedString(node)) return;
        let [start, end] = node.range;
        const normalize = (text) => text.replace(/\r\n?/gu, "\n");
        if (
          normalize(sourceCode.text.slice(start, end)) !==
          normalize(node.value.raw)
        ) {
          start++;
          end -= node.tail ? 1 : 2;
          if (
            normalize(sourceCode.text.slice(start, end)) !==
            normalize(node.value.raw)
          ) {
            throw new Error(
              `Cannot locate template contents at offset ${start}.`,
            );
          }
        }
        const raw = sourceCode.text.slice(start, end);
        const span = mappedText(raw, start, "javascript");
        if (normalize(span.text) !== node.value.cooked) {
          throw new Error(`Cannot map template contents at offset ${start}.`);
        }
        report(span);
      },
      Identifier: identifier,
      JSXIdentifier: identifier,
      PrivateIdentifier: identifier,
    };
  },
};

export default {
  meta: { name: "oxlint-plugin-spellcheck", version: "0.1.0" },
  rules: { check },
};
