import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { card, sectionBox, inputStyle, btn } from "../styles";
import { FeishuAuthManager } from "../../shared/utils/feishu-auth";

const FeishuTab: React.FC = () => {
  const { t } = useTranslation("options");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [refreshExpiresAt, setRefreshExpiresAt] = useState("");
  const [userName, setUserName] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [savedConfig, setSavedConfig] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    chrome.storage.local.get(["feishuAppId", "feishuAppSecret"], async (result) => {
      setAppId(result.feishuAppId || "");
      setAppSecret(result.feishuAppSecret || "");
      setSavedConfig(!!(result.feishuAppId && result.feishuAppSecret));
    });

    FeishuAuthManager.getInstance().loadSession().then((session) => {
      if (!session) return;
      setAccessToken(session.access_token || "");
      setRefreshToken(session.refresh_token || "");
      setExpiresAt(session.expires_at ? String(session.expires_at) : "");
      setRefreshExpiresAt(session.refresh_expires_at ? String(session.refresh_expires_at) : "");
      setUserName(session.user_name || "");
      setTenantName(session.tenant_name || "");
      setIsAuthorized(!!session.access_token);
    });
  }, []);

  const handleSaveConfig = async () => {
    await chrome.storage.local.set({
      feishuAppId: appId.trim(),
      feishuAppSecret: appSecret.trim(),
    });
    setSavedConfig(!!(appId.trim() && appSecret.trim()));
    setStatusMsg(t("feishu.configSaved"));
  };

  const handleSaveSession = async () => {
    if (!accessToken.trim()) {
      setStatusMsg(t("feishu.noAccessToken"));
      return;
    }

    await FeishuAuthManager.getInstance().saveSession({
      access_token: accessToken.trim(),
      refresh_token: refreshToken.trim() || undefined,
      expires_at: expiresAt.trim() ? Number(expiresAt.trim()) : undefined,
      refresh_expires_at: refreshExpiresAt.trim() ? Number(refreshExpiresAt.trim()) : undefined,
      user_name: userName.trim() || undefined,
      tenant_name: tenantName.trim() || undefined,
      saved_at: Date.now(),
    });

    setIsAuthorized(true);
    setStatusMsg(t("feishu.sessionSaved"));
  };

  const handleClearSession = async () => {
    await FeishuAuthManager.getInstance().clearSession();
    setAccessToken("");
    setRefreshToken("");
    setExpiresAt("");
    setRefreshExpiresAt("");
    setUserName("");
    setTenantName("");
    setIsAuthorized(false);
    setStatusMsg(t("feishu.sessionCleared"));
  };

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
        <div>
          <h2 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 4px" }}>{t("feishu.title")}</h2>
          <p style={{ color: "#6b7280", fontSize: "14px", margin: 0 }}>{t("feishu.desc")}</p>
        </div>
        <div style={{ padding: "4px 10px", backgroundColor: "#fff7ed", color: "#9a3412", borderRadius: "12px", fontSize: "12px", fontWeight: 600, border: "1px solid #fdba74" }}>
          {t("feishu.badge")}
        </div>
      </div>

      <div style={sectionBox}>
        <h3 style={{ fontSize: "15px", fontWeight: 600, margin: "0 0 12px" }}>{t("feishu.configTitle")}</h3>
        <div style={{ display: "grid", gap: "10px" }}>
          <input type="text" value={appId} onChange={(e) => setAppId(e.target.value)} placeholder={t("feishu.appIdPlaceholder")} style={inputStyle} />
          <input type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder={t("feishu.appSecretPlaceholder")} style={inputStyle} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px" }}>
          <span style={{ fontSize: "12px", color: "#6b7280" }}>
            {savedConfig ? t("feishu.configReady") : t("feishu.configPending")}
          </span>
          <button onClick={handleSaveConfig} style={{ ...btn("#2563eb"), padding: "8px 12px", fontSize: "13px" }}>
            {t("feishu.saveConfig")}
          </button>
        </div>
      </div>

      <div style={{ ...sectionBox, marginTop: "16px" }}>
        <h3 style={{ fontSize: "15px", fontWeight: 600, margin: "0 0 12px" }}>{t("feishu.sessionTitle")}</h3>
        <p style={{ margin: "0 0 12px", fontSize: "12px", color: "#6b7280", lineHeight: 1.6 }}>
          {t("feishu.sessionDesc")}
        </p>
        <div style={{ display: "grid", gap: "10px" }}>
          <input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder={t("feishu.accessTokenPlaceholder")} style={inputStyle} />
          <input type="password" value={refreshToken} onChange={(e) => setRefreshToken(e.target.value)} placeholder={t("feishu.refreshTokenPlaceholder")} style={inputStyle} />
          <input type="text" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} placeholder={t("feishu.expiresAtPlaceholder")} style={inputStyle} />
          <input type="text" value={refreshExpiresAt} onChange={(e) => setRefreshExpiresAt(e.target.value)} placeholder={t("feishu.refreshExpiresAtPlaceholder")} style={inputStyle} />
          <input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} placeholder={t("feishu.userNamePlaceholder")} style={inputStyle} />
          <input type="text" value={tenantName} onChange={(e) => setTenantName(e.target.value)} placeholder={t("feishu.tenantNamePlaceholder")} style={inputStyle} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px" }}>
          <span style={{ fontSize: "12px", color: isAuthorized ? "#166534" : "#9a3412" }}>
            {isAuthorized ? t("feishu.authorized") : t("feishu.notAuthorized")}
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={handleSaveSession} style={{ ...btn("#0f766e"), padding: "8px 12px", fontSize: "13px" }}>
              {t("feishu.saveSession")}
            </button>
            <button onClick={handleClearSession} style={{ ...btn("#b91c1c"), padding: "8px 12px", fontSize: "13px" }}>
              {t("feishu.clearSession")}
            </button>
          </div>
        </div>
      </div>

      <div style={{ ...sectionBox, marginTop: "16px", backgroundColor: "#f8fafc" }}>
        <h3 style={{ fontSize: "15px", fontWeight: 600, margin: "0 0 8px" }}>{t("feishu.runtimeTitle")}</h3>
        <p style={{ margin: 0, fontSize: "13px", color: "#475569", lineHeight: 1.7 }}>
          {t("feishu.runtimeDesc")}
        </p>
      </div>

      {statusMsg ? (
        <div style={{ marginTop: "12px", fontSize: "12px", color: "#2563eb" }}>{statusMsg}</div>
      ) : null}
    </div>
  );
};

export default FeishuTab;
