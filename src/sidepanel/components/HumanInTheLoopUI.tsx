import React from 'react';
import { useTranslation } from 'react-i18next';
import { HumanRequest } from "../../lib/claw";

interface HumanInTheLoopUIProps {
  humanRequest: HumanRequest | null;
  handleHumanResponse: (confirmed: boolean) => void;
}

export const HumanInTheLoopUI: React.FC<HumanInTheLoopUIProps> = ({ humanRequest, handleHumanResponse }) => {
  const { t } = useTranslation('sidepanel');

  if (!humanRequest) return null;

  return (
    <div style={{ padding: "16px", backgroundColor: "#fffbeb", borderTop: "1px solid #fde68a", boxShadow: "0 -4px 6px -1px rgba(0, 0, 0, 0.05)" }}>
      <h3 style={{ margin: "0 0 8px 0", color: "#d97706", fontSize: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
        <span>⚠️</span> {t('humanLoop.title')}
      </h3>
      <p style={{ margin: "0 0 12px 0", fontSize: "13px", color: "#92400e", lineHeight: "1.4" }}>{humanRequest.message}</p>
      {humanRequest.action_description && (
        <div style={{ margin: "0 0 12px 0", fontSize: "12px", color: "#b45309", backgroundColor: "#fef3c7", padding: "10px", borderRadius: "8px", border: "1px dashed #fcd34d" }}>
          <strong>{t('humanLoop.actionDetails')}</strong> {humanRequest.action_description}
        </div>
      )}
      {humanRequest.type === "confirmation" && (
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={() => handleHumanResponse(false)}
            style={{ flex: 1, backgroundColor: "#ffffff", color: "#ef4444", padding: "10px", border: "1px solid #fca5a5", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "14px" }}
          >
            {t('humanLoop.reject')}
          </button>
          <button
            onClick={() => handleHumanResponse(true)}
            style={{ flex: 1, backgroundColor: "#10b981", color: "white", padding: "10px", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "14px", boxShadow: "0 1px 2px rgba(16, 185, 129, 0.2)" }}
          >
            {t('humanLoop.allow')}
          </button>
        </div>
      )}
    </div>
  );
};
