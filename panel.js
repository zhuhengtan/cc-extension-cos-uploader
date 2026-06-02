'use strict';

const fs = require('fs');
const path = require('path');

const PACKAGE_NAME = 'cc-extension-cos-uploader';
const CONFIG_PATH = path.join(__dirname, 'cos.config.json');
const STATE_PATH = path.join(__dirname, '.upload-state.json');
const uploadMethods = require('./main').methods;

Editor.Panel.define = Editor.Panel.define || function (options) { return options; };

module.exports = Editor.Panel.define({
template: `
<div class="wrap">
  <h2 id="panel-title">COS 上传配置</h2>

  <!-- ===== 确认阶段 ===== -->
  <div id="section-config">
    <div class="field-group">
      <div class="field-row">
        <span class="field-label">SecretId</span>
        <ui-input class="field-input" id="input-secret-id" placeholder="请输入 SecretId"></ui-input>
      </div>
      <div class="field-row">
        <span class="field-label">SecretKey</span>
        <ui-input class="field-input" id="input-secret-key" placeholder="请输入 SecretKey"></ui-input>
      </div>
      <div class="field-row">
        <span class="field-label">Bucket</span>
        <ui-input class="field-input" id="input-bucket" placeholder="例如 my-bucket-1234567890"></ui-input>
      </div>
      <div class="field-row">
        <span class="field-label">Region</span>
        <ui-input class="field-input" id="input-region" placeholder="例如 ap-shanghai"></ui-input>
      </div>
    </div>
    <div class="info-group">
      <div class="info-row">
        <span class="info-label">平台</span>
        <span class="info-value" id="display-platform">-</span>
      </div>
      <div class="info-row">
        <span class="info-label">远端路径</span>
        <span class="info-value" id="display-remote-prefix">-</span>
      </div>
      <div class="info-row">
        <span class="info-label">输出目录</span>
        <span class="info-value info-dir" id="display-output-dir" title="">-</span>
      </div>
    </div>
    <div class="actions">
      <ui-button id="btn-cancel-confirm">取消</ui-button>
      <ui-button class="blue" id="btn-confirm">确认上传</ui-button>
    </div>
  </div>

  <!-- ===== 上传中阶段 ===== -->
  <div id="section-uploading" style="display:none">
    <div class="progress-wrap">
      <div class="progress-text" id="progress-text">准备上传...</div>
      <div class="progress-bar-track">
        <div class="progress-bar-fill" id="progress-bar-fill" style="width:0%"></div>
      </div>
      <div class="current-file muted" id="current-file"></div>
    </div>
    <div class="actions">
      <ui-button id="btn-cancel-upload">取消上传</ui-button>
    </div>
  </div>

  <!-- ===== 完成阶段 ===== -->
  <div id="section-done" style="display:none">
    <div class="result-wrap">
      <div id="result-icon" class="result-icon"></div>
      <div id="result-message" class="result-message"></div>
    </div>
    <div class="actions">
      <ui-button class="blue" id="btn-close">关闭</ui-button>
    </div>
  </div>
</div>
`,

style: `
.wrap {
  box-sizing: border-box;
  color: #d6d6d6;
  font-family: sans-serif;
  padding: 20px;
  height: 100%;
  overflow-y: auto;
}
h2 {
  color: #fff;
  font-size: 17px;
  margin: 0 0 16px;
}
.field-group {
  background: rgba(0,0,0,0.22);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 12px;
}
.field-row {
  display: flex;
  align-items: center;
  min-height: 32px;
  gap: 10px;
  margin-bottom: 8px;
}
.field-row:last-child { margin-bottom: 0; }
.field-label {
  color: #8e8e8e;
  font-size: 12px;
  width: 78px;
  flex-shrink: 0;
}
.field-input { flex: 1; }
.info-group {
  background: rgba(0,0,0,0.14);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 4px;
  padding: 10px 12px;
  margin-bottom: 16px;
}
.info-row {
  display: flex;
  gap: 10px;
  min-height: 22px;
  align-items: flex-start;
  margin-bottom: 4px;
}
.info-row:last-child { margin-bottom: 0; }
.info-label {
  color: #8e8e8e;
  font-size: 12px;
  width: 60px;
  flex-shrink: 0;
}
.info-value {
  color: #cfcfcf;
  font-size: 12px;
  word-break: break-all;
}
.info-dir {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 300px;
}
.actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
.progress-wrap {
  background: rgba(0,0,0,0.22);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 4px;
  padding: 20px;
  margin-bottom: 16px;
}
.progress-text {
  color: #cfcfcf;
  font-size: 13px;
  margin-bottom: 12px;
}
.progress-bar-track {
  background: rgba(255,255,255,0.08);
  border-radius: 3px;
  height: 6px;
  overflow: hidden;
  margin-bottom: 8px;
}
.progress-bar-fill {
  background: #4db8ff;
  height: 100%;
  border-radius: 3px;
  transition: width 0.25s ease;
}
.current-file {
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.muted { color: #8e8e8e; }
.result-wrap {
  background: rgba(0,0,0,0.22);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 4px;
  padding: 28px 20px;
  margin-bottom: 16px;
  text-align: center;
}
.result-icon {
  font-size: 36px;
  margin-bottom: 12px;
  line-height: 1;
}
.result-message {
  font-size: 14px;
  line-height: 1.6;
}
.result-success { color: #67c23a; }
.result-warning { color: #e6a23c; }
.result-error { color: #f56c6c; }
`,

$: {
  panelTitle: '#panel-title',
  sectionConfig: '#section-config',
  sectionUploading: '#section-uploading',
  sectionDone: '#section-done',
  inputSecretId: '#input-secret-id',
  inputSecretKey: '#input-secret-key',
  inputBucket: '#input-bucket',
  inputRegion: '#input-region',
  displayPlatform: '#display-platform',
  displayRemotePrefix: '#display-remote-prefix',
  displayOutputDir: '#display-output-dir',
  progressText: '#progress-text',
  progressBarFill: '#progress-bar-fill',
  currentFile: '#current-file',
  resultIcon: '#result-icon',
  resultMessage: '#result-message',
  btnCancelConfirm: '#btn-cancel-confirm',
  btnConfirm: '#btn-confirm',
  btnCancelUpload: '#btn-cancel-upload',
  btnClose: '#btn-close',
},

_phase: 'idle',
_configInitialized: false,
_polling: false,
_pollTimer: null,

async ready() {
  this._pollTimer = setInterval(async () => {
    if (this._polling) return;
    this._polling = true;
    try {
      const state = await getUploadState();
      renderState(this, state);
    } catch (e) {
      console.warn(`[${PACKAGE_NAME}] failed to get upload state:`, e && e.message ? e.message : e);
    }
    this._polling = false;
  }, 400);

  try {
    renderState(this, await getUploadState());
  } catch (e) {
    console.warn(`[${PACKAGE_NAME}] failed to get initial upload state:`, e && e.message ? e.message : e);
    renderState(this, createFallbackConfirmingState());
  }

  const onConfirm = async () => {
    const editedConfig = {
      secretId: getInputValue(this.$.inputSecretId),
      secretKey: getInputValue(this.$.inputSecretKey),
      bucket: getInputValue(this.$.inputBucket),
      region: getInputValue(this.$.inputRegion),
    };
    await callUploadMethod('confirmUpload', 'confirm-upload', editedConfig);
    renderState(this, await getUploadState());
  };
  this.$.btnConfirm.addEventListener('confirm', onConfirm);
  this.$.btnConfirm.addEventListener('click', onConfirm);

  const onCancelConfirm = async () => {
    await callUploadMethod('cancelUpload', 'cancel-upload');
    await closeSelf();
  };
  this.$.btnCancelConfirm.addEventListener('confirm', onCancelConfirm);
  this.$.btnCancelConfirm.addEventListener('click', onCancelConfirm);

  const onCancelUpload = async () => {
    await callUploadMethod('cancelUpload', 'cancel-upload');
    await closeSelf();
  };
  this.$.btnCancelUpload.addEventListener('confirm', onCancelUpload);
  this.$.btnCancelUpload.addEventListener('click', onCancelUpload);

  const onClose = async () => {
    await callUploadMethod('closePanelMsg', 'close-panel');
    await closeSelf();
  };
  this.$.btnClose.addEventListener('confirm', onClose);
  this.$.btnClose.addEventListener('click', onClose);
},

close() {
  if (this._pollTimer) {
    clearInterval(this._pollTimer);
    this._pollTimer = null;
  }
  // If user closes panel via X while upload is pending, treat as cancel
  if (this._phase !== 'done' && this._phase !== 'idle') {
    callUploadMethod('cancelUpload', 'cancel-upload');
  }
},
});

// ===================== Helpers =====================

function renderState(panel, state) {
  if (!state) return;
  const phase = state.phase || 'idle';
  const prevPhase = panel._phase;
  panel._phase = phase;

  if (phase === 'confirming' && prevPhase !== 'confirming') {
    panel._configInitialized = false;
  }

  panel.$.sectionConfig.style.display = phase === 'confirming' ? '' : 'none';
  panel.$.sectionUploading.style.display = phase === 'uploading' ? '' : 'none';
  panel.$.sectionDone.style.display = phase === 'done' ? '' : 'none';

  if (phase === 'confirming') {
    panel.$.panelTitle.textContent = 'COS 上传配置';
    renderConfirming(panel, state);
  } else if (phase === 'uploading') {
    panel.$.panelTitle.textContent = '正在上传';
    renderUploading(panel, state);
  } else if (phase === 'done') {
    panel.$.panelTitle.textContent = '上传结果';
    renderDone(panel, state);
  }
}

function renderConfirming(panel, state) {
  const config = state.config || {};

  if (!panel._configInitialized) {
    setInputValue(panel.$.inputSecretId, config.secretId || '');
    setInputValue(panel.$.inputSecretKey, config.secretKey || '');
    setInputValue(panel.$.inputBucket, config.bucket || '');
    setInputValue(panel.$.inputRegion, config.region || '');
    panel._configInitialized = true;
  }

  panel.$.displayPlatform.textContent = state.platform || '-';
  panel.$.displayOutputDir.textContent = state.outputDir || '-';
  panel.$.displayOutputDir.title = state.outputDir || '';

  const remotePrefix = computeRemotePrefix(config, state.platform || '');
  panel.$.displayRemotePrefix.textContent = remotePrefix || '-';
}

function renderUploading(panel, state) {
  const progress = state.progress || {};
  const done = progress.done || 0;
  const total = progress.total || 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  panel.$.progressText.textContent = total > 0
    ? `已上传 ${done} / ${total} 个文件（${pct}%）`
    : '准备上传...';
  panel.$.progressBarFill.style.width = pct + '%';
  panel.$.currentFile.textContent = progress.currentFile ? `正在上传: ${progress.currentFile}` : '';
}

function renderDone(panel, state) {
  const result = state.result || {};
  const progress = state.progress || {};

  if (result.canceled) {
    panel.$.resultIcon.textContent = '⚠️';
    panel.$.resultMessage.className = 'result-message result-warning';
    panel.$.resultMessage.textContent = '上传已取消';
  } else if (result.error) {
    panel.$.resultIcon.textContent = '❌';
    panel.$.resultMessage.className = 'result-message result-error';
    panel.$.resultMessage.textContent = `上传失败：${result.error}`;
  } else if (result.success) {
    panel.$.resultIcon.textContent = '✅';
    panel.$.resultMessage.className = 'result-message result-success';
    panel.$.resultMessage.textContent = `上传成功，共上传 ${progress.done || 0} 个文件`;
  }
}

function getInputValue(input) {
  if (!input) return '';
  return String(input.value || input.getAttribute('value') || '').trim();
}

function setInputValue(input, value) {
  if (!input) return;
  input.value = value;
  input.setAttribute('value', value);
}

function computeRemotePrefix(config, platform) {
  const trimSlashes = (s) => String(s || '').replace(/^\/+|\/+$/g, '');
  const join = (...parts) => parts.map(trimSlashes).filter(Boolean).join('/');

  const basePrefix = config.basePrefix || '';
  const mapping = config.platformPrefixMap || {};
  const mapped = mapping[platform];

  if (mapped) {
    const segments = trimSlashes(mapped).split('/').filter(Boolean);
    const suffix = segments.length <= 1 ? trimSlashes(mapped) : segments.slice(1).join('/') || platform;
    return join(basePrefix, suffix) || '-';
  }
  return join(basePrefix, platform) || '-';
}

async function getUploadState() {
  try {
    const state = await uploadMethods.getUploadState();
    if (state && state.phase && state.phase !== 'idle') {
      return normalizePanelState(state);
    }
  } catch (error) {
    console.warn(`[${PACKAGE_NAME}] direct getUploadState failed:`, error && error.message ? error.message : error);
  }

  try {
    const state = await Editor.Message.request(PACKAGE_NAME, 'get-upload-state');
    if (state && state.phase && state.phase !== 'idle') {
      return normalizePanelState(state);
    }
  } catch (error) {
    console.warn(`[${PACKAGE_NAME}] IPC get-upload-state failed:`, error && error.message ? error.message : error);
  }

  return createFallbackConfirmingState();
}

async function callUploadMethod(localMethodName, messageName, payload) {
  ensureActionState();

  if (uploadMethods && typeof uploadMethods[localMethodName] === 'function') {
    return await uploadMethods[localMethodName](payload);
  }

  return await Editor.Message.request(PACKAGE_NAME, messageName, payload);
}

function createFallbackConfirmingState() {
  return {
    phase: 'confirming',
    config: loadDefaultConfig(),
    platform: '',
    outputDir: '',
    progress: { done: 0, total: 0, currentFile: '' },
    result: null,
  };
}

function normalizePanelState(state) {
  return Object.assign({}, state, {
    config: mergeDefaultConfig(state.config || {}),
  });
}

function mergeDefaultConfig(config) {
  const defaults = loadDefaultConfig();
  const result = Object.assign({}, defaults, config || {});

  for (const [key, value] of Object.entries(defaults)) {
    if (typeof result[key] === 'string' && !result[key].trim()) {
      result[key] = value;
    }
  }

  return result;
}

function ensureActionState() {
  const state = readPanelState();
  if (state && state.phase && state.phase !== 'idle') {
    return;
  }
  writePanelState(createFallbackConfirmingState());
}

function readPanelState() {
  if (!fs.existsSync(STATE_PATH)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch (error) {
    return null;
  }
}

function writePanelState(state) {
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
  } catch (error) {
    console.warn(`[${PACKAGE_NAME}] failed to write panel state:`, error && error.message ? error.message : error);
  }
}

async function closeSelf() {
  if (!global.Editor || !Editor.Panel || typeof Editor.Panel.close !== 'function') {
    return;
  }

  try {
    await Editor.Panel.close(PACKAGE_NAME);
  } catch (error) {
    console.warn(`[${PACKAGE_NAME}] failed to close panel:`, error && error.message ? error.message : error);
  }
}

function loadDefaultConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (error) {
    console.warn(`[${PACKAGE_NAME}] failed to parse default config:`, error && error.message ? error.message : error);
    return {};
  }
}
