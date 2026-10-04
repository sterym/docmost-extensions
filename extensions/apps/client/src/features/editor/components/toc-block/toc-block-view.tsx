import { NodeViewProps, NodeViewWrapper, useEditorState } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { ActionIcon, Group, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { IconListTree, IconMinus, IconPlus } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { useCallback, useRef } from "react";
import {
  TOC_MAX_LEVEL,
  TOC_MIN_LEVEL,
  TOC_DEFAULT_MAX_LEVEL,
} from "@docmost/editor-ext";
import classes from "./toc-block.module.css";

type HeadingEntry = {
  id: string | null;
  level: number;
  text: string;
  pos: number;
};

type TocState = {
  headings: HeadingEntry[];
  isEditable: boolean;
};

function collectHeadings(editor: NodeViewProps["editor"]): HeadingEntry[] {
  const headings: HeadingEntry[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return true;
    const text = node.textContent.trim();
    if (text.length) {
      headings.push({
        id: node.attrs.id ?? null,
        level: Number(node.attrs.level) || 1,
        text,
        pos,
      });
    }
    // headings cannot contain other headings
    return false;
  });
  return headings;
}

function sameTocState(a: TocState, b: TocState): boolean {
  if (a.isEditable !== b.isEditable) return false;
  if (a.headings.length !== b.headings.length) return false;
  for (let i = 0; i < a.headings.length; i += 1) {
    const x = a.headings[i];
    const y = b.headings[i];
    if (x.id !== y.id || x.level !== y.level || x.text !== y.text || x.pos !== y.pos) {
      return false;
    }
  }
  return true;
}

export default function TocBlockView(props: NodeViewProps) {
  const { editor, node, updateAttributes, selected } = props;
  const { t } = useTranslation();
  const headerPaddingRef = useRef<HTMLDivElement | null>(null);

  const maxLevel: number = node.attrs.maxLevel ?? TOC_DEFAULT_MAX_LEVEL;

  // The heading list is never stored in the document. It is re-derived on
  // every editor transaction so the block stays live for local edits and for
  // changes arriving through collaboration.
  const { headings, isEditable } = useEditorState<TocState>({
    editor,
    selector: ({ editor: e }) => ({
      headings: e ? collectHeadings(e) : [],
      isEditable: e ? e.isEditable : false,
    }),
    equalityFn: sameTocState,
  });

  const visible = headings.filter((h) => h.level <= maxLevel);
  const minLevel = visible.reduce(
    (min, h) => Math.min(min, h.level),
    TOC_MAX_LEVEL,
  );

  const jumpTo = useCallback(
    (pos: number) => {
      if (!editor || editor.isDestroyed) return;
      const { view } = editor;

      let headerOffset = 0;
      if (headerPaddingRef.current) {
        headerOffset =
          parseInt(
            window
              .getComputedStyle(headerPaddingRef.current)
              .getPropertyValue("top"),
          ) || 0;
      }

      const dom = view.nodeDOM(pos) as HTMLElement | null;
      if (dom && typeof dom.getBoundingClientRect === "function") {
        const top =
          dom.getBoundingClientRect().top + window.scrollY - headerOffset - 16;
        window.scrollTo({ top, behavior: "smooth" });
      }

      const tr = view.state.tr;
      tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)));
      view.dispatch(tr);
      view.focus();
    },
    [editor],
  );

  const changeMaxLevel = (delta: number) => {
    const next = Math.min(
      TOC_MAX_LEVEL,
      Math.max(TOC_MIN_LEVEL, maxLevel + delta),
    );
    if (next !== maxLevel) {
      updateAttributes({ maxLevel: next });
    }
  };

  return (
    <NodeViewWrapper
      className={clsx(classes.wrapper, { [classes.selected]: selected })}
      data-type="tableOfContents"
    >
      <Group justify="space-between" wrap="nowrap" className={classes.header}>
        <Group gap={6} wrap="nowrap">
          <IconListTree size={16} stroke={1.5} />
          <Text size="sm" fw={600}>
            {t("Table of contents")}
          </Text>
        </Group>

        {isEditable && (
          <Group gap={2} wrap="nowrap" className={classes.controls}>
            <Text size="xs" c="dimmed" mr={4}>
              {t("Up to H{{level}}", { level: maxLevel })}
            </Text>
            <Tooltip label={t("Show fewer heading levels")} withinPortal={false}>
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                aria-label={t("Show fewer heading levels")}
                disabled={maxLevel <= TOC_MIN_LEVEL}
                onClick={() => changeMaxLevel(-1)}
              >
                <IconMinus size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t("Show more heading levels")} withinPortal={false}>
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                aria-label={t("Show more heading levels")}
                disabled={maxLevel >= TOC_MAX_LEVEL}
                onClick={() => changeMaxLevel(1)}
              >
                <IconPlus size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        )}
      </Group>

      {visible.length === 0 ? (
        <Text size="sm" c="dimmed" className={classes.empty}>
          {t("Add headings to this page to populate the table of contents.")}
        </Text>
      ) : (
        <ul className={classes.list}>
          {visible.map((heading) => (
            <li
              key={heading.id ?? heading.pos}
              className={classes.item}
              style={{
                paddingInlineStart: `calc(${heading.level - minLevel} * var(--mantine-spacing-md))`,
              }}
            >
              <UnstyledButton
                className={classes.link}
                onClick={() => jumpTo(heading.pos)}
              >
                {heading.text}
              </UnstyledButton>
            </li>
          ))}
        </ul>
      )}

      <div ref={headerPaddingRef} className={classes.headerPadding} />
    </NodeViewWrapper>
  );
}
