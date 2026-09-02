"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/cpms/ui/toaster";
import { Toaster as Sonner } from "@/components/cpms/ui/sonner";
import { TooltipProvider } from "@/components/cpms/ui/tooltip";
import { AuthProvider } from "@/hooks/cpms/useAuth";
import { RoleProvider } from "@/hooks/cpms/useRole";
import { useInactivityTimeout } from "@/hooks/cpms/useInactivityTimeout";

// Signs the user out after 5 minutes idle. Mounted once, app-wide, exactly as
// <InactivityHandler /> was in the Vite App.tsx.
const InactivityHandler = () => {
  useInactivityTimeout();
  return null;
};

/**
 * The provider stack from the Vite App.tsx, minus BrowserRouter (App Router owns
 * routing now). Rendered from app/layout.tsx so it wraps every route.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  // Created in state rather than at module scope: on the server a module-level
  // client would be shared across requests, leaking cached data between users.
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <RoleProvider>
            <InactivityHandler />
            {children}
          </RoleProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
