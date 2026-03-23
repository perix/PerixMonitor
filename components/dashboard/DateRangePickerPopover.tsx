import * as React from "react"
import { CalendarRange, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { DateRange } from "react-day-picker"
import { parseISO, format } from "date-fns"
import { it } from "date-fns/locale"

interface DateRangePickerPopoverProps {
  startDate: string;
  endDate: string;
  minDate?: string;
  maxDate?: string;
  onApply: (start: string, end: string) => void;
  onReset: () => void;
  disabled?: boolean;
}

export function DateRangePickerPopover({
  startDate,
  endDate,
  minDate,
  maxDate,
  onApply,
  onReset,
  disabled
}: DateRangePickerPopoverProps) {
  const [open, setOpen] = React.useState(false)

  // Parse initial dates
  const initialRange: DateRange = React.useMemo(() => {
    return {
      from: startDate ? new Date(startDate) : undefined,
      to: endDate ? new Date(endDate) : undefined,
    };
  }, [startDate, endDate]);

  const [date, setDate] = React.useState<DateRange | undefined>(initialRange)

  // Sync internal state when opened
  React.useEffect(() => {
    if (open) {
      setDate({
        from: startDate ? new Date(startDate) : undefined,
        to: endDate ? new Date(endDate) : undefined,
      })
    }
  }, [open, startDate, endDate])

  const handleApply = () => {
    if (date?.from && date?.to) {
      // Formatta le date nel formato YYYY-MM-DDT00:00:00.000Z 
      // Usa parse/format standard per assicurare il timezone corretto rispetto alla stringa originaria
      const startStr = format(date.from, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx");
      const endStr = format(date.to, "yyyy-MM-dd'T'12:00:00.000xxx");
      onApply(startStr, endStr)
    }
    setOpen(false)
  }

  const handleReset = () => {
    onReset()
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          size="icon" 
          className="h-8 w-8 text-muted-foreground hover:text-white"
          title="Seleziona periodo dal calendario"
          disabled={disabled}
        >
          <CalendarRange className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 bg-slate-950 border-slate-800" align="end">
        <div className="p-3">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={setDate}
            numberOfMonths={2}
            locale={it}
            disabled={{
              before: minDate ? new Date(minDate) : new Date(2000, 0, 1),
              after: maxDate ? new Date(maxDate) : new Date(2100, 0, 1),
            }}
            className="text-slate-200"
          />
          <div className="flex justify-between items-center px-4 py-2 border-t border-slate-800 mt-2">
            <Button variant="ghost" size="sm" onClick={handleReset} className="text-slate-400 hover:text-white h-8">
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
            <Button size="sm" onClick={handleApply} disabled={!date?.from || !date?.to} className="h-8 bg-primary text-primary-foreground">
              Applica Periodo
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
