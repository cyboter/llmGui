import { useTranslation } from "react-i18next";
import { setLanguage, type SupportedLanguage } from "../../i18n";

export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation();

  return (
    <div className="field-block">
      <label htmlFor="language-select">{t("advanced.language")}</label>
      <select
        id="language-select"
        value={i18n.language}
        onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
      >
        <option value="de">{t("advanced.languageGerman")}</option>
        <option value="en">{t("advanced.languageEnglish")}</option>
      </select>
    </div>
  );
}
