"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { it } from "date-fns/locale"

import { cn } from "@/lib/utils"
import { formatDate, formatDateToISO, parseISODateLocal } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export interface DatePickerProps {
  value: string | null | undefined;
  onChange: (iso: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  minDate?: string;
  maxDate?: string;
  className?: string;
  inputClassName?: string;
  id?: string;
}

const MASK_RE = /^(\d{0,2})(\d{0,2})(\d{0,4})$/;

function applyMask(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  const m = digits.match(MASK_RE);
  if (!m) return digits;
  const [, dd, mm, yyyy] = m;
  let out = dd;
  if (mm) out += "/" + mm;
  if (yyyy) out += "/" + yyyy;
  return out;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "GG/MM/AAAA",
  disabled,
  minDate,
  maxDate,
  className,
  inputClassName,
  id,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState<string>(() => (value ? formatDate(value) : ""));

  React.useEffect(() => {
    setText(value ? formatDate(value) : "");
  }, [value]);

  const selectedDate = value ? parseISODateLocal(value) ?? undefined : undefined;

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = applyMask(e.target.value);
    setText(masked);
    if (masked === "") {
      onChange(null);
      return;
    }
    if (masked.length === 10) {
      const iso = formatDateToISO(masked);
      if (iso) onChange(iso);
    }
  };

  const handleBlur = () => {
    if (text === "") {
      onChange(null);
      return;
    }
    const iso = formatDateToISO(text);
    if (iso) {
      onChange(iso);
      setText(formatDate(iso));
    } else {
      setText(value ? formatDate(value) : "");
    }
  };

  const handleCalendarSelect = (d: Date | undefined) => {
    if (!d) {
      onChange(null);
      setText("");
    } else {
      const iso = formatDateToISO(d);
      if (iso) {
        onChange(iso);
        setText(formatDate(iso));
      }
    }
    setOpen(false);
  };

  return (
    <div className={cn("relative inline-flex items-center", className)}>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        value={text}
        onChange={handleTextChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={10}
        className={cn("pr-9", inputClassName)}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            className="absolute right-1 h-7 w-7 text-muted-foreground hover:text-white"
            aria-label="Apri calendario"
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 bg-slate-950 border-slate-800" align="end">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleCalendarSelect}
            defaultMonth={selectedDate}
            locale={it}
            disabled={{
              before: minDate ? parseISODateLocal(minDate) ?? new Date(1900, 0, 1) : new Date(1900, 0, 1),
              after: maxDate ? parseISODateLocal(maxDate) ?? new Date(2100, 0, 1) : new Date(2100, 0, 1),
            }}
            className="text-slate-200"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
