# CoTabor Feishu Setup Guide

To equip AI with memory and logging capabilities, CoTabor supports using Feishu Bitable as the backend database. Follow these steps to connect and initialize the Feishu backend in just two minutes.

## Step 1: Scan and Authorize

1. Open the CoTabor extension options page (click the extension icon, then click the ⚙️ Settings button in the dropdown panel).
2. Select **Feishu Settings** in the left menu bar.
3. Click the **Scan to Login to Feishu** button.
4. A new Feishu authorization web page will open. Use your Feishu mobile app to scan the QR code on the page and confirm authorization for the CoTabor extension.
5. After successful authorization, the page will close automatically, and the settings interface will display that you are logged in and show your Feishu username.

> *Tip: CoTabor obtains and uses an officially compliant Feishu authorization Token for API calls, ensuring high security without exposing any other personal information.*

## Step 2: Build the AI Memory Repository

Due to the underlying calling method, we need you to create an empty folder to store configurations and data:
1. Open the Feishu Cloud Docs space: [Feishu Cloud Docs](https://feishu.cn/drive/).
2. Create a **new empty folder** in a suitable location (e.g., the root directory of "My Space") and name it something like "CoTabor_Memories".
3. Copy the full web link of this folder (e.g., `https://xxx.feishu.cn/drive/folder/xxx...`).
4. Switch back to the CoTabor options page, and under "Step 2: Build Bitable", **paste the folder link (or Folder Token) into the input box**.
5. Click **One-Click Initialize AI Data Center**.

> Wait a few seconds, and the system will automatically create the underlying Bitable databases dedicated to recording execution logs and learning memories in the folder you specified. When the interface prompts "Initialization Successful!", the Feishu backend is fully integrated.

**Done!** CoTabor can now automatically record context and accumulate personal business operation rules and preferences.
