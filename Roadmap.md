## Roadmap & Known Limitations
Status: Active Development (Beta v1.0) Last Updated: February 2026

This project is currently in active production use, but as with any agile tool, I am constantly iterating to make it more robust. Below is the list of known limitations and the features planned for future updates.

Backend Automation (Google Apps Script)
Security Hardening
Current State: Credentials (API Keys/Passwords) are defined as constants at the top of the script.

Planned Update: Move all sensitive credentials to PropertiesService.getScriptProperties() to prevent accidental exposure in shared code.

Two-Way Sync & Deletion
Current State: The system is "Fire and Forget." If a file is deleted from Drive, the WordPress post remains.

Planned Update: Implement a "Garbage Collection" script that runs weekly to check for orphaned posts on WordPress and delete them if the source file is missing from Drive.

Smarter "Time Travel" (Date Detection)
Current State: The OCR scanner grabs the first date pattern it finds in the text.

Known Limitation: In rare cases, if a document header has an approval date (e.g., "Approved Jan 2026") before the meeting date, it may misfile the document.

Planned Update: Improve the Regex logic to weigh dates based on context keywords (e.g., prioritizing dates near "Meeting of..." or "Held on...").

Bulk Processing Optimization
Current State: Google Apps Script has a 6-minute execution limit. Uploading 50+ files at once may cause a timeout.

Workaround: The script currently uses processed flags to resume where it left off on the next hourly trigger.

Planned Update: Implement a "Queue System" that stops processing after 4.5 minutes to ensure a graceful exit before the timeout.

### Frontend Dashboard (HTML/JS)
Pagination & Archives
Current State: The dashboard fetches the most recent 100 documents.

Known Limitation: As the archive grows beyond 100 files, older documents will drop off the visual feed (though they remain in WordPress).

Planned Update: Implement "Load More" pagination or server-side filtering to access deep archives without overloading the initial page load.

Search Logic
Current State: Client-side search. It filters only the documents currently loaded in the browser.

Planned Update: Switch to Server-Side Search (using WordPress REST API search endpoints) to allow querying the entire database, not just visible files.

Robust Link Extraction
Current State: The script assumes the first link in the post content is the "Download" button.

Planned Update: Shift to using a dedicated WordPress Meta Field (ACF or similar) to store the PDF URL securely, decoupling it from the post's HTML content.

Found a bug or have a suggestion? Feel free to open an issue or pull request. I am actively building and refining this tool!
