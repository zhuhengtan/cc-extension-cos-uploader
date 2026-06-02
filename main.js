'use strict';

const fs = require('fs');
const path = require('path');

// Lazy-loaded to avoid crashing main.js if the module path is unusual
// in Cocos Creator's extension main-process context.
function loadCos() {
  try {
    return require('cos-nodejs-sdk-v5');
  } catch (e) {
    return require(path.join(__dirname, 'node_modules', 'cos-nodejs-sdk-v5'));
  }
}

const PACKAGE_NAME = 'cc-extension-cos-uploader';
const CANCEL_CHECK_INTERVAL = 250;
const FLOW_POLL_INTERVAL = 200;
const ABORT_ERROR_CODE = 'BUILD_COS_UPLOADER_ABORTED';
const STATE_PATH = path.join(__dirname, '.upload-state.json');

let uploadState = createIdleState();
let pendingFlowResolve = null;
let uploadContext = null;

exports.load = function () {
  console.log(`[${PACKAGE_NAME}] main.js loaded, methods registered: ${Object.keys(exports.methods || {}).join(', ')}`);
};

exports.unload = function () {
  console.log(`[${PACKAGE_NAME}] unloaded`);
  if (pendingFlowResolve) {
    pendingFlowResolve({ canceled: true });
    pendingFlowResolve = null;
  }
  cancelUploadContext('extension unload');
  uploadState = createIdleState();
};

exports.methods = {
  // Called from hooks.js onAfterBuild — opens the panel, waits for user decision + upload completion
  async startUploadFlow(data) {
    try {
      console.log(`[${PACKAGE_NAME}] startUploadFlow called, platform=${data && data.platform}`);

      if (pendingFlowResolve) {
        pendingFlowResolve({ canceled: true });
        pendingFlowResolve = null;
      }
      cancelUploadContext('new upload flow started');

      uploadState = {
        phase: 'confirming',
        config: (data && data.config) || {},
        platform: (data && data.platform) || '',
        outputDir: (data && data.outputDir) || '',
        progress: { done: 0, total: 0, currentFile: '' },
        result: null,
        cancelRequested: false,
      };
      writeUploadState(uploadState);

      console.log(`[${PACKAGE_NAME}] opening panel...`);
      const opened = await openPanel();
      console.log(`[${PACKAGE_NAME}] openPanel result: ${opened}`);

      if (!opened) {
        console.warn(`[${PACKAGE_NAME}] panel could not be opened, upload skipped`);
        uploadState = createIdleState();
        writeUploadState(uploadState);
        return { canceled: true };
      }

      console.log(`[${PACKAGE_NAME}] panel opened, waiting for user...`);
      return await waitForFlowResult();
    } catch (err) {
      console.error(
        `[${PACKAGE_NAME}] startUploadFlow error:`,
        err && err.message ? err.message : String(err)
      );
      uploadState = createIdleState();
      writeUploadState(uploadState);
      return { canceled: true };
    }
  },

  // Called from panel to poll current state
  async getUploadState() {
    try {
      return readUploadState();
    } catch (err) {
      return createIdleState();
    }
  },

  // Called from panel when user clicks "Confirm Upload"
  async confirmUpload(editedConfig) {
    try {
      const state = readUploadState();
      if (state.phase !== 'confirming') {
        return;
      }
      uploadState = Object.assign({}, state, {
        phase: 'uploading',
        config: Object.assign({}, state.config || {}, editedConfig || {}),
        progress: { done: 0, total: 0, currentFile: '' },
        result: null,
        cancelRequested: false,
      });
      writeUploadState(uploadState);
    } catch (err) {
      console.error(`[${PACKAGE_NAME}] confirmUpload error:`, err && err.message ? err.message : String(err));
    }
  },

  // Called from panel Cancel button (both in confirming and uploading phase) or panel close event
  async cancelUpload() {
    try {
      const state = readUploadState();
      if (state.phase === 'idle' || state.phase === 'done') {
        await closePanelHelper();
        return;
      }

      if (state.phase === 'confirming') {
        uploadState = Object.assign({}, state, {
          phase: 'done',
          result: { success: false, canceled: true },
          cancelRequested: true,
        });
        writeUploadState(uploadState);
      } else if (state.phase === 'uploading') {
        cancelUploadContext('user canceled from panel');
        uploadState = Object.assign({}, state, {
          cancelRequested: true,
          result: { success: false, canceled: true },
        });
        writeUploadState(uploadState);
      }
      await closePanelHelper();
    } catch (err) {
      console.error(`[${PACKAGE_NAME}] cancelUpload error:`, err && err.message ? err.message : String(err));
    }
  },

  // Called from panel Close button (done phase)
  async closePanelMsg() {
    try {
      cancelUploadContext('panel closed');
      uploadState = createIdleState();
      writeUploadState(uploadState);
      await closePanelHelper();
    } catch (err) {
      console.error(`[${PACKAGE_NAME}] closePanelMsg error:`, err && err.message ? err.message : String(err));
    }
  },
};

// ===================== Upload Execution =====================

async function doUpload() {
  uploadState = readUploadState();
  const config = uploadState.config;
  const outputDir = uploadState.outputDir;
  const platform = uploadState.platform;

  let files;
  try {
    files = listFiles(outputDir);
  } catch (err) {
    uploadState.phase = 'done';
    uploadState.result = { success: false, error: `无法读取构建目录: ${err.message}` };
    writeUploadState(uploadState);
    return { error: err.message };
  }

  uploadState.progress.total = files.length;
  writeUploadState(uploadState);

  const COS = loadCos();
  const cos = new COS({
    SecretId: config.secretId,
    SecretKey: config.secretKey,
  });

  const remotePrefix = getRemotePrefix(config, platform);
  const ctx = createUploadContext(cos);
  uploadContext = ctx;
  startCancelMonitor(ctx);

  console.log(
    `[${PACKAGE_NAME}] uploading ${files.length} file(s) from ${outputDir} to cos://${config.bucket}/${remotePrefix}`
  );

  try {
    for (const filePath of files) {
      const latestState = readUploadState();
      if (latestState.cancelRequested) {
        cancelUploadContext('user canceled from panel');
      }
      if (shouldCancelUpload(ctx)) break;

      const relativePath = normalizeSlashes(path.relative(outputDir, filePath));
      const objectKey = joinCosPath(remotePrefix, relativePath);
      uploadState.progress.currentFile = relativePath;

      await uploadFile(cos, config, filePath, objectKey, ctx);
      uploadState.progress.done += 1;
      writeUploadState(uploadState);
      console.log(`[${PACKAGE_NAME}] uploaded ${relativePath}`);
    }

    stopCancelMonitor(ctx);

    if (shouldCancelUpload(ctx)) {
      uploadState.phase = 'done';
      uploadState.result = { success: false, canceled: true };
      uploadState.cancelRequested = true;
      writeUploadState(uploadState);
      return { canceled: true };
    } else {
      console.log(`[${PACKAGE_NAME}] upload completed for platform ${platform}`);
      uploadState.phase = 'done';
      uploadState.result = { success: true, total: files.length };
      writeUploadState(uploadState);
      return { success: true };
    }
  } catch (error) {
    stopCancelMonitor(ctx);

    const isCanceled = isAbortError(error) || Boolean(ctx && ctx.cancelReason);
    uploadState.phase = 'done';
    uploadState.result = isCanceled
      ? { success: false, canceled: true }
      : { success: false, error: error.message };
    uploadState.cancelRequested = isCanceled;

    writeUploadState(uploadState);
    return isCanceled ? { canceled: true } : { error: error.message };
  } finally {
    if (ctx && ctx.taskIds) {
      ctx.taskIds.clear();
    }
    if (uploadContext === ctx) {
      uploadContext = null;
    }
  }
}

// ===================== State Helpers =====================

function createIdleState() {
  return {
    phase: 'idle',
    config: null,
    platform: '',
    outputDir: '',
    progress: { done: 0, total: 0, currentFile: '' },
    result: null,
    cancelRequested: false,
  };
}

function readUploadState() {
  if (!fs.existsSync(STATE_PATH)) {
    return uploadState || createIdleState();
  }

  try {
    return Object.assign(createIdleState(), JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')));
  } catch (error) {
    console.warn(`[${PACKAGE_NAME}] failed to read upload state:`, error && error.message ? error.message : error);
    return uploadState || createIdleState();
  }
}

function writeUploadState(state) {
  uploadState = Object.assign(createIdleState(), state || {});
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify(uploadState, null, 2), 'utf8');
  } catch (error) {
    console.warn(`[${PACKAGE_NAME}] failed to write upload state:`, error && error.message ? error.message : error);
  }
}

async function waitForFlowResult() {
  while (true) {
    const state = readUploadState();
    if (state.phase === 'uploading') {
      return await doUpload();
    }
    if (state.phase === 'done') {
      return state.result || { canceled: true };
    }
    if (state.phase === 'idle') {
      return { canceled: true };
    }
    await delay(FLOW_POLL_INTERVAL);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openPanel() {
  if (!global.Editor || !Editor.Panel || typeof Editor.Panel.open !== 'function') {
    console.warn(`[${PACKAGE_NAME}] Editor.Panel.open is unavailable`);
    return false;
  }
  try {
    await Editor.Panel.open(PACKAGE_NAME);
    return true;
  } catch (error) {
    console.error(
      `[${PACKAGE_NAME}] failed to open panel:`,
      error && error.message ? error.message : error
    );
    return false;
  }
}

async function closePanelHelper() {
  if (!global.Editor || !Editor.Panel || typeof Editor.Panel.close !== 'function') {
    return;
  }
  try {
    await Editor.Panel.close(PACKAGE_NAME);
  } catch (error) {
    console.warn(
      `[${PACKAGE_NAME}] failed to close panel:`,
      error && error.message ? error.message : error
    );
  }
}

// ===================== Upload Utilities =====================

function getRemotePrefix(config, platform) {
  const mapping = config.platformPrefixMap || {};
  const mapped = mapping[platform];
  if (mapped) {
    const normalized = trimSlashes(mapped);
    const segments = normalized.split('/').filter(Boolean);
    const suffix = segments.length <= 1 ? normalized : segments.slice(1).join('/') || platform;
    return trimSlashes(joinCosPath(config.basePrefix, suffix));
  }
  return trimSlashes(joinCosPath(config.basePrefix, platform));
}

function listFiles(directoryPath) {
  const files = [];
  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function createUploadContext(cos) {
  return {
    cos,
    taskIds: new Set(),
    cancelReason: '',
    cancelTimer: null,
  };
}

function startCancelMonitor(ctx) {
  ctx.cancelTimer = setInterval(() => {
    if (shouldCancelUpload(ctx)) {
      cancelAllTasks(ctx);
    }
  }, CANCEL_CHECK_INTERVAL);
  if (ctx.cancelTimer && typeof ctx.cancelTimer.unref === 'function') {
    ctx.cancelTimer.unref();
  }
}

function stopCancelMonitor(ctx) {
  if (ctx && ctx.cancelTimer) {
    clearInterval(ctx.cancelTimer);
    ctx.cancelTimer = null;
  }
}

function shouldCancelUpload(ctx) {
  return Boolean(ctx && ctx.cancelReason);
}

function cancelUploadContext(reason) {
  if (!uploadContext) return;
  if (!uploadContext.cancelReason) {
    uploadContext.cancelReason = reason || 'canceled';
  }
  cancelAllTasks(uploadContext);
}

function cancelAllTasks(ctx) {
  if (!ctx || !ctx.cos) return;
  for (const taskId of Array.from(ctx.taskIds)) {
    try {
      ctx.cos.cancelTask(taskId);
    } catch (e) {
      // ignore
    }
  }
}

function uploadFile(cos, config, filePath, objectKey, ctx) {
  const fileBuffer = fs.readFileSync(filePath);
  const mimeType = getMimeType(filePath);
  const normalizedKey = trimSlashes(objectKey);
  const taskId = `${PACKAGE_NAME}:${Date.now()}:${Math.random().toString(16).slice(2)}`;

  return new Promise((resolve, reject) => {
    if (ctx) ctx.taskIds.add(taskId);
    cos.putObject(
      {
        Bucket: config.bucket,
        Region: config.region,
        Key: normalizedKey,
        Body: fileBuffer,
        ContentLength: fileBuffer.length,
        ContentType: mimeType,
        TaskId: taskId,
        onProgress() {
          if (readUploadState().cancelRequested && ctx && !ctx.cancelReason) {
            ctx.cancelReason = 'user canceled from panel';
          }
          if (shouldCancelUpload(ctx)) {
            cancelAllTasks(ctx);
          }
        },
      },
      (error, data) => {
        if (ctx) ctx.taskIds.delete(taskId);

        if (shouldCancelUpload(ctx)) {
          reject(createAbortError(`upload canceled for ${objectKey}`));
          return;
        }

        if (error) {
          reject(new Error(`[${PACKAGE_NAME}] upload failed for ${objectKey}: ${error.message}`));
          return;
        }

        if (!data || data.statusCode < 200 || data.statusCode >= 300) {
          reject(
            new Error(`[${PACKAGE_NAME}] upload failed for ${objectKey}: unexpected response ${JSON.stringify(data)}`)
          );
          return;
        }

        resolve();
      }
    );
  });
}

function createAbortError(message) {
  const error = new Error(`[${PACKAGE_NAME}] ${message}`);
  error.code = ABORT_ERROR_CODE;
  return error;
}

function isAbortError(error) {
  return Boolean(error && error.code === ABORT_ERROR_CODE);
}

function trimSlashes(value) {
  return String(value || '').replace(/^\/+|\/+$/g, '');
}

function joinCosPath() {
  return Array.from(arguments)
    .map((item) => trimSlashes(item))
    .filter(Boolean)
    .join('/');
}

function normalizeSlashes(value) {
  return String(value || '').replace(/\\/g, '/');
}

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.wasm': 'application/wasm',
    '.webm': 'video/webm',
    '.webp': 'image/webp',
    '.xml': 'application/xml; charset=utf-8',
  };
  return mimeTypes[extension] || 'application/octet-stream';
}
