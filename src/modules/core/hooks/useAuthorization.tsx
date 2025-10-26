/**
 * @fileoverview Custom hook to handle authorization for specific pages or components.
 * It checks if the current user's role includes at least one of the required permissions.
 * If not, it denies access and can optionally redirect the user.
 */
'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './useAuth';

type UseAuthorizationReturn = {
  isAuthorized: boolean | null;
  hasPermission: (permission: string) => boolean;
  userPermissions: string[];
};

export function useAuthorization(requiredPermissions: string[] = []): UseAuthorizationReturn {
    const router = useRouter();
    const { user, userRole, isReady } = useAuth(); // Use isReady from the central auth context

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
        // This effect is now simplified. The main redirect logic is in DashboardLayout.
        // It's kept in case specific pages need to react to authorization changes in the future,
        // but it no longer handles the primary redirection responsibility.
        if (isReady && !isAuthorized) {
            // Optional: Log an access attempt or handle specific page logic
        }
    }, [isAuthorized, isReady]);

    const hasPermission = (permission: string) => {
        if (!isReady || !userRole) return false;
        if (userRole.id === 'admin') return true;
        return userPermissions.includes(permission);
    };

    return { isAuthorized, hasPermission, userPermissions };
}
