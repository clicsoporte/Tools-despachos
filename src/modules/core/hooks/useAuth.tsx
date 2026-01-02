/**
 * @fileoverview This file defines a central authentication context and hook.
 * It provides a single source of truth for the current user, their role, companyData,
 * and loading status, preventing redundant data fetching and component re-renders.
 */
'use client';

import React, { createContext, useState, useContext, ReactNode, FC, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { User, Role, Company, Product, StockInfo, Customer, Exemption, ExemptionLaw, Notification, Suggestion } from "../types";
import { getCurrentUser as getCurrentUserClient, getInitialAuthData, logout as clientLogout } from '../lib/auth-client';
import { getUnreadSuggestionsCount as getUnreadSuggestionsCountAction } from "@/modules/core/lib/suggestions-actions";
import { getExchangeRate } from "../lib/api-actions";
import { getNotificationsForUser } from "../lib/notifications-actions";

const REDIRECT_URL_KEY = 'redirectUrl';

/**
 * Defines the shape of the authentication context's value.
 */
interface AuthContextType {
  user: User | null;
  userRole: Role | null;
  companyData: Company | null;
  customers: Customer[];
  products: Product[];
  stockLevels: StockInfo[];
  allExemptions: Exemption[];
  exemptionLaws: ExemptionLaw[];
  isReady: boolean; // Flag to signal when ALL auth-related data is loaded
  exchangeRateData: {
      rate: number | null;
      date: string | null;
  };
  unreadSuggestionsCount: number;
  notifications: Notification[];
  unreadNotificationsCount: number;
  fetchUnreadNotifications: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  redirectAfterLogin: (path?: string) => void;
  logout: () => void;
  refreshExchangeRate: () => Promise<void>;
  setCompanyData: (data: Company) => void;
  updateUnreadSuggestionsCount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * The provider component that wraps the authenticated parts of the application.
 * It handles the initial loading of all authentication-related data.
 * @param {object} props - The component props.
 * @param {ReactNode} props.children - The child components to render.
 */
export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [companyData, setCompanyData] = useState<Company | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockLevels, setStockLevels] = useState<StockInfo[]>([]);
  const [allExemptions, setAllExemptions] = useState<Exemption[]>([]);
  const [exemptionLaws, setExemptionLaws] = useState<ExemptionLaw[]>([]);
  const [exchangeRateData, setExchangeRateData] = useState<{ rate: number | null; date: string | null }>({ rate: null, date: null });
  const [unreadSuggestionsCount, setUnreadSuggestionsCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [isReady, setIsReady] = useState(false); // Only one state for readiness

  const fetchExchangeRate = useCallback(async () => {
    try {
        const data = await getExchangeRate();
        if (data.venta?.valor) {
             setExchangeRateData({
                rate: data.venta.valor,
                date: new Date(data.venta.fecha).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: '2-digit' })
             });
        }
    } catch (error) {
        console.error("Failed to fetch exchange rate on refresh:", error);
    }
  }, []);

  const updateUnreadSuggestionsCount = useCallback(async () => {
    try {
        const count = await getUnreadSuggestionsCountAction();
        setUnreadSuggestionsCount(count);
    } catch (error) {
        console.error("Failed to update unread suggestions count:", error);
    }
  }, []);

  const fetchUnreadNotifications = useCallback(async () => {
    const currentUser = await getCurrentUserClient();
    if (!currentUser) return;
    try {
      const userNotifications = await getNotificationsForUser(currentUser.id);
      setNotifications(userNotifications);
      setUnreadNotificationsCount(userNotifications.filter(n => !n.isRead).length);
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    }
  }, []);

  const loadAuthData = useCallback(async () => {
    setIsReady(false);
    try {
      const currentUser = await getCurrentUserClient();
      
      if (!currentUser) {
          setUser(null);
          setIsReady(true);
          return;
      }
      
      const data = await getInitialAuthData();
      
      setUser(currentUser);
      setCompanyData(data.companySettings);
      setCustomers(data.customers);
      setProducts(data.products);
      setStockLevels(data.stock);
      setAllExemptions(data.exemptions);
      setExemptionLaws(data.exemptionLaws);
      setExchangeRateData(data.exchangeRate);
      
      // Fetch initial counts and data
      const initialSuggestionsCount = await getUnreadSuggestionsCountAction();
      setUnreadSuggestionsCount(initialSuggestionsCount);
      
      const initialNotifications = await getNotificationsForUser(currentUser.id);
      setNotifications(initialNotifications);
      setUnreadNotificationsCount(initialNotifications.filter(n => !n.isRead).length);


      if (currentUser && data.roles.length > 0) {
        const role = data.roles.find((r: Role) => r.id === currentUser.role);
        setUserRole(role || null);
      } else {
        setUserRole(null);
      }
    } catch (error) {
      console.error("Failed to load authentication context data:", error);
      setUser(null);
      setUserRole(null);
      setCompanyData(null);
    } finally {
      setIsReady(true);
    }
  }, []);
  
  const redirectAfterLogin = (path?: string) => {
    const redirectUrlKey = 'redirectUrl';
    const redirectUrl = sessionStorage.getItem(redirectUrlKey);
    
    if (redirectUrl) {
        sessionStorage.removeItem(redirectUrlKey);
    }
    
    // Prioritize the redirect URL from session storage, then the provided path, then default to dashboard.
    router.push(redirectUrl || path || '/dashboard');
  };

  const handleLogout = async () => {
    await clientLogout();
    setIsReady(false);
    setUser(null);
    setUserRole(null);
    window.location.href = '/';
  }

  useEffect(() => {
    loadAuthData();
  }, [loadAuthData]);

  useEffect(() => {
    if (user && isReady) {
      const interval = setInterval(() => {
        // Run these in parallel and catch potential fetch errors
        Promise.all([
            updateUnreadSuggestionsCount(),
            fetchUnreadNotifications()
        ]).catch(error => {
            // This will catch network errors (like "Failed to fetch") if the server action call fails.
            // It's common during development with hot-reloading or temporary network issues.
            // We can log it silently to the console without breaking the UI.
            console.warn("Periodic auth update failed, likely due to network interruption or page unload:", error);
        });
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [user, isReady, updateUnreadSuggestionsCount, fetchUnreadNotifications]);

  const contextValue: AuthContextType = {
    user,
    userRole,
    companyData,
    customers,
    products,
    stockLevels,
    allExemptions,
    exemptionLaws,
    isReady,
    exchangeRateData,
    unreadSuggestionsCount,
    notifications,
    unreadNotificationsCount,
    fetchUnreadNotifications,
    refreshAuth: loadAuthData,
    redirectAfterLogin,
    logout: handleLogout,
    refreshExchangeRate: fetchExchangeRate,
    setCompanyData,
    updateUnreadSuggestionsCount,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * A custom hook to easily access the central authentication context.
 * Throws an error if used outside of an AuthProvider.
 * @returns {AuthContextType} The authentication context value.
 */
export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};
