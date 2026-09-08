"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import es from "@/locales/es.json";
import en from "@/locales/en.json";
import fr from "@/locales/fr.json";
import de from "@/locales/de.json";
import it from "@/locales/it.json";
import pt from "@/locales/pt.json";

export type Locale = "es" | "en" | "fr" | "de" | "it" | "pt";

export interface LocaleOption {
  code: Locale;
  name: string;
  nativeName: string;
  flag: string;
}

export const LOCALES: LocaleOption[] = [
  { code: "es", name: "Español", nativeName: "Español", flag: "🇪🇸" },
  { code: "en", name: "English", nativeName: "English", flag: "🇬🇧" },
  { code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷" },
  { code: "de", name: "German", nativeName: "Deutsch", flag: "🇩🇪" },
  { code: "it", name: "Italian", nativeName: "Italiano", flag: "🇮🇹" },
  { code: "pt", name: "Portuguese", nativeName: "Português", flag: "🇵🇹" },
];

const dictionaries: Record<Locale, any> = {
  es,
  en,
  fr,
  de,
  it,
  pt,
};

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (
    key: string,
    fallbackOrParams?: string | Record<string, string | number>,
    params?: Record<string, string | number>
  ) => string;
  locales: LocaleOption[];
}

const I18nContext = createContext<I18nContextType>({
  locale: "es",
  setLocale: () => {},
  t: (key: string, fallbackOrParams?: string | Record<string, string | number>) =>
    typeof fallbackOrParams === "string" ? fallbackOrParams : key,
  locales: LOCALES,
});

function getNestedValue(obj: any, path: string): string | undefined {
  if (!obj) return undefined;
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null || typeof current !== "object") {
      return undefined;
    }
    current = current[part];
  }
  return typeof current === "string" ? current : undefined;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("es");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("vibe_locale") as Locale | null;
      if (stored && ["es", "en", "fr", "de", "it", "pt"].includes(stored)) {
        setLocaleState(stored);
        if (typeof document !== "undefined") {
          document.documentElement.lang = stored;
        }
      } else if (typeof navigator !== "undefined" && navigator.language) {
        const browserLang = navigator.language.slice(0, 2).toLowerCase() as Locale;
        if (["es", "en", "fr", "de", "it", "pt"].includes(browserLang)) {
          setLocaleState(browserLang);
          if (typeof document !== "undefined") {
            document.documentElement.lang = browserLang;
          }
        }
      }
    } catch {
      // ignore
    } finally {
      setMounted(true);
    }
  }, []);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem("vibe_locale", newLocale);
      if (typeof document !== "undefined") {
        document.documentElement.lang = newLocale;
      }
    } catch {
      // ignore
    }
  };

  const t = (
    key: string,
    fallbackOrParams?: string | Record<string, string | number>,
    params?: Record<string, string | number>
  ): string => {
    let fallback: string | undefined;
    let interpolations: Record<string, string | number> | undefined;

    if (typeof fallbackOrParams === "string") {
      fallback = fallbackOrParams;
      interpolations = params;
    } else if (typeof fallbackOrParams === "object" && fallbackOrParams !== null) {
      interpolations = fallbackOrParams;
    }

    const dict = dictionaries[locale] || dictionaries.es;
    let translation = getNestedValue(dict, key);

    // Fallback to Spanish if key not found in current locale
    if (translation === undefined && locale !== "es") {
      translation = getNestedValue(dictionaries.es, key);
    }

    // Final fallback: fallback string or key itself
    if (translation === undefined) {
      translation = fallback !== undefined ? fallback : key;
    }

    if (interpolations) {
      Object.entries(interpolations).forEach(([paramKey, paramVal]) => {
        translation = translation!.replace(
          new RegExp(`\\{${paramKey}\\}`, "g"),
          String(paramVal)
        );
      });
    }

    return translation;
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, locales: LOCALES }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
