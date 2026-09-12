import type { JSONContent } from "@tiptap/core";

/** Convert the shared reader's DOM into an editable schema without parsing rendered math. */
export function prepareVisualDocument(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const element of doc.querySelectorAll<HTMLElement>("[data-math-tex]")) {
    element.replaceChildren();
  }
  for (const element of doc.querySelectorAll<HTMLElement>("[data-figure-index], [data-editor-svg]")) {
    if (element.parentElement?.closest("[data-figure-index], [data-editor-svg]")) continue;
    const figure = doc.createElement("div");
    figure.dataset.visualFigure = "true";
    for (const name of ["data-figure-index", "data-editor-svg"]) {
      if (element.hasAttribute(name)) figure.setAttribute(name, element.getAttribute(name)!);
    }
    figure.dataset.src = element.getAttribute("src") ?? "";
    figure.dataset.label = element.getAttribute("alt") ?? "그림";
    element.replaceWith(figure);
  }
  for (const box of doc.querySelectorAll<HTMLElement>("[data-condition-box]")) {
    const children = [...box.children];
    const rows = children.flatMap(child => child.classList.contains("grid") ? [...child.children] : [child]);
    box.replaceChildren(...rows.map(row => {
      const p = doc.createElement("p"); p.innerHTML = row.innerHTML; return p;
    }));
  }
  for (const choice of doc.querySelectorAll(".choice")) {
    const marker = choice.querySelector(".choice-marker");
    choice.setAttribute("data-choice-marker", marker?.textContent ?? "");
    marker?.remove();
  }
  return doc.body.innerHTML;
}

const tableMarkdown = (node: JSONContent): string => {
  const rows = node.content ?? [];
  return rows.map((row, i) => {
    const cells = row.content ?? [];
    const line = `| ${cells.map(cell => documentMarkdown(cell).trim().replace(/\n/g, "<br>").replace(/\|/g, "\\|")).join(" | ")} |`;
    return i === 0 ? `${line}\n| ${cells.map(() => "---").join(" | ")} |` : line;
  }).join("\n");
};

/** The stored/exported format stays Markdown + LaTeX; the user edits its visual form. */
export function documentMarkdown(node: JSONContent): string {
  const attrs = node.attrs ?? {};
  const children = () => (node.content ?? []).map(documentMarkdown).join("");
  const blocks = () => (node.content ?? []).map(documentMarkdown).join("\n\n");
  switch (node.type) {
    case "doc": return blocks().trim();
    case "text": {
      let text = node.text ?? "";
      for (const mark of node.marks ?? []) {
        if (mark.type === "bold") text = `**${text}**`;
        if (mark.type === "italic") text = `*${text}*`;
        if (mark.type === "strike") text = `~~${text}~~`;
        if (mark.type === "code") text = `\`${text}\``;
        if (mark.type === "link") text = `[${text}](${mark.attrs?.href ?? ""})`;
      }
      return text;
    }
    case "visualMath": return attrs.display ? `$$${attrs.tex}$$` : `$${attrs.tex}$`;
    case "visualFigure": return attrs.index !== null ? `[그림${Number(attrs.index) + 1}]` : attrs.svg || `![${attrs.label ?? ""}](${attrs.src ?? ""})`;
    case "hardBreak": return "\n";
    case "horizontalRule": return "---";
    case "heading": return `${"#".repeat(attrs.level ?? 2)} ${children()}`;
    case "codeBlock": return `\`\`\`${attrs.language ?? ""}\n${children()}\n\`\`\``;
    case "conditionBox": {
      let text = (node.content ?? []).map(documentMarkdown).join("\n");
      text = text.replace(/\*{0,2}<보기>\*{0,2}/, attrs.cols > 1 ? `<보기:cols=${attrs.cols}>` : "<보기>");
      return text.split("\n").map(line => `> ${line}`).join("\n");
    }
    case "blockquote": return blocks().split("\n").map(line => `> ${line}`).join("\n");
    case "choiceGroup": return (node.content ?? []).map(documentMarkdown).join("\n");
    case "choiceItem": return `${attrs.marker} ${children()}`;
    case "bulletList": case "orderedList": return (node.content ?? []).map((item, i) => {
      const text = documentMarkdown(item);
      return `${node.type === "bulletList" ? "-" : `${i + (attrs.start ?? 1)}.`} ${text.replace(/\n/g, "\n  ")}`;
    }).join("\n");
    case "table": return tableMarkdown(node);
    case "listItem": case "tableCell": case "tableHeader": return blocks();
    default: return children();
  }
}
