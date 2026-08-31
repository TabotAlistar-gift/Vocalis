import fs from "fs";
import path from "path";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import sharp from "sharp";
import { logger } from "./logger";

export interface PassportPdfData {
  fullName: string;
  vocalisId: string;
  level: string;
  badge: string;
  dateJoined: string;
  dateIssued?: string | null;
  profilePhotoPath?: string | null;
}

function formatDate(isoOrString?: string | null): string {
  if (!isoOrString) return "N/A";
  const d = new Date(isoOrString);
  if (isNaN(d.getTime())) return isoOrString;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

/**
 * Generate a high-resolution, print-ready PDF of the Vocalis Passport matching the preview 100%
 */
export async function generatePassportPdf(data: PassportPdfData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  // Standard passport card proportion: 680 x 425 pt (landscape)
  const width = 680;
  const height = 425;
  const page = pdfDoc.addPage([width, height]);

  // Load standard fonts
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontTimes = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

  // Palette definitions
  const navyBg = rgb(6 / 255, 24 / 255, 49 / 255); // #061831
  const white = rgb(1, 1, 1);
  const gold = rgb(244 / 255, 198 / 255, 65 / 255); // #f4c641
  const redAccent = rgb(237 / 255, 29 / 255, 64 / 255); // #ed1d40
  const blueAccent = rgb(22 / 255, 93 / 255, 232 / 255); // #165de8
  const textDark = rgb(14 / 255, 35 / 255, 71 / 255); // #0e2347
  const textMuted = rgb(104 / 255, 120 / 255, 144 / 255); // #687890
  const fieldLineColor = rgb(32 / 255, 84 / 255, 147 / 255); // #205493
  const cardBorder = rgb(216 / 255, 225 / 255, 236 / 255);
  const dotColor = rgb(215 / 255, 222 / 255, 233 / 255);

  // Outer container / card background
  page.drawRectangle({
    x: 0,
    y: 0,
    width,
    height,
    color: white,
  });

  const leftPanelWidth = 220;

  // 1. LEFT NAVY PANEL (Clean solid navy without white lines or red/blue curve)
  page.drawRectangle({
    x: 0,
    y: 0,
    width: leftPanelWidth,
    height,
    color: navyBg,
  });

  // Attempt to embed Vocalist ribbon logo on left panel
  const logoPaths = [
    path.resolve(process.cwd(), "../vocalis-passport/public/vocalist logo.png"),
    path.resolve(process.cwd(), "public/vocalist logo.png"),
    path.resolve(__dirname, "../../../vocalis-passport/public/vocalist logo.png"),
    path.resolve(__dirname, "../../vocalis-passport/public/vocalist logo.png"),
  ];

  let logoFile = logoPaths.find((p) => fs.existsSync(p));
  if (logoFile) {
    try {
      const logoBuffer = fs.readFileSync(logoFile);
      const pngBuffer = await sharp(logoBuffer).resize({ height: 80 }).png().toBuffer();
      const embeddedLogo = await pdfDoc.embedPng(pngBuffer);
      page.drawImage(embeddedLogo, {
        x: 28,
        y: height - 76,
        width: 42,
        height: 42,
      });
    } catch {}
  }

  // Draw Vocalis brand text on left panel
  page.drawText("Vocalis.", {
    x: 78,
    y: height - 58,
    size: 20,
    font: fontBold,
    color: white,
  });

  page.drawText("Turning passion into impact", {
    x: 78,
    y: height - 72,
    size: 7.5,
    font: fontRegular,
    color: rgb(180 / 255, 195 / 255, 215 / 255),
  });

  // Shifted UP: VOCALIS PASSPORT section
  const passportTitleY = 125;
  page.drawText("VOCALIS", {
    x: 28,
    y: passportTitleY + 36,
    size: 13,
    font: fontBold,
    color: rgb(220 / 255, 230 / 255, 245 / 255),
  });

  page.drawText("PASSPORT", {
    x: 28,
    y: passportTitleY + 8,
    size: 25,
    font: fontBold,
    color: gold,
  });

  // Gradient accent line below PASSPORT
  page.drawRectangle({
    x: 28,
    y: passportTitleY - 2,
    width: 60,
    height: 2.5,
    color: redAccent,
  });
  page.drawRectangle({
    x: 88,
    y: passportTitleY - 2,
    width: 60,
    height: 2.5,
    color: blueAccent,
  });

  page.drawText("Turning passion into impact", {
    x: 28,
    y: passportTitleY - 18,
    size: 8,
    font: fontRegular,
    color: rgb(160 / 255, 180 / 255, 210 / 255),
  });

  // 2. RIGHT PAPER PANEL: Background dots & Centralized Watermark
  const rightX = leftPanelWidth + 24;
  const rightWidth = width - leftPanelWidth - 48;

  // Background subtle dot grid
  for (let dx = rightX; dx < width - 15; dx += 18) {
    for (let dy = 20; dy < height - 15; dy += 18) {
      page.drawCircle({
        x: dx,
        y: dy,
        size: 0.75,
        color: dotColor,
      });
    }
  }

  // Embedded Centralized Larger Watermark (90% size, centered)
  const watermarkPaths = [
    path.resolve(process.cwd(), "../vocalis-passport/public/logo.png"),
    path.resolve(process.cwd(), "public/logo.png"),
    path.resolve(__dirname, "../../../vocalis-passport/public/logo.png"),
    path.resolve(__dirname, "../../vocalis-passport/public/logo.png"),
  ];

  let wmFile = watermarkPaths.find((p) => fs.existsSync(p));
  if (wmFile) {
    try {
      const wmBuffer = fs.readFileSync(wmFile);
      const pngWm = await sharp(wmBuffer).resize({ width: 400 }).png().toBuffer();
      const embeddedWm = await pdfDoc.embedPng(pngWm);
      const wmSize = 340;
      page.drawImage(embeddedWm, {
        x: rightX + (rightWidth - wmSize) / 2 + 10,
        y: (height - wmSize) / 2 + 15,
        width: wmSize,
        height: wmSize,
        opacity: 0.08,
      });
    } catch {}
  }

  // Photo Area on Left of Right Panel
  const photoW = 122;
  const photoH = 156;
  const photoX = rightX + 6;
  const photoY = height - photoH - 45;

  // Photo border & background
  page.drawRectangle({
    x: photoX - 2,
    y: photoY - 2,
    width: photoW + 4,
    height: photoH + 4,
    color: cardBorder,
  });
  page.drawRectangle({
    x: photoX,
    y: photoY,
    width: photoW,
    height: photoH,
    color: rgb(240 / 255, 244 / 255, 250 / 255),
  });

  // Embed Photo if available
  let photoEmbedded = false;
  if (data.profilePhotoPath) {
    try {
      let photoBuffer: Buffer | null = null;
      if (fs.existsSync(data.profilePhotoPath)) {
        photoBuffer = fs.readFileSync(data.profilePhotoPath);
      } else if (data.profilePhotoPath.startsWith("data:image/")) {
        const base64Data = data.profilePhotoPath.split(";base64,").pop();
        if (base64Data) {
          photoBuffer = Buffer.from(base64Data, "base64");
        }
      }

      if (photoBuffer) {
        const jpegBuffer = await sharp(photoBuffer)
          .resize(photoW * 2, photoH * 2, { fit: "cover", position: "center" })
          .jpeg({ quality: 95 })
          .toBuffer();

        const embeddedImage = await pdfDoc.embedJpg(jpegBuffer);
        page.drawImage(embeddedImage, {
          x: photoX,
          y: photoY,
          width: photoW,
          height: photoH,
        });
        photoEmbedded = true;
      }
    } catch (err) {
      logger.warn({ err }, "Could not embed profile photo in PDF");
    }
  }

  if (!photoEmbedded) {
    page.drawCircle({
      x: photoX + photoW / 2,
      y: photoY + photoH / 2 + 15,
      size: 24,
      color: rgb(180 / 255, 195 / 255, 215 / 255),
    });
    page.drawRectangle({
      x: photoX + 22,
      y: photoY + 16,
      width: photoW - 44,
      height: 32,
      color: rgb(180 / 255, 195 / 255, 215 / 255),
    });
  }

  // Student Fields on Right of Photo — Generously Spaced Out (spaced across the whole height)
  const fieldX = photoX + photoW + 24;
  const fieldWidth = width - fieldX - 28;

  const fieldList = [
    { label: "NAME", value: data.fullName },
    { label: "VOCALIS ID", value: data.vocalisId },
    { label: "LEVEL", value: data.level },
    { label: "DATE ISSUED", value: formatDate(data.dateIssued || new Date().toISOString()) },
    { label: "DATE JOINED", value: formatDate(data.dateJoined) },
    { label: "VOCALIS BADGE", value: data.badge.toUpperCase() },
  ];

  let currentY = height - 52;
  const rowSpacing = 42; // Generously spaced out across the card

  for (const f of fieldList) {
    page.drawText(f.label, {
      x: fieldX,
      y: currentY,
      size: 7.5,
      font: fontBold,
      color: textMuted,
    });
    page.drawText(f.value, {
      x: fieldX,
      y: currentY - 14,
      size: 11.5,
      font: fontBold,
      color: textDark,
    });

    // Horizontal crisp blue underline for each field
    page.drawLine({
      start: { x: fieldX, y: currentY - 19 },
      end: { x: fieldX + fieldWidth, y: currentY - 19 },
      color: fieldLineColor,
      thickness: 1.5,
    });

    currentY -= rowSpacing;
  }

  // Divider above bottom signature block
  const dividerY = 88;
  page.drawLine({
    start: { x: rightX, y: dividerY },
    end: { x: width - 28, y: dividerY },
    color: cardBorder,
    thickness: 1,
  });

  // Center accent on divider with indicator dot
  const centerDividerX = rightX + (rightWidth - 100) / 2;
  page.drawRectangle({
    x: centerDividerX,
    y: dividerY - 0.75,
    width: 50,
    height: 2,
    color: redAccent,
  });
  page.drawRectangle({
    x: centerDividerX + 50,
    y: dividerY - 0.75,
    width: 50,
    height: 2,
    color: blueAccent,
  });
  page.drawCircle({
    x: rightX + rightWidth / 2,
    y: dividerY + 0.25,
    size: 3,
    color: textDark,
  });

  // Bottom Signature & Quotation
  page.drawText("Vocalis", {
    x: rightX + 6,
    y: 52,
    size: 24,
    font: fontTimes,
    color: textDark,
  });

  page.drawText("FOUNDER'S SIGNATURE", {
    x: rightX + 6,
    y: 38,
    size: 7,
    font: fontBold,
    color: textMuted,
  });

  page.drawText('" Turning passion into impact "', {
    x: width - 210,
    y: 46,
    size: 10.5,
    font: fontTimes,
    color: textDark,
  });

  // Outer border line for the whole card
  page.drawRectangle({
    x: 0,
    y: 0,
    width,
    height,
    borderColor: cardBorder,
    borderWidth: 1,
  });

  return await pdfDoc.save();
}
