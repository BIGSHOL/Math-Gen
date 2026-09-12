import { useEffect, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorContent, useEditor } from "@tiptap/react";
import { InputRule, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { MathfieldElement, convertAsciiMathToLatex } from "mathlive";
import "mathlive/fonts.css";
import MarkdownRenderer, { type MarkdownRendererProps } from "./MarkdownRenderer";
import { renderKatexSafe } from "@app/lib/katexRender";
import { documentMarkdown, prepareVisualDocument } from "@app/lib/visualDocument";

MathfieldElement.fontsDirectory = null;
MathfieldElement.soundsDirectory = null;

const hideMathLiveUi = () => {
  try {
    window.mathVirtualKeyboard?.hide({ animate: false });
  } catch {
    // MathLive can already be disconnected while React removes the editor.
  }
};

const TEMPLATES = [
  ["수식", "\\placeholder{}"],
  ["분수", "\\frac{\\placeholder{}}{\\placeholder{}}"],
  ["제곱", "\\placeholder{}^{2}"],
  ["루트", "\\sqrt{\\placeholder{}}"],
  ["적분", "\\int_{\\placeholder{}}^{\\placeholder{}}\\placeholder{}\\,dx"],
  ["합", "\\sum_{n=1}^{\\placeholder{}}\\placeholder{}"],
  ["극한", "\\lim_{x\\to\\placeholder{}}\\placeholder{}"],
] as const;

const createMathNode = (active: React.MutableRefObject<MathfieldElement | null>) =>
  Node.create({
    name: "visualMath",
    group: "inline",
    inline: true,
    atom: true,
    addAttributes: () => ({
      tex: { default: "" },
      display: { default: false },
      fresh: { default: false },
    }),
    parseHTML: () => [{
      tag: "[data-math-tex]",
      getAttrs: (element) => ({
        tex: decodeURIComponent((element as HTMLElement).dataset.mathTex ?? ""),
        display: (element as HTMLElement).dataset.mathDisplay === "true",
      }),
    }],
    renderHTML: ({ node }) => ["span", {
      "data-math-tex": encodeURIComponent(node.attrs.tex),
      "data-math-display": String(node.attrs.display),
    }],
    addInputRules() {
      return [new InputRule({
        // `x^2 `, `1/2 `처럼 익숙한 입력도 수식으로 전환한다.
        find: /(?:^|\s)([a-zA-Z0-9]+(?:[\^/][a-zA-Z0-9]+)+) $/,
        handler: ({ state, range, match }) => {
          const from = range.to - match[1].length - 1;
          state.tr.replaceWith(from, range.to, [
            this.type.create({ tex: convertAsciiMathToLatex(match[1]) }),
            state.schema.text(" "),
          ]);
        },
      })];
    },
    addNodeView() {
      return ({ node: firstNode, editor, getPos }) => {
        let node = firstNode;
        let field: MathfieldElement | null = null;
        let destroyed = false;
        const dom = document.createElement("span");
        dom.className = "visual-math";
        dom.contentEditable = "false";
        dom.tabIndex = 0;
        dom.setAttribute("role", "button");
        dom.setAttribute("aria-label", "수식 편집");
        dom.title = "클릭해서 수식 수정";

        const paint = () => {
          dom.dataset.mathDisplay = String(node.attrs.display);
          dom.dataset.mathTex = encodeURIComponent(node.attrs.tex);
          dom.innerHTML = renderKatexSafe(node.attrs.tex || "\\square", node.attrs.display);
        };
        const close = (direction?: "forward" | "backward") => {
          if (!field || destroyed) return;
          if (active.current === field) active.current = null;
          hideMathLiveUi();
          field = null;
          paint();
          const pos = getPos();
          if (direction && typeof pos === "number") {
            editor.chain().focus().setTextSelection(pos + (direction === "forward" ? 1 : 0)).run();
          }
        };
        const open = () => {
          if (field || destroyed) return;
          field = new MathfieldElement();
          field.value = String(node.attrs.tex).replace(/\\displaystyle\s*/g, "");
          field.mathVirtualKeyboardPolicy = "manual";
          field.smartFence = true;
          field.setAttribute("aria-label", "수식 입력");
          active.current = field;
          dom.replaceChildren(field);
          field.addEventListener("input", () => {
            const pos = getPos();
            if (typeof pos !== "number" || !field) return;
            editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              tex: field.value,
              fresh: false,
            }));
          });
          field.addEventListener("blur", () => setTimeout(() => {
            if (field && !field.matches(":focus-within")) close();
          }, 0));
          field.addEventListener("move-out", (event) => {
            event.preventDefault();
            close(event.detail.direction === "backward" ? "backward" : "forward");
          });
          field.addEventListener("keydown", (event) => {
            if (event.key === "Escape" || event.key === "Enter") {
              event.preventDefault();
              close("forward");
            }
            event.stopPropagation();
          });
          field.focus();
        };
        dom.addEventListener("click", open);
        dom.addEventListener("keydown", (event) => {
          if (!field && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            open();
          }
        });
        paint();
        if (node.attrs.fresh) setTimeout(open, 0);
        return {
          dom,
          stopEvent: () => true,
          ignoreMutation: () => true,
          update: (next) => {
            if (next.type !== node.type) return false;
            node = next;
            if (!field) paint();
            return true;
          },
          destroy: () => {
            destroyed = true;
            if (active.current === field) active.current = null;
            hideMathLiveUi();
          },
        };
      };
    },
  });

const ChoiceGroup = Node.create({
  name: "choiceGroup", group: "block", content: "choiceItem+",
  addAttributes: () => ({ class: { default: "choice-row cols-1" } }),
  parseHTML: () => [{ tag: ".choice-row", getAttrs: (element) => ({ class: (element as HTMLElement).className }) }],
  renderHTML: ({ node }) => ["div", { class: node.attrs.class }, 0],
});

const ChoiceItem = Node.create({
  name: "choiceItem", content: "inline*", defining: true,
  addAttributes: () => ({ marker: { default: "①" } }),
  parseHTML: () => [{ tag: "[data-choice-marker]", getAttrs: (element) => ({ marker: (element as HTMLElement).dataset.choiceMarker }) }],
  renderHTML: ({ node }) => [
    "div", { class: "choice" },
    ["span", { class: "choice-marker", contenteditable: "false" }, node.attrs.marker],
    ["span", {}, 0],
  ],
});

const ConditionBox = Node.create({
  name: "conditionBox", group: "block", content: "block+", defining: true,
  addAttributes: () => ({ cols: { default: 1 } }),
  parseHTML: () => [{ tag: "[data-condition-box]", getAttrs: (element) => ({ cols: Number((element as HTMLElement).dataset.conditionBox) || 1 }) }],
  renderHTML: ({ node }) => ["div", { class: "visual-condition", "data-condition-box": node.attrs.cols }, 0],
});

interface MathTextEditorProps extends Omit<MarkdownRendererProps, "content"> {
  value: string;
  onChange: (value: string) => void;
}

export function MathTextEditor(props: MathTextEditorProps) {
  const latest = useRef(props);
  latest.current = props;
  const activeMath = useRef<MathfieldElement | null>(null);
  const lastEmitted = useRef(props.value);
  const [sourceMode, setSourceMode] = useState(false);
  const firstHtml = useRef<string | null>(null);
  const toHtml = () => prepareVisualDocument(renderToStaticMarkup(
    <MarkdownRenderer {...latest.current} content={latest.current.value} editorTokens onFigureClick={undefined} />,
  ));
  if (firstHtml.current === null) firstHtml.current = toHtml();

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TableKit,
      createMathNode(activeMath),
      ChoiceGroup,
      ChoiceItem,
      ConditionBox,
      Node.create({
        name: "visualFigure", group: "block", atom: true,
        addAttributes: () => ({ index: { default: null }, svg: { default: "" }, src: { default: "" }, label: { default: "그림" }, refresh: { default: 0 } }),
        parseHTML: () => [{
          tag: "[data-visual-figure]",
          getAttrs: (element) => {
            const data = (element as HTMLElement).dataset;
            return {
              index: data.figureIndex === undefined ? null : Number(data.figureIndex),
              svg: decodeURIComponent(data.editorSvg ?? ""),
              src: data.src ?? "",
              label: data.label ?? "그림",
            };
          },
        }],
        renderHTML: () => ["div", { "data-visual-figure": "true" }],
        addNodeView: () => ({ node: firstNode }) => {
          let node = firstNode;
          const dom = document.createElement("div");
          dom.className = "visual-figure";
          dom.contentEditable = "false";
          const index = node.attrs.index as number | null;
          const paint = () => {
            const current = latest.current;
            const svg = index !== null ? current.diagramSvgs?.[index]?.svg : node.attrs.svg;
            const src = index !== null ? current.imageCrops?.[index]?.src : node.attrs.src;
            if (svg) dom.innerHTML = svg;
            else if (src) {
              const image = document.createElement("img");
              image.src = src;
              image.alt = node.attrs.label;
              dom.replaceChildren(image);
            } else dom.textContent = index === null ? "그림" : `그림 ${index + 1}`;
          };
          const open = () => { if (index !== null) latest.current.onFigureClick?.(index); };
          if (index !== null) {
            dom.tabIndex = 0;
            dom.setAttribute("role", "button");
            dom.setAttribute("aria-label", `그림 ${index + 1} 편집`);
            dom.title = "클릭해서 그림 수정";
          }
          dom.addEventListener("click", open);
          dom.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); }
          });
          paint();
          return {
            dom,
            stopEvent: () => true,
            ignoreMutation: () => true,
            update: (next) => {
              if (next.type !== node.type) return false;
              node = next;
              paint();
              return true;
            },
          };
        },
      }),
    ],
    content: firstHtml.current,
    editorProps: {
      attributes: {
        class: "visual-document prose prose-slate max-w-none",
        "aria-label": "문제 본문",
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor: current }) => {
      const markdown = documentMarkdown(current.getJSON());
      lastEmitted.current = markdown;
      latest.current.onChange(markdown);
    },
  });

  useEffect(() => {
    if (editor && props.value !== lastEmitted.current) {
      lastEmitted.current = props.value;
      editor.commands.setContent(toHtml(), { emitUpdate: false });
    }
  }, [editor, props.value]);

  useEffect(() => {
    if (!editor) return;
    const tr = editor.state.tr;
    editor.state.doc.descendants((node, position) => {
      if (node.type.name === "visualFigure") {
        tr.setNodeMarkup(position, undefined, { ...node.attrs, refresh: Number(node.attrs.refresh) + 1 });
      }
    });
    if (tr.docChanged) editor.view.dispatch(tr.setMeta("addToHistory", false));
  }, [editor, props.diagramSvgs, props.imageCrops]);

  useEffect(() => () => hideMathLiveUi(), []);

  const insert = (tex: string) => {
    if (activeMath.current) {
      activeMath.current.insert(tex, { selectionMode: "placeholder" });
      activeMath.current.focus();
      return;
    }
    editor?.chain().focus().insertContent({ type: "visualMath", attrs: { tex, fresh: true } }).run();
  };
  const toggleSource = () => {
    activeMath.current?.blur();
    if (sourceMode && editor) editor.commands.setContent(toHtml(), { emitUpdate: false });
    setSourceMode((value) => !value);
  };

  return <div className="visual-editor rounded-r2 border border-line-strong bg-white overflow-hidden">
    <div className="visual-editor-toolbar" role="toolbar" aria-label="수식 삽입">
      {!sourceMode && TEMPLATES.map(([label, tex]) =>
        <button key={label} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insert(tex)}>{label}</button>)}
      {!sourceMode && <>
        <button type="button" aria-label="본문 되돌리기" onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().undo().run()}>↶</button>
        <button type="button" aria-label="본문 다시 실행" onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().redo().run()}>↷</button>
      </>}
      <button type="button" className="ml-auto" onClick={toggleSource}>{sourceMode ? "직접 편집으로" : "원문 코드"}</button>
    </div>
    {sourceMode
      ? <textarea className="w-full min-h-[300px] p-3 font-mono text-small" aria-label="문제 본문 (Markdown + LaTeX)" value={props.value} onChange={(event) => props.onChange(event.target.value)} />
      : <EditorContent editor={editor} />}
    <p className="text-caption text-muted border-t border-line px-3 py-2">글은 바로 입력하고, 수식과 그림은 클릭해서 고치세요. 분수는 위아래 칸에 숫자를 입력하면 됩니다.</p>
  </div>;
}
