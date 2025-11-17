
/**
 * @fileoverview Redirect component for the old /dashboard/settings route.
 * This component will now permanently redirect to the user's profile page.
 */
"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { Loader2 } from 'lucide-react';

export default function OldSettingsPage() {
    const router = useRouter();
    const { isReady } = useAuth();

    useEffect(() => {
        // Only redirect once the auth state (and thus the router) is ready.
        if (isReady) {
            router.replace('/dashboard/profile');
        }
    }, [isReady, router]);
    
    // Display a loader while the redirection is happening.
    return (
         <div className="flex h-screen w-full items-center justify-center bg-background">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
    );
}
