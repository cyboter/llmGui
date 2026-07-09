import i18n from "../i18n";
import type { FriendlyError } from "./types";

/// Übersetzt einen vom Backend gelieferten FriendlyError (mit stabilem
/// `code`) in den aktuell aktiven UI-Sprachtext. Fällt auf den
/// deutschsprachigen Backend-Fallback-Text zurück, falls für den Code
/// (noch) kein Übersetzungseintrag existiert.
export function translateError(error: FriendlyError): string {
  const key = `errors.${error.code}`;
  const translated = i18n.t(key);
  return translated === key ? error.message : translated;
}
