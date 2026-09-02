"use client";

import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * CPMS has no theme toggle and never sets the `dark` class, so the app is
 * always light. This used to read next-themes' useTheme(), but there is no
 * ThemeProvider mounted for it to read from — it returned undefined and fell
 * back to the "system" default, which let toasts render dark on a machine with
 * a dark OS preference while every other surface stayed light.
 *
 * Pinning the value states the intent and drops the dependency. If CPMS ever
 * gains a real theme toggle, this is the line to change.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
