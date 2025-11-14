/**
 * @fileoverview The main entry point of the application.
 * This Server Component acts as a router, determining whether to show
 * the login form or the initial setup wizard based on whether any users
 * exist in the database.
 */

import { headers } from "next/headers";
import { AuthForm } from "@/components/auth/auth-form";
import { SetupWizard } from "@/components/auth/setup-wizard";
import { getCompanySettings, getUserCount } from "@/modules/core/lib/db";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Network, UserPlus } from "lucide-react";

async function CompanyInfo({ hasUsers }: { hasUsers: boolean }) {
  const companyData = await getCompanySettings();
  return (
    <CardHeader className="text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
        {hasUsers ? <Network className="h-8 w-8" /> : <UserPlus className="h-8 w-8" />}
      </div>
      <CardTitle className="text-3xl font-bold">{hasUsers ? companyData?.systemName || "Clic-Tools" : "Bienvenido a Clic-Tools"}</CardTitle>
      <CardDescription>
        {hasUsers ? "Inicia sesión para acceder a tus herramientas" : "Completa la configuración para crear tu cuenta de administrador"}
      </CardDescription>
    </CardHeader>
  );
}

/**
 * Renders either the login page or the setup wizard.
 * It fetches server-side data (user count, request headers) and passes it
 * to the appropriate client component.
 */
export default async function InitialPage() {
  const userCount = await getUserCount();
  const hasUsers = userCount > 0;

  const requestHeaders = headers();
  const clientIp = requestHeaders.get('x-forwarded-for') ?? 'Unknown IP';
  const clientHost = requestHeaders.get('host') ?? 'Unknown Host';
  const clientInfo = { ip: clientIp, host: clientHost };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm shadow-2xl">
        <CompanyInfo hasUsers={hasUsers} />
        <CardContent>
            {hasUsers ? (
                <AuthForm clientInfo={clientInfo} />
            ) : (
                <SetupWizard clientInfo={clientInfo} />
            )}
        </CardContent>
      </Card>
    </div>
  );
}
