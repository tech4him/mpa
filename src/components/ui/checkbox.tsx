import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, ...props }, ref) => (
    <div className="relative inline-flex">
      <input
        type="checkbox"
        ref={ref}
        checked={checked}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
        className={cn(
          "peer h-4 w-4 shrink-0 rounded-sm border border-gray-300 bg-white focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 checked:bg-blue-600 checked:border-blue-600",
          className
        )}
        {...props}
      />
      {checked && (
        <Check className="absolute inset-0 h-4 w-4 text-white pointer-events-none" />
      )}
    </div>
  )
)
Checkbox.displayName = "Checkbox"

export { Checkbox }