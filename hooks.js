'use strict';

const fs = require('fs');
const path = require('path');
const uploadMethods = require('./main').methods;

const PACKAGE_NAME = 'cc-extension-cos-uploader';
const CONFIG_PATH = path.join(__dirname, 'cos.config.json');

module.exports.methods = uploadMethods;

module.exports.load = async function load() {
  console.log(`[${PACKAGE_NAME}] hooks loaded`);
};
module.exports.unload = async function unload() {};

module.exports.onAfterBuild = async function onAfterBuild(options) {
  return runUploadFlow(options);
};

async function runUploadFlow(options) {
  try {
    const config = loadConfig(options);

    if (!config.enabled) {
      console.log(`[${PACKAGE_NAME}] upload skipped because plugin is disabled`);
      return;
    }

    const projectPath = getProjectPath();
    const outputDir = resolveBuildOutputDir(projectPath, options);
    const platform = getPlatformName(options, outputDir);

    console.log(`[${PACKAGE_NAME}] build completed, opening upload panel for platform: ${platform}`);

    const result = await uploadMethods.startUploadFlow({
      config,
      platform,
      outputDir,
    });

    if (result && result.canceled) {
      console.log(`[${PACKAGE_NAME}] upload was canceled by user`);
      return;
    }

    if (result && result.error) {
      console.error(`[${PACKAGE_NAME}] upload failed: ${result.error}`);
      return;
    }

    if (result && result.success) {
      console.log(`[${PACKAGE_NAME}] upload completed successfully`);
    }
  } catch (err) {
    console.error(
      `[${PACKAGE_NAME}] onAfterBuild unexpected error:`,
      err && err.message ? err.message : String(err)
    );
  }
}

// ===================== Config Helpers =====================

function loadConfig(buildOptions) {
  let fileConfig = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
      console.warn(`[${PACKAGE_NAME}] failed to parse ${CONFIG_PATH}`);
    }
  }

  const pluginOptions =
    buildOptions && buildOptions.packages && buildOptions.packages[PACKAGE_NAME]
      ? buildOptions.packages[PACKAGE_NAME]
      : {};

  const config = mergeConfig(fileConfig, pluginOptions);
  config.basePrefix = getProjectPackageName();

  return config;
}

function mergeConfig(fileConfig, pluginOptions) {
  const config = Object.assign({}, fileConfig);

  for (const [key, value] of Object.entries(pluginOptions || {})) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        config[key] = trimmed;
      }
      continue;
    }

    if (typeof value === 'boolean') {
      config[key] = value;
      continue;
    }

    if (value !== undefined && value !== null) {
      config[key] = value;
    }
  }

  return config;
}

function getProjectPath() {
  if (global.Editor && Editor.Project && Editor.Project.path) {
    return Editor.Project.path;
  }
  return path.resolve(__dirname, '../..');
}

function getProjectPackageName() {
  const packageJsonPath = path.join(getProjectPath(), 'package.json');
  if (!fs.existsSync(packageJsonPath)) return '';
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return String(packageJson.name || '').trim();
  } catch (error) {
    console.warn(`[${PACKAGE_NAME}] failed to parse project package.json`);
    return '';
  }
}

// ===================== Build Path Helpers =====================

function resolveBuildOutputDir(projectPath, options) {
  const directCandidates = [
    options && options.dest,
    options && options.paths && options.paths.dest,
    options && options.result && options.result.dest,
    options && options.result && options.result.paths && options.result.paths.dest,
  ].filter(Boolean);

  for (const candidate of directCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const buildRoot = resolveBuildRoot(projectPath, options && options.buildPath);
  const outputName = getPlatformName(options);
  const outputDir = path.join(buildRoot, outputName);

  if (!fs.existsSync(outputDir)) {
    throw new Error(`[${PACKAGE_NAME}] build output directory not found: ${outputDir}`);
  }

  return outputDir;
}

function resolveBuildRoot(projectPath, buildPath) {
  if (!buildPath) return path.join(projectPath, 'build');
  if (path.isAbsolute(buildPath)) return buildPath;
  if (buildPath.startsWith('project://')) {
    return path.join(projectPath, buildPath.slice('project://'.length));
  }
  return path.join(projectPath, buildPath);
}

function getPlatformName(options, outputDir) {
  return (
    (options && options.platform) ||
    (options && options.outputName) ||
    (options && options.taskName) ||
    (outputDir && path.basename(outputDir)) ||
    'unknown-platform'
  );
}
