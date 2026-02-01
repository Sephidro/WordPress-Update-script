/**
 * ------------------------------------------------------------------
 * GOVERNANCE AUTOMATION SCRIPT
 * ------------------------------------------------------------------
 * PURPOSE: Monitors a Google Drive folder for governance documents.
 * AUTOMATION:
 * 1. Converts Word Docs (.docx) to PDF.
 * 2. OCR Scans documents to find the "Meeting Date" inside the text.
 * 3. Backdates the WordPress post to match the actual meeting date.
 * 4. Resolves Drive Shortcuts to their original files.
 * ------------------------------------------------------------------
 */

// --- CONFIGURATION ---
// REPLACE THESE VALUES WITH YOUR OWN
const FOLDER_ID = 'ENTER_YOUR_DRIVE_FOLDER_ID'; 
const WP_SITE_URL = 'https://your-domain.com';
const WP_USERNAME = 'your_wordpress_username'; 
const WP_APP_PASSWORD = 'xxxx xxxx xxxx xxxx'; // WordPress Application Password
const POST_CATEGORY_ID = 1; // ID of the WordPress Category (e.g., "Governance")

function checkAndPost() {
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const files = folder.getFiles();
  const scriptProperties = PropertiesService.getScriptProperties();
  const authHeader = 'Basic ' + Utilities.base64Encode(WP_USERNAME + ':' + WP_APP_PASSWORD);

  while (files.hasNext()) {
    let file = files.next();
    let fileId = file.getId(); 
    
    // --- 0. SHORTCUT RESOLVER ---
    // If the file is a shortcut, find the real target ID
    if (file.getMimeType() === "application/vnd.google-apps.shortcut") {
      try {
        let targetId = file.getTargetId();
        file = DriveApp.getFileById(targetId); 
        fileId = targetId; 
      } catch (e) {
        Logger.log('Skipping broken shortcut');
        continue;
      }
    }

    // Check if this file ID has already been processed
    if (scriptProperties.getProperty(fileId) === 'processed') {
      continue; 
    }

    Logger.log('Processing: ' + file.getName());
    
    let blob;
    let fileNameForWP;
    let detectedDate = null; 
    
    let mime = file.getMimeType();
    let name = file.getName().toLowerCase();

    // --- 1. INTELLIGENT CONVERSION & DATE SCANNING ---
    try {
      let tempFileId;
      
      // A. Setup the conversion config
      if (name.endsWith('.docx') || mime.includes('wordprocessingml')) {
        // Convert Word to Google Doc for text extraction
        let tempResource = { title: "TEMP_SCAN_" + file.getName(), mimeType: MimeType.GOOGLE_DOCS };
        let tempFile = Drive.Files.copy(tempResource, fileId);
        tempFileId = tempFile.id;
      } 
      else if (mime === MimeType.PDF || mime.includes('image')) {
        // Convert PDF/Image to Google Doc (Using OCR)
        let tempResource = { title: "TEMP_SCAN_" + file.getName(), mimeType: MimeType.GOOGLE_DOCS };
        let tempFile = Drive.Files.copy(tempResource, fileId, {ocr: true}); 
        tempFileId = tempFile.id;
      }
      else if (mime === MimeType.GOOGLE_DOCS) {
        tempFileId = fileId; 
      }

      // B. EXTRACT TEXT & FIND DATE
      if (tempFileId) {
        let doc = DocumentApp.openById(tempFileId);
        let textBody = doc.getBody().getText();
        detectedDate = findDateInText(textBody); 
        
        // Prepare the PDF blob for upload
        if (name.endsWith('.docx')) {
           blob = doc.getAs(MimeType.PDF);
           let niceName = file.getName().replace(/\.docx?$/i, ".pdf");
           blob.setName(niceName);
           fileNameForWP = niceName;
        } else {
           blob = file.getBlob();
           fileNameForWP = file.getName();
        }

        // Cleanup: Delete the temp file
        if (mime !== MimeType.GOOGLE_DOCS) {
          Drive.Files.remove(tempFileId);
        }
      }

    } catch (err) {
      Logger.log('Scanning/Conversion Failed: ' + err.toString());
      // Fallback: Use original file if conversion fails
      blob = file.getBlob();
      fileNameForWP = file.getName();
    }

    // --- 2. UPLOAD AND POST ---
    try {
      // Step A: Upload to Media Library
      let mediaOptions = {
        'method': 'post',
        'contentType': 'application/pdf', 
        'headers': {
          'Authorization': authHeader,
          'Content-Disposition': 'attachment; filename="' + fileNameForWP + '"'
        },
        'payload': blob,
        'muteHttpExceptions': true
      };

      let mediaResponse = UrlFetchApp.fetch(WP_SITE_URL + '/wp-json/wp/v2/media', mediaOptions);
      if (mediaResponse.getResponseCode() !== 201) continue;
      
      let mediaData = JSON.parse(mediaResponse.getContentText());
      let fileLink = mediaData.source_url;
      Logger.log('Media uploaded. Date found: ' + (detectedDate || "None (Using Today)"));

      // Step B: Create Post
      let cleanTitle = fileNameForWP.replace(/\.pdf$/i, ""); 
      
      // Determine Dates
      let postDateISO = new Date().toISOString(); // Default to Now
      let displayDate = Utilities.formatDate(new Date(), "GMT-5", "MMMM dd, yyyy");

      if (detectedDate) {
        // Time Travel Logic: Backdate post to the meeting date
        postDateISO = detectedDate.toISOString().split('T')[0] + 'T12:00:00';
        displayDate = Utilities.formatDate(detectedDate, "GMT-5", "MMMM dd, yyyy");
      }

      let htmlContent = `
        <div style="font-family: sans-serif; color: #333;">
          <p><strong>Meeting Date:</strong> ${displayDate}</p>
          <hr>
          <div style="margin: 20px 0;">
            <a href="${fileLink}" style="background-color: #00d084; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px;">
              ⬇ Download Official PDF
            </a>
          </div>
          <p>View document below:</p>
          <iframe src="${fileLink}" style="width:100%; height:800px; border: 1px solid #ddd; box-shadow: 0 4px 6px rgba(0,0,0,0.1);"></iframe>
        </div>
      `;

      let postBody = {
        'title': cleanTitle,
        'content': htmlContent,
        'status': 'publish',
        'categories': [POST_CATEGORY_ID],
        'date': postDateISO 
      };

      let postOptions = {
        'method': 'post',
        'contentType': 'application/json',
        'headers': { 'Authorization': authHeader },
        'payload': JSON.stringify(postBody),
        'muteHttpExceptions': true
      };

      let postResponse = UrlFetchApp.fetch(WP_SITE_URL + '/wp-json/wp/v2/posts', postOptions);
      
      if (postResponse.getResponseCode() === 201) {
        Logger.log('SUCCESS! Post created for date: ' + postDateISO);
        // Mark file ID as processed so we don't post it again
        scriptProperties.setProperty(fileId, 'processed'); 
      }

    } catch (e) {
      Logger.log('CRASH: ' + e.toString());
    }
  }
}

// --- HELPER: DATE DETECTIVE ---
function findDateInText(text) {
  if (!text) return null;
  
  // Regex: Looks for "Month Day, Year" (e.g. December 16, 2025)
  const dateRegex = /(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}/i;
  
  let match = text.match(dateRegex);
  
  if (match) {
    let dateStr = match[0].replace(/(st|nd|rd|th)/, ""); 
    return new Date(dateStr);
  }
  return null;
}
