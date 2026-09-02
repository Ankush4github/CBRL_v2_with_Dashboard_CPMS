"use client";

import { Button } from "@/components/cpms/ui/button";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { asset } from "@/lib/cpms/base-path";
interface PageHeaderProps {
  title: string;
  backTo?: string;
  showLogo?: boolean;
  children?: React.ReactNode;
}

const PageHeader = ({ title, backTo = "/dashboard", showLogo = false, children }: PageHeaderProps) => {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-50 bg-card border-b-2 border-border p-4">
      <div className="max-w-7xl mx-auto flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push(asset(backTo))}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2 flex-1">
          {showLogo ? (
            <img src={asset("/cbrl-logo.png")} alt="CBRL Logo" className="h-10 w-10 object-contain" />
          ) : (
            <div className="h-10 w-10 bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">C</span>
            </div>
          )}
          <span className="font-bold text-xl tracking-tight">{title}</span>
        </div>
        {children}
      </div>
    </header>
  );
};

export default PageHeader;