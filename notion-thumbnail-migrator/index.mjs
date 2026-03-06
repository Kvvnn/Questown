import "dotenv/config";
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const THUMB_PROP = process.env.THUMBNAIL_PROPERTY_NAME || "Thumbnail";
const DRY_RUN = (process.env.DRY_RUN || "true").toLowerCase() === "true";

if (!process.env.NOTION_TOKEN) throw new Error("Missing NOTION_TOKEN");
if (!DATABASE_ID) throw new Error("Missing NOTION_DATABASE_ID");

function getFileUrlFromImageBlock(block) {
  const img = block.image;
  if (!img) return null;
  if (img.type === "external") return img.external?.url || null;
  if (img.type === "file") return img.file?.url || null;
  return null;
}

async function findFirstImageUrlInBlock(blockId) {
  let cursor = undefined;

  while (true) {
    const resp = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
    });

    for (const block of resp.results) {
      if (block.type === "image") {
        const url = getFileUrlFromImageBlock(block);
        if (url) return url;
      }

      if (block.has_children) {
        const nested = await findFirstImageUrlInBlock(block.id);
        if (nested) return nested;
      }
    }

    if (!resp.has_more) break;
    cursor = resp.next_cursor;
  }

  return null;
}

async function findFirstImageUrlInPage(pageId) {
  return findFirstImageUrlInBlock(pageId);
}

function hasExistingThumbnail(page) {
  const prop = page.properties?.[THUMB_PROP];
  if (!prop) return false;
  if (prop.type !== "files") return false;
  return Array.isArray(prop.files) && prop.files.length > 0;
}

async function* queryAllPages(databaseId) {
  let cursor = undefined;

  while (true) {
    const resp = await notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const page of resp.results) yield page;

    if (!resp.has_more) break;
    cursor = resp.next_cursor;
  }
}

async function main() {
  let updated = 0,
    skippedHasThumb = 0,
    skippedNoImage = 0,
    errors = 0,
    total = 0;

  for await (const page of queryAllPages(DATABASE_ID)) {
    total++;

    try {
      if (hasExistingThumbnail(page)) {
        skippedHasThumb++;
        continue;
      }

      const firstImageUrl = await findFirstImageUrlInPage(page.id);
      if (!firstImageUrl) {
        skippedNoImage++;
        continue;
      }

      const patch = {
        [THUMB_PROP]: {
          files: [
            {
              name: "thumbnail",
              external: { url: firstImageUrl },
            },
          ],
        },
      };

      if (DRY_RUN) {
        console.log(`[DRY_RUN] would update page ${page.id} -> ${THUMB_PROP}=${firstImageUrl}`);
      } else {
        await notion.pages.update({
          page_id: page.id,
          properties: patch,
        });
        console.log(`updated page ${page.id}`);
      }

      updated++;
    } catch (e) {
      errors++;
      console.error(`error page ${page.id}:`, e?.message || e);
    }
  }

  console.log("\n=== DONE ===");
  console.log({ total, updated, skippedHasThumb, skippedNoImage, errors, dryRun: DRY_RUN });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
