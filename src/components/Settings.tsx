import { Trans, useTranslation } from 'react-i18next';
import { useTourStore } from '../store/tourStore';
import { SUPPORTED_LANGUAGES } from '../i18n';
import type { ExportLang } from '../types';

export default function Settings() {
  const { t } = useTranslation();
  const name = useTourStore((s) => s.settings.name);
  const setName = useTourStore((s) => s.setName);
  const gallery = useTourStore((s) => s.settings.gallery);
  const setGallery = useTourStore((s) => s.setGallery);
  const tiles = useTourStore((s) => s.settings.tiles);
  const setTiles = useTourStore((s) => s.setTiles);
  const lang = useTourStore((s) => s.settings.lang);
  const setLang = useTourStore((s) => s.setLang);

  return (
    <div className="settings">
      <h2>{t('settings.title')}</h2>
      <p className="muted">{t('settings.subtitle')}</p>

      <label className="setting">
        <span>
          <strong>{t('settings.projectName')}</strong>
          <span className="muted">
            <Trans
              i18nKey="settings.projectNameHelp"
              components={[<code />, <code />, <code />]}
            />
          </span>
          <input
            className="setting-text"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('settings.projectNamePlaceholder')}
          />
        </span>
      </label>

      <label className="setting">
        <span>
          <strong>{t('settings.tourLanguage')}</strong>
          <span className="muted">{t('settings.tourLanguageHelp')}</span>
          <select
            className="setting-text"
            value={lang}
            onChange={(e) => setLang(e.target.value as ExportLang)}
          >
            {SUPPORTED_LANGUAGES.map((lng) => (
              <option key={lng} value={lng}>
                {t(`language.${lng}`)}
              </option>
            ))}
          </select>
        </span>
      </label>

      <label className="setting">
        <input
          type="checkbox"
          checked={gallery}
          onChange={(e) => setGallery(e.target.checked)}
        />
        <span>
          <strong>{t('settings.includeGallery')}</strong>
          <span className="muted">
            <Trans
              i18nKey="settings.galleryHelp"
              components={[<em />, <code />]}
            />
          </span>
        </span>
      </label>

      <label className="setting">
        <input
          type="checkbox"
          checked={tiles}
          onChange={(e) => setTiles(e.target.checked)}
        />
        <span>
          <strong>{t('settings.tiles')}</strong>
          <span className="muted">
            <Trans i18nKey="settings.tilesHelp" components={[<code />]} />
          </span>
        </span>
      </label>
    </div>
  );
}
