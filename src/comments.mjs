import { fromMarkdown } from "mdast-util-from-markdown";
import { mappedText } from "./text.mjs";

const machinery =
  /^(?:eslint\b|eslint-|oxlint\b|oxlint-|global\b|globals\b|exported\b|prettier-ignore\b|@(?:ts-|flow\b|noflow\b)|(?:istanbul|c8|v8|jshint|jslint)\b|[#@]\s*source(?:Mapping)?URL=|SPDX-License-Identifier:|spellcheck[-:])/u;
const metadata =
  /^(?:author|license|preserve|type|typedef|callback|implements|extends|augments|satisfies|this|enum|namespace|memberof|alias|name|module|requires|import|default|defaultValue|inheritDoc)$/iu;
const parameter = /^(?:param|arg|argument|property|prop|template|typeParam)$/iu;
// Preserve one masking space per UTF-16 source unit.
const mask = (text) => text.replace(/[^\r\n]/g, " ");

function documentation(source) {
  let example = false;
  let text = "";
  const mapping = [];
  for (const line of source.text.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/gu)) {
    if (!line[0]) continue;
    let value = line[0];
    const indentation = /^[ \t]*/u.exec(value)[0].length;
    let first = 0;
    const tag = /^[ \t]*@([\w-]+)\b[ \t]*/u.exec(value);
    if (tag) {
      example = tag[1].toLowerCase() === "example";
      if (example || metadata.test(tag[1])) value = mask(value);
      else {
        first = tag[0].length;
        if (value[first] === "{") {
          let depth = 0;
          do {
            if (value[first] === "{") depth++;
            if (value[first] === "}") depth--;
            first++;
          } while (first < value.length && depth);
        }
        if (parameter.test(tag[1])) {
          const name = /^[ \t]*(?:\[[^\]]*\]|[^\s]+)[ \t]*(?:-[ \t]*)?/u.exec(
            value.slice(first),
          );
          if (name) first += name[0].length;
        }
      }
    } else if (example || machinery.test(value.trimStart()))
      value = mask(value);
    value = value.replace(
      /^([ \t]*)(?:TODO|FIXME|XXX|HACK|NOTE)(?:\([^)]*\))?:[ \t]*/u,
      mask,
    );
    value = value.replace(/\{@[\w-]+[^}]*\}/gu, (inline) => {
      const link =
        /^\{@(?:link|linkcode|linkplain)[ \t]+[^\s|}]+(?:[|\s]+([^}]*))?\}$/u.exec(
          inline,
        );
      if (!link?.[1]) return mask(inline);
      const start = inline.length - link[1].length - 1;
      return mask(inline.slice(0, start)) + link[1] + " ";
    });
    first += /^[ \t]*/u.exec(value.slice(first))[0].length;
    text += line[0].slice(0, indentation) + value.slice(first);
    mapping.push(
      ...source.mapping.slice(line.index, line.index + indentation),
      ...source.mapping.slice(line.index + first, line.index + value.length),
    );
  }
  return { text, mapping };
}

function commentSource(group, text) {
  let source = "";
  const mapping = [];
  for (const [index, comment] of group.entries()) {
    if (index) {
      source += "\n";
      mapping.push({ start: comment.range[0] - 1, end: comment.range[0] });
    }
    const block = text.startsWith("/*", comment.range[0]);
    const start = comment.range[0] + 2;
    const raw = text.slice(start, comment.range[1] - (block ? 2 : 0));
    const lines = [...raw.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/gu)].filter(
      (line) => line[0],
    );
    const margins = lines
      .slice(1)
      .filter(([line]) => line.trim() && !/^[ \t]*\*/u.test(line))
      .map(([line]) => /^[ \t]*/u.exec(line)[0].length);
    const margin = margins.length ? Math.min(...margins) : 0;
    for (const [lineIndex, line] of lines.entries()) {
      const marker = block
        ? /^[ \t]*\*(?:[ \t]|(?=\r|\n|$))/u.exec(line[0])
        : null;
      const prefix = marker
        ? marker[0].length
        : block && lineIndex
          ? margin
          : line[0].startsWith(" ")
            ? 1
            : 0;
      const content = line[0].slice(prefix);
      source += content;
      for (let unit = 0; unit < content.length; unit++) {
        const offset = start + line.index + prefix + unit;
        mapping.push({ start: offset, end: offset + 1 });
      }
    }
  }
  return documentation({ text: source, mapping });
}

function* prose(source) {
  function* visit(node) {
    const first = node.position.start.offset;
    const last = node.position.end.offset;
    if (node.type === "text") {
      const decoded = mappedText(
        source.text.slice(first, last),
        first,
        "markdown",
      );
      yield {
        text: decoded.text,
        mapping: decoded.mapping.map(({ start, end }) => ({
          start: source.mapping[start].start,
          end: source.mapping[end - 1].end,
        })),
      };
    } else if (node.type === "image" || node.type === "imageReference") {
      let depth = 1;
      let end = first + 2;
      for (; end < last; end++) {
        if (source.text[end] === "\\") end++;
        else if (source.text[end] === "[") depth++;
        else if (source.text[end] === "]" && --depth === 0) break;
      }
      if (end >= last)
        throw new Error(`Cannot map image description at offset ${first}.`);
      yield* prose({
        text: source.text.slice(first + 2, end),
        mapping: source.mapping.slice(first + 2, end),
      });
    } else if (!["code", "inlineCode", "html"].includes(node.type)) {
      for (const child of node.children ?? []) yield* visit(child);
    }
  }
  yield* visit(fromMarkdown(source.text));
}

export function* commentSpans(sourceCode) {
  const groups = [];
  for (const comment of sourceCode.getAllComments()) {
    if (
      !/^\/[/*]/u.test(
        sourceCode.text.slice(comment.range[0], comment.range[0] + 2),
      )
    )
      continue;
    const previous = groups.at(-1)?.at(-1);
    if (
      previous &&
      comment.type === "Line" &&
      previous.type === "Line" &&
      /^[ \t]*(?:\r\n|\r|\n)[ \t]*$/u.test(
        sourceCode.text.slice(previous.range[1], comment.range[0]),
      )
    ) {
      groups.at(-1).push(comment);
    } else groups.push([comment]);
  }
  for (const group of groups)
    yield* prose(commentSource(group, sourceCode.text));
}
