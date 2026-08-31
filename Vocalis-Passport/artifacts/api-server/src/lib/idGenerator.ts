import { db, usersTable } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * Generate a unique sequential Vocalis ID in format VOC-26-00001
 */
export async function generateVocalisId(): Promise<string> {
  const currentYearSuffix = new Date().getFullYear().toString().slice(-2); // "26"
  const prefix = `VOC-${currentYearSuffix}-`;

  try {
    // Find the highest sequence number with this prefix
    const result = await db.execute<{ max_id: string | null }>(
      sql`SELECT vocalis_id as max_id FROM users WHERE vocalis_id LIKE ${prefix + '%'} ORDER BY id DESC LIMIT 1`
    );

    let nextNumber = 1;
    const latestId = result.rows[0]?.max_id;
    if (latestId) {
      const match = latestId.match(/VOC-\d{2}-(\d+)/);
      if (match && match[1]) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    const paddedNumber = nextNumber.toString().padStart(5, "0");
    return `${prefix}${paddedNumber}`;
  } catch {
    // Fallback if table is empty or query fails
    const randomSuffix = Math.floor(10000 + Math.random() * 90000);
    return `${prefix}${randomSuffix}`;
  }
}
