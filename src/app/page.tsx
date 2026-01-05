/**
 * @fileoverview The main entry point of the application.
 * This component now acts as a simple Server Component wrapper, delegating the
 * core logic of displaying either the login form or the setup wizard to the
 * client-side AuthForm component. This simplifies the initial render and
 * improves build stability.
 */
import { AuthForm } from "@/components/auth/auth-form";
import {
  Card,
} from "@/components/ui/card";
import { headers } from "next/headers";
import React from "react";

export const dynamic = 'force-dynamic';

export default function InitialPage() {
  // Extracting client info on the server side.
  // Note: In a typical server environment behind proxies, you'd need to check
  // 'x-forwarded-for' headers. For a LAN app, this is generally sufficient.
  const headerList = headers();
  const clientInfo = {
    ip: headerList.get("x-forwarded-for") || "N/A",
    host: headerList.get("host") || "N/A",
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm shadow-2xl">
        {/* The AuthForm component will now handle showing the correct title/description and form */}
        <AuthForm clientInfo={clientInfo} />
      </Card>
    </div>
  );
}
