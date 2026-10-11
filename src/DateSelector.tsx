import { useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
type DateSelectorProps = { value: string; onChange: (value: string) => void };
function localDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function shiftDate(value: string, amount: number) {
  const shifted = new Date(`${value}T12:00:00`);
  shifted.setDate(shifted.getDate() + amount);
  return localDateString(shifted);
}
function DateSelector({ value, onChange }: DateSelectorProps) {
  const dateInput = useRef<HTMLInputElement>(null);
  const [today] = useState(() => localDateString(new Date()));
  const selectedDate = useMemo(() => new Date(`${value}T12:00:00`), [value]);
  const label = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(selectedDate);
  const presets = [
    { offset: -1, label: "Yesterday" },
    { offset: 0, label: "Today" },
    { offset: 1, label: "Tomorrow" },
  ];
  return (
    <div className="date-bar">
      <div className="date-controls" aria-label="Choose match day">
        <button
          type="button"
          className="date-arrow"
          aria-label="Previous day"
          onClick={() => onChange(shiftDate(value, -1))}
        >
          <ChevronLeft size={17} />
        </button>
        {presets.map(({ offset, label: preset }) => {
          const presetDate = shiftDate(today, offset);
          return (
            <button
              type="button"
              className={`date-preset ${presetDate === value ? "date-preset-active" : ""}`}
              key={preset}
              onClick={() => onChange(presetDate)}
              aria-pressed={presetDate === value}
            >
              {preset}
            </button>
          );
        })}
        <button
          type="button"
          className="date-arrow"
          aria-label="Next day"
          onClick={() => onChange(shiftDate(value, 1))}
        >
          <ChevronRight size={17} />
        </button>
      </div>
      <div className="selected-date">
        <div className="selected-date-copy">
          <span className="selected-date-label">
            {value === today
              ? "MATCHDAY"
              : value < today
                ? "PAST FIXTURES"
                : "UPCOMING FIXTURES"}
          </span>
          <span className="selected-date-value">{label}</span>
        </div>
        <button
          type="button"
          className="calendar-button"
          aria-label="Choose date from calendar"
          onClick={() => {
            if (dateInput.current?.showPicker) dateInput.current.showPicker();
            else dateInput.current?.click();
          }}
        >
          <CalendarDays size={16} />
          <input
            ref={dateInput}
            type="date"
            value={value}
            onChange={(event) =>
              event.target.value && onChange(event.target.value)
            }
            aria-label="Select fixture date"
          />
        </button>
      </div>
    </div>
  );
}
export default DateSelector;
