"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";
import { asset } from "@/lib/cpms/base-path";

const NotFound = () => {
  const pathname = usePathname();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", pathname);
  }, [pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
        {/* A bare "/" would leave CPMS entirely and land on the main CBRL
            site's home page. Next used to resolve it against basePath; with
            CPMS mounted as an ordinary route subtree it no longer does, so the
            mount path is applied explicitly. */}
        <Link href={asset("/")} className="text-primary underline hover:text-primary/90">
          Return to Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
