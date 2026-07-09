import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import de from "./locales/de.json";
import en from "./locales/en.json";

const LANGUAGE_KEY = "llmgui.language";

export type SupportedLanguage = "de" | "en";

function detectInitialLanguage(): SupportedLanguage {
  const stored = localStorage.getItem(LANGUAGE_KEY);
  if (stored === "de" || stored === "en") return stored;

  // WebView2 spiegelt die Windows-Systemsprache in navigator.language wider
  // — reicht für unsere Zwecke, ohne eine zusätzliche Tauri-OS-Plugin-
  // Abhängigkeit nur für die Spracherkennung einzuführen.
  return navigator.language.toLowerCase().startsWith("de") ? "de" : "en";
}

export function setLanguage(lang: SupportedLanguage): void {
  localStorage.setItem(LANGUAGE_KEY, lang);
  i18n.changeLanguage(lang);
}

export function getStoredLanguage(): SupportedLanguage {
  return detectInitialLanguage();
}

i18n.use(initReactI18next).init({
  resources: {
    de: { translation: de },
    en: { translation: en },
  },
  lng: detectInitialLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
