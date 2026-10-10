"use client";

// Toggle a workspace's labels on a task. Each label is a pressed/unpressed button with a
// check icon when on, so selection never relies on colour.
import { Check, Tag } from "lucide-react";
import { labelStyle } from "@/utils/labels";
import { cx } from "@/lib/cx";
import type { Label } from "@/types/models";

interface LabelPickerProps {
  labels: Label[];
  selectedIds: string[];
  onChange: (labelIds: string[]) => void;
  disabled?: boolean;
}

export default function LabelPicker({ labels, selectedIds, onChange, disabled = false }: LabelPickerProps) {
  const toggle = (labelId: string) =>
    onChange(selectedIds.includes(labelId) ? selectedIds.filter((id) => id !== labelId) : [...selectedIds, labelId]);

  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className="mb-1.5 text-[14px] font-medium text-ink">
        Labels <span className="font-normal text-muted">(optional)</span>
      </legend>
      {labels.length === 0 ? (
        <p className="flex items-center gap-2 text-[14px] text-muted">
          <Tag size={15} aria-hidden="true" />
          This workspace has no labels yet. Owners and Admins can add them in workspace settings.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {labels.map((label) => {
            const selected = selectedIds.includes(label.id);
            return (
              <button
                key={label.id}
                type="button"
                aria-pressed={selected}
                onClick={() => toggle(label.id)}
                className={cx(
                  "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[14px] font-medium transition-opacity disabled:cursor-not-allowed",
                  selected ? "border-current" : "border-transparent opacity-70 hover:opacity-100"
                )}
                style={labelStyle(label.color)}
              >
                {selected && <Check size={14} aria-hidden="true" strokeWidth={2.5} />}
                {label.name}
              </button>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
