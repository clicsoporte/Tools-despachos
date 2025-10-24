/**
 * @fileoverview Custom hook to handle authorization for specific pages or components.
 * It checks if the current user's role includes at least one of the required permissions.
 * If not, it denies access and can optionally redirect the user.
 */
'use client';

import { useEffect, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

type UseAuthorizationReturn = {
  isAuthorized: boolean | null;
  hasPermission: (permission: string) => boolean;
  userPermissions: string[];
};

export function useAuthorization(requiredPermissions: string[] = []): UseAuthorizationReturn {
    const router = useRouter();
    const pathname = usePathname();
    const { toast } = useToast();
    const { user, userRole, isLoading, isReady } = useAuth(); // Use isReady from the central auth context

    const userPermissions = useMemo(() => userRole?.permissions || [], [userRole]);

    const isAuthorized = useMemo(() => {
        if (!isReady) return null; // Wait until all auth data is ready before making a decision.
        if (!user || !userRole) return false; // No user or role, not authorized.
        
        // If no specific permissions are required, being logged in and ready is enough.
        if (requiredPermissions.length === 0) return true;
        
        // Admin has all permissions, always.
        if (userRole.id === 'admin') return true;
        
        // Check if the user has at least one of the required permissions.
        return requiredPermissions.some(p => userPermissions.includes(p));
    }, [isReady, user, userRole, requiredPermissions, userPermissions]);

    useEffect(() => {
        // Only act if authorization status is definitively decided (not null) and it's negative.
        if (isAuthorized === false) {
             // Instead of a toast and redirect which can cause a flash of content,
             // components should use the `isAuthorized` flag to conditionally render.
             // This keeps the control within the component and provides a smoother experience.
             // If a component absolutely needs a redirect, it can implement it itself.
             // The main redirect logic is now in DashboardLayout.
        }
    }, [isAuthorized, router, toast, pathname]);

    const hasPermission = (permission: string) => {
        if (!isReady || !userRole) return false;
        if (userRole.id === 'admin') return true;
        return userPermissions.includes(permission);
    };

    return { isAuthorized, hasPermission, userPermissions };
}
