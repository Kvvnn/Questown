import "dotenv/config";
import { Client } from "@notionhq/client";
import fs from "node:fs/promises";
import path from "node:path";

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const THUMB_PROP = process.env.THUMBNAIL_PROPERTY_NAME || "Thumbnail";
const NOTION_VERSION = process.env.NOTION_VERSION || "2025-09-03";
const DRY_RUN = (process.env.DRY_RUN || "true").toLowerCase() === "true";
const FORCE_OVERWRITE = (process.env.FORCE_OVERWRITE || "false").toLowerCase() === "true";
const ONLY_PAGE_ID = process.env.ONLY_PAGE_ID || "";
const MAX_ITEMS = Number(process.env.MAX_ITEMS || "0");
const DOWNLOAD_ONLY = (process.env.DOWNLOAD_ONLY || "false").toLowerCase() === "true";
const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || "downloads";
const DOWNLOAD_AND_APPLY_URL = (process.env.DOWNLOAD_AND_APPLY_URL || "false").toLowerCase() === "true";
const URL_PROP = process.env.THUMBNAIL_URL_PROPERTY_NAME || "Thumbnail_URL";
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "";
const CLOUDINARY_UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET || "";

if (!NOTION_TOKEN) throw new Error("Missing NOTION_TOKEN");
if (!DATABASE_ID && !ONLY_PAGE_ID) throw new Error("Missing NOTION_DATABASE_ID (or set ONLY_PAGE_ID)");
if (DOWNLOAD_AND_APPLY_URL && (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET)) {
  throw new Error("Missing CLOUDINARY_CLOUD_NAME or CLOUDINARY_UPLOAD_PRESET for DOWNLOAD_AND_APPLY_URL");
}

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

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function uniquePath(dir, baseName, ext) {
  let i = 0;
  while (true) {
    const suffix = i === 0 ? "" : `-${i + 1}`;
    const filename = `${sanitizeName(baseName)}${suffix}.${ext}`;
    const full = path.join(dir, filename);
    if (!(await fileExists(full))) return { full, filename };
    i++;
  }
}

async function downloadImageToLocal(imageUrl, baseName) {
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    throw new Error(`Image download failed (${imgRes.status}): ${imageUrl}`);
  }

  const contentType = (imgRes.headers.get("content-type") || "application/octet-stream").split(";")[0];
  const ext = extFromContentType(contentType);
  const outDir = path.resolve(process.cwd(), DOWNLOAD_DIR);
  await fs.mkdir(outDir, { recursive: true });

  const { full, filename } = await uniquePath(outDir, baseName, ext);
  const bytes = Buffer.from(await imgRes.arrayBuffer());
  await fs.writeFile(full, bytes);

  return { full, filename, contentType, bytes: bytes.length };
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

function hasExistingUrl(page) {
  const prop = page.properties?.[URL_PROP];
  if (!prop || prop.type !== "url") return false;
  return Boolean(prop.url);
}

async function uploadToCloudinary(localPath) {
  const bytes = await fs.readFile(localPath);
  const form = new FormData();
  form.append("file", new Blob([bytes]));
  form.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cloudinary upload failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  if (!data?.secure_url) throw new Error("Cloudinary response missing secure_url");
  return data.secure_url;
}

async function updateUrlProperty(pageId, url) {
  await notion.pages.update({
    page_id: pageId,
    properties: {
      [URL_PROP]: { url },
    },
  });
}

async function queryWithPath(path, startCursor) {
  const res = await notionFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ start_cursor: startCursor, page_size: 100 }),
  });
  return res.json();
}

async function resolveDataSourceId(databaseId) {
  const res = await notionFetch(`/v1/databases/${databaseId}`);
  const db = await res.json();
  const ds = db?.data_sources?.[0]?.id;
  if (!ds) throw new Error(`No data_sources found for database ${databaseId}`);
  return ds;
}

async function* queryAllPages(databaseId) {
  let cursor;
  let mode = "sdk-database";
  let dataSourceId;

  while (true) {
    let resp;

    if (mode === "sdk-database") {
      try {
        resp = await notion.databases.query({
          database_id: databaseId,
          start_cursor: cursor,
          page_size: 100,
        });
      } catch {
        mode = "api-data-source";
      }
    }

    if (mode === "api-data-source") {
      try {
        dataSourceId ||= await resolveDataSourceId(databaseId);
        resp = await queryWithPath(`/v1/data_sources/${dataSourceId}/query`, cursor);
      } catch {
        mode = "api-database";
      }
    }

    if (mode === "api-database") {
      resp = await queryWithPath(`/v1/databases/${databaseId}/query`, cursor);
    }

    for (const page of resp.results || []) {
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

  let lastErr;

  // 502/5xx가 나오면 같은 upload_id 재시도 대신 새 upload를 다시 발급받아 재시도
  for (let cycle = 1; cycle <= 5; cycle++) {
    try {
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

      // 동일 upload_id에서는 짧게 재시도
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const form = new FormData();
          form.append("file", new Blob([bytes], { type: contentType }), filename);

          await notionFetch(`/v1/file_uploads/${uploadId}/send`, {
            method: "POST",
            body: form,
          });

          return { uploadId, filename };
        } catch (e) {
          lastErr = e;
          await sleep(500 * attempt + Math.floor(Math.random() * 250));
        }
      }
    } catch (e) {
      lastErr = e;
    }

    await sleep(1000 * cycle + Math.floor(Math.random() * 500));
  }

  throw lastErr || new Error("file_upload send failed");
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

  const firstImageUrl = await findFirstImageUrlInBlock(page.id);
  if (!firstImageUrl) {
    return { status: "skip-no-image", name };
  }

  if (DOWNLOAD_ONLY || DOWNLOAD_AND_APPLY_URL) {
    const saved = await downloadImageToLocal(firstImageUrl, name);
    console.log(`downloaded ${name} (${page.id}) -> ${saved.filename}`);

    if (DOWNLOAD_AND_APPLY_URL) {
      if (!FORCE_OVERWRITE && hasExistingUrl(page)) {
        return { status: "skip-has-url", name, savedPath: saved.full };
      }

      if (DRY_RUN) {
        console.log(`[DRY_RUN] apply-url ${name} (${page.id})`);
        return { status: "applied-url", name, savedPath: saved.full };
      }

      const secureUrl = await uploadToCloudinary(saved.full);
      await updateUrlProperty(page.id, secureUrl);
      console.log(`applied-url ${name} (${page.id}) -> ${secureUrl}`);
      return { status: "applied-url", name, savedPath: saved.full, secureUrl };
    }

    return { status: "downloaded", name, savedPath: saved.full };
  }

  if (!FORCE_OVERWRITE && hasExistingThumbnail(page)) {
    return { status: "skip-has-thumb", name };
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
  let skippedHasUrl = 0;
  let skippedNoImage = 0;
  let downloaded = 0;
  let appliedUrl = 0;
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
      else if (result.status === "downloaded") downloaded++;
      else if (result.status === "applied-url") {
        downloaded++;
        appliedUrl++;
      }
      else if (result.status === "skip-has-thumb") skippedHasThumb++;
      else if (result.status === "skip-has-url") skippedHasUrl++;
      else if (result.status === "skip-no-image") skippedNoImage++;
    } catch (e) {
      errors++;
      console.error(`error ${page.id}:`, {
        message: e?.message || String(e),
        code: e?.code,
        status: e?.status,
        body: e?.body,
      });
    }
  }

  console.log("\n=== DONE ===");
  console.log({
    total,
    updated,
    downloaded,
    appliedUrl,
    skippedHasThumb,
    skippedHasUrl,
    skippedNoImage,
    errors,
    dryRun: DRY_RUN,
    downloadOnly: DOWNLOAD_ONLY,
    downloadAndApplyUrl: DOWNLOAD_AND_APPLY_URL,
    downloadDir: DOWNLOAD_DIR,
    urlProperty: URL_PROP,
    forceOverwrite: FORCE_OVERWRITE,
    onlyPageId: ONLY_PAGE_ID || null,
    notionVersion: NOTION_VERSION,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
