# CoTabor Feishu Backend Guide (Legacy Compatibility Path)

English | [简体中文](../../zh-CN/manual/feishu.md)

Feishu-related backend code still exists in the repository, but it is no longer the primary documented setup flow in the current top-level Options UI. Treat this document as a compatibility note for maintainers who still need the legacy Feishu path.

## Current Status

- The current top-level Options UI focuses on `Notion`, `LLM`, and `MCP`
- Feishu is no longer the recommended default backend path in the public README
- If you continue maintaining Feishu, verify the current implementation in code before following older UI assumptions

## Step 1: Scan and Authorize

1. Confirm first that the repository branch you are working on still exposes a Feishu settings entry or an equivalent maintainer-only flow.
2. Open the CoTabor extension options page.
3. Use the available Feishu authorization entry in your current build.
4. Complete QR-code authorization in the Feishu web flow.
5. Verify in the UI or logs that the authorization state was persisted.

> *Tip: CoTabor obtains and uses an officially compliant Feishu authorization Token for API calls, ensuring high security without exposing any other personal information.*

## Step 2: Build the AI Memory Repository

Due to the underlying calling method, you need to create an empty folder to store configuration and data:
1. Open the Feishu Cloud Docs space: [Feishu Cloud Docs](https://feishu.cn/drive/).
2. Create a **new empty folder** in a suitable location (e.g., the root directory of "My Space") and name it something like "CoTabor_Memories".
3. Copy the full web link of this folder (e.g., `https://xxx.feishu.cn/drive/folder/xxx...`).
4. Switch back to the CoTabor options page, and under "Step 2: Build Bitable", **paste the folder link (or Folder Token) into the input box**.
5. Click **One-Click Initialize AI Data Center**.

> Wait a few seconds. The system should create the underlying Bitable databases used for execution logs and memory storage in the folder you specified. Verify the actual result against the current branch implementation.

## Maintenance Note

If the current build no longer exposes the required Feishu UI entry, do not keep extending this document with guessed steps. Update the product surface first, then update this guide.
