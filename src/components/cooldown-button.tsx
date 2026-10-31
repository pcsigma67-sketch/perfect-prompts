import { forwardRef, useEffect, useRef, useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const BUTTON_COOLDOWN_MS = 3000;

export const CooldownButton = forwardRef<HTMLButtonElement, ButtonProps>(
  function CooldownButton({ onClick, disabled, className, ...props }, ref) {
    const [coolingDown, setCoolingDown] = useState(false);
    const locked = useRef(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    }, []);

    return (
      <Button
        {...props}
        ref={ref}
        variant="ghost"
        className={cn("h-auto whitespace-normal", className, coolingDown && "invisible")}
        data-cooling-down={coolingDown || undefined}
        disabled={disabled || coolingDown}
        onClick={(event) => {
          if (locked.current || disabled) return;
          locked.current = true;
          setCoolingDown(true);
          timer.current = setTimeout(() => {
            locked.current = false;
            setCoolingDown(false);
          }, BUTTON_COOLDOWN_MS);
          onClick?.(event);
        }}
      />
    );
  },
);