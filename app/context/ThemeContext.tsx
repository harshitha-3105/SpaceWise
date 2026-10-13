"use client";

import { createContext, useContext, useEffect, ReactNode } from "react";
import { notifyStorageChange, useBrowserStorageValue } from "../utils/browserStorage";

type Theme = "dark" | "light";
interface ThemeCtx { theme: Theme; toggle: () => void; }

const Ctx = createContext<ThemeCtx>({ theme: "dark", toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const savedTheme = useBrowserStorageValue("sw_theme");
  const theme: Theme = savedTheme === "light" ? "light" : "dark";

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    localStorage.setItem("sw_theme", next);
    notifyStorageChange("sw_theme");
    document.documentElement.setAttribute("data-theme", next);
  }

  return <Ctx.Provider value={{ theme, toggle }}>{children}</Ctx.Provider>;
}

export function useTheme() { return useContext(Ctx); }
