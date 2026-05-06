import React, { useEffect, useState } from 'react';
import { Button, Dropdown, Flex, Space, Typography } from 'antd';
import { GlobalOutlined, LinkOutlined, SettingOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { changeLanguage, SUPPORTED_LANGUAGES } from '../../i18n';
import { findLanguage } from '../../i18n/languages';

const { Text, Title } = Typography;

interface HeaderProps {
  boundTabId: number | null;
  boundTabTitle: string;
  boundTabUrl: string;
  sessionLocked: boolean;
  activeTabTitle: string;
  activeTabUrl: string;
  openOptions: () => void;
  onBindCurrentPage: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  boundTabId,
  boundTabTitle,
  boundTabUrl,
  sessionLocked,
  activeTabTitle,
  activeTabUrl,
  openOptions,
  onBindCurrentPage,
}) => {
  const [version, setVersion] = useState("1.0.0");
  const { t, i18n } = useTranslation('sidepanel');

  useEffect(() => {
    try {
      const manifest = chrome.runtime.getManifest();
      if (manifest && manifest.version) {
        setVersion(manifest.version);
      }
    } catch (e) {
      console.warn("Failed to get extension version", e);
    }
  }, []);

  const currentLangLabel = findLanguage(i18n.language)?.label ?? 'EN';

  const langMenuItems = SUPPORTED_LANGUAGES.map(lang => ({
    key: lang.code,
    label: lang.label,
    onClick: () => changeLanguage(lang.code),
  }));

  const isBrowsingDifferentPage = sessionLocked && activeTabUrl && boundTabUrl && activeTabUrl !== boundTabUrl;

  return (
    <header style={{ padding: "12px 16px", backgroundColor: "#ffffff", borderBottom: "1px solid #e5e7eb", display: "flex", flexDirection: "column", gap: "10px", boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)", zIndex: 10 }}>
      <Flex justify="space-between" align="center" wrap gap="small">
        <Space align="center" size={8}>
          <img src="/icons/icon48.png" alt="CoTabor Logo" style={{ width: "26px", height: "26px", borderRadius: "6px", objectFit: "cover" }} />
          <Title level={5} style={{ margin: 0, display: "flex", alignItems: "center", gap: "6px", color: "#111827" }}>
            CoTabor
            <Text type="secondary" style={{ fontSize: "12px", fontWeight: 400 }}>v{version}</Text>
            <div
              style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: boundTabId ? "#10b981" : "#ef4444", marginLeft: "4px" }}
              title={boundTabId ? t('header.connected') : t('header.disconnected')}
            />
          </Title>
        </Space>

        <Space size={8} wrap>
          <Button
            onClick={onBindCurrentPage}
            icon={<LinkOutlined />}
            style={{ borderRadius: 10 }}
            title={t('header.bindPageTitle')}
          >
            {t('header.bindPage')}
          </Button>

          <Dropdown menu={{ items: langMenuItems }} trigger={['click']}>
            <Button icon={<GlobalOutlined />} style={{ borderRadius: 10 }}>
              {currentLangLabel}
            </Button>
          </Dropdown>

          <Button
            onClick={openOptions}
            icon={<SettingOutlined />}
            style={{ borderRadius: 10 }}
          >
            {t('common:settings')}
          </Button>
        </Space>
      </Flex>
      {boundTabId && (
        <div style={{ fontSize: "12px", color: "#6b7280", lineHeight: 1.5, minWidth: 0, backgroundColor: "#f9fafb", padding: "8px 10px", borderRadius: "6px", border: "1px solid #f3f4f6" }}>
          <div style={{ color: "#374151", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {t('header.boundPage', { defaultValue: '任务绑定页面' })} · {boundTabTitle || t('header.noTitle')}
          </div>
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "2px" }} title={boundTabUrl || ""}>
            {boundTabUrl || t('header.noUrl')}
          </div>
          {isBrowsingDifferentPage && (
            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "4px", color: "#2563eb" }} title={activeTabUrl}>
              {t('header.currentBrowsingPage', { defaultValue: '当前浏览页' })} · {activeTabTitle || activeTabUrl}
            </div>
          )}
        </div>
      )}
    </header>
  );
};
