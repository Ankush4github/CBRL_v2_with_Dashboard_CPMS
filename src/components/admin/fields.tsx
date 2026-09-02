'use client';

import { useId } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { moveBy, removeAt, replaceAt } from './useContentEditor';

const labelClass = 'text-[11px] font-medium uppercase tracking-wider text-muted-foreground';

function FieldFrame({
  label,
  hint,
  error,
  htmlFor,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className={cn(labelClass, 'block')}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  error,
  type = 'text',
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  type?: string;
  className?: string;
}) {
  const id = useId();

  return (
    <FieldFrame label={label} hint={hint} error={error} htmlFor={id} className={className}>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        className={error ? 'border-destructive' : undefined}
      />
    </FieldFrame>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  error,
  rows = 4,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  rows?: number;
  className?: string;
}) {
  const id = useId();

  return (
    <FieldFrame label={label} hint={hint} error={error} htmlFor={id} className={className}>
      <Textarea
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        className={cn('leading-relaxed', error && 'border-destructive')}
      />
    </FieldFrame>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  hint,
  error,
  className,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  className?: string;
}) {
  const id = useId();

  return (
    <FieldFrame label={label} hint={hint} error={error} htmlFor={id} className={className}>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldFrame>
  );
}

/**
 * An ordered list of short strings — objectives, instrument features, the
 * paragraphs of a research write-up. Order is meaningful on the public page, so
 * rows can be moved rather than only added and removed.
 */
export function StringListField({
  label,
  values,
  onChange,
  addLabel = 'Add item',
  placeholder,
  multiline = false,
  hint,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  addLabel?: string;
  placeholder?: string;
  multiline?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className={labelClass}>{label}</span>
        <span className="text-[11px] tabular-nums text-muted-foreground/70">
          {values.length}
        </span>
      </div>

      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}

      {values.length === 0 && (
        <p className="rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground">
          Nothing here yet.
        </p>
      )}

      <ul className="space-y-2">
        {values.map((value, index) => (
          <li key={index} className="flex items-start gap-2">
            <span className="mt-2.5 w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground">
              {index + 1}
            </span>

            {multiline ? (
              <Textarea
                rows={3}
                value={value}
                placeholder={placeholder}
                onChange={(event) => onChange(replaceAt(values, index, event.target.value))}
                className="leading-relaxed"
              />
            ) : (
              <Input
                value={value}
                placeholder={placeholder}
                onChange={(event) => onChange(replaceAt(values, index, event.target.value))}
              />
            )}

            <div className="flex shrink-0 items-center">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-8"
                aria-label={`Move ${label} item ${index + 1} up`}
                disabled={index === 0}
                onClick={() => onChange(moveBy(values, index, -1))}
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-8"
                aria-label={`Move ${label} item ${index + 1} down`}
                disabled={index === values.length - 1}
                onClick={() => onChange(moveBy(values, index, 1))}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-8 text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${label} item ${index + 1}`}
                onClick={() => onChange(removeAt(values, index))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...values, ''])}>
        <Plus className="h-3.5 w-3.5" />
        {addLabel}
      </Button>
    </div>
  );
}

/** Section divider inside a long form. */
export function FieldSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t pt-6 first:border-t-0 first:pt-0">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{title}</p>
      {description && <p className="mt-1.5 text-xs text-muted-foreground">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}
