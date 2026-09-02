"use client";

import { useState } from "react";
import { Button } from "@/components/cpms/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/cpms/ui/card";
import { Loader2, Shield, Stethoscope, Activity, FlaskConical, Microscope, TestTube, Atom, Dna, Pill, Heart, Syringe, Beaker, Thermometer, Droplets, Scan } from "lucide-react";
import { useAuth } from "@/hooks/cpms/useAuth";
import { toast } from "sonner";
import { describeError } from "@/lib/cpms/errors";
import { asset } from "@/lib/cpms/base-path";
const FloatingElement = ({ 
  children, 
  className = "",
  style = {}
}: { 
  children: React.ReactNode; 
  className?: string;
  style?: React.CSSProperties;
}) => (
  <div 
    className={`absolute text-primary/10 pointer-events-none ${className}`}
    style={style}
  >
    {children}
  </div>
);

const Login = () => {
  const {
    signInWithGoogle
  } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const handleGoogleLogin = async () => {
    setIsLoading(true);
    const {
      error
    } = await signInWithGoogle();
    if (error) {
      toast.error(describeError(error, "Failed to sign in with Google"));
      setIsLoading(false);
    }
    // Don't set loading to false on success - redirect will happen
  };
  return <div className="min-h-screen flex flex-col relative overflow-hidden bg-gradient-to-br from-background via-background to-accent/20">
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-primary/5 via-transparent to-secondary/10 pointer-events-none" />
      
      {/* Floating Lab Elements - Primary color variations */}
      <FloatingElement className="top-[10%] left-[5%] text-primary/15 animate-[float_6s_ease-in-out_infinite]" style={{ animationDelay: '0s' }}>
        <FlaskConical size={48} strokeWidth={1} />
      </FloatingElement>
      <FloatingElement className="top-[20%] right-[8%] text-primary/20 animate-[float_8s_ease-in-out_infinite]" style={{ animationDelay: '1s' }}>
        <Microscope size={56} strokeWidth={1} />
      </FloatingElement>
      <FloatingElement className="top-[60%] left-[3%] text-primary/10 animate-[float_7s_ease-in-out_infinite]" style={{ animationDelay: '2s' }}>
        <TestTube size={40} strokeWidth={1} />
      </FloatingElement>
      <FloatingElement className="top-[75%] right-[5%] text-primary/25 animate-[float_5s_ease-in-out_infinite]" style={{ animationDelay: '0.5s' }}>
        <Atom size={52} strokeWidth={1} />
      </FloatingElement>
      
      {/* Floating Lab Elements - Accent color variations */}
      <FloatingElement className="top-[40%] left-[8%] text-accent-foreground/15 animate-[float_9s_ease-in-out_infinite]" style={{ animationDelay: '3s' }}>
        <Dna size={44} strokeWidth={1} />
      </FloatingElement>
      <FloatingElement className="top-[30%] right-[3%] text-muted-foreground/20 animate-[float_6s_ease-in-out_infinite]" style={{ animationDelay: '1.5s' }}>
        <Pill size={36} strokeWidth={1} />
      </FloatingElement>
      <FloatingElement className="top-[85%] left-[10%] text-destructive/15 animate-[float_7s_ease-in-out_infinite]" style={{ animationDelay: '2.5s' }}>
        <Heart size={32} strokeWidth={1} />
      </FloatingElement>
      <FloatingElement className="top-[50%] right-[6%] text-primary/12 animate-[float_8s_ease-in-out_infinite]" style={{ animationDelay: '4s' }}>
        <Syringe size={38} strokeWidth={1} />
      </FloatingElement>
      
      {/* Additional floating elements */}
      <FloatingElement className="top-[15%] left-[45%] text-primary/8 animate-[float_10s_ease-in-out_infinite]" style={{ animationDelay: '2s' }}>
        <Beaker size={42} strokeWidth={1} />
      </FloatingElement>
      <FloatingElement className="top-[70%] right-[40%] text-muted-foreground/12 animate-[float_7s_ease-in-out_infinite]" style={{ animationDelay: '3.5s' }}>
        <Thermometer size={34} strokeWidth={1} />
      </FloatingElement>
      <FloatingElement className="top-[5%] right-[25%] text-primary/18 animate-[float_8s_ease-in-out_infinite]" style={{ animationDelay: '1.2s' }}>
        <Droplets size={38} strokeWidth={1} />
      </FloatingElement>
      <FloatingElement className="top-[90%] right-[20%] text-accent-foreground/10 animate-[float_6s_ease-in-out_infinite]" style={{ animationDelay: '4.5s' }}>
        <Scan size={46} strokeWidth={1} />
      </FloatingElement>
      {/* Header */}
      <header className="p-4 lg:p-6">
        <div className="flex items-center gap-2">
          <img src={asset("/cbrl-logo.png")} alt="CBRL Logo" className="h-10 w-10 object-contain" />
          <span className="font-bold text-xl tracking-tight">CPMS</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8">
          {/* Welcome Section */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">
              CBRL Patient Management System
            </h1>
            <p className="text-muted-foreground text-lg">
              CPMS - Secure. Smart. Simple.
            </p>
          </div>

          {/* Login Card */}
          <Card className="border-2 border-border shadow-md">
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-xl">Welcome Back</CardTitle>
              <CardDescription>
                Sign in to access patient records
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Button onClick={handleGoogleLogin} disabled={isLoading} className="w-full h-14 text-base font-semibold gap-3" size="lg">
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>}
                {isLoading ? "Signing in..." : "Continue with Google"}
              </Button>

              <div className="text-center text-sm text-muted-foreground">
                <p>
                  By signing in, you agree to our{" "}
                  <a href="#" className="underline hover:text-foreground">
                    Terms of Service
                  </a>{" "}
                  and{" "}
                  <a href="#" className="underline hover:text-foreground">
                    Privacy Policy
                  </a>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Features */}
          <div className="grid grid-cols-3 gap-4 pt-4">
            <div className="text-center space-y-2">
              <div className="mx-auto h-12 w-12 bg-accent flex items-center justify-center">
                <Shield className="h-6 w-6 text-accent-foreground" />
              </div>
              <p className="text-xs font-medium">Secure Access</p>
            </div>
            <div className="text-center space-y-2">
              <div className="mx-auto h-12 w-12 bg-accent flex items-center justify-center">
                <Stethoscope className="h-6 w-6 text-accent-foreground" />
              </div>
              <p className="text-xs font-medium">AI Powered</p>
            </div>
            <div className="text-center space-y-2">
              <div className="mx-auto h-12 w-12 bg-accent flex items-center justify-center">
                <Activity className="h-6 w-6 text-accent-foreground" />
              </div>
              <p className="text-xs font-medium">Real-time</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-4 text-center text-sm text-muted-foreground">
        <p className="text-foreground text-center">© 2026-27 <a href="https://cbrl.iitkgp.ac.in/" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Clinical Biomarker Research Laboratory</a>, IIT Kharagpur. All rights reserved.</p>
      </footer>
    </div>;
};
export default Login;