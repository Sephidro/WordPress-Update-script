// --- CONFIGURATION ---
const FOLDER_ID = 'XXXXXXXXXXXX';
const WP_SITE_URL = 'XXXXXXXXXXXX';
const WP_USERNAME = 'XXXXXXXXXXXXX';
const WP_APP_PASSWORD = 'XXXXXXXXXX'; // App password
const POST_CATEGORY_ID = XX; // Last digits in category URL (1) (95)
function checkAndPost() {
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const files = folder.getFiles();
  const scriptProperties = PropertiesService.getScriptProperties();
  const authHeader = 'Basic ' + Utilities.base64Encode(WP_USERNAME + ':' + WP_APP_PASSWORD);

  while (files.hasNext()) {
    let file = files.next();
    let fileId = file.getId(); 
    
    // --- 0. SHORTCUT RESOLVER ---
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

    if (scriptProperties.getProperty(fileId) === 'processed') {
      continue; 
    }

    Logger.log('Processing: ' + file.getName());
    
    let blob;
    let fileNameForWP;
    let detectedDate = null; // Store the found date here
    
    let mime = file.getMimeType();
    let name = file.getName().toLowerCase();

    // --- 1. INTELLIGENT CONVERSION & DATE SCANNING ---
    try {
      // We need to get the TEXT of the document to find the date.
      // We use the "Conversion Protocol" for both Word Docs AND PDFs
      
      let tempFileId;
      let needsConversion = false;

      // A. Setup the conversion config
      if (name.endsWith('.docx') || mime.includes('wordprocessingml')) {
        // Convert Word to Google Doc
        let tempResource = { title: "TEMP_SCAN_" + file.getName(), mimeType: MimeType.GOOGLE_DOCS };
        let tempFile = Drive.Files.copy(tempResource, fileId);
        tempFileId = tempFile.id;
        needsConversion = true;
      } 
      else if (mime === MimeType.PDF || mime.includes('image')) {
        // Convert PDF/Image to Google Doc (Using OCR)
        let tempResource = { title: "TEMP_SCAN_" + file.getName(), mimeType: MimeType.GOOGLE_DOCS };
        // 'ocr: true' is the magic key that reads text from PDFs
        let tempFile = Drive.Files.copy(tempResource, fileId, {ocr: true}); 
        tempFileId = tempFile.id;
        needsConversion = false; // It's already a PDF, we just needed the text
      }
      else if (mime === MimeType.GOOGLE_DOCS) {
        tempFileId = fileId; // No copy needed
      }

      // B. EXTRACT TEXT & FIND DATE
      if (tempFileId) {
        let doc = DocumentApp.openById(tempFileId);
        let textBody = doc.getBody().getText();
        detectedDate = findDateInText(textBody); // Call our helper function
        
        // If we made a temporary copy, get the PDF blob from it (if it was a Docx) or just cleanup
        if (name.endsWith('.docx')) {
           blob = doc.getAs(MimeType.PDF);
           let niceName = file.getName().replace(/\.docx?$/i, ".pdf");
           blob.setName(niceName);
           fileNameForWP = niceName;
        } else {
           // If it was already a PDF, just use the original file blob
           blob = file.getBlob();
           fileNameForWP = file.getName();
        }

        // Cleanup: Delete the temp file if we created one
        if (mime !== MimeType.GOOGLE_DOCS) {
          Drive.Files.remove(tempFileId);
        }
      }

    } catch (err) {
      Logger.log('Scanning/Conversion Failed: ' + err.toString());
      // Fallback: If scanning fails, just upload the file as-is and use today's date
      blob = file.getBlob();
      fileNameForWP = file.getName();
    }

    // --- 2. UPLOAD AND POST ---
    try {
      // Upload to Media Library
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

      // Create Post
      let cleanTitle = fileNameForWP.replace(/\.pdf$/i, ""); 
      
      // Determine the Display Date (Visual) and the Post Date (Sorting)
      let postDateISO = new Date().toISOString(); // Default to Now
      let displayDate = Utilities.formatDate(new Date(), "GMT-5", "MMMM dd, yyyy");

      if (detectedDate) {
        // VISUALS: Always show the REAL meeting date in the HTML text
        displayDate = Utilities.formatDate(detectedDate, "GMT-5", "MMMM dd, yyyy");

        // SORTING: The "Time Travel" Safety Check
        let now = new Date();
        if (detectedDate < now) {
          // CASE A: PAST MEETING (Minutes)
          // Backdate the post so it files itself into the correct archive month.
          // We set it to noon to avoid timezone slippage.
          postDateISO = detectedDate.toISOString().split('T')[0] + 'T12:00:00';
        } else {
          // CASE B: FUTURE MEETING (Agendas/Notices)
          // DO NOT use the future date, or WordPress will hide (schedule) the post.
          // Use "NOW" so it publishes immediately for the public to see.
          postDateISO = now.toISOString();
        }
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
        'date': postDateISO // <--- THIS IS THE MAGIC TIME TRAVEL LINE
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
        let postData = JSON.parse(postResponse.getContentText());
        Logger.log('SUCCESS! Post created for date: ' + postDateISO);
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
  
  // Regex to look for "Month Day, Year" (e.g., December 16, 2025 or Dec 16, 2025)
  // It handles 1 or 2 digit days, and full or 3-letter months
  const dateRegex = /(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}/i;
  
  let match = text.match(dateRegex);
  
  if (match) {
    // Finds a string like "December 16, 2025"
    // Parses it into a Javascript Date Object
    let dateStr = match[0].replace(/(st|nd|rd|th)/, ""); // Remove 'th' so '16th' becomes '16' for easier parsing
    return new Date(dateStr);
  }
  
  return null;
}
