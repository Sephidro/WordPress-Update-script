# 🏛️ Google Drive to WordPress Governance Automation

This Google Apps Script automates the posting of official governance documents (Meeting Minutes, Agendas) from a Google Drive folder directly to a WordPress website.

It solves the problem of "Compliance Drudgery" by allowing administrators to simply drag-and-drop files into a folder, while the script handles conversion, formatting, and publishing.

## 🌟 Key Features

* **Format Conversion:** Automatically detects `.docx` files, converts them to PDF, and uploads the clean PDF to WordPress.
* **"Time Travel" (OCR Date Detection):** Scans the document text to find the *actual* meeting date (e.g., "December 14, 2025") and backdates the WordPress post to match. This ensures archives remain chronological regardless of when the file was uploaded.
* **Shortcut Resolver:** Supports Google Drive Shortcuts, allowing you to organize files in multiple folders without breaking the automation.
* **Duplicate Prevention:** Tracks processed File IDs to prevent double-posting.

## 🛠️ Setup Instructions

### 1. WordPress Configuration
1.  Go to your WordPress Users page.
2.  Create a new Application Password for your user.
3.  Note your `Category ID` for where these posts should live (e.g., "Governance").

### 2. Google Apps Script
1.  Create a new Google Apps Script project.
2.  Paste the code from `Code.gs` into the editor.
3.  **Enable the Drive API:**
    * Click `+` next to **Services** in the left sidebar.
    * Select **Drive API** and click Add.
4.  Update the `CONFIGURATION` section at the top of the script:
    * `FOLDER_ID`: The ID of your source Google Drive folder.
    * `WP_SITE_URL`: Your full website URL.
    * `WP_USERNAME`: Your WordPress username.
    * `WP_APP_PASSWORD`: The Application Password you generated.
    * `POST_CATEGORY_ID`: The numeric ID of your target category.

### 3. Automation
1.  Go to **Triggers** (Clock icon) in the Apps Script dashboard.
2.  Create a new Trigger:
    * **Function:** `checkAndPost`
    * **Event Source:** Time-driven
    * **Timer:** Hour timer (Every 1 hour)

## ⚠️ Requirements
* A Google Workspace account.
* A self-hosted WordPress site (or WordPress.com with Business plan) supporting REST API.
