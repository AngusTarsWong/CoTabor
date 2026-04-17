# CoTabor Notion Setup Guide (Recommended for Beginners)

Notion Database is the recommended first choice for an AI memory backend, especially suited for users experiencing CoTabor's persistent memory feature for the first time.

## Step 1: Authorize Notion Access

CoTabor provides two methods to bind Notion. Generally, just use **Method 1: OAuth Quick Authorization**.

1. Open the CoTabor extension options page.
2. Select **Notion Settings** in the top left corner (if it defaults to Feishu, you can switch via the top tabs).
3. Click the **Web Quick Authorize Notion** button.
4. Confirm your login in the pop-up Notion official login window, and select the workspace space and page permissions you want to authorize for CoTabor.
5. Upon success, the settings panel status will update to: "Authorized".

*(If you are an advanced user or deploying your own internal version of the plugin, you can also select "Method 2" at the bottom to configure through a self-built Internal Integration and applying for a Token starting with `secret_ `)*

## Step 2: Initialize Notion Data Center

Next, you need to create a few child data tables dedicated to AI under a specific parent document.

1. Go to any existing page you can edit, or create a **brand new blank Parent Page** and name it something like "Agent Memory & Execution Log Repo".
2. Since workspace permissions were already granted during authorization (usually no manual setup needed; if using Method 2 Token, click `...` at the top right of this page -> Connections -> select your Integration name to authorize).
3. Copy the **URL link of this current Parent Page**.
4. Return to the settings interface, and in Step 2, paste this URL into the input box.
5. Click the blue **One-Click Initialize Notion Data Center** button.

The creation process includes three tables (usually referred to collectively as L1/L2/L3): "Skill Graph (Skill)", "Tactical Experience (Tactical)", and some logs. Wait for the configuration code and completion text to pop up in the bottom right corner, and it's done.

## Step 3: Enable Notion as the Primary Backend

Completing the configuration does not mean the system will immediately write to this newly initialized Notion. You must tell the system to switch here:
- Under "Step 3: Enable Notion Backend" on the settings page, click the green **Switch to Notion Backend** button.

All done! From now on, interactions and execution patterns that need to be "remembered" will be recorded nicely as independent page cards into your Notion database system.
