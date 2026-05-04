import React from 'react';
import { useTranslation } from 'react-i18next';
import { HumanRequest } from "../../lib/claw";

interface HumanInTheLoopUIProps {
  humanRequest: HumanRequest | null;
  handleHumanResponse: (confirmed: boolean) => void;
}

const typeConfig: Record<HumanRequest["type"], { emoji: string; title: string; color: string; bg: string; border: string; textColor: string }> = {
  confirmation: {
    emoji: "⚠️",
    title: "需要确认",
    color: "#d97706",
    bg: "#fffbeb",
    border: "#fde68a",
    textColor: "#92400e",
  },
  login: {
    emoji: "🔐",
    title: "需要登录",
    color: "#2563eb",
    bg: "#eff6ff",
    border: "#bfdbfe",
    textColor: "#1e40af",
  },
  captcha: {
    emoji: "🧩",
    title: "需要验证码",
    color: "#d97706",
    bg: "#fffbeb",
    border: "#fde68a",
    textColor: "#92400e",
  },
  "2fa": {
    emoji: "📱",
    title: "需要二步验证",
    color: "#7c3aed",
    bg: "#f5f3ff",
    border: "#ddd6fe",
    textColor: "#5b21b6",
  },
  stuck: {
    emoji: "🆘",
    title: "Agent 遇到困难，需要您帮助",
    color: "#dc2626",
    bg: "#fef2f2",
    border: "#fecaca",
    textColor: "#991b1b",
  },
};

export const HumanInTheLoopUI: React.FC<HumanInTheLoopUIProps> = ({ humanRequest, handleHumanResponse }) => {
  const { t } = useTranslation('sidepanel');

  if (!humanRequest) return null;

  const cfg = typeConfig[humanRequest.type] ?? typeConfig.confirmation;
  const showConfirmReject = humanRequest.type === "confirmation";
  const continueLabel = humanRequest.type === "stuck" ? "我已处理，继续执行" : "完成后继续";

  return (
    <div style={{ padding: "16px", backgroundColor: cfg.bg, borderTop: `1px solid ${cfg.border}`, boxShadow: "0 -4px 6px -1px rgba(0, 0, 0, 0.05)" }}>
      <h3 style={{ margin: "0 0 8px 0", color: cfg.color, fontSize: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
        <span>{cfg.emoji}</span> {cfg.title}
      </h3>
      <p style={{ margin: "0 0 12px 0", fontSize: "13px", color: cfg.textColor, lineHeight: "1.4" }}>{humanRequest.message}</p>
      {humanRequest.action_description && (
        <div style={{ margin: "0 0 12px 0", fontSize: "12px", color: cfg.textColor, backgroundColor: cfg.bg, padding: "10px", borderRadius: "8px", border: `1px dashed ${cfg.border}`, opacity: 0.85 }}>
          <strong>{t('humanLoop.actionDetails')}</strong> {humanRequest.action_description}
        </div>
      )}
      {showConfirmReject ? (
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
      ) : (
        <button
          onClick={() => handleHumanResponse(true)}
          style={{ width: "100%", backgroundColor: cfg.color, color: "white", padding: "10px", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "14px" }}
        >
          {continueLabel}
        </button>
      )}
    </div>
  );
};
