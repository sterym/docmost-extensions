import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

export interface TableOfContentsOptions {
  HTMLAttributes: Record<string, any>;
  view: any;
}

export interface TableOfContentsAttributes {
  /**
   * Deepest heading level (1-6) listed by the block.
   */
  maxLevel: number;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tableOfContents: {
      setTableOfContents: (
        attributes?: Partial<TableOfContentsAttributes>,
      ) => ReturnType;
    };
  }
}

export const TOC_MIN_LEVEL = 1;
export const TOC_MAX_LEVEL = 6;
export const TOC_DEFAULT_MAX_LEVEL = 3;

function clampLevel(value: unknown): number {
  const level = Number(value);
  if (!Number.isFinite(level)) return TOC_DEFAULT_MAX_LEVEL;
  return Math.min(TOC_MAX_LEVEL, Math.max(TOC_MIN_LEVEL, Math.round(level)));
}

/**
 * In-page table of contents block (like Confluence's TOC macro).
 *
 * The node stores no heading data: the client node view derives the list
 * from the document on every transaction, so it stays live while editing
 * and collaborating. Server-side rendering (export, search) emits an empty
 * placeholder element.
 */
export const TableOfContents = Node.create<TableOfContentsOptions>({
  name: "tableOfContents",

  group: "block",

  atom: true,

  selectable: true,

  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      view: null,
    };
  },

  addAttributes() {
    return {
      maxLevel: {
        default: TOC_DEFAULT_MAX_LEVEL,
        parseHTML: (element) =>
          clampLevel(element.getAttribute("data-max-level")),
        renderHTML: (attributes) => ({
          "data-max-level": clampLevel(attributes.maxLevel),
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: `div[data-type="${this.name}"]`,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        { "data-type": this.name, class: "table-of-contents" },
        this.options.HTMLAttributes,
        HTMLAttributes,
      ),
    ];
  },

  addCommands() {
    return {
      setTableOfContents:
        (attributes) =>
        ({ chain }) =>
          chain()
            .insertContent({ type: this.name, attrs: attributes })
            .focus()
            .run(),
    };
  },

  addNodeView() {
    // Force the react node view to render immediately using flush sync (https://github.com/ueberdosis/tiptap/blob/b4db352f839e1d82f9add6ee7fb45561336286d8/packages/react/src/ReactRenderer.tsx#L183-L191)
    this.editor.isInitialized = true;

    return ReactNodeViewRenderer(this.options.view);
  },
});
