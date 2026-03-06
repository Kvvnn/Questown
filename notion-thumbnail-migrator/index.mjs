import "dotenv/config";
import { Client } from "@notionhq/client";

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const THUMB_PROP = process.env.THUMBNAIL_PROPERTY_NAME || "Thumbnail";
const NOTION_VERSION = process.env.NOTION_VERSION || "2024-10-22";
const DRY_RUN = (process.env.DRY_RUN || "true").toLowerCase() === "true";
const FORCE_OVERWRITE = (process.env.FORCE_OVERWRITE || "false").toLowerCase() === "true";
const ONLY_PAGE_ID = process.env.ONLY_PAGE_ID || "";
const MAX_ITEMS = Number(process.env.MAX_ITEMS || "0");

if (!NOTION_TOKEN) throw new Error("Missing NOTION_TOKEN");
if (!DATABASE_ID && !ONLY_PAGE_ID) throw new Error("Missing NOTION_DATABASE_ID (or set ONLY_PAGE_ID)");

const notion = new Client({ auth: NOTION_TOKEN, notionVersion: NOTION_VERSION });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeName(value, fallback = "thumbnail") {
  const s = String(value || fallback).trim().replace(/[\\/:*?"<>|]+/g, "_");
  return s || fallback;
}

function extFromContentType(contentType) {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("png")) return "png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("svg")) return "svg";
  return "bin";
}

function titleFromPage(page) {
  const titleProp = Object.values(page.properties || {}).find((p) => p?.type === "title");
  const text = (titleProp?.title || []).map((t) => t?.plain_text || "").join("").trim();
  return text || page.id;
}

async function notionFetch(path, init = {}) {
  const res = await fetch(`https://api.notion.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      ...(init.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion API ${path} failed (${res.status}): ${body}`);
  }

  return res;
}

function getFileUrlFromImageBlock(block) {
  const img = block.image;
  if (!img) return null;
  if (img.type === "external") return img.external?.url || null;
  if (img.type === "file") return img.file?.url || null;
  return null;
}

async function findFirstImageUrlInBlock(blockId) {
  let cursor;

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

function hasExistingThumbnail(page) {
  const prop = page.properties?.[THUMB_PROP];
  if (!prop || prop.type !== "files") return false;
  return Array.isArray(prop.files) && prop.files.length > 0;
}

async function* queryAllPages(databaseId) {
  let cursor;

  while (true) {
    const resp = await notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const page of resp.results) {
      yield page;
    }

    if (!resp.has_more) break;
    cursor = resp.next_cursor;
  }
}

async function createFileUploadFromUrl(imageUrl, baseName) {
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    throw new Error(`Image download failed (${imgRes.status}): ${imageUrl}`);
  }

  const contentType = (imgRes.headers.get("content-type") || "application/octet-stream").split(";")[0];
  const ext = extFromContentType(contentType);
  const filename = `${sanitizeName(baseName)}.${ext}`;

  const bytes = Buffer.from(await imgRes.arrayBuffer());

  const createRes = await notionFetch("/v1/file_uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename,
      content_type: contentType,
    }),
  });

  const created = await createRes.json();
  const uploadId = created.id;
  if (!uploadId) throw new Error("file_upload create did not return id");

  const form = new FormData();
  form.append("file", new Blob([bytes], { type: contentType }), filename);

  await notionFetch(`/v1/file_uploads/${uploadId}/send`, {
    method: "POST",
    body: form,
  });

  return { uploadId, filename };
}

async function updateThumbnailWithUpload(pageId, uploadId, filename) {
  let lastErr;

  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      await notion.pages.update({
        page_id: pageId,
        properties: {
          [THUMB_PROP]: {
            files: [
              {
                name: filename,
                type: "file_upload",
                file_upload: { id: uploadId },
              },
            ],
          },
        },
      });
      return;
    } catch (e) {
      lastErr = e;
      await sleep(350 * attempt);
    }
  }

  throw lastErr || new Error("thumbnail update failed");
}

async function processPage(page) {
  const name = titleFromPage(page);

  if (!FORCE_OVERWRITE && hasExistingThumbnail(page)) {
    return { status: "skip-has-thumb", name };
  }

  const firstImageUrl = await findFirstImageUrlInBlock(page.id);
  if (!firstImageUrl) {
    return { status: "skip-no-image", name };
  }

  if (DRY_RUN) {
    console.log(`[DRY_RUN] ${name} (${page.id}) -> ${firstImageUrl}`);
    return { status: "updated", name };
  }

  const { uploadId, filename } = await createFileUploadFromUrl(firstImageUrl, name);
  await updateThumbnailWithUpload(page.id, uploadId, filename);

  console.log(`updated ${name} (${page.id})`);
  return { status: "updated", name };
}

async function main() {
  let total = 0;
  let updated = 0;
  let skippedHasThumb = 0;
  let skippedNoImage = 0;
  let errors = 0;

  const pages = [];

  if (ONLY_PAGE_ID) {
    const page = await notion.pages.retrieve({ page_id: ONLY_PAGE_ID });
    pages.push(page);
  } else {
    for await (const page of queryAllPages(DATABASE_ID)) {
      pages.push(page);
      if (MAX_ITEMS > 0 && pages.length >= MAX_ITEMS) break;
    }
  }

  for (const page of pages) {
    total++;
    try {
      const result = await processPage(page);
      if (result.status === "updated") updated++;
      else if (result.status === "skip-has-thumb") skippedHasThumb++;
      else if (result.status === "skip-no-image") skippedNoImage++;
    } catch (e) {
      errors++;
      console.error(`error ${page.id}:`, e?.message || e);
    }
  }

  console.log("\n=== DONE ===");
  console.log({
    total,
    updated,
    skippedHasThumb,
    skippedNoImage,
    errors,
    dryRun: DRY_RUN,
    forceOverwrite: FORCE_OVERWRITE,
    onlyPageId: ONLY_PAGE_ID || null,
    notionVersion: NOTION_VERSION,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
