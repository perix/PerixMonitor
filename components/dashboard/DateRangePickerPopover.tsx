import * as React from "react"
import { CalendarRange, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

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
  const [localStart, setLocalStart] = React.useState(startDate)
  const [localEnd, setLocalEnd] = React.useState(endDate)

  // Sync internal state when opened
  React.useEffect(() => {
    if (open) {
      setLocalStart(startDate)
      setLocalEnd(endDate)
    }
  }, [open, startDate, endDate])

  const handleApply = () => {
    onApply(localStart, localEnd)
    setOpen(false)
  }

  const handleReset = () => {
    onReset()
    setOpen(false)
  }

  // Helper to format Date to YYYY-MM-DD for native input
  const formatForInput = (isoDate: string) => {
    if (!isoDate) return "";
    return isoDate.split('T')[0];
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          size="icon" 
          className="h-8 w-8 text-muted-foreground hover:text-white"
          title="Seleziona periodo personalizzato"
          disabled={disabled}
        >
          <CalendarRange className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 bg-slate-950 border-slate-800" align="end">
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none text-slate-200">Periodo di Analisi</h4>
            <p className="text-sm text-slate-400">
              Imposta le date esatte per l'intervallo temporale.
            </p>
          </div>
          <div className="grid gap-2">
            <div className="grid grid-cols-3 items-center gap-4">
              <label htmlFor="start-date" className="text-sm text-slate-300">
                Inizio
              </label>
              <input
                id="start-date"
                type="date"
                className="col-span-2 flex h-9 w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50 text-slate-200"
                value={formatForInput(localStart)}
                min={formatForInput(minDate || '')}
                max={formatForInput(localEnd || maxDate || '')}
                onChange={(e) => setLocalStart(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-3 items-center gap-4">
              <label htmlFor="end-date" className="text-sm text-slate-300">
                Fine
              </label>
              <input
                id="end-date"
                type="date"
                className="col-span-2 flex h-9 w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50 text-slate-200"
                value={formatForInput(localEnd)}
                min={formatForInput(localStart || minDate || '')}
                max={formatForInput(maxDate || '')}
                onChange={(e) => setLocalEnd(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-between mt-2">
            <Button variant="ghost" size="sm" onClick={handleReset} className="text-slate-400 hover:text-white">
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
            <Button size="sm" onClick={handleApply} className="bg-primary text-primary-foreground">
              Applica
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
