import React from "react";
import ReactDOM from "react-dom/client";
import "antd/dist/reset.css";
import { I18nextProvider } from "react-i18next";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { initI18n } from "../i18n";
import i18n from "../i18n";
import { SwarmApp } from "./App";

initI18n().then(() => {
  const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
  root.render(
    <React.StrictMode>
      <I18nextProvider i18n={i18n}>
        <ConfigProvider locale={zhCN}>
          <SwarmApp />
        </ConfigProvider>
      </I18nextProvider>
    </React.StrictMode>
  );
});
