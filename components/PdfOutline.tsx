"use client";

import { useState } from "react";
import type { OutlineItem } from "@/types";

interface Props {
  items: OutlineItem[];
  currentPage: number;
  onNavigate: (page: number) => void;
}

export default function PdfOutline({ items, currentPage, onNavigate }: Props) {
  return (
    <aside className="w-72 shrink-0 border-r border-gray-200 dark:border-gray-800 overflow-auto bg-white dark:bg-gray-900">
      <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-200 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900">
        Contents
      </div>
      <ul className="py-1 text-sm">
        {items.map((it, i) => (
          <Node
            key={i}
            item={it}
            depth={0}
            currentPage={currentPage}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
    </aside>
  );
}

function Node({
  item,
  depth,
  currentPage,
  onNavigate,
}: {
  item: OutlineItem;
  depth: number;
  currentPage: number;
  onNavigate: (page: number) => void;
}) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = item.items.length > 0;
  const active = item.pageNumber === currentPage;

  return (
    <li>
      <div
        className={`flex items-start gap-1 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800 ${
          active ? "bg-blue-50 dark:bg-blue-950" : ""
        }`}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="w-4 shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 leading-5 text-left"
            aria-label={open ? "Collapse" : "Expand"}
          >
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <button
          type="button"
          onClick={() => item.pageNumber && onNavigate(item.pageNumber)}
          disabled={!item.pageNumber}
          className={`flex-1 text-left leading-5 truncate ${
            active ? "font-semibold text-blue-700 dark:text-blue-300" : ""
          } ${!item.pageNumber ? "opacity-60 cursor-default" : ""}`}
          title={item.title}
        >
          {item.title}
        </button>
        {item.pageNumber && (
          <span className="text-xs text-gray-400 shrink-0">{item.pageNumber}</span>
        )}
      </div>
      {hasChildren && open && (
        <ul>
          {item.items.map((ch, i) => (
            <Node
              key={i}
              item={ch}
              depth={depth + 1}
              currentPage={currentPage}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
