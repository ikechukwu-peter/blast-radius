import { memo, useEffect, useRef, useState } from 'react';
import { NodeResizer, type Node, type NodeProps } from '@xyflow/react';
import type { Annotation } from '@/core';
import { useDesign } from '@/stores/designStore';
import { SideHandles } from './SystemNode';

export type AnnotationNodeData = { annotation: Annotation; editable: boolean };
export type AnnotationFlowNode = Node<AnnotationNodeData, 'text' | 'zone'>;

const FONT = { sm: 'text-xs', md: 'text-sm', lg: 'text-lg font-semibold' } as const;

/** Text edited in place: double-click to start, Enter (or click away) to commit, Esc to cancel. */
function useInlineEdit(annotation: Annotation, editable: boolean) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(annotation.text);
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);
  const start = () => {
    if (!editable) return;
    setDraft(annotation.text);
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    if (draft !== annotation.text) useDesign.getState().updateAnnotation(annotation.id, { text: draft });
  };
  const keys = (e: React.KeyboardEvent, multiline: boolean) => {
    e.stopPropagation();
    if (e.key === 'Escape') setEditing(false);
    if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commit();
    }
  };
  return { editing, draft, setDraft, ref, start, commit, keys };
}

function resizeHandlers(id: string) {
  return {
    onResizeStart: () => useDesign.getState().snapshot(),
    onResize: (_: unknown, p: { x: number; y: number; width: number; height: number }) =>
      useDesign.getState().updateAnnotation(id, { position: { x: p.x, y: p.y }, width: p.width, height: p.height }, false),
  };
}

function TextNodeImpl({ data, selected }: NodeProps<AnnotationFlowNode>) {
  const { annotation, editable } = data;
  const { editing, draft, setDraft, ref, start, commit, keys } = useInlineEdit(annotation, editable);
  return (
    <div
      className="relative h-full w-full rounded-md border border-transparent px-2 py-1 hover:border-line"
      style={{ width: annotation.width, height: annotation.height, borderColor: selected ? 'var(--ok)' : undefined }}
      onDoubleClick={start}
    >
      {editable && <NodeResizer isVisible={selected} minWidth={80} minHeight={28} color="var(--ok)" {...resizeHandlers(annotation.id)} />}
      <SideHandles />
      {editing ? (
        <textarea
          ref={ref}
          className={`nodrag nowheel h-full w-full resize-none bg-transparent text-text outline-none ${FONT[annotation.fontSize ?? 'md']}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => keys(e, true)}
          aria-label="Note text"
        />
      ) : (
        <p className={`h-full w-full overflow-hidden whitespace-pre-wrap leading-snug ${FONT[annotation.fontSize ?? 'md']}`} style={{ color: annotation.color ?? 'var(--text)' }}>
          {annotation.text || <span className="text-muted">Empty note</span>}
        </p>
      )}
    </div>
  );
}

function ZoneNodeImpl({ data, selected }: NodeProps<AnnotationFlowNode>) {
  const { annotation, editable } = data;
  const color = annotation.color ?? '#22d3ee';
  const { editing, draft, setDraft, ref, start, commit, keys } = useInlineEdit(annotation, editable);
  return (
    <div
      className="relative rounded-xl border-[1.5px] border-dashed"
      style={{ width: annotation.width, height: annotation.height, borderColor: selected ? 'var(--ok)' : `${color}99`, background: `${color}0d` }}
    >
      {editable && <NodeResizer isVisible={selected} minWidth={120} minHeight={80} color="var(--ok)" {...resizeHandlers(annotation.id)} />}
      <SideHandles />
      <div className="absolute left-3 top-2" onDoubleClick={start}>
        {editing ? (
          <input
            ref={ref}
            className="nodrag w-56 rounded bg-bg px-1 text-xs font-semibold uppercase tracking-wider text-text outline-none ring-1 ring-ok/60"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => keys(e, false)}
            aria-label="Zone name"
          />
        ) : (
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>
            {annotation.text || 'Zone'}
          </span>
        )}
      </div>
    </div>
  );
}

export const TextNode = memo(TextNodeImpl);
export const ZoneNode = memo(ZoneNodeImpl);
