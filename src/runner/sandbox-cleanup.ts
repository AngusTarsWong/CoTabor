import type { Page } from "puppeteer-core";

export const isIgnorableSandboxCloseError = (error: unknown): boolean => {
  const message = String((error as any)?.message || error || "").toLowerCase();
  return (
    message.includes("connection closed") ||
    message.includes("session closed") ||
    message.includes("target closed") ||
    message.includes("protocol error") ||
    message.includes("most likely the page has been closed")
  );
};

export const closeSandboxPageSafely = async (page: Page | undefined | null): Promise<void> => {
  if (!page || page.isClosed()) {
    return;
  }

  try {
    await page.close();
  } catch (error) {
    if (!isIgnorableSandboxCloseError(error)) {
      throw error;
    }
  }
};
