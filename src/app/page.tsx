/**
 * @fileoverview The main entry point of the application, refactored as a Client Component.
 * This component now handles the logic for displaying the login form or the setup wizard
 * on the client-side, making it more resilient to server-side rendering issues.
 */
"use client";

import { AuthForm } from "@/components/auth/auth-form";
import { SetupWizard } from "@/components/auth/setup-wizard";
import { getCompanySettings, getUserCount } from "@/modules/core/lib/db";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Network, UserPlus, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import React, { useState, useEffect } from 'react';

// Client-side component to handle dynamic rendering of login or setup.
export default function InitialPage() {
  const [hasUsers, setHasUsers] = useState<boolean | null>(null);
  const [companyName, setCompanyName] = useState<string>("Clic-Tools");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkUserStatus() {
      try {
        const [userCount, companyData] = await Promise.all([
          getUserCount(),
          getCompanySettings()
        ]);
        setHasUsers(userCount > 0);
        if (companyData?.systemName) {
          setCompanyName(companyData.systemName);
        }
      } catch (error) {
        console.error("Error checking initial user status:", error);
        // Fallback to login form if there's an error, as it's the most common state.
        setHasUsers(true);
      } finally {
        setIsLoading(false);
      }
    }
    checkUserStatus();
  }, []);

  // Client info can be simplified as server-side headers are not available here.
  const clientInfo = { ip: 'N/A', host: 'N/A' };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm shadow-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
            {isLoading ? <Loader2 className="h-8 w-8 animate-spin" /> : hasUsers ? <Network className="h-8 w-8" /> : <UserPlus className="h-8 w-8" />}
          </div>
          {isLoading ? (
            <>
              <Skeleton className="h-9 w-48 mx-auto" />
              <Skeleton className="h-5 w-80 mx-auto mt-2" />
            </>
          ) : (
            <>
              <CardTitle className="text-3xl font-bold">
                {hasUsers ? companyName : "Bienvenido a Clic-Tools"}
              </CardTitle>
              <CardDescription>
                {hasUsers
                  ? "Inicia sesión para acceder a tus herramientas"
                  : "Completa la configuración para crear tu cuenta de administrador"}
              </CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center h-48">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
          ) : hasUsers === true ? (
            <AuthForm clientInfo={clientInfo} />
          ) : hasUsers === false ? (
            <SetupWizard clientInfo={clientInfo} />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
